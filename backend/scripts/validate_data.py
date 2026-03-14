import asyncio
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def _load_env() -> str:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    for env_file in (backend_root / ".env", project_root / ".env"):
        if env_file.exists():
            load_dotenv(env_file)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL not found in environment")
    return database_url


async def _station_summary(session: AsyncSession) -> List[Dict[str, object]]:
    result = await session.execute(
        text(
            """
            SELECT
                ml.id,
                ml.name,
                COUNT(sr.id) AS row_count,
                MIN(sr.recorded_at) AS min_time,
                MAX(sr.recorded_at) AS max_time,
                MIN(sr.value) AS min_value,
                MAX(sr.value) AS max_value,
                SUM(CASE WHEN sr.value IS NULL THEN 1 ELSE 0 END) AS null_count,
                COALESCE(a.anomaly_count, 0) AS anomaly_count
            FROM monitoring_locations ml
            LEFT JOIN sensor_readings sr
                ON sr.location_id = ml.id
            LEFT JOIN (
                SELECT location_id, COUNT(*) AS anomaly_count
                FROM alerts
                WHERE type = 'anomaly'
                GROUP BY location_id
            ) a
                ON a.location_id = ml.id
            WHERE ml.type = 'air'
            GROUP BY ml.id, ml.name, a.anomaly_count
            ORDER BY ml.name ASC
            """
        )
    )

    rows = []
    for row in result.fetchall():
        rows.append(
            {
                "station_id": str(row[0]),
                "name": row[1],
                "row_count": int(row[2] or 0),
                "min_time": row[3],
                "max_time": row[4],
                "min_value": row[5],
                "max_value": row[6],
                "null_count": int(row[7] or 0),
                "anomaly_count": int(row[8] or 0),
            }
        )
    return rows


async def _forecast_check(session: AsyncSession) -> Tuple[bool, str]:
    result = await session.execute(
        text(
            """
            WITH air_locs AS (
                SELECT id FROM monitoring_locations WHERE type = 'air' AND is_active = TRUE
            ),
            air_params AS (
                SELECT id FROM monitoring_units WHERE UPPER(parameter) IN ('PM10', 'PM2.5', 'SO2', 'NO2', 'CO', 'O3')
            ),
            combos AS (
                SELECT l.id AS location_id, p.id AS parameter_id
                FROM air_locs l
                CROSS JOIN air_params p
            ),
            latest AS (
                SELECT DISTINCT ON (f.location_id, f.parameter_id)
                    f.location_id,
                    f.parameter_id,
                    f.point_forecast
                FROM forecasts f
                ORDER BY f.location_id, f.parameter_id, f.created_at DESC
            )
            SELECT
                (SELECT COUNT(*) FROM combos) AS expected_combos,
                SUM(CASE WHEN latest.location_id IS NOT NULL
                          AND jsonb_array_length(latest.point_forecast) >= 72
                         THEN 1 ELSE 0 END) AS combos_with_72
            FROM combos
            LEFT JOIN latest
              ON latest.location_id = combos.location_id
             AND latest.parameter_id = combos.parameter_id
            """
        )
    )
    row = result.fetchone()
    expected = int(row[0] or 0)
    got = int(row[1] or 0)
    ok = expected > 0 and expected == got
    return ok, f"expected={expected} combos_with_72={got}"


async def _limits_check(session: AsyncSession) -> Tuple[bool, str]:
    result = await session.execute(
        text(
            """
            WITH air_params AS (
                SELECT id, parameter
                FROM monitoring_units
                WHERE UPPER(parameter) IN ('PM10', 'PM2.5', 'SO2', 'NO2', 'CO', 'O3')
            ),
            covered AS (
                SELECT DISTINCT parameter_id
                FROM prescribed_limits
            )
            SELECT
                COUNT(*) AS total_params,
                SUM(CASE WHEN c.parameter_id IS NOT NULL THEN 1 ELSE 0 END) AS covered_params
            FROM air_params p
            LEFT JOIN covered c ON c.parameter_id = p.id
            """
        )
    )
    row = result.fetchone()
    total = int(row[0] or 0)
    covered = int(row[1] or 0)
    ok = total > 0 and total == covered
    return ok, f"total_air_parameters={total} covered_by_limits={covered}"


def _print_station_table(rows: List[Dict[str, object]]) -> None:
    print("\n=== AIR SENSOR SUMMARY ===")
    print("station | rows | date_range | min | max | nulls | anomalies")
    for r in rows:
        date_range = f"{r['min_time']} -> {r['max_time']}"
        print(
            f"{r['name']} | {r['row_count']} | {date_range} | "
            f"{r['min_value']} | {r['max_value']} | {r['null_count']} | {r['anomaly_count']}"
        )


async def main() -> None:
    _configure_logging()
    database_url = _load_env()

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as session:
            rows = await _station_summary(session)
            _print_station_table(rows)

            station_ok = all(r["row_count"] > 0 for r in rows) and len(rows) > 0
            print(f"\nCHECK station_data: {'PASS' if station_ok else 'FAIL'} (stations={len(rows)})")

            forecast_ok, forecast_msg = await _forecast_check(session)
            print(f"CHECK forecasts_72h: {'PASS' if forecast_ok else 'FAIL'} ({forecast_msg})")

            limits_ok, limits_msg = await _limits_check(session)
            print(f"CHECK limits_coverage: {'PASS' if limits_ok else 'FAIL'} ({limits_msg})")

            overall = station_ok and forecast_ok and limits_ok
            print(f"\nOVERALL: {'PASS' if overall else 'FAIL'}")

            if not overall:
                raise RuntimeError("Phase 3 validation failed. See checks above.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        logging.exception("Validation failed: %s", exc)
        sys.exit(1)
