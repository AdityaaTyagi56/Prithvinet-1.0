import asyncio
import logging
from datetime import datetime, date as date_type

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.workers.celery_app import celery_app


async def _compute_compliance_snapshot() -> dict:
    period = datetime.utcnow().date().isoformat()

    async with AsyncSessionLocal() as db:
        combos = (
            await db.execute(
                text(
                    """
                    SELECT
                        i.id AS industry_id,
                        pl.parameter_id,
                        pl.limit_value,
                        pl.limit_type::text AS limit_type
                    FROM industries i
                    JOIN prescribed_limits pl ON pl.industry_type = i.type
                    WHERE i.status::text = 'active'
                    """
                )
            )
        ).mappings().all()

        await db.execute(text("DELETE FROM compliance_records WHERE period = :period"), {"period": period})

        compliant_count = 0
        non_compliant_count = 0
        pending_count = 0

        for combo in combos:
            stats = (
                await db.execute(
                    text(
                        """
                        SELECT
                            COUNT(*)::int AS total_count,
                            COALESCE(
                                SUM(
                                    CASE
                                        WHEN :limit_type = 'max' AND sr.value > :limit_value THEN 1
                                        WHEN :limit_type = 'min' AND sr.value < :limit_value THEN 1
                                        ELSE 0
                                    END
                                )::int,
                                0
                            ) AS violations_count
                        FROM sensor_readings sr
                        JOIN monitoring_locations ml ON ml.id = sr.location_id
                        WHERE ml.industry_id = :industry_id
                          AND sr.parameter_id = :parameter_id
                          AND sr.recorded_at >= now() - interval '24 hours'
                        """
                    ),
                    {
                        "industry_id": combo["industry_id"],
                        "parameter_id": combo["parameter_id"],
                        "limit_type": combo["limit_type"],
                        "limit_value": combo["limit_value"],
                    },
                )
            ).mappings().first()

            total_count = int(stats["total_count"] if stats else 0)
            violations_count = int(stats["violations_count"] if stats else 0)

            if total_count == 0:
                status = "pending"
                pending_count += 1
            elif violations_count > 0:
                status = "non_compliant"
                non_compliant_count += 1
            else:
                status = "compliant"
                compliant_count += 1

            await db.execute(
                text(
                    """
                    INSERT INTO compliance_records (
                        id,
                        industry_id,
                        parameter_id,
                        period,
                        status,
                        violations_count,
                        last_checked,
                        created_at
                    )
                    VALUES (
                        gen_random_uuid(),
                        :industry_id,
                        :parameter_id,
                        :period,
                        CAST(:status AS compliancestatus),
                        :violations_count,
                        now(),
                        now()
                    )
                    """
                ),
                {
                    "industry_id": combo["industry_id"],
                    "parameter_id": combo["parameter_id"],
                    "period": period,
                    "status": status,
                    "violations_count": violations_count,
                },
            )

        await db.commit()

    return {
        "period": period,
        "evaluated_records": len(combos),
        "compliant_count": compliant_count,
        "non_compliant_count": non_compliant_count,
        "pending_count": pending_count,
    }

@celery_app.task
def evaluate_all_readings():
    # Keep backward compatibility with existing beat schedule key.
    return asyncio.run(_compute_compliance_snapshot())


@celery_app.task
def compute_compliance_records():
    return asyncio.run(_compute_compliance_snapshot())

@celery_app.task
def check_missing_reports():
    # Placeholder for checking missing reports
    print("Running check_missing_reports task")
    return "Success"

@celery_app.task
def refresh_all_forecasts():
    """Refresh Prophet forecasts for all active location/parameter combos."""
    from app.services.ml_service import generate_forecast

    async def _refresh():
        async with AsyncSessionLocal() as db:
            combos = (
                await db.execute(
                    text(
                        """
                        SELECT DISTINCT ml.id::text AS loc_id, mu.id::text AS param_id
                        FROM monitoring_locations ml
                        CROSS JOIN monitoring_units mu
                        WHERE ml.is_active = TRUE
                          AND mu.parameter IN ('PM2.5', 'PM10', 'SO2', 'NO2')
                        LIMIT 100
                        """
                    )
                )
            ).fetchall()

            refreshed = 0
            for loc_id, param_id in combos:
                try:
                    await generate_forecast(db, loc_id, param_id, hours=72)
                    refreshed += 1
                except Exception as exc:
                    logging.warning("Forecast refresh failed for %s/%s: %s", loc_id, param_id, exc)

            return {"refreshed": refreshed, "total": len(combos)}

    return asyncio.run(_refresh())


@celery_app.task
def run_daily_aqi_analysis():
    """Generate AI analysis for today's AQI readings at end of day."""
    from app.services.aqi_analysis_service import generate_daily_analysis

    today = date_type.today()
    result = asyncio.run(generate_daily_analysis(today))
    return {
        "date": today.isoformat(),
        "status": "completed" if result.get("ai_insight") else "no_data",
    }
