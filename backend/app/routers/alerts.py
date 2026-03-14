"""
alerts.py — Real-time alert console with industry-specific endpoints.
Sources: CECB OCEMS compliance_events, CPCB RTDMS live readings,
         CPCB NWMP water exceedances, sensor_readings threshold breaches.
"""
from datetime import datetime, timedelta

from app.core.database import get_db
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/alerts", tags=["Alerts"])


# ── GET /alerts/ — main alert listing ────────────────────────────────────────
@router.get("/")
async def get_alerts(
    pollution_type: str = Query(None, description="Filter: air, water, noise, stack"),
    severity: str = Query(None, description="Filter: critical, high, medium, low"),
    status: str = Query(None, description="Filter: active, acknowledged, escalated, resolved"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns alerts from multiple sources:
    1. compliance_events (stack emissions from CECB OCEMS / CPCB RTDMS)
    2. alerts table (ambient air / water / noise threshold breaches)
    3. Synthetic fallback from sensor_readings exceeding prescribed_limits
    """

    # ── Source 1: Stack compliance events (industry emissions) ──
    stack_rows = (
        (
            await db.execute(
                text("""
                SELECT
                    'ce-' || ce.id::text                                  AS id,
                    'stack'                                               AS pollution_type,
                    COALESCE(ms.name, 'Unknown Station')                  AS location,
                    COALESCE(ms.region, 'Unknown')                        AS region,
                    COALESCE(ind.name, 'Unknown Industry')                AS industry,
                    COALESCE(ind.type, '')                                AS industry_type,
                    CASE ce.parameter_id
                        WHEN 1 THEN 'PM'
                        WHEN 3 THEN 'SO2'
                        WHEN 4 THEN 'NOx'
                        ELSE 'Unknown'
                    END                                                   AS parameter,
                    ce.value::float                                       AS value,
                    ce.limit_value::float                                 AS threshold,
                    ce.severity::text                                     AS severity,
                    'active'                                              AS status,
                    ce.created_at                                         AS triggered_at,
                    (ce.created_at + interval '2 hours')                  AS auto_escalation_at,
                    'CECB OCEMS / CPCB RTDMS'                             AS data_source
                FROM compliance_events ce
                LEFT JOIN monitoring_stations ms ON ms.id = ce.station_id
                LEFT JOIN industries ind ON ind.id = ms.industry_id
                ORDER BY ce.created_at DESC
                LIMIT :lim
                """),
                {"lim": limit},
            )
        )
        .mappings()
        .all()
    )

    # ── Source 2: Real alerts table (ambient breaches) ──
    real_rows = (
        (
            await db.execute(
                text("""
                SELECT
                    a.id::text                                            AS id,
                    'air'                                                 AS pollution_type,
                    COALESCE(ml.name, 'Unknown Location')                 AS location,
                    COALESCE(ro.name, 'Unknown Region')                   AS region,
                    COALESCE(i.name, 'Unknown Industry')                  AS industry,
                    COALESCE(i.type, '')                                  AS industry_type,
                    COALESCE(mu.parameter, 'Unknown')                     AS parameter,
                    COALESCE(a.value, 0)::float                           AS value,
                    COALESCE(a.threshold, 0)::float                       AS threshold,
                    a.severity::text                                      AS severity,
                    a.status::text                                        AS status,
                    a.created_at                                          AS triggered_at,
                    NULL                                                  AS auto_escalation_at,
                    'CPCB NAMP / data.gov.in'                             AS data_source
                FROM alerts a
                LEFT JOIN monitoring_locations ml ON ml.id = a.location_id
                LEFT JOIN regional_offices     ro ON ro.id = ml.region_id
                LEFT JOIN industries            i ON i.id  = a.industry_id
                LEFT JOIN monitoring_units     mu ON mu.id = a.parameter_id
                ORDER BY a.created_at DESC
                LIMIT :lim
                """),
                {"lim": limit},
            )
        )
        .mappings()
        .all()
    )

    # ── Source 3: Synthetic fallback from sensor_readings ──
    synthetic_rows = []
    if not real_rows and not stack_rows:
        synthetic_rows = (
            (
                await db.execute(
                    text("""
                    SELECT DISTINCT ON (ml.id, mu.parameter)
                        gen_random_uuid()::text                           AS id,
                        'air'                                             AS pollution_type,
                        COALESCE(ml.name, 'Unknown Location')             AS location,
                        COALESCE(ro.name, 'Unknown Region')               AS region,
                        COALESCE(i.name, 'Unknown Industry')              AS industry,
                        COALESCE(i.type, '')                              AS industry_type,
                        mu.parameter                                      AS parameter,
                        sr.value::float                                   AS value,
                        pl.limit_value::float                             AS threshold,
                        CASE
                            WHEN sr.value > pl.limit_value * 1.5 THEN 'critical'
                            WHEN sr.value > pl.limit_value * 1.2 THEN 'high'
                            WHEN sr.value > pl.limit_value       THEN 'medium'
                            ELSE 'low'
                        END                                               AS severity,
                        'active'                                          AS status,
                        sr.recorded_at                                    AS triggered_at,
                        (sr.recorded_at + interval '2 hours')             AS auto_escalation_at,
                        'Sensor readings'                                 AS data_source
                    FROM sensor_readings sr
                    JOIN monitoring_units       mu ON mu.id  = sr.parameter_id
                    JOIN monitoring_locations   ml ON ml.id  = sr.location_id
                    LEFT JOIN regional_offices  ro ON ro.id  = ml.region_id
                    LEFT JOIN industries         i ON i.id   = ml.industry_id
                    LEFT JOIN prescribed_limits pl ON pl.parameter_id = mu.id
                                                   AND pl.industry_type = COALESCE(i.type, 'Steel')
                                                   AND pl.limit_type::text = 'max'
                    WHERE pl.id IS NOT NULL AND sr.value > pl.limit_value
                    ORDER BY ml.id, mu.parameter, sr.recorded_at DESC
                    LIMIT 50
                    """)
                )
            )
            .mappings()
            .all()
        )

    all_rows = list(stack_rows) + list(real_rows) + list(synthetic_rows)

    # Apply filters
    result = _format_rows(all_rows)
    if pollution_type:
        result = [r for r in result if r["pollution_type"] == pollution_type]
    if severity:
        result = [r for r in result if r["severity"] == severity]
    if status:
        result = [r for r in result if r["status"] == status]

    # Sort by triggered_at descending
    result.sort(key=lambda r: r.get("triggered_at", ""), reverse=True)
    return result[:limit]


# ── GET /alerts/industry/{industry_id} — alerts for a specific industry ──────
@router.get("/industry/{industry_id}")
async def get_industry_alerts(
    industry_id: str,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Returns all alerts/compliance events for a specific industry."""
    cutoff = datetime.utcnow() - timedelta(days=days)

    rows = (
        (
            await db.execute(
                text("""
                SELECT
                    'ce-' || ce.id::text                                  AS id,
                    CASE ce.parameter_id
                        WHEN 1 THEN 'PM'
                        WHEN 3 THEN 'SO2'
                        WHEN 4 THEN 'NOx'
                        ELSE 'Unknown'
                    END                                                   AS parameter,
                    ce.value::float                                       AS value,
                    ce.limit_value::float                                 AS threshold,
                    ce.severity::text                                     AS severity,
                    ce.created_at                                         AS triggered_at,
                    ROUND(((ce.value - ce.limit_value) / ce.limit_value * 100)::numeric, 1) AS excess_percent,
                    COALESCE(ms.name, 'Unknown Stack')                    AS stack_name
                FROM compliance_events ce
                LEFT JOIN monitoring_stations ms ON ms.id = ce.station_id
                WHERE ms.industry_id::text = :iid
                  AND ce.created_at >= :cutoff
                ORDER BY ce.created_at DESC
                """),
                {"iid": industry_id, "cutoff": cutoff},
            )
        )
        .mappings()
        .all()
    )

    return [
        {
            "id": str(row["id"]),
            "parameter": row["parameter"],
            "value": float(row["value"]),
            "threshold": float(row["threshold"]),
            "severity": row["severity"],
            "triggered_at": row["triggered_at"].isoformat() if isinstance(row["triggered_at"], datetime) else str(row["triggered_at"]),
            "excess_percent": float(row["excess_percent"]) if row["excess_percent"] else 0,
            "stack_name": row["stack_name"],
        }
        for row in rows
    ]


# ── GET /alerts/history — historical alert trends ────────────────────────────
@router.get("/history")
async def get_alert_history(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Returns daily alert counts grouped by severity for charting."""
    cutoff = datetime.utcnow() - timedelta(days=days)

    rows = (
        (
            await db.execute(
                text("""
                SELECT
                    DATE(created_at) AS date,
                    severity,
                    COUNT(*)::int AS count
                FROM compliance_events
                WHERE created_at >= :cutoff
                GROUP BY DATE(created_at), severity
                ORDER BY date
                """),
                {"cutoff": cutoff},
            )
        )
        .mappings()
        .all()
    )

    return [
        {
            "date": str(row["date"]),
            "severity": row["severity"],
            "count": row["count"],
        }
        for row in rows
    ]


# ── GET /alerts/worst-offenders — top industries by violations ───────────────
@router.get("/worst-offenders")
async def get_worst_offenders(
    days: int = Query(90, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns industries ranked by total violations.
    Includes real CPCB standard references.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    rows = (
        (
            await db.execute(
                text("""
                SELECT
                    ind.id::text                          AS industry_id,
                    ind.name                              AS industry_name,
                    ind.type                              AS industry_type,
                    COUNT(*)::int                         AS total_violations,
                    COUNT(*) FILTER (WHERE ce.severity = 'CRITICAL')::int AS critical_count,
                    COUNT(*) FILTER (WHERE ce.severity = 'HIGH')::int     AS high_count,
                    MAX(ce.value)::float                  AS worst_value,
                    MAX(ce.limit_value)::float            AS worst_limit,
                    MAX(ce.created_at)                    AS latest_violation
                FROM compliance_events ce
                JOIN monitoring_stations ms ON ms.id = ce.station_id
                JOIN industries ind ON ind.id = ms.industry_id
                WHERE ce.created_at >= :cutoff
                GROUP BY ind.id, ind.name, ind.type
                ORDER BY total_violations DESC
                LIMIT :lim
                """),
                {"cutoff": cutoff, "lim": limit},
            )
        )
        .mappings()
        .all()
    )

    return [
        {
            "industry_id": row["industry_id"],
            "industry_name": row["industry_name"],
            "industry_type": row["industry_type"],
            "total_violations": row["total_violations"],
            "critical_count": row["critical_count"],
            "high_count": row["high_count"],
            "worst_reading": {
                "value": row["worst_value"],
                "limit": row["worst_limit"],
                "excess_percent": round(((row["worst_value"] - row["worst_limit"]) / row["worst_limit"]) * 100, 1) if row["worst_limit"] else 0,
            },
            "latest_violation": row["latest_violation"].isoformat() if isinstance(row["latest_violation"], datetime) else str(row["latest_violation"]),
        }
        for row in rows
    ]


# ── Recommended actions by parameter (real CPCB references) ──────────────────
_RECOMMENDED: dict[str, str] = {
    "PM": (
        "Inspect and service ESP/fabric filters immediately. "
        "Reduce production rate by 25% until PM drops below threshold. "
        "Deploy water sprinklers at raw material handling zones. "
        "Ref: EP Rules 1986 Schedule-I stack emission standards."
    ),
    "PM2.5": (
        "Inspect and service ESP/fabric filters immediately. "
        "Reduce production rate by 25% until PM2.5 drops below threshold. "
        "Deploy water sprinklers at raw material handling zones. "
        "Ref: NAAQS 2009 — annual avg 40 µg/m³, 24h avg 60 µg/m³."
    ),
    "PM10": (
        "Check baghouse and ESP efficiency. "
        "Verify raw material handling — deploy dust suppression. "
        "Ref: NAAQS 2009 — annual avg 60 µg/m³, 24h avg 100 µg/m³."
    ),
    "SO2": (
        "Activate standby FGD (Flue Gas Desulphurisation) unit. "
        "Verify limestone feed rate and scrubber efficiency. "
        "Alert CECB regional officer if SO2 remains elevated for >1 hour. "
        "Ref: EP Rules 1986 Schedule-I."
    ),
    "NOx": (
        "Check combustion temperature and excess-air ratio in the furnace. "
        "Reduce fuel feed rate by 15%. "
        "Inspect SCR catalyst for fouling or bypass leaks. "
        "Ref: EP Rules 1986 Schedule-I."
    ),
    "NO2": (
        "Check combustion temperature and excess-air ratio in the furnace. "
        "Reduce fuel feed rate by 15%. "
        "Ref: NAAQS 2009 — annual avg 40 µg/m³, 24h avg 80 µg/m³."
    ),
    "BOD": (
        "Inspect CETP/ETP operations; check aeration system. "
        "Collect upstream/downstream samples. "
        "Ref: CPCB General Discharge Standards — inland surface: 30 mg/L."
    ),
    "DO": (
        "Low dissolved oxygen detected — possible organic discharge. "
        "Halt effluent discharge; investigate upstream sources. "
        "Ref: CPCB Water Quality Criteria — Class C min 4 mg/L, Class B min 5 mg/L."
    ),
    "COD": (
        "Chemical oxygen demand exceeded — verify ETP chemical dosing. "
        "Schedule follow-up sampling. "
        "Ref: CPCB General Discharge Standards — inland surface: 250 mg/L."
    ),
    "Leq": (
        "Ambient noise exceeded — verify noise barriers. "
        "Issue direction under Noise Pollution (Regulation and Control) Rules 2000. "
        "Ref: CPCB Noise Standards — Industrial 75 dB(A) day, 70 dB(A) night."
    ),
}

_DEFAULT_ACTION = (
    "Escalate to on-site environment officer for immediate inspection. "
    "Log incident in the compliance register and notify CECB."
)


def _format_rows(rows) -> list[dict]:
    result = []
    for row in rows:
        triggered = row["triggered_at"]
        if isinstance(triggered, datetime):
            triggered_iso = triggered.isoformat()
        else:
            triggered_iso = (
                str(triggered) if triggered else datetime.utcnow().isoformat()
            )

        auto_esc = row.get("auto_escalation_at")
        if isinstance(auto_esc, datetime):
            auto_esc_iso = auto_esc.isoformat()
        elif auto_esc:
            auto_esc_iso = str(auto_esc)
        else:
            auto_esc_iso = None

        parameter = str(row["parameter"])

        # Calculate excess percent
        value = float(row["value"])
        threshold = float(row["threshold"]) if row["threshold"] else 0
        excess_percent = round(((value - threshold) / threshold) * 100, 1) if threshold > 0 and value > threshold else 0

        result.append(
            {
                "id": str(row["id"]),
                "pollution_type": row["pollution_type"],
                "location": row["location"],
                "region": row["region"],
                "industry": row["industry"],
                "industry_type": row.get("industry_type", ""),
                "parameter": parameter,
                "value": value,
                "threshold": threshold,
                "excess_percent": excess_percent,
                "severity": row["severity"],
                "status": row["status"],
                "triggered_at": triggered_iso,
                "auto_escalation_at": auto_esc_iso,
                "data_source": row.get("data_source", ""),
                "recommended_action": _RECOMMENDED.get(parameter, _DEFAULT_ACTION),
            }
        )
    return result
