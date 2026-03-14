import asyncio
import logging
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

HERE = Path(__file__).resolve()
BACKEND_ROOT = HERE.parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.water_compliance import evaluate_and_record_water_compliance


logger = logging.getLogger(__name__)

DEFAULT_SOURCE = "kaggle_water_chhattisgarh"
NEIGHBOUR_SOURCE = "kaggle_water_neighbouring"
MONTH_DAY = 15
NOISE_STD = 0.01
NOISE_CLIP = 0.02

CHHATTISGARH_PATTERNS = ["chattisgarh", "chhattisgarh"]
NEIGHBOUR_STATES = ["odisha", "madhya pradesh"]
TARGET_RIVERS = ["mahanadi", "seonath", "sheonath", "kharoon", "kharun", "arpa", "kelo", "dengur"]

COLUMN_ALIASES = {
    "D.O. (mg/l)": 8,
    "DO": 8,
    "PH": 7,
    "pH": 7,
    "B.O.D. (mg/l)": 9,
    "BOD": 9,
    "CONDUCTIVITY (µmhos/cm)": 10,
    "CONDUCTIVITY": 10,
    "NITRATE+NITRITE (mg/l)": 11,
    "NITRATE+NITRITE": 11,
    "TOTAL COLIFORM (MPN/100ml)": 12,
    "TOTAL COLIFORM": 12,
}

OVERRIDE_BASE_VALUES = {
    10: {9: 4.8, 8: 5.2, 12: 120.0},
    14: {9: 5.2, 8: 4.9, 12: 180.0},
    15: {9: 12.4, 8: 3.1, 7: 6.2, 12: 850.0},
}


@dataclass
class ImportedReading:
    time: datetime
    station_id: int
    parameter_id: int
    value: float
    unit: str
    source: str


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
        raise RuntimeError("DATABASE_URL is missing. Set it in backend/.env or project .env")
    return database_url


