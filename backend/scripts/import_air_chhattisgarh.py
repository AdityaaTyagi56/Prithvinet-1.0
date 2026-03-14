import asyncio
import logging
import os
import random
import sys
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker


BATCH_SIZE = 500
PROGRESS_EVERY = 5000
SOURCE_NAME = "manual"
RNG = random.Random(42)
NP_RNG = np.random.default_rng(42)

POLLUTANT_COLUMNS = {
    "PM10": "PM10",
    "PM2.5": "PM2.5",
    "SO2": "SO2",
    "NO2": "NO2",
    "CO": "CO",
    "O3": "O3",
}

KORBA_FACTORS = {
    "PM10": 1.44,
    "SO2": 2.65,
    "NO2": 1.46,
    "PM2.5": 1.23,
}

DEFAULT_UNITS = {
    "PM10": "ug/m3",
    "PM2.5": "ug/m3",
    "SO2": "ug/m3",
    "NO2": "ug/m3",
    "CO": "mg/m3",
    "O3": "ug/m3",
}


@dataclass
class MonitoringStation:
    id: uuid.UUID
    name: str
    location: str


class ImportErrorWithContext(Exception):
    pass


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def _load_env() -> str:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    env_candidates = [
        backend_root / ".env",
        project_root / ".env",
    ]
    for env_file in env_candidates:
        if env_file.exists():
            load_dotenv(env_file)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ImportErrorWithContext("DATABASE_URL is missing in environment/.env")

    return database_url


