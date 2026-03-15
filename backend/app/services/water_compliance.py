import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis_client
from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


@dataclass
class WaterComplianceResult:
    is_violation: bool
    severity: Optional[str] = None
    limit_value: Optional[float] = None
    rule_name: Optional[str] = None


def _to_float(value: object) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def evaluate_water_reading(station_id: int, parameter_id: int, value: float) -> WaterComplianceResult:
    # parameter_id mapping:
    # 7: pH, 8: DO, 9: BOD, 12: Coliform
    if parameter_id == 7:
        if value < 6.5:
            return WaterComplianceResult(True, "HIGH", 6.5, "PH_MIN")
        if value > 8.5:
            return WaterComplianceResult(True, "HIGH", 8.5, "PH_MAX")
        return WaterComplianceResult(False)

    if parameter_id == 8:
        if value < 6.0:
            return WaterComplianceResult(True, "HIGH", 6.0, "DO_MIN")
        return WaterComplianceResult(False)

    if parameter_id == 9:
        if station_id == 15 and value > 5.0:
            return WaterComplianceResult(True, "CRITICAL", 5.0, "BOD_DENGUR_CRITICAL")
        if value > 3.0:
            return WaterComplianceResult(True, "HIGH", 3.0, "BOD_MAX")
        return WaterComplianceResult(False)

    if parameter_id == 12:
        if station_id == 14 and value > 100.0:
            return WaterComplianceResult(True, "CRITICAL", 100.0, "COLIFORM_KELO_DS_CRITICAL")
        if value > 50.0:
            return WaterComplianceResult(True, "HIGH", 50.0, "COLIFORM_MAX")
        return WaterComplianceResult(False)

    return WaterComplianceResult(False)


async def evaluate_and_record_water_compliance(
    db: AsyncSession,
    station_id: int,
    parameter_id: int,
    reading_time: datetime,
    value: float,
) -> Optional[dict]:
    """Evaluate one reading and persist violation event if it breaches a rule."""
    result = evaluate_water_reading(station_id=station_id, parameter_id=parameter_id, value=value)
    if not result.is_violation:
        return None

    reading_time = reading_time if reading_time.tzinfo else reading_time.replace(tzinfo=timezone.utc)

    dedup_check = await db.execute(
        text(
            """
            SELECT id
            FROM compliance_events
            WHERE station_id = :station_id
              AND parameter_id = :parameter_id
              AND reading_time = :reading_time
              AND severity = :severity
            LIMIT 1
            """
        ),
        {
            "station_id": station_id,
            "parameter_id": parameter_id,
            "reading_time": reading_time,
            "severity": result.severity,
        },
    )
    if dedup_check.fetchone() is not None:
        return None

    city_row = (
        await db.execute(
            text(
                """
                SELECT COALESCE(city, 'unknown') AS city,
                       COALESCE(name, '') AS station_name
                FROM monitoring_stations
                WHERE id = :station_id
                """
            ),
            {"station_id": station_id},
        )
    ).mappings().first()

    city = (city_row["city"] if city_row else "unknown") or "unknown"
    station_name = (city_row["station_name"] if city_row else "") or ""

    inserted = await db.execute(
        text(
            """
            INSERT INTO compliance_events (
                station_id,
                parameter_id,
                reading_time,
                value,
                limit_value,
                severity,
                created_at
            )
            VALUES (
                :station_id,
                :parameter_id,
                :reading_time,
                :value,
                :limit_value,
                :severity,
                NOW()
            )
            RETURNING id
            """
        ),
        {
            "station_id": station_id,
            "parameter_id": parameter_id,
            "reading_time": reading_time,
            "value": value,
            "limit_value": result.limit_value,
            "severity": result.severity,
        },
    )
    event_id = inserted.scalar_one()

    payload = {
        "event_id": event_id,
        "station_id": station_id,
        "station_name": station_name,
        "city": city,
        "parameter_id": parameter_id,
        "reading_time": reading_time.isoformat(),
        "value": value,
        "limit_value": result.limit_value,
        "severity": result.severity,
        "rule": result.rule_name,
    }

    channel = f"alerts:{city.strip() or 'unknown'}"
    try:
        await redis_client.publish(channel, json.dumps(payload))
    except Exception as exc:
        logger.warning("Failed to publish water alert to Redis channel %s: %s", channel, exc)

    return payload


async def _compute_water_compliance_score(city: str, db: AsyncSession) -> float:
    """Returns percentage of water readings within compliance in the last 7 days for a city."""
    city = (city or "").strip()
    if not city:
        return 0.0

    result = (
        await db.execute(
            text(
                """
                WITH recent AS (
                    SELECT
                        sr.parameter_id,
                        sr.value
                    FROM sensor_readings sr
                    JOIN monitoring_stations ms ON ms.id = sr.station_id
                    WHERE LOWER(ms.city) = LOWER(:city)
                      AND sr.time >= NOW() - INTERVAL '7 days'
                      AND sr.parameter_id IN (7, 8, 9, 12)
                ),
                scored AS (
                    SELECT
                        CASE
                            WHEN parameter_id = 7 THEN (value >= 6.5 AND value <= 8.5)
                            WHEN parameter_id = 8 THEN (value >= 6.0)
                            WHEN parameter_id = 9 THEN (value <= 3.0)
                            WHEN parameter_id = 12 THEN (value <= 50.0)
                            ELSE TRUE
                        END AS is_within_limit
                    FROM recent
                )
                SELECT
                    COUNT(*)::float AS total_count,
                    COALESCE(SUM(CASE WHEN is_within_limit THEN 1 ELSE 0 END), 0)::float AS compliant_count
                FROM scored
                """
            ),
            {"city": city},
        )
    ).mappings().first()

    if not result:
        return 0.0

    total = _to_float(result["total_count"]) or 0.0
    compliant = _to_float(result["compliant_count"]) or 0.0
    if total <= 0:
        return 0.0

    return round((compliant / total) * 100.0, 2)


async def get_water_compliance_score(city: str) -> float:
    async with AsyncSessionLocal() as db:
        return await _compute_water_compliance_score(city=city, db=db)
