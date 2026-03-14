"""
Air quality endpoints for PrithviNet.

GET /api/v1/air/readings/{station_id}     – time-series for a station
GET /api/v1/air/forecast/{station_id}     – 72-hour Prophet forecast
GET /api/v1/air/heatmap                   – map heat-layer payload (Redis-cached 5 min)
GET /api/v1/air/compliance                – compliance events + city score
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import redis_client
from app.services.ml_service import generate_forecast

router = APIRouter(prefix="/air", tags=["Air"])

# ── Helpers ───────────────────────────────────────────────────────────────────

def _intensity_status(intensity: float) -> str:
    if intensity >= 1.5:
        return "CRITICAL"
    if intensity >= 1.0:
        return "HIGH"
    if intensity >= 0.75:
        return "MODERATE"
    return "SAFE"


def _parse_coords(raw: Optional[str]) -> tuple[Optional[float], Optional[float]]:
    if not raw:
        return None, None
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 2:
        return None, None
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        return None, None


# ── 1. Time-series readings ───────────────────────────────────────────────────

@router.get("/readings/{station_id}")
async def get_air_readings(
    station_id: str,
    parameter: Optional[str] = Query(None, description="Parameter name e.g. PM2.5"),
    from_time: Optional[datetime] = Query(None),
    to_time: Optional[datetime] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns time-series sensor readings for an air station.
    Anomalous rows are flagged via is_anomaly=true (quality_flag='anomaly').
    """
    try:
        loc_uuid = uuid.UUID(station_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="station_id must be a valid UUID")

    # Verify station exists and is air-type
    loc_row = (
        await db.execute(
            text(
                "SELECT name FROM monitoring_locations WHERE id = :id AND type = 'air'"
            ),
            {"id": loc_uuid},
        )
    ).fetchone()
    if not loc_row:
        raise HTTPException(status_code=404, detail="Air station not found")

    filters = ["sr.location_id = :loc_id"]
    params: dict = {"loc_id": loc_uuid}

    if parameter:
        filters.append("UPPER(mu.parameter) = UPPER(:param)")
        params["param"] = parameter

    if from_time:
        filters.append("sr.recorded_at >= :from_time")
        params["from_time"] = from_time

    if to_time:
        filters.append("sr.recorded_at <= :to_time")
        params["to_time"] = to_time

    where = " AND ".join(filters)
    params["limit"] = limit

    rows = (
        await db.execute(
            text(
                f"""
                SELECT
                    sr.recorded_at  AS time,
                    mu.parameter    AS parameter,
                    sr.value        AS value,
                    mu.unit         AS unit,
                    CASE WHEN sr.quality_flag = 'anomaly' THEN TRUE ELSE FALSE END AS is_anomaly
                FROM sensor_readings sr
                JOIN monitoring_units mu ON mu.id = sr.parameter_id
                WHERE {where}
                ORDER BY sr.recorded_at ASC
                LIMIT :limit
                """
            ),
            params,
        )
    ).mappings().all()

    return [dict(r) for r in rows]


# ── 2. 72-hour Prophet forecast ───────────────────────────────────────────────

@router.get("/forecast/{station_id}")
async def get_air_forecast(
    station_id: str,
    parameter: str = Query(..., description="Parameter name e.g. PM2.5"),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns 72-hour forecast from DB (or triggers Prophet on-demand if absent).
    """
    try:
        loc_uuid = uuid.UUID(station_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="station_id must be a valid UUID")

    param_row = (
        await db.execute(
            text(
                "SELECT id FROM monitoring_units WHERE UPPER(parameter) = UPPER(:p)"
            ),
            {"p": parameter},
        )
    ).fetchone()
    if not param_row:
        raise HTTPException(status_code=404, detail=f"Parameter '{parameter}' not found")

    param_id = str(param_row[0])

    # Try DB first
    db_row = (
        await db.execute(
            text(
                """
                SELECT point_forecast, lower_bound, upper_bound, created_at
                FROM forecasts
                WHERE location_id = :loc_id AND parameter_id = :param_id
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {"loc_id": loc_uuid, "param_id": param_row[0]},
        )
    ).fetchone()

    if db_row:
        point = db_row[0] if isinstance(db_row[0], list) else json.loads(db_row[0])
        lower = db_row[1] if isinstance(db_row[1], list) else json.loads(db_row[1])
        upper = db_row[2] if isinstance(db_row[2], list) else json.loads(db_row[2])

        forecasts = []
        for p, lo, hi in zip(point, lower, upper):
            forecasts.append(
                {
                    "time": p.get("timestamp") or p.get("time"),
                    "value": p.get("value") or p.get("point"),
                    "lower_ci": lo.get("value") or lo.get("lower"),
                    "upper_ci": hi.get("value") or hi.get("upper"),
                }
            )

        return {
            "station_id": station_id,
            "parameter": parameter,
            "generated_at": db_row[3].isoformat() if db_row[3] else None,
            "forecasts": forecasts,
        }

    # On-demand fall-through: run Prophet / fallback in ml_service
    try:
        result = await generate_forecast(db, station_id, param_id, hours=72)
    except Exception:
        await db.rollback()
        result = []

    return {
        "station_id": station_id,
        "parameter": parameter,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "forecasts": [
            {
                "time": p.get("timestamp"),
                "value": p.get("point"),
                "lower_ci": p.get("lower"),
                "upper_ci": p.get("upper"),
            }
            for p in result
        ],
    }


# ── 3. Heatmap (Redis-cached 5 min) ──────────────────────────────────────────