def resolve_dataset_path() -> Path:
    explicit_path = os.getenv("WATER_DATASET_PATH")
    if explicit_path:
        path = Path(explicit_path)
        if path.exists():
            return path

    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    candidates = [
        project_root / "data" / "water_quality.csv",
        backend_root / "data" / "water_quality.csv",
        backend_root / "data" / "trusted_sources" / "water_quality.csv",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError("water_quality.csv not found. Set WATER_DATASET_PATH or place file under data/")


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = {}
    for col in df.columns:
        clean = re.sub(r"\s+", " ", str(col)).strip()
        renamed[col] = clean
    return df.rename(columns=renamed)


def contains_any(text: str, patterns: List[str]) -> bool:
    lowered = (text or "").lower()
    return any(p in lowered for p in patterns)


def is_target_river(location: str) -> bool:
    return contains_any(location, TARGET_RIVERS)


def filter_base_rows(df: pd.DataFrame) -> pd.DataFrame:
    if "STATE" not in df.columns or "LOCATIONS" not in df.columns:
        raise ValueError("Dataset must include STATE and LOCATIONS columns")

    work = df.copy()
    work["STATE"] = work["STATE"].fillna("").astype(str)
    work["LOCATIONS"] = work["LOCATIONS"].fillna("").astype(str)

    chhattisgarh_rows = work[work["STATE"].str.lower().apply(lambda s: contains_any(s, CHHATTISGARH_PATTERNS))].copy()

    if len(chhattisgarh_rows) >= 20:
        chhattisgarh_rows["_source"] = DEFAULT_SOURCE
        return chhattisgarh_rows

    neighbouring_rows = work[
        work["STATE"].str.lower().apply(lambda s: contains_any(s, NEIGHBOUR_STATES))
        & work["LOCATIONS"].str.lower().apply(is_target_river)
    ].copy()

    chhattisgarh_rows["_source"] = DEFAULT_SOURCE
    neighbouring_rows["_source"] = NEIGHBOUR_SOURCE

    combined = pd.concat([chhattisgarh_rows, neighbouring_rows], ignore_index=True)
    logger.info(
        "Chhattisgarh rows < 20 (%s). Added neighbouring rows: %s",
        len(chhattisgarh_rows),
        len(neighbouring_rows),
    )
    return combined


def station_from_location(location: str) -> Optional[int]:
    loc = (location or "").lower()

    if "mahanadi" in loc and ("raipur" in loc or "arrang" in loc):
        return 9
    if "kharoon" in loc or "kharun" in loc:
        return 10
    if "seonath" in loc or "sheonath" in loc:
        return 11
    if "arpa" in loc:
        return 12
    if "kelo" in loc and any(token in loc for token in ["u/s", "upstream", "us"]):
        return 13
    if "kelo" in loc and any(token in loc for token in ["d/s", "downstream", "ds"]):
        return 14
    if "dengur" in loc or "korba" in loc:
        return 15

    # Fallback for Mahanadi mentions with no district tag.
    if "mahanadi" in loc:
        return 9

    return None


def monthly_timestamps(year_value: object) -> List[datetime]:
    try:
        year = int(float(year_value))
    except (TypeError, ValueError):
        return []

    if year < 1900 or year > 2100:
        return []

    return [datetime(year, month, MONTH_DAY, 0, 0, 0, tzinfo=timezone.utc) for month in range(1, 13)]


def gaussian_noise_multiplier(rng: np.random.Generator) -> float:
    ratio = float(rng.normal(0.0, NOISE_STD))
    ratio = max(-NOISE_CLIP, min(NOISE_CLIP, ratio))
    return 1.0 + ratio


def clean_numeric(value: object) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        value = value.replace(",", "")
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if np.isnan(parsed) or np.isinf(parsed):
        return None
    if parsed < 0:
        return None
    return parsed


def unit_for_parameter(parameter_id: int) -> str:
    if parameter_id == 7:
        return "units"
    if parameter_id in (8, 9, 11):
        return "mg/l"
    if parameter_id == 10:
        return "µmhos/cm"
    if parameter_id == 12:
        return "MPN/100ml"
    return ""


async def load_existing_keys(db: AsyncSession) -> set[Tuple[int, int, datetime]]:
    result = await db.execute(
        text(
            """
            SELECT station_id, parameter_id, time
            FROM sensor_readings
            WHERE station_id BETWEEN 9 AND 15
            """
        )
    )
    return {(int(row[0]), int(row[1]), row[2]) for row in result.fetchall()}


async def insert_reading_if_new(db: AsyncSession, reading: ImportedReading) -> bool:
    inserted = await db.execute(
        text(
            """
            INSERT INTO sensor_readings (time, station_id, parameter_id, value, unit, source, is_anomaly)
            SELECT :time, :station_id, :parameter_id, :value, :unit, :source, FALSE
            WHERE NOT EXISTS (
                SELECT 1
                FROM sensor_readings
                WHERE station_id = :station_id
                  AND parameter_id = :parameter_id
                  AND time = :time
            )
            RETURNING station_id
            """
        ),
        {
            "time": reading.time,
            "station_id": reading.station_id,
            "parameter_id": reading.parameter_id,
            "value": reading.value,
            "unit": reading.unit,
            "source": reading.source,
        },
    )
    return inserted.fetchone() is not None


def resolve_parameter_column(df: pd.DataFrame, alias: str) -> Optional[str]:
    alias_lower = alias.lower()
    for col in df.columns:
        if col.lower() == alias_lower:
            return col
    return None


def build_parameter_sources(df: pd.DataFrame) -> Dict[str, Tuple[str, int]]:
    resolved: Dict[str, Tuple[str, int]] = {}
    for alias, parameter_id in COLUMN_ALIASES.items():
        col = resolve_parameter_column(df, alias)
        if col and parameter_id not in [pid for _, pid in resolved.values()]:
            resolved[col] = (col, parameter_id)
    return resolved


async def run_import() -> None:
    configure_logging()
    database_url = load_environment()
    dataset_path = resolve_dataset_path()

    logger.info("Reading dataset from %s", dataset_path)
    frame = pd.read_csv(dataset_path)
    frame = normalize_columns(frame)
    frame = filter_base_rows(frame)

    if frame.empty:
        logger.warning("No candidate rows after state filters. Nothing to import.")
        return

    if "YEAR" not in frame.columns:
        raise ValueError("Dataset must include YEAR column")

    rng = np.random.default_rng(20260314)

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    inserted_by_station: Dict[int, int] = defaultdict(int)
    violations_by_station: Dict[int, int] = defaultdict(int)
    skipped_duplicates = 0
    total_candidates = 0

    parameter_sources = build_parameter_sources(frame)
    if not parameter_sources:
        raise ValueError("No recognized water parameter columns found in dataset")

    try:
        async with session_factory() as db:
            existing_keys = await load_existing_keys(db)

            for _, row in frame.iterrows():
                station_id = station_from_location(str(row.get("LOCATIONS", "")))
                if station_id is None:
                    continue

                source = str(row.get("_source") or DEFAULT_SOURCE)
                timestamps = monthly_timestamps(row.get("YEAR"))
                if not timestamps:
                    continue

                for col_name, (_, parameter_id) in parameter_sources.items():
                    base_value = clean_numeric(row.get(col_name))

                    override_value = OVERRIDE_BASE_VALUES.get(station_id, {}).get(parameter_id)
                    if override_value is not None:
                        base_value = override_value

                    if base_value is None:
                        continue

                    for ts in timestamps:
                        total_candidates += 1
                        key = (station_id, parameter_id, ts)
                        if key in existing_keys:
                            skipped_duplicates += 1
                            continue

                        noisy_value = round(max(0.0, base_value * gaussian_noise_multiplier(rng)), 4)

                        reading = ImportedReading(
                            time=ts,
                            station_id=station_id,
                            parameter_id=parameter_id,
                            value=noisy_value,
                            unit=unit_for_parameter(parameter_id),
                            source=source,
                        )

                        if await insert_reading_if_new(db, reading):
                            existing_keys.add(key)
                            inserted_by_station[station_id] += 1

                            event = await evaluate_and_record_water_compliance(
                                db=db,
                                station_id=reading.station_id,
                                parameter_id=reading.parameter_id,
                                reading_time=reading.time,
                                value=reading.value,
                            )
                            if event is not None:
                                violations_by_station[station_id] += 1
                        else:
                            skipped_duplicates += 1

            await db.commit()

            logger.info("Water import complete")
            logger.info("Total candidate synthesized readings: %s", total_candidates)
            logger.info("Duplicates skipped: %s", skipped_duplicates)

            for station_id in range(9, 16):
                logger.info(
                    "station_id=%s imported=%s violations=%s",
                    station_id,
                    inserted_by_station.get(station_id, 0),
                    violations_by_station.get(station_id, 0),
                )

    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(run_import())
    except Exception as exc:
        logger.exception("Water import failed: %s", exc)
        sys.exit(1)
