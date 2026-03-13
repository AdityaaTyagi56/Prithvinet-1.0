import argparse
import asyncio
import logging
import os
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
OWM_URL = "http://api.openweathermap.org/data/2.5/air_pollution"

POLLUTANT_PARAM_MAP = {
    "PM10": "PM10",
    "PM2.5": "PM2.5",
    "SO2": "SO2",
    "NO2": "NO2",
}

CITY_COORDS = {
    "raipur": (21.2514, 81.6296),
    "bhilai": (21.1938, 81.3509),
    "korba": (22.3595, 82.7501),
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


def _load_env() -> Tuple[str, str, Optional[str]]:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    for env_file in (backend_root / ".env", project_root / ".env"):
        if env_file.exists():
            load_dotenv(env_file)

    database_url = os.getenv("DATABASE_URL")
    govapi_key = os.getenv("GOVAPI_KEY")
    owm_key = os.getenv("OWM_KEY")

    if not database_url:
        raise SyncError("DATABASE_URL is missing")
    if not govapi_key:
        raise SyncError("GOVAPI_KEY is missing")

    return database_url, govapi_key, owm_key


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

    missing = [v for v in POLLUTANT_PARAM_MAP.values() if v.upper() not in params]
    if missing:
        raise SyncError(f"Missing monitoring parameters: {', '.join(missing)}")

    resolved_params = {k: params[v.upper()] for k, v in POLLUTANT_PARAM_MAP.items()}
    return stations, resolved_params


def _station_match(stations: List[Station], text_blob: str) -> Optional[uuid.UUID]:
    blob = text_blob.lower()

    def first_match(*keywords: str) -> Optional[uuid.UUID]:
        for s in stations:
            hay = f"{s.name} {s.location}".lower()
            if all(k in hay for k in keywords):
                return s.id
        return None

    if "raipur" in blob and "industrial" in blob:
        hit = first_match("raipur", "industrial")
        if hit:
            return hit

    if "raipur" in blob and "residential" in blob:
        hit = first_match("raipur", "residential")
        if hit:
            return hit

    if "bhilai" in blob and "industrial" in blob:
        hit = first_match("bhilai", "industrial")
        if hit:
            return hit

    if "korba" in blob:
        hit = first_match("korba")
        if hit:
            return hit

    if "bhilai" in blob:
        # Any non-industrial Bhilai fallback
        for s in stations:
            hay = f"{s.name} {s.location}".lower()
            if "bhilai" in hay and "industrial" not in hay:
                return s.id

    return None


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

    return {
        "PM10": as_float(record.get("pm10") or record.get("PM10")),
        "PM2.5": as_float(record.get("pm2_5") or record.get("PM2.5") or record.get("pm25")),
        "SO2": as_float(record.get("so2") or record.get("SO2")),
        "NO2": as_float(record.get("no2") or record.get("NO2")),
    }


async def _fetch_govapi(govapi_key: str) -> List[Dict[str, Any]]:
    params = {
        "api-key": govapi_key,
        "format": "json",
        "limit": 500,
        "filters[state]": "Chhattisgarh",
    }
    timeout = httpx.Timeout(25.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(GOV_URL, params=params)
        resp.raise_for_status()
        payload = resp.json()

    records = payload.get("records") or []
    if not isinstance(records, list):
        return []
    return records


async def _fetch_owm(owm_key: str) -> List[Dict[str, Any]]:
    if not owm_key:
        return []

    timeout = httpx.Timeout(25.0)
    out: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=timeout) as client:
        for city, (lat, lon) in CITY_COORDS.items():
            resp = await client.get(
                OWM_URL,
                params={"lat": lat, "lon": lon, "appid": owm_key},
            )
            resp.raise_for_status()
            payload = resp.json()
            items = payload.get("list") or []
            if not items:
                continue
            item = items[0]
            components = item.get("components") or {}
            dt_unix = item.get("dt")
            dt = (
                datetime.fromtimestamp(int(dt_unix), tz=timezone.utc)
                if dt_unix is not None
                else datetime.now(timezone.utc)
            )
            out.append(
                {
                    "city": city,
                    "station": city,
                    "timestamp": dt.replace(minute=0, second=0, microsecond=0),
                    "values": {
                        "PM10": components.get("pm10"),
                        "PM2.5": components.get("pm2_5"),
                        "SO2": components.get("so2"),
                        "NO2": components.get("no2"),
                    },
                }
            )
    return out


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


async def sync_once(session: AsyncSession, govapi_key: str, owm_key: Optional[str]) -> None:
    stations, param_map = await _load_stations_and_params(session)

    used_source = "govapi"
    inserts = 0

    records: List[Dict[str, Any]] = []
    try:
        records = await _fetch_govapi(govapi_key)
        if not records:
            raise SyncError("GovAPI returned no records")
    except Exception as exc:
        logging.warning("GovAPI failed or empty, switching to OpenWeather fallback: %s", exc)
        used_source = "openweathermap"
        fallback = await _fetch_owm(owm_key or "")
        if not fallback:
            raise SyncError("Both GovAPI and OpenWeather fallback failed")

        for item in fallback:
            city = item["city"]
            station_id = _station_match(stations, city)
            if not station_id:
                continue
            ts = item["timestamp"]
            values = _normalize_record(item["values"])
            for pname, value in values.items():
                if value is None:
                    continue
                created = await _insert_if_new(
                    session,
                    station_id=station_id,
                    param_id=param_map[pname],
                    recorded_at=ts,
                    value=float(value),
                    quality_flag="openweathermap",
                )
                if created:
                    inserts += 1
        await session.commit()
        logging.info("Sync complete: inserted=%d source=%s", inserts, used_source)
        return

    for record in records:
        blob = " ".join(
            [
                str(record.get("city") or ""),
                str(record.get("station") or ""),
                str(record.get("station_name") or ""),
                str(record.get("area") or ""),
                str(record.get("location") or ""),
                str(record.get("location_name") or ""),
            ]
        )
        station_id = _station_match(stations, blob)
        if not station_id:
            continue

        ts = _extract_timestamp(record)
        values = _normalize_record(record)

        for pname, value in values.items():
            if value is None:
                continue
            created = await _insert_if_new(
                session,
                station_id=station_id,
                param_id=param_map[pname],
                recorded_at=ts,
                value=float(value),
                quality_flag="govapi",
            )
            if created:
                inserts += 1

    await session.commit()
    logging.info("Sync complete: inserted=%d source=%s", inserts, used_source)


async def _run_scheduler(session_factory: sessionmaker, govapi_key: str, owm_key: Optional[str]) -> None:
    scheduler = AsyncIOScheduler(timezone="UTC")

    async def _job() -> None:
        async with session_factory() as session:
            await sync_once(session, govapi_key, owm_key)

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
    database_url, govapi_key, owm_key = _load_env()

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        if with_scheduler:
            await _run_scheduler(session_factory, govapi_key, owm_key)
        else:
            async with session_factory() as session:
                await sync_once(session, govapi_key, owm_key)
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
