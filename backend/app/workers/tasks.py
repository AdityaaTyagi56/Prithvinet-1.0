import asyncio
from datetime import datetime, timedelta

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.workers.celery_app import celery_app

async def _check_missing_reports() -> dict:
    """Find industries that have NO sensor readings in the last 24 hours, and create MissingReportReminders if they don't already exist for this period."""
    period = datetime.utcnow().date().isoformat()
    yesterday = datetime.utcnow() - timedelta(days=1)
    
    async with AsyncSessionLocal() as db:
        missing_industries_q = text("""
            SELECT i.id, i.name 
            FROM industries i
            LEFT JOIN (
                SELECT ml.industry_id, sr.id
                FROM sensor_readings sr
                JOIN monitoring_locations ml ON sr.location_id = ml.id
                WHERE sr.recorded_at >= :yesterday
            ) recent_readings ON recent_readings.industry_id = i.id
            WHERE i.status::text = 'active'
            GROUP BY i.id, i.name
            HAVING COUNT(recent_readings.id) = 0
        """)
        
        missing_industries = (await db.execute(missing_industries_q, {"yesterday": yesterday})).mappings().all()
        
        new_reminders_count = 0
        for mi in missing_industries:
            exists = (await db.execute(text("""
                SELECT 1 FROM missing_report_reminders
                WHERE industry_id = :industry_id AND "period" = :period
            """), {"industry_id": mi["id"], "period": period})).scalar()
            
            if not exists:
                loc_id = (await db.execute(text("SELECT id FROM monitoring_locations WHERE industry_id = :industry_id LIMIT 1"), {"industry_id": mi["id"]})).scalar()
                
                await db.execute(text("""
                    INSERT INTO missing_report_reminders (
                        id, industry_id, "period", is_resolved, created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), :industry_id, :period, false, now(), now()
                    )
                """), {"industry_id": mi["id"], "period": period})
                
                if loc_id:
                    await db.execute(text("""
                        INSERT INTO alerts (
                            id, type, severity, message, location_id, recorded_at, status, created_at, updated_at
                        ) VALUES (
                            gen_random_uuid(), 'missing_report', 'high', :msg, 
                            :loc_id, now(), 'new', now(), now()
                        )
                    """), {
                        "msg": f"Missing mandatory environmental report from {mi['name']} for period {period}.", 
                        "loc_id": loc_id
                    })
                new_reminders_count += 1
                
        if new_reminders_count > 0:
            await db.commit()
            
    return {"period": period, "new_reminders": new_reminders_count}

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
    return asyncio.run(_check_missing_reports())

@celery_app.task
def refresh_all_forecasts():
    # Placeholder for refreshing Prophet forecasts
    print("Running refresh_all_forecasts task")
    return "Success"
