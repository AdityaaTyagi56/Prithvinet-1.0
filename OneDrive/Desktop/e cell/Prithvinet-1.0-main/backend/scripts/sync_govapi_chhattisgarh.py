import argparse
import asyncio
import logging
import os
import re
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker


GOV_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"

POLLUTANT_PARAM_MAP = {
    "PM10": ["pm10", "pm_10", "rspfpm10", "respirable_particulate_matter"],
    "PM2.5": ["pm2_5", "pm2.5", "pm25", "pm_2_5", "fine_particulate_matter"],
    "SO2": ["so2", "sulphur_dioxide", "sulfur_dioxide"],
    "NO2": ["no2", "nitrogen_dioxide"],
}

DISTRICT_COORDS = {
    "balod": (20.73, 81.20),
    "baloda bazar": (21.65, 82.16),
    "balrampur": (23.60, 83.61),
    "bastar": (19.11, 81.95),
    "bemetara": (21.71, 81.54),
    "bijapur": (18.84, 80.92),
    "bilaspur": (22.08, 82.14),
    "dantewada": (18.90, 81.35),
    "dhamtari": (20.71, 81.55),
    "durg": (21.19, 81.28),
    "gariaband": (20.63, 82.06),
    "gaurela pendra marwahi": (22.89, 81.90),
    "janjgir champa": (22.02, 82.58),
    "jashpur": (22.88, 84.14),
    "kabirdham": (22.01, 81.25),
    "kanker": (20.27, 81.49),
    "khairagarh chhuikhadan gandai": (21.42, 81.33),
    "kondagaon": (19.59, 81.66),
    "korba": (22.36, 82.75),
    "koriya": (23.26, 82.56),
    "mahasamund": (21.11, 82.10),
    "manendragarh chirmiri bharatpur": (23.25, 82.35),
    "mohla manpur ambagarh chowki": (20.88, 80.74),
    "mungeli": (22.07, 81.69),
    "narayanpur": (19.72, 81.25),
    "raigarh": (21.90, 83.40),
    "raipur": (21.25, 81.63),
    "rajnandgaon": (21.10, 81.03),
    "sakti": (22.02, 82.96),
    "sarangarh bilaigarh": (21.59, 83.08),
    "sukma": (18.39, 81.66),
    "surajpur": (23.22, 82.86),
    "surguja": (23.12, 83.20),
}


@dataclass
class Station:
    id: uuid.UUID
    name: str
    location: str


class SyncError(Exception):
    pass


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def _load_env() -> Tuple[str, str]:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    for env_file in (backend_root / ".env", project_root / ".env"):
        if env_file.exists():
            load_dotenv(env_file)

    database_url = os.getenv("DATABASE_URL")
    govapi_key = os.getenv("GOVAPI_KEY")
    if not database_url:
        raise SyncError("DATABASE_URL is missing")
    if not govapi_key:
        raise SyncError("GOVAPI_KEY is missing")

    return database_url, govapi_key


async def _load_stations_and_params(
    session: AsyncSession,
) -> Tuple[List[Station], Dict[str, uuid.UUID]]:
    stations_result = await session.execute(
        text(
            """
            SELECT id, name, COALESCE(location, '')
            FROM monitoring_locations
            WHERE type = 'air' AND is_active = TRUE
            """
        )
    )
    stations = [Station(row[0], row[1] or "", row[2] or "") for row in stations_result.fetchall()]
    if not stations:
        raise SyncError("No active AIR stations found")

    params_result = await session.execute(text("SELECT id, parameter FROM monitoring_units"))
    params = {(row[1] or "").strip().upper(): row[0] for row in params_result.fetchall()}

    required = ["PM10", "PM2.5", "SO2", "NO2"]
    missing = [v for v in required if v.upper() not in params]
    if missing:
        raise SyncError(f"Missing monitoring parameters: {', '.join(missing)}")

    resolved_params = {k: params[k.upper()] for k in required}
    return stations, resolved_params


def _norm(text_value: str) -> str:
    return re.sub(r"\s+", " ", (text_value or "").strip().lower())


def _slug(text_value: str) -> str:
    raw = _norm(text_value)
    cleaned = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return cleaned or "unknown"


def _first_non_empty(record: Dict[str, Any], keys: List[str]) -> str:
    for key in keys:
        value = record.get(key)
        if value is None:
            continue
        as_text = str(value).strip()
        if as_text:
            return as_text
    return ""


