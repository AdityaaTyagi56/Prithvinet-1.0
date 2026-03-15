import argparse
import asyncio
import csv
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.core import MonitoringLocation, MonitoringUnit
from app.models.monitoring import SensorReading, SourceType

OPEN_METEO_ARCHIVE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
SOURCE_NOTES = {
    "provider": "Open-Meteo Air Quality API",
    "dataset": "Copernicus Atmosphere Monitoring Service (CAMS) global forecast/analysis products",
    "variables": ["pm2_5", "nitrogen_dioxide", "sulphur_dioxide"],
    "api_docs": "https://open-meteo.com/en/docs/air-quality-api",
}

POLLUTANT_MAP = {
    "PM2.5": "pm2_5",
    "NO2": "nitrogen_dioxide",
    "SO2": "sulphur_dioxide",
}


@dataclass
class LocationInfo:
    id: str
    name: str
    latitude: float
    longitude: float


def parse_coordinates(raw: str | None) -> tuple[float, float] | None:
    if not raw:
        return None
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 2:
        return None
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        return None


async def get_locations(session: AsyncSession) -> list[LocationInfo]:
    result = await session.execute(select(MonitoringLocation))
    locations = []
    for idx, loc in enumerate(result.scalars().all()):
        if (loc.name or "").strip().lower().startswith("stack "):
            continue
        parsed = parse_coordinates(loc.location)
        if not parsed and loc.name == "Central Station":
            parsed = (21.2514, 81.6296)
        if not parsed and loc.name == "Bharat Steel":
            parsed = (21.2315, 81.6521)
        if not parsed:
            parsed = (21.20 + (idx * 0.01), 81.55 + (idx * 0.008))
        if not parsed:
            continue
        locations.append(LocationInfo(id=str(loc.id), name=loc.name, latitude=parsed[0], longitude=parsed[1]))
    return locations


async def get_parameter_ids(session: AsyncSession) -> dict[str, str]:
    result = await session.execute(select(MonitoringUnit))
    by_param = {u.parameter: str(u.id) for u in result.scalars().all()}
    missing = [p for p in POLLUTANT_MAP if p not in by_param]
    if missing:
        raise RuntimeError(f"Missing monitoring units in DB: {', '.join(missing)}")
    return by_param


async def fetch_open_meteo_hourly(
    client: httpx.AsyncClient,
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(POLLUTANT_MAP.values()),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "timezone": "UTC",
    }
    res = await client.get(OPEN_METEO_ARCHIVE_URL, params=params, timeout=60)
    res.raise_for_status()
    return res.json()


def build_rows(location: LocationInfo, payload: dict[str, Any]) -> list[dict[str, Any]]:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    rows: list[dict[str, Any]] = []

    for idx, ts in enumerate(times):
        for parameter, source_key in POLLUTANT_MAP.items():
            values = hourly.get(source_key, [])
            if idx >= len(values):
                continue
            value = values[idx]
            if value is None:
                continue

            rows.append(
                {
                    "location_id": location.id,
                    "location_name": location.name,
                    "latitude": location.latitude,
                    "longitude": location.longitude,
                    "timestamp_utc": ts,
                    "parameter": parameter,
                    "value": float(value),
                    "unit": "ug/m3",
                    "source": "open-meteo-cams",
                }
            )
    return rows


async def import_rows_to_db(
    session: AsyncSession,
    rows: list[dict[str, Any]],
    parameter_ids: dict[str, str],
    replace_start: datetime | None,
) -> int:
    if replace_start is not None:
        await session.execute(delete(SensorReading).where(SensorReading.recorded_at >= replace_start))

    inserts: list[SensorReading] = []
    for row in rows:
        recorded_at = datetime.fromisoformat(row["timestamp_utc"]).replace(tzinfo=timezone.utc)
        parameter_id = parameter_ids[row["parameter"]]
        inserts.append(
            SensorReading(
                location_id=row["location_id"],
                parameter_id=parameter_id,
                value=row["value"],
                unit_id=parameter_id,
                recorded_at=recorded_at,
                source=SourceType.manual,
            )
        )

    chunk_size = 5000
    for i in range(0, len(inserts), chunk_size):
        session.add_all(inserts[i : i + chunk_size])
        await session.flush()

    await session.commit()
    return len(inserts)


async def generate(days: int, import_db: bool, replace_range: bool) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    end_day = date.today()
    start_day = end_day - timedelta(days=days)

    output_dir = Path(__file__).parent / "data" / "trusted_sources"
    output_dir.mkdir(parents=True, exist_ok=True)

    async with async_session() as session:
        locations = await get_locations(session)
        if not locations:
            raise RuntimeError("No monitoring locations with coordinates found. Seed locations first.")

        parameter_ids = await get_parameter_ids(session)

        all_rows: list[dict[str, Any]] = []
        async with httpx.AsyncClient() as client:
            for loc in locations:
                payload = await fetch_open_meteo_hourly(
                    client=client,
                    latitude=loc.latitude,
                    longitude=loc.longitude,
                    start_date=start_day,
                    end_date=end_day,
                )
                rows = build_rows(loc, payload)
                all_rows.extend(rows)
                print(f"Fetched {len(rows)} rows for {loc.name}")

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        csv_path = output_dir / f"air_quality_dataset_{timestamp}.csv"
        json_path = output_dir / f"air_quality_dataset_{timestamp}_sources.json"

        if all_rows:
            with csv_path.open("w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=[
                        "location_id",
                        "location_name",
                        "latitude",
                        "longitude",
                        "timestamp_utc",
                        "parameter",
                        "value",
                        "unit",
                        "source",
                    ],
                )
                writer.writeheader()
                writer.writerows(all_rows)

        manifest = {
            "generated_at_utc": datetime.utcnow().isoformat() + "Z",
            "date_window": {"start": start_day.isoformat(), "end": end_day.isoformat()},
            "row_count": len(all_rows),
            "location_count": len(locations),
            "source": SOURCE_NOTES,
            "api_url": OPEN_METEO_ARCHIVE_URL,
            "output_csv": str(csv_path),
        }

        with json_path.open("w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        print(f"Saved dataset CSV: {csv_path}")
        print(f"Saved source manifest: {json_path}")

        if import_db:
            replace_start = datetime.combine(start_day, datetime.min.time(), tzinfo=timezone.utc) if replace_range else None
            inserted = await import_rows_to_db(
                session=session,
                rows=all_rows,
                parameter_ids=parameter_ids,
                replace_start=replace_start,
            )
            print(f"Imported {inserted} rows into sensor_readings (source=manual)")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate realistic air quality dataset from trusted public API.")
    parser.add_argument("--days", type=int, default=30, help="Number of past days to fetch")
    parser.add_argument("--import-db", action="store_true", help="Import fetched data into sensor_readings table")
    parser.add_argument(
        "--replace-range",
        action="store_true",
        help="Delete existing readings in fetched date range before import",
    )
    args = parser.parse_args()

    asyncio.run(generate(days=args.days, import_db=args.import_db, replace_range=args.replace_range))


if __name__ == "__main__":
    main()