def _resolve_dataset_path() -> Path:
    explicit = os.getenv("AIR_DATASET_PATH")
    if explicit:
        path = Path(explicit)
        if path.exists():
            return path

    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    candidates = [
        project_root / "data" / "AllIndiaBulletins_Master.csv",
        backend_root / "data" / "AllIndiaBulletins_Master.csv",
        backend_root / "data" / "trusted_sources" / "AllIndiaBulletins_Master.csv",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise ImportErrorWithContext(
        "Could not find AllIndiaBulletins_Master.csv. Set AIR_DATASET_PATH or place it under data/."
    )


async def _fetch_air_stations(session: AsyncSession) -> tuple[List[MonitoringStation], List[MonitoringStation]]:
    result = await session.execute(
        text(
            """
            SELECT id, name, COALESCE(location, '') AS location
            FROM monitoring_locations
            WHERE type = 'air' AND is_active = TRUE
              AND name NOT ILIKE 'Stack %'
            ORDER BY created_at ASC
            """
        )
    )
    stations = [MonitoringStation(id=row[0], name=row[1] or "", location=row[2] or "") for row in result.fetchall()]
    if len(stations) < 7:
        raise ImportErrorWithContext("Need at least 7 active AIR monitoring locations for mapping")

    def _match_keywords(items: Sequence[MonitoringStation], keywords: Sequence[str], limit: int) -> List[MonitoringStation]:
        hits: List[MonitoringStation] = []
        for st in items:
            blob = f"{st.name} {st.location}".lower()
            if any(k in blob for k in keywords):
                hits.append(st)
        return hits[:limit]

    raipur_cluster = _match_keywords(stations, ["raipur", "bhilai", "durg"], 4)
    korba_cluster = _match_keywords(stations, ["korba"], 3)

    if len(raipur_cluster) < 4:
        needed = 4 - len(raipur_cluster)
        used_ids = {s.id for s in raipur_cluster}
        for st in stations:
            if st.id not in used_ids:
                raipur_cluster.append(st)
                if needed == 1:
                    break
                needed -= 1

    if len(korba_cluster) < 3:
        needed = 3 - len(korba_cluster)
        used_ids = {s.id for s in raipur_cluster + korba_cluster}
        for st in stations:
            if st.id not in used_ids:
                korba_cluster.append(st)
                if needed == 1:
                    break
                needed -= 1

    if len(raipur_cluster) < 4 or len(korba_cluster) < 3:
        raise ImportErrorWithContext("Could not map stations to 4 Raipur/Bhilai + 3 Korba targets")

    return raipur_cluster[:4], korba_cluster[:3]


async def _ensure_parameters(session: AsyncSession) -> Dict[str, tuple[uuid.UUID, str]]:
    existing = await session.execute(
        text("SELECT id, parameter, unit FROM monitoring_units")
    )
    by_name: Dict[str, tuple[uuid.UUID, str]] = {}
    for row in existing.fetchall():
        by_name[(row[1] or "").strip().upper()] = (row[0], row[2])

    for param in POLLUTANT_COLUMNS:
        key = param.upper()
        if key in by_name:
            continue
        created = await session.execute(
            text(
                """
                INSERT INTO monitoring_units (id, parameter, unit, description)
                VALUES (:id, :parameter, :unit, :description)
                RETURNING id, unit
                """
            ),
            {
                "id": uuid.uuid4(),
                "parameter": param,
                "unit": DEFAULT_UNITS[param],
                "description": f"Imported pollutant parameter {param}",
            },
        )
        row = created.fetchone()
        by_name[key] = (row[0], row[1])
        logging.info("Created missing monitoring parameter %s", param)

    await session.commit()

    resolved: Dict[str, tuple[uuid.UUID, str]] = {}
    for param in POLLUTANT_COLUMNS:
        pid, unit = by_name[param.upper()]
        resolved[param] = (pid, unit)
    return resolved


def _parse_dataset(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if "city" not in df.columns or "date" not in df.columns:
        raise ImportErrorWithContext("CSV must include at least 'city' and 'date' columns")

    work = df.copy()
    work["city"] = work["city"].astype(str)
    work = work[work["city"].str.contains("Raipur", case=False, na=False)]
    if work.empty:
        raise ImportErrorWithContext("No rows matching city contains 'Raipur'")

    work["date"] = pd.to_datetime(work["date"], errors="coerce", utc=True)
    work = work.dropna(subset=["date"])
    if work.empty:
        raise ImportErrorWithContext("No rows with parseable dates after filtering")

    for col in POLLUTANT_COLUMNS.values():
        if col in work.columns:
            work[col] = pd.to_numeric(work[col], errors="coerce")

    return work.sort_values("date")


def _hourly_points(day_ts: datetime) -> List[datetime]:
    start = day_ts.replace(hour=0, minute=0, second=0, microsecond=0)
    return [start + timedelta(hours=h) for h in range(24)]


def _apply_noise(value: float, sigma_fraction: float) -> float:
    return max(0.0, float(value) * (1.0 + float(NP_RNG.normal(0.0, sigma_fraction))))


def _station_factor(station_id: uuid.UUID, parameter: str) -> float:
    seed = hash((str(station_id), parameter)) & 0xFFFFFFFF
    local_rng = random.Random(seed)
    return local_rng.uniform(0.95, 1.05)


async def _prepare_temp_table(session: AsyncSession) -> None:
    await session.execute(
        text(
            """
            CREATE TEMP TABLE IF NOT EXISTS tmp_air_import (
                id UUID NOT NULL,
                location_id UUID NOT NULL,
                parameter_id UUID NOT NULL,
                value DOUBLE PRECISION NOT NULL,
                unit_id UUID NOT NULL,
                recorded_at TIMESTAMPTZ NOT NULL,
                source TEXT NOT NULL,
                quality_flag TEXT NULL
            ) ON COMMIT PRESERVE ROWS
            """
        )
    )
    await session.commit()


async def _insert_batch(
    session: AsyncSession,
    batch_rows: List[dict],
) -> List[uuid.UUID]:
    await session.execute(text("TRUNCATE TABLE tmp_air_import"))
    await session.execute(
        text(
            """
            INSERT INTO tmp_air_import (
                id, location_id, parameter_id, value, unit_id, recorded_at, source, quality_flag
            ) VALUES (
                :id, :location_id, :parameter_id, :value, :unit_id, :recorded_at, :source, :quality_flag
            )
            """
        ),
        batch_rows,
    )

    inserted = await session.execute(
        text(
            """
            INSERT INTO sensor_readings (
                id, location_id, parameter_id, value, unit_id, recorded_at, source, quality_flag
            )
            SELECT
                t.id,
                t.location_id,
                t.parameter_id,
                t.value,
                t.unit_id,
                t.recorded_at,
                CAST(t.source AS sourcetype),
                t.quality_flag
            FROM tmp_air_import t
            WHERE NOT EXISTS (
                SELECT 1
                FROM sensor_readings s
                WHERE s.location_id = t.location_id
                  AND s.parameter_id = t.parameter_id
                  AND s.recorded_at = t.recorded_at
            )
            RETURNING location_id
            """
        )
    )
    rows = inserted.fetchall()
    await session.commit()
    return [row[0] for row in rows]


async def run_import() -> None:
    _configure_logging()
    database_url = _load_env()
    dataset_path = _resolve_dataset_path()

    logging.info("Using dataset: %s", dataset_path)
    frame = _parse_dataset(dataset_path)

    engine = create_async_engine(database_url, echo=False)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    total_inserted = 0
    inserted_by_station: Dict[uuid.UUID, int] = defaultdict(int)

    async with SessionLocal() as session:
        raipur_stations, korba_stations = await _fetch_air_stations(session)
        param_map = await _ensure_parameters(session)
        await _prepare_temp_table(session)

        logging.info(
            "Raipur/Bhilai stations: %s",
            [f"{s.name} ({s.id})" for s in raipur_stations],
        )
        logging.info(
            "Korba stations: %s",
            [f"{s.name} ({s.id})" for s in korba_stations],
        )

        buffer_rows: List[dict] = []

        for _, row in frame.iterrows():
            day_ts = row["date"]
            if pd.isna(day_ts):
                continue

            daily_values: Dict[str, float] = {}
            for param, col in POLLUTANT_COLUMNS.items():
                if col not in row.index:
                    continue
                value = row[col]
                if pd.isna(value):
                    continue
                daily_values[param] = float(value)

            if not daily_values:
                continue

            hourly_stamps = _hourly_points(day_ts.to_pydatetime().astimezone(timezone.utc))

            for stamp in hourly_stamps:
                for param, base_value in daily_values.items():
                    param_id, _ = param_map[param]

                    for station in raipur_stations:
                        varied = _apply_noise(base_value * _station_factor(station.id, param), 0.02)
                        buffer_rows.append(
                            {
                                "id": uuid.uuid4(),
                                "location_id": station.id,
                                "parameter_id": param_id,
                                "value": round(varied, 4),
                                "unit_id": param_id,
                                "recorded_at": stamp,
                                "source": SOURCE_NAME,
                                "quality_flag": None,
                            }
                        )

                    factor = KORBA_FACTORS.get(param, 1.0)
                    for station in korba_stations:
                        korba_value = _apply_noise(base_value * factor, 0.02)
                        buffer_rows.append(
                            {
                                "id": uuid.uuid4(),
                                "location_id": station.id,
                                "parameter_id": param_id,
                                "value": round(korba_value, 4),
                                "unit_id": param_id,
                                "recorded_at": stamp,
                                "source": SOURCE_NAME,
                                "quality_flag": None,
                            }
                        )

                    if len(buffer_rows) >= BATCH_SIZE:
                        inserted_locations = await _insert_batch(session, buffer_rows)
                        for loc_id in inserted_locations:
                            inserted_by_station[loc_id] += 1
                        total_inserted += len(inserted_locations)
                        if total_inserted > 0 and total_inserted % PROGRESS_EVERY == 0:
                            logging.info("Inserted %d rows so far", total_inserted)
                        buffer_rows.clear()

        if buffer_rows:
            inserted_locations = await _insert_batch(session, buffer_rows)
            for loc_id in inserted_locations:
                inserted_by_station[loc_id] += 1
            total_inserted += len(inserted_locations)

        station_names = {s.id: s.name for s in (raipur_stations + korba_stations)}
        logging.info("Import complete. Total new rows inserted: %d", total_inserted)
        for station_id, count in sorted(inserted_by_station.items(), key=lambda x: x[1], reverse=True):
            logging.info("Station %s (%s): %d rows", station_names.get(station_id, "unknown"), station_id, count)

    await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(run_import())
    except Exception as exc:
        logging.exception("Air import failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(run_import())
    except Exception as exc:
        logging.exception("Air import failed: %s", exc)
        sys.exit(1)