def _resolve_station_name(record: Dict[str, Any]) -> str:
    return _first_non_empty(
        record,
        [
            "station",
            "station_name",
            "location",
            "location_name",
            "site",
            "site_name",
            "area",
            "city",
        ],
    )


def _resolve_district(record: Dict[str, Any]) -> str:
    return _first_non_empty(record, ["district", "city", "city_name", "state_district"])


def _resolve_state(record: Dict[str, Any]) -> str:
    return _first_non_empty(record, ["state", "state_name"])


def _is_chhattisgarh_record(record: Dict[str, Any]) -> bool:
    state = _norm(_resolve_state(record))
    district = _norm(_resolve_district(record))
    station = _norm(_resolve_station_name(record))
    hay = f"{state} {district} {station}"
    return "chhattisgarh" in hay or "chattisgarh" in hay


def _extract_timestamp(record: Dict[str, Any]) -> datetime:
    keys = [
        "last_update",
        "last_update_date",
        "from_date",
        "to_date",
        "sampling_date",
        "date",
        "created_at",
    ]
    for key in keys:
        value = record.get(key)
        if not value:
            continue
        parsed = None
        for fmt in (
            None,
            "%d-%m-%Y %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ):
            try:
                if fmt is None:
                    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                else:
                    parsed = datetime.strptime(str(value), fmt)
                break
            except Exception:
                continue
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)

    now = datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def _normalize_record(record: Dict[str, Any]) -> Dict[str, Optional[float]]:
    def as_float(v: Any) -> Optional[float]:
        if v is None:
            return None
        try:
            out = float(v)
            if out < 0:
                return None
            return out
        except Exception:
            return None

    out: Dict[str, Optional[float]] = {"PM10": None, "PM2.5": None, "SO2": None, "NO2": None}
    lower_map = {str(k).lower(): v for k, v in record.items()}
    for pollutant, aliases in POLLUTANT_PARAM_MAP.items():
        for alias in aliases:
            if alias in lower_map:
                parsed = as_float(lower_map[alias])
                if parsed is not None:
                    out[pollutant] = parsed
                    break
    return out


async def _fetch_govapi(govapi_key: str) -> List[Dict[str, Any]]:
    timeout = httpx.Timeout(25.0)
    all_records: List[Dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=timeout) as client:
        limit = 1000
        offset = 0
        while True:
            resp = await client.get(
                GOV_URL,
                params={
                    "api-key": govapi_key,
                    "format": "json",
                    "limit": limit,
                    "offset": offset,
                    "filters[state]": "Chhattisgarh",
                },
            )
            resp.raise_for_status()
            payload = resp.json()
            batch = payload.get("records") or []
            if not isinstance(batch, list) or not batch:
                break
            all_records.extend(batch)
            if len(batch) < limit:
                break
            offset += limit

    return all_records


async def _default_region_id(session: AsyncSession) -> Optional[uuid.UUID]:
    row = (
        await session.execute(
            text(
                """
                SELECT id
                FROM regional_offices
                WHERE LOWER(state) LIKE '%chhattisgarh%'
                ORDER BY created_at ASC
                LIMIT 1
                """
            )
        )
    ).first()
    return row[0] if row else None


def _district_coords(district: str) -> Tuple[float, float]:
    key = _norm(district)
    if key in DISTRICT_COORDS:
        return DISTRICT_COORDS[key]
    return DISTRICT_COORDS["raipur"]


async def _ensure_station(
    session: AsyncSession,
    stations_by_iot: Dict[str, uuid.UUID],
    stations_by_name: Dict[str, uuid.UUID],
    station_name: str,
    district: str,
    region_id: Optional[uuid.UUID],
) -> uuid.UUID:
    district_text = district or "Chhattisgarh"
    station_key = _norm(station_name)
    iot_key = f"govapi-air-{_slug(station_name)}-{_slug(district_text)}"

    if iot_key in stations_by_iot:
        return stations_by_iot[iot_key]
    if station_key in stations_by_name:
        return stations_by_name[station_key]

    lat, lng = _district_coords(district_text)
    created = await session.execute(
        text(
            """
            INSERT INTO monitoring_locations (
                id,
                name,
                location,
                type,
                region_id,
                iot_device_id,
                is_active,
                created_at,
                updated_at
            )
            VALUES (
                :id,
                :name,
                :location,
                CAST(:type AS locationtype),
                :region_id,
                :iot_device_id,
                TRUE,
                NOW(),
                NOW()
            )
            RETURNING id
            """
        ),
        {
            "id": uuid.uuid4(),
            "name": station_name,
            "location": f"{lat:.4f},{lng:.4f}",
            "type": "air",
            "region_id": region_id,
            "iot_device_id": iot_key,
        },
    )
    station_id = created.scalar_one()
    stations_by_iot[iot_key] = station_id
    stations_by_name[station_key] = station_id
    return station_id


