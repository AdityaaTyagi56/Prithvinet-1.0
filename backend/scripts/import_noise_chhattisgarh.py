"""
Import noise quality data from data/noise_data.csv into the PrithviNet database.

Column mapping:
  leq_day   → parameter_id=13  (reading timestamp: 08:00)
  leq_night → parameter_id=14  (reading timestamp: 22:00)
  lmax      → parameter_id=15  (reading timestamp: 08:00)

Station mapping:
  Korba Industrial Area  → station_id=16
  Bhilai Steel Zone      → station_id=17
  Raipur Commercial Hub  → station_id=18
  Raipur Civil Lines     → station_id=19
  Bilaspur Residential   → station_id=20

Run from repo root: python backend/scripts/import_noise_chhattisgarh.py
"""

import asyncio
import csv
import logging
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

STATION_MAP: dict[str, int] = {
    "korba industrial area": 16,
    "bhilai steel zone":     17,
    "raipur commercial hub": 18,
    "raipur civil lines":    19,
    "bilaspur residential":  20,
}

# CPCB noise limits (dB(A)) per zone type
NOISE_LIMITS: dict[str, dict[str, float]] = {
    "Industrial":   {"day": 75.0, "night": 70.0},
    "Commercial":   {"day": 65.0, "night": 55.0},
    "Residential":  {"day": 55.0, "night": 45.0},
    "Silence":      {"day": 50.0, "night": 40.0},
}

# parameter_id → (column, hour)
PARAM_COLUMNS = [
    (13, "leq_day",   8),
    (14, "leq_night", 22),
    (15, "lmax",      8),
]

ANOMALY_THRESHOLD_FRAC = 1.15  # flag if value > limit × 1.15
BATCH_SIZE = 500
SOURCE = "synthetic_noise_chhattisgarh"

logger = logging.getLogger(__name__)


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def load_environment() -> str:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent
    for env_file in (backend_root / ".env", project_root / ".env"):
        if env_file.exists():
            load_dotenv(env_file)
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing. Set it in .env")
    return database_url


def resolve_dataset_path() -> Path:
    explicit = os.getenv("NOISE_DATASET_PATH")
    if explicit:
        p = Path(explicit)
        if p.exists():
            return p
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    candidates = [
        backend_root.parent / "data" / "noise_data.csv",
        backend_root / "data" / "noise_data.csv",
    ]
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError("noise_data.csv not found. Set NOISE_DATASET_PATH or place under data/")


async def load_existing_keys(db: AsyncSession) -> set[tuple[int, int, datetime]]:
    result = await db.execute(
        text(
            """
            SELECT station_id, parameter_id, time
            FROM sensor_readings
            WHERE station_id BETWEEN 16 AND 20
            """
        )
    )
    return {(int(r[0]), int(r[1]), r[2]) for r in result.fetchall()}


async def insert_batch(db: AsyncSession, batch: list[dict]) -> int:
    if not batch:
        return 0
    result = await db.execute(
        text(
            """
            INSERT INTO sensor_readings
                (time, station_id, parameter_id, value, unit, source, is_anomaly)
            SELECT
                v.time, v.station_id, v.parameter_id, v.value, v.unit, v.source, v.anomaly
            FROM (VALUES
                """ +
            ",\n".join(
                f"(CAST(:{k}_time AS timestamptz), :{k}_sid, :{k}_pid, "
                f":{k}_val, :{k}_unit, :{k}_src, :{k}_anm)"
                for k in [str(i) for i in range(len(batch))]
            ) +
            """
            ) AS v(time, station_id, parameter_id, value, unit, source, anomaly)
            WHERE NOT EXISTS (
                SELECT 1 FROM sensor_readings sr
                WHERE sr.station_id   = v.station_id
                  AND sr.parameter_id = v.parameter_id
                  AND sr.time         = v.time
            )
            """
        ),
        {
            f"{i}_{field}": val
            for i, row in enumerate(batch)
            for field, val in [
                ("time", row["time"]),
                ("sid",  row["station_id"]),
                ("pid",  row["parameter_id"]),
                ("val",  row["value"]),
                ("unit", row["unit"]),
                ("src",  row["source"]),
                ("anm",  row["is_anomaly"]),
            ]
        },
    )
    return result.rowcount if result.rowcount else 0


async def run_import() -> None:
    configure_logging()
    database_url = load_environment()
    dataset_path = resolve_dataset_path()

    logger.info("Reading noise dataset from %s", dataset_path)

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    inserted_by_station: dict[int, int] = defaultdict(int)
    violations_by_station: dict[int, int] = defaultdict(int)
    skipped = 0
    total = 0

    try:
        async with session_factory() as db:
            existing_keys = await load_existing_keys(db)

            batch: list[dict] = []

            with dataset_path.open() as fp:
                reader = csv.DictReader(fp)
                for row in reader:
                    station_name = row.get("station", "").strip().lower()
                    station_id = STATION_MAP.get(station_name)
                    if station_id is None:
                        continue

                    zone_type = row.get("zone_type", "Residential").strip()
                    limits = NOISE_LIMITS.get(zone_type, NOISE_LIMITS["Residential"])
                    date_str = row.get("date", "").strip()
                    if not date_str:
                        continue

                    for param_id, col, hour in PARAM_COLUMNS:
                        raw = row.get(col, "").strip()
                        if not raw:
                            continue
                        try:
                            value = float(raw)
                        except ValueError:
                            continue

                        ts = datetime.fromisoformat(date_str).replace(
                            hour=hour, minute=0, second=0, tzinfo=timezone.utc
                        )

                        key = (station_id, param_id, ts)
                        if key in existing_keys:
                            skipped += 1
                            continue

                        # Determine day/night for limit check
                        limit_key = "night" if hour >= 20 or hour < 6 else "day"
                        limit = limits[limit_key]
                        is_anomaly = value > limit * ANOMALY_THRESHOLD_FRAC

                        batch.append({
                            "time": ts,
                            "station_id": station_id,
                            "parameter_id": param_id,
                            "value": value,
                            "unit": "dB(A)",
                            "source": SOURCE,
                            "is_anomaly": is_anomaly,
                        })
                        existing_keys.add(key)
                        total += 1

                        if is_anomaly:
                            violations_by_station[station_id] += 1

                        if len(batch) >= BATCH_SIZE:
                            n = await insert_batch(db, batch)
                            for r in batch:
                                inserted_by_station[r["station_id"]] += 1
                            batch.clear()

                if batch:
                    await insert_batch(db, batch)
                    for r in batch:
                        inserted_by_station[r["station_id"]] += 1

            await db.commit()

        logger.info("Noise import complete")
        logger.info("Total candidates: %d | Skipped duplicates: %d", total, skipped)

        station_names_rev = {v: k for k, v in STATION_MAP.items()}
        for sid in range(16, 21):
            logger.info(
                "station_id=%d (%s) inserted=%d violations=%d",
                sid,
                station_names_rev.get(sid, "?"),
                inserted_by_station.get(sid, 0),
                violations_by_station.get(sid, 0),
            )

    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(run_import())
    except Exception as exc:
        logger.exception("Noise import failed: %s", exc)
        sys.exit(1)