HEATMAP_CACHE_KEY = "air:heatmap"
HEATMAP_TTL = 300  # seconds


@router.get("/heatmap")
async def get_air_heatmap(db: AsyncSession = Depends(get_db)):
    """
    Returns latest reading per station per parameter with intensity + status.
    intensity = current_value / prescribed_limit
    status    = CRITICAL / HIGH / MODERATE / SAFE
    Cached in Redis for 5 minutes.
    """
    cached = await redis_client.get(HEATMAP_CACHE_KEY)
    if cached:
        return json.loads(cached)

    rows = (
        await db.execute(
            text(
                """
                SELECT DISTINCT ON (sr.location_id, sr.parameter_id)
                    ml.id::text            AS station_id,
                    ml.name                AS station_name,
                    ml.location            AS coordinates,
                    mu.parameter           AS parameter,
                    sr.value               AS value,
                    mu.unit                AS unit,
                    pl.limit_value         AS limit_value
                FROM sensor_readings sr
                JOIN monitoring_units     mu ON mu.id = sr.parameter_id
                JOIN monitoring_locations ml ON ml.id = sr.location_id
                LEFT JOIN prescribed_limits pl
                    ON pl.parameter_id = mu.id
                    AND pl.limit_type::text = 'max'
                WHERE ml.type = 'air'
                ORDER BY sr.location_id, sr.parameter_id, sr.recorded_at DESC
                """
            )
        )
    ).mappings().all()

    result = []
    for r in rows:
        lat, lng = _parse_coords(r["coordinates"])
        limit_value = float(r["limit_value"]) if r["limit_value"] else None
        value = float(r["value"])
        intensity = round(value / limit_value, 4) if limit_value else None

        result.append(
            {
                "station_id": r["station_id"],
                "station_name": r["station_name"],
                "lat": lat,
                "lng": lng,
                "parameter": r["parameter"],
                "value": value,
                "unit": r["unit"],
                "intensity": intensity,
                "status": _intensity_status(intensity) if intensity is not None else "UNKNOWN",
            }
        )

    await redis_client.setex(HEATMAP_CACHE_KEY, HEATMAP_TTL, json.dumps(result))
    return result


# ── 4. Compliance events + city score ────────────────────────────────────────

@router.get("/compliance")
async def get_air_compliance(
    city: Optional[str] = Query(None),
    severity: Optional[str] = Query(None, description="low|medium|high|critical"),
    from_time: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns live compliance events (alerts for limit breaches) joined with
    station + parameter info, plus compliance_score per city (last 7 days).
    """
    # ── Compliance events ─────────────────────────────────────────────────────
    filters = ["ml.type = 'air'", "a.type = 'limit_breach'"]
    params: dict = {}

    if city:
        filters.append("(ro.name ILIKE :city OR ro.district ILIKE :city)")
        params["city"] = f"%{city}%"

    if severity:
        filters.append("a.severity::text = :severity")
        params["severity"] = severity

    if from_time:
        filters.append("a.created_at >= :from_time")
        params["from_time"] = from_time

    where = " AND ".join(filters)

    events = (
        await db.execute(
            text(
                f"""
                SELECT
                    a.id::text            AS id,
                    ml.name               AS station,
                    COALESCE(ro.name, ro.district, 'Unknown') AS city,
                    mu.parameter          AS parameter,
                    a.value               AS value,
                    a.threshold           AS threshold,
                    a.severity::text      AS severity,
                    a.status::text        AS status,
                    a.created_at          AS triggered_at
                FROM alerts a
                JOIN monitoring_locations ml ON ml.id = a.location_id
                LEFT JOIN regional_offices ro ON ro.id = ml.region_id
                JOIN monitoring_units mu ON mu.id = a.parameter_id
                WHERE {where}
                ORDER BY a.created_at DESC
                LIMIT 200
                """
            ),
            params,
        )
    ).mappings().all()

    # ── Compliance score per city (last 7 days) ───────────────────────────────
    city_score_rows = (
        await db.execute(
            text(
                """
                WITH readings_7d AS (
                    SELECT
                        COALESCE(ro.name, ro.district, 'Unknown') AS city,
                        COUNT(*) AS total,
                        SUM(
                            CASE
                                WHEN pl.limit_type::text = 'max' AND sr.value <= pl.limit_value THEN 1
                                WHEN pl.limit_type::text = 'min' AND sr.value >= pl.limit_value THEN 1
                                ELSE 0
                            END
                        ) AS compliant
                    FROM sensor_readings sr
                    JOIN monitoring_units mu ON mu.id = sr.parameter_id
                    JOIN monitoring_locations ml ON ml.id = sr.location_id
                    LEFT JOIN regional_offices ro ON ro.id = ml.region_id
                    LEFT JOIN prescribed_limits pl
                        ON pl.parameter_id = mu.id
                        AND pl.limit_type::text IN ('max', 'min')
                    WHERE ml.type = 'air'
                      AND sr.recorded_at >= NOW() - INTERVAL '7 days'
                    GROUP BY city
                )
                SELECT
                    city,
                    total,
                    compliant,
                    CASE WHEN total > 0
                         THEN ROUND(compliant * 100.0 / total, 2)
                         ELSE NULL
                    END AS compliance_score
                FROM readings_7d
                ORDER BY city
                """
            )
        )
    ).mappings().all()

    return {
        "events": [dict(e) for e in events],
        "compliance_scores": [dict(r) for r in city_score_rows],
    }
