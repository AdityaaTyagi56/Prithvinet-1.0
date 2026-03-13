"""
PrithviNet IoT Simulator — Chhattisgarh Air Stations
Runs as a standalone async process or Docker container.
Env vars: BACKEND_URL, DATABASE_URL
"""

import asyncio
import json
import logging
import math
import os
import random
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import httpx
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# ── Config ────────────────────────────────────────────────────────────────────

TICK_SECONDS = 30
LOG_EVERY_N = 100
SPIKE_PROBABILITY = 0.02          # 2% chance of major violation per reading
BUFFER_FILE = Path("iot_buffer.jsonl")

RNG = random.Random(42)
NP_SEED = 42

# ── Logging ───────────────────────────────────────────────────────────────────

def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


# ── Environment ───────────────────────────────────────────────────────────────

def _load_env() -> tuple[str, str]:
    here = Path(__file__).resolve()
    for candidate in (
        here.parents[1] / ".env",
        here.parents[2] / ".env",
    ):
        if candidate.exists():
            load_dotenv(candidate)

    backend_url = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing")
    return backend_url.rstrip("/"), database_url


# ── DB bootstrap ──────────────────────────────────────────────────────────────

async def _load_station_baselines(
    session: AsyncSession,
) -> Dict[str, Dict[str, float]]:
    """
    Returns {location_id_str: {parameter_name: latest_value}} for all AIR stations.
    Falls back to hard-coded Chhattisgarh averages if there are no readings yet.
    """
    result = await session.execute(
        text(
            """
            SELECT DISTINCT ON (sr.location_id, sr.parameter_id)
                sr.location_id::text  AS loc_id,
                mu.parameter          AS param,
                sr.value              AS value
            FROM sensor_readings sr
            JOIN monitoring_units mu ON mu.id = sr.parameter_id
            JOIN monitoring_locations ml ON ml.id = sr.location_id
            WHERE ml.type = 'air'
            ORDER BY sr.location_id, sr.parameter_id, sr.recorded_at DESC
            """
        )
    )

    baselines: Dict[str, Dict[str, float]] = {}
    for row in result.fetchall():
        loc_id = str(row[0])
        if loc_id not in baselines:
            baselines[loc_id] = {}
        baselines[loc_id][row[1]] = float(row[2])

    # Fallback defaults (Raipur averages from research data)
    DEFAULT_AIR = {
        "PM10": 82.0,
        "PM2.5": 42.0,
        "SO2": 18.0,
        "NO2": 28.0,
        "CO": 1.2,
        "O3": 38.0,
    }

    if not baselines:
        # Get all air station IDs and seed with defaults
        stations = await session.execute(
            text(
                "SELECT id::text FROM monitoring_locations WHERE type = 'air' AND is_active = TRUE"
            )
        )
        for (loc_id,) in stations.fetchall():
            baselines[loc_id] = dict(DEFAULT_AIR)

    return baselines


async def _load_station_names(session: AsyncSession) -> Dict[str, str]:
    result = await session.execute(
        text(
            "SELECT id::text, name FROM monitoring_locations WHERE type = 'air' AND is_active = TRUE"
        )
    )
    return {str(row[0]): (row[1] or "Unknown") for row in result.fetchall()}


# ── Simulation math ───────────────────────────────────────────────────────────

def _time_of_day_factor(hour: int) -> float:
    """Peaks at hour=6 and hour=18, trough at midday/midnight."""
    return 1.0 + 0.2 * math.sin((hour - 6) * math.pi / 12)


def _weekday_factor(weekday: int) -> float:
    """Mon=0 … Sun=6. Weekdays 10% higher."""
    return 1.10 if weekday < 5 else 1.00


def _winter_factor(month: int) -> float:
    """Oct–Feb Chhattisgarh winter pollution spike."""
    return 1.30 if month in (10, 11, 12, 1, 2) else 1.00


def _is_korba_spike_hour(hour: int) -> bool:
    """Coal plant startup/shutdown cycle at 06:00 and 18:00."""
    return hour in (6, 18)


