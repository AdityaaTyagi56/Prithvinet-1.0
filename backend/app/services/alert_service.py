import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.monitoring import SensorReading
from app.models.core import MonitoringLocation, Industry, PrescribedLimit, LimitType
from app.models.alerts import Alert, AlertType, AlertSeverity
from app.core.redis import redis_client

async def evaluate_reading(reading: SensorReading, db: AsyncSession):
    # 1. Get Location and Industry
    loc_res = await db.execute(select(MonitoringLocation).where(MonitoringLocation.id == reading.location_id))
    location = loc_res.scalar_one_or_none()
    if not location or not location.industry_id:
        return

    ind_res = await db.execute(select(Industry).where(Industry.id == location.industry_id))
    industry = ind_res.scalar_one_or_none()
    if not industry:
        return

    # 2. Get Prescribed Limit for this parameter and industry type
    limit_res = await db.execute(
        select(PrescribedLimit).where(
            PrescribedLimit.parameter_id == reading.parameter_id,
            PrescribedLimit.industry_type == industry.type
        )
    )
    limit = limit_res.scalar_one_or_none()
    if not limit:
        return

    # 3. Check for breach
    is_breach = False
    if limit.limit_type == LimitType.max and reading.value > limit.limit_value:
        is_breach = True
    elif limit.limit_type == LimitType.min and reading.value < limit.limit_value:
        is_breach = True

    if is_breach:
        await create_alert(
            db=db,
            alert_type=AlertType.limit_breach,
            location_id=location.id,
            industry_id=industry.id,
            parameter_id=reading.parameter_id,
            value=reading.value,
            threshold=limit.limit_value,
            severity=AlertSeverity.medium,
            region_id=location.region_id
        )

async def create_alert(db: AsyncSession, alert_type: AlertType, location_id, industry_id, parameter_id, value, threshold, severity, region_id):
    # Dedup check in Redis
    # SET alert_dedup:{loc}:{param} 1 EX 3600
    dedup_key = f"alert_dedup:{location_id}:{parameter_id}"
    is_duplicate = await redis_client.get(dedup_key)
    
    if is_duplicate:
        return # Suppress duplicate alert within 1-hour window

    # Create Alert
    alert = Alert(
        type=alert_type,
        location_id=location_id,
        industry_id=industry_id,
        parameter_id=parameter_id,
        value=value,
        threshold=threshold,
        severity=severity
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)

    # Set dedup key
    await redis_client.setex(dedup_key, 3600, "1")

    # Publish to Redis pub/sub
    alert_payload = {
        "id": str(alert.id),
        "type": alert.type,
        "location_id": str(location_id),
        "industry_id": str(industry_id),
        "parameter_id": str(parameter_id),
        "value": value,
        "threshold": threshold,
        "severity": severity,
        "status": alert.status
    }
    await redis_client.publish("alerts:global", json.dumps(alert_payload))
    if region_id:
        await redis_client.publish(f"alerts:region:{region_id}", json.dumps(alert_payload))