async def _insert_if_new(
    session: AsyncSession,
    station_id: uuid.UUID,
    param_id: uuid.UUID,
    recorded_at: datetime,
    value: float,
    quality_flag: str,
) -> bool:
    exists = await session.execute(
        text(
            """
            SELECT 1
            FROM sensor_readings
            WHERE location_id = :loc_id
              AND parameter_id = :param_id
              AND recorded_at = :recorded_at
            LIMIT 1
            """
        ),
        {
            "loc_id": station_id,
            "param_id": param_id,
            "recorded_at": recorded_at,
        },
    )
    if exists.fetchone() is not None:
        return False

    await session.execute(
        text(
            """
            INSERT INTO sensor_readings (
                id, location_id, parameter_id, value, unit_id, recorded_at, source, quality_flag
            ) VALUES (
                :id, :loc_id, :param_id, :value, :unit_id, :recorded_at, CAST(:source AS sourcetype), :quality_flag
            )
            """
        ),
        {
            "id": uuid.uuid4(),
            "loc_id": station_id,
            "param_id": param_id,
            "value": float(value),
            "unit_id": param_id,
            "recorded_at": recorded_at,
            "source": "manual",
            "quality_flag": quality_flag,
        },
    )
    return True
async def sync_once(session: AsyncSession, govapi_key: str) -> None:
    stations, param_map = await _load_stations_and_params(session)
    region_id = await _default_region_id(session)

    stations_by_name: Dict[str, uuid.UUID] = {_norm(s.name): s.id for s in stations if s.name}
    stations_by_iot: Dict[str, uuid.UUID] = {}

    records = await _fetch_govapi(govapi_key)
    if not records:
        raise SyncError("GovAPI returned no records")

    inserts = 0
    skipped = 0
    districts_seen: Dict[str, int] = {}

    for record in records:
        if not _is_chhattisgarh_record(record):
            continue

        station_name = _resolve_station_name(record)
        if not station_name:
            skipped += 1
            continue

        district = _resolve_district(record) or "Raipur"
        districts_seen[_norm(district)] = districts_seen.get(_norm(district), 0) + 1

        station_id = await _ensure_station(
            session=session,
            stations_by_iot=stations_by_iot,
            stations_by_name=stations_by_name,
            station_name=station_name,
            district=district,
            region_id=region_id,
        )

        ts = _extract_timestamp(record)
        values = _normalize_record(record)

        for pname, value in values.items():
            if value is None:
                continue
            created = await _insert_if_new(
                session=session,
                station_id=station_id,
                param_id=param_map[pname],
                recorded_at=ts,
                value=float(value),
                quality_flag=f"govapi:{_slug(district)}",
            )
            if created:
                inserts += 1

    await session.commit()
    logging.info(
        "Sync complete: inserted=%d skipped=%d districts=%d source=govapi",
        inserts,
        skipped,
        len(districts_seen),
    )


async def _run_scheduler(session_factory: sessionmaker, govapi_key: str) -> None:
    scheduler = AsyncIOScheduler(timezone="UTC")

    async def _job() -> None:
        async with session_factory() as session:
            await sync_once(session, govapi_key)

    scheduler.add_job(_job, trigger="interval", minutes=60, max_instances=1, coalesce=True)
    scheduler.start()
    logging.info("APScheduler started: syncing every 60 minutes")

    await _job()

    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        pass
    finally:
        scheduler.shutdown(wait=False)


async def main(with_scheduler: bool) -> None:
    _configure_logging()
    database_url, govapi_key = _load_env()

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        if with_scheduler:
            await _run_scheduler(session_factory, govapi_key)
        else:
            async with session_factory() as session:
                await sync_once(session, govapi_key)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync Chhattisgarh air data from data.gov.in")
    parser.add_argument(
        "--scheduler",
        action="store_true",
        help="Run continuously and sync every 60 minutes",
    )
    args = parser.parse_args()

    try:
        asyncio.run(main(with_scheduler=args.scheduler))
    except Exception as exc:
        logging.exception("GovAPI sync failed: %s", exc)
        sys.exit(1)