def _simulate_value(
    base: float,
    param: str,
    loc_name: str,
    now: datetime,
    tick_index: int,
    is_korba: bool,
) -> float:
    hour = now.hour
    month = now.month
    weekday = now.weekday()

    # Composite multiplier
    factor = (
        _time_of_day_factor(hour)
        * _weekday_factor(weekday)
        * _winter_factor(month)
    )

    # Gaussian noise ±3%
    noise = 1.0 + RNG.gauss(0.0, 0.03)
    value = base * factor * noise

    # Korba coal plant cycle: 3 consecutive ticks at spike hours
    if is_korba and _is_korba_spike_hour(hour) and (tick_index % (3600 // TICK_SECONDS)) < 3:
        value *= 2.8

    # Random major violation spike (2% probability)
    if RNG.random() < SPIKE_PROBABILITY:
        value *= 3.0

    return max(0.0, round(value, 4))


# ── HTTP posting ──────────────────────────────────────────────────────────────

async def _post_reading(
    client: httpx.AsyncClient,
    backend_url: str,
    location_id: str,
    parameter: str,
    value: float,
) -> bool:
    payload = {
        "location_id": location_id,
        "parameter": parameter,
        "value": value,
        "source": "iot",
    }
    try:
        resp = await client.post(
            f"{backend_url}/api/v1/readings/",
            json=payload,
            timeout=8.0,
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False


def _write_buffer(reading: dict) -> None:
    with BUFFER_FILE.open("a") as fp:
        fp.write(json.dumps(reading) + "\n")


async def _flush_buffer(client: httpx.AsyncClient, backend_url: str) -> int:
    if not BUFFER_FILE.exists():
        return 0

    lines = BUFFER_FILE.read_text().splitlines()
    if not lines:
        return 0

    flushed = 0
    remaining: List[str] = []
    for line in lines:
        try:
            item = json.loads(line)
            ok = await _post_reading(
                client,
                backend_url,
                item["location_id"],
                item["parameter"],
                item["value"],
            )
            if ok:
                flushed += 1
            else:
                remaining.append(line)
        except Exception:
            remaining.append(line)

    if remaining:
        BUFFER_FILE.write_text("\n".join(remaining) + "\n")
    else:
        BUFFER_FILE.unlink(missing_ok=True)

    return flushed


# ── Main loop ─────────────────────────────────────────────────────────────────

async def run_simulator() -> None:
    _configure_logging()
    backend_url, database_url = _load_env()

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        baselines = await _load_station_baselines(session)
        station_names = await _load_station_names(session)

    await engine.dispose()

    logging.info(
        "Simulator ready: %d stations, %d baseline parameters loaded",
        len(baselines),
        sum(len(v) for v in baselines.values()),
    )

    total_readings = 0
    tick_index = 0

    async with httpx.AsyncClient() as client:
        while True:
            now = datetime.now(timezone.utc)
            readings_this_tick = 0

            # Try to flush any buffered readings first
            flushed = await _flush_buffer(client, backend_url)
            if flushed:
                logging.info("Flushed %d buffered readings", flushed)

            for loc_id, param_map in baselines.items():
                loc_name = station_names.get(loc_id, "")
                is_korba = "korba" in loc_name.lower()

                for param, base_value in param_map.items():
                    value = _simulate_value(
                        base=base_value,
                        param=param,
                        loc_name=loc_name,
                        now=now,
                        tick_index=tick_index,
                        is_korba=is_korba,
                    )

                    ok = await _post_reading(client, backend_url, loc_id, param, value)
                    if not ok:
                        _write_buffer(
                            {
                                "location_id": loc_id,
                                "parameter": param,
                                "value": value,
                            }
                        )

                    # Update running baseline so drift is gradual over time
                    baselines[loc_id][param] = base_value * 0.98 + value * 0.02

                    total_readings += 1
                    readings_this_tick += 1

            if total_readings % LOG_EVERY_N < readings_this_tick:
                sample = {
                    station_names.get(loc_id, loc_id[:8]): {
                        p: round(v, 2)
                        for p, v in list(params.items())[:3]
                    }
                    for loc_id, params in list(baselines.items())[:4]
                }
                logging.info(
                    "tick=%d total_sent=%d sample=%s",
                    tick_index,
                    total_readings,
                    sample,
                )

            tick_index += 1
            await asyncio.sleep(TICK_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(run_simulator())
    except KeyboardInterrupt:
        logging.info("Simulator stopped by user")
    except Exception as exc:
        logging.exception("Simulator crashed: %s", exc)
        sys.exit(1)
