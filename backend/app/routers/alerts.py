from datetime import datetime, timedelta

from app.core.database import get_db
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/")
async def get_alerts(
    db: AsyncSession = Depends(get_db),
):
    """
    Returns alerts in the shape expected by AlertsDashboard.
    Tries the real alerts table first; if empty, synthesises alerts
    from sensor readings that have exceeded prescribed limits.
    """

    real_rows = (
        (
            await db.execute(
                text(
                    """
                SELECT
                    a.id::text                                          AS id,
                    'air'                                               AS pollution_type,
                    COALESCE(ml.name,  'Unknown Location')              AS location,
                    COALESCE(ro.name,  'Unknown Region')                AS region,
                    COALESCE(i.name,   'Unknown Industry')              AS industry,
                    COALESCE(mu.parameter, 'Unknown')                   AS parameter,
                    COALESCE(a.value,  0)::float                        AS value,
                    COALESCE(a.threshold, 0)::float                     AS threshold,
                    a.severity::text                                    AS severity,
                    a.status::text                                      AS status,
                    a.created_at                                        AS triggered_at,
                    NULL                                                AS auto_escalation_at
                FROM alerts a
                LEFT JOIN monitoring_locations ml ON ml.id = a.location_id
                LEFT JOIN regional_offices     ro ON ro.id = ml.region_id
                LEFT JOIN industries            i  ON i.id  = a.industry_id
                LEFT JOIN monitoring_units     mu ON mu.id = a.parameter_id
                ORDER BY a.created_at DESC
                LIMIT 100
                """
                )
            )
        )
        .mappings()
        .all()
    )

    if real_rows:
        return _format_rows(real_rows)

    # ── Synthetic fallback: readings that exceeded prescribed limits ──────────
    synthetic_rows = (
        (
            await db.execute(
                text(
                    """
                SELECT DISTINCT ON (ml.id, mu.parameter)
                    gen_random_uuid()::text                             AS id,
                    'air'                                               AS pollution_type,
                    COALESCE(ml.name,  'Unknown Location')              AS location,
                    COALESCE(ro.name,  'Unknown Region')                AS region,
                    COALESCE(i.name,   'Unknown Industry')              AS industry,
                    mu.parameter                                        AS parameter,
                    sr.value::float                                     AS value,
                    pl.limit_value::float                               AS threshold,
                    CASE
                        WHEN sr.value > pl.limit_value * 1.5 THEN 'critical'
                        WHEN sr.value > pl.limit_value * 1.2 THEN 'high'
                        WHEN sr.value > pl.limit_value       THEN 'medium'
                        ELSE 'low'
                    END                                                 AS severity,
                    'active'                                            AS status,
                    sr.recorded_at                                      AS triggered_at,
                    (sr.recorded_at + interval '2 hours')               AS auto_escalation_at
                FROM sensor_readings sr
                JOIN monitoring_units       mu ON mu.id  = sr.parameter_id
                JOIN monitoring_locations   ml ON ml.id  = sr.location_id
                LEFT JOIN regional_offices  ro ON ro.id  = ml.region_id
                LEFT JOIN industries         i  ON i.id  = ml.industry_id
                LEFT JOIN prescribed_limits pl ON pl.parameter_id = mu.id
                                               AND pl.industry_type = COALESCE(i.type, 'Steel')
                                               AND pl.limit_type::text = 'max'
                WHERE pl.id IS NOT NULL
                  AND sr.value > pl.limit_value
                ORDER BY ml.id, mu.parameter, sr.recorded_at DESC
                LIMIT 50
                """
                )
            )
        )
        .mappings()
        .all()
    )

    return _format_rows(synthetic_rows)


_RECOMMENDED: dict[str, str] = {
    "PM2.5": (
        "Inspect and service ESP/fabric filters immediately. "
        "Reduce production rate by 25% until PM2.5 drops below threshold. "
        "Deploy water sprinklers at raw material handling zones."
    ),
    "SO2": (
        "Activate standby FGD (Flue Gas Desulphurisation) unit. "
        "Verify limestone feed rate and scrubber efficiency. "
        "Alert CECB regional officer if SO2 remains elevated for >1 hour."
    ),
    "NO2": (
        "Check combustion temperature and excess-air ratio in the furnace. "
        "Reduce fuel feed rate by 15%. "
        "Inspect SCR catalyst for fouling or bypass leaks."
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
        result.append(
            {
                "id": str(row["id"]),
                "pollution_type": row["pollution_type"],
                "location": row["location"],
                "region": row["region"],
                "industry": row["industry"],
                "parameter": parameter,
                "value": float(row["value"]),
                "threshold": float(row["threshold"]),
                "severity": row["severity"],
                "status": row["status"],
                "triggered_at": triggered_iso,
                "auto_escalation_at": auto_esc_iso,
                "recommended_action": _RECOMMENDED.get(parameter, _DEFAULT_ACTION),
            }
        )
    return result
