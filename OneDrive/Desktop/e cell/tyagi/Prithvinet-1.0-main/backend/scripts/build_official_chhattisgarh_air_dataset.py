import argparse
import asyncio
import csv
import json
import os
import re
import sys
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker


GOV_AIR_RESOURCE_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
OUTPUT_PREFIX = "official_air_chhattisgarh"

POLLUTANT_ALIASES = {
    "PM10": ["pm10", "pm_10", "rspfpm10", "respirable_particulate_matter"],
    "PM2.5": ["pm2_5", "pm2.5", "pm25", "pm_2_5", "fine_particulate_matter"],
    "SO2": ["so2", "sulphur_dioxide", "sulfur_dioxide"],
    "NO2": ["no2", "nitrogen_dioxide"],
}


@dataclass
class NormalizedRecord:
    state: str
    district: str
    city: str
    station_name: str
    timestamp_utc: datetime
    pm10: Optional[float]
    pm25: Optional[float]
    so2: Optional[float]
    no2: Optional[float]


def _norm(text_value: str) -> str:
    return re.sub(r"\s+", " ", (text_value or "").strip().lower())


def _slug(text_value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", _norm(text_value)).strip("-")
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


def _parse_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


def _extract_timestamp(record: Dict[str, Any]) -> datetime:
    candidate_keys = [
        "last_update",
        "last_update_date",
        "from_date",
        "to_date",
        "sampling_date",
        "date",
        "created_at",
    ]
    for key in candidate_keys:
        value = record.get(key)
        if not value:
            continue
        for fmt in (None, "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                if fmt is None:
                    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                else:
                    parsed = datetime.strptime(str(value), fmt)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return parsed.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
            except Exception:
                continue
    now = datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def _extract_pollutants(record: Dict[str, Any]) -> Dict[str, Optional[float]]:
    lowered = {str(k).lower(): v for k, v in record.items()}
    out = {"PM10": None, "PM2.5": None, "SO2": None, "NO2": None}
    for pollutant, aliases in POLLUTANT_ALIASES.items():
        for alias in aliases:
            if alias in lowered:
                parsed = _parse_float(lowered[alias])
                if parsed is not None:
                    out[pollutant] = parsed
                    break
    return out


def _is_chhattisgarh(state: str, district: str, city: str, station_name: str) -> bool:
    blob = _norm(f"{state} {district} {city} {station_name}")
    return "chhattisgarh" in blob or "chattisgarh" in blob


def _normalize_record(record: Dict[str, Any]) -> Optional[NormalizedRecord]:
    state = _first_non_empty(record, ["state", "state_name"])
    district = _first_non_empty(record, ["district", "state_district"])
    city = _first_non_empty(record, ["city", "city_name"])
    station_name = _first_non_empty(
        record,
        ["station", "station_name", "location", "location_name", "site", "site_name", "area", "city"],
    )
    if not station_name:
        return None
    if not _is_chhattisgarh(state, district, city, station_name):
        return None

    pollutants = _extract_pollutants(record)
    if all(v is None for v in pollutants.values()):
        return None

    return NormalizedRecord(
        state=state or "Chhattisgarh",
        district=district or city or "Unknown",
        city=city or district or "Unknown",
        station_name=station_name,
        timestamp_utc=_extract_timestamp(record),
        pm10=pollutants["PM10"],
        pm25=pollutants["PM2.5"],
        so2=pollutants["SO2"],
        no2=pollutants["NO2"],
    )


def _load_env() -> tuple[str, str]:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    for env_file in (backend_root / ".env", project_root / ".env"):
        if env_file.exists():
            load_dotenv(env_file)

    govapi_key = os.getenv("GOVAPI_KEY")
    database_url = os.getenv("DATABASE_URL", "")
    if not govapi_key:
        raise RuntimeError("GOVAPI_KEY missing in environment (.env)")
    return govapi_key, database_url


async def _fetch_all_records(govapi_key: str, limit: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    offset = 0

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        while True:
            response = await client.get(
                GOV_AIR_RESOURCE_URL,
                params={
                    "api-key": govapi_key,
                    "format": "json",
                    "limit": limit,
                    "offset": offset,
                    "filters[state]": "Chhattisgarh",
                },
            )
            response.raise_for_status()
            payload = response.json()
            batch = payload.get("records") or []
            if not isinstance(batch, list) or not batch:
                break
            out.extend(batch)
            if len(batch) < limit:
                break
            offset += limit

    return out


def _to_rows(records: List[NormalizedRecord]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for rec in records:
        for parameter, value in (("PM10", rec.pm10), ("PM2.5", rec.pm25), ("SO2", rec.so2), ("NO2", rec.no2)):
            if value is None:
                continue
            rows.append(
                {
                    "state": rec.state,
                    "district": rec.district,
                    "city": rec.city,
                    "station_name": rec.station_name,
                    "timestamp_utc": rec.timestamp_utc.isoformat(),
                    "parameter": parameter,
                    "value": value,
                    "unit": "ug/m3",
                    "source": "data.gov.in",
                }
            )
    return rows


async def _import_to_db(database_url: str, rows: List[Dict[str, Any]]) -> int:
    if not database_url:
        raise RuntimeError("DATABASE_URL missing in environment (.env)")

    engine = create_async_engine(database_url, echo=False)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    inserted = 0

    async with SessionLocal() as session:
        parameter_rows = (
            await session.execute(text("SELECT id, parameter FROM monitoring_units"))
        ).fetchall()
        parameter_map = {(row[1] or "").strip().upper(): row[0] for row in parameter_rows}

        needed = ["PM10", "PM2.5", "SO2", "NO2"]
        missing = [name for name in needed if name.upper() not in parameter_map]
        if missing:
            raise RuntimeError(f"Missing monitoring_units rows for: {', '.join(missing)}")

        station_cache: Dict[str, uuid.UUID] = {}
        existing_stations = (
            await session.execute(
                text("SELECT id, name, COALESCE(iot_device_id, '') FROM monitoring_locations WHERE type = 'air'")
            )
        ).fetchall()
        for station_id, station_name, iot_id in existing_stations:
            if station_name:
                station_cache[f"name:{_norm(station_name)}"] = station_id
            if iot_id:
                station_cache[f"iot:{iot_id}"] = station_id

        region_id = (
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
        ).scalar()

        for row in rows:
            station_name = row["station_name"]
            district = row["district"]
            iot_device_id = f"govapi-air-{_slug(station_name)}-{_slug(district)}"

            station_id = station_cache.get(f"iot:{iot_device_id}") or station_cache.get(f"name:{_norm(station_name)}")
            if station_id is None:
                created = await session.execute(
                    text(
                        """
                        INSERT INTO monitoring_locations (
                            id, name, location, type, region_id, iot_device_id, is_active, created_at, updated_at
                        )
                        VALUES (
                            :id, :name, :location, CAST(:type AS locationtype), :region_id, :iot_device_id, TRUE, NOW(), NOW()
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "id": uuid.uuid4(),
                        "name": station_name,
                        "location": None,
                        "type": "air",
                        "region_id": region_id,
                        "iot_device_id": iot_device_id,
                    },
                )
                station_id = created.scalar_one()
                station_cache[f"iot:{iot_device_id}"] = station_id
                station_cache[f"name:{_norm(station_name)}"] = station_id

            parameter_name = row["parameter"].upper()
            parameter_id = parameter_map[parameter_name]
            recorded_at = datetime.fromisoformat(row["timestamp_utc"])

            exists = await session.execute(
                text(
                    """
                    SELECT 1
                    FROM sensor_readings
                    WHERE location_id = :location_id
                      AND parameter_id = :parameter_id
                      AND recorded_at = :recorded_at
                    LIMIT 1
                    """
                ),
                {
                    "location_id": station_id,
                    "parameter_id": parameter_id,
                    "recorded_at": recorded_at,
                },
            )
            if exists.fetchone() is not None:
                continue

            await session.execute(
                text(
                    """
                    INSERT INTO sensor_readings (
                        id, location_id, parameter_id, value, unit_id, recorded_at, source, quality_flag
                    )
                    VALUES (
                        :id, :location_id, :parameter_id, :value, :unit_id, :recorded_at,
                        CAST(:source AS sourcetype), :quality_flag
                    )
                    """
                ),
                {
                    "id": uuid.uuid4(),
                    "location_id": station_id,
                    "parameter_id": parameter_id,
                    "value": float(row["value"]),
                    "unit_id": parameter_id,
                    "recorded_at": recorded_at,
                    "source": "manual",
                    "quality_flag": "govapi-official",
                },
            )
            inserted += 1

        await session.commit()

    await engine.dispose()
    return inserted


async def run(limit: int, import_db: bool) -> None:
    govapi_key, database_url = _load_env()

    raw_records = await _fetch_all_records(govapi_key=govapi_key, limit=limit)
    normalized = [item for item in (_normalize_record(r) for r in raw_records) if item is not None]
    rows = _to_rows(normalized)

    output_dir = Path(__file__).resolve().parents[1] / "data" / "trusted_sources"
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    csv_path = output_dir / f"{OUTPUT_PREFIX}_{timestamp}.csv"
    manifest_path = output_dir / f"{OUTPUT_PREFIX}_{timestamp}_sources.json"

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "state",
                "district",
                "city",
                "station_name",
                "timestamp_utc",
                "parameter",
                "value",
                "unit",
                "source",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    district_counter = Counter(_norm(r.district) for r in normalized)
    station_counter = Counter(_norm(r.station_name) for r in normalized)

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "provider": "data.gov.in",
        "resource_url": GOV_AIR_RESOURCE_URL,
        "filters": {"state": "Chhattisgarh"},
        "raw_record_count": len(raw_records),
        "normalized_record_count": len(normalized),
        "flattened_row_count": len(rows),
        "district_count": len(district_counter),
        "station_count": len(station_counter),
        "districts": sorted(district_counter.keys()),
        "output_csv": str(csv_path),
    }
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)

    print(f"Saved dataset CSV: {csv_path}")
    print(f"Saved source manifest: {manifest_path}")
    print(f"Rows: {len(rows)} | Districts: {len(district_counter)} | Stations: {len(station_counter)}")

    if import_db:
        inserted = await _import_to_db(database_url=database_url, rows=rows)
        print(f"Imported into DB: {inserted} new sensor_readings")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build official Chhattisgarh air dataset from data.gov.in and optionally import into DB."
    )
    parser.add_argument("--limit", type=int, default=1000, help="Page size per API request")
    parser.add_argument("--import-db", action="store_true", help="Import dataset rows into DB")
    args = parser.parse_args()

    try:
        asyncio.run(run(limit=args.limit, import_db=args.import_db))
    except Exception as exc:
        print(f"Dataset build failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
