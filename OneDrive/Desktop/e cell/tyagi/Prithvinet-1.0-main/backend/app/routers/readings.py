from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.monitoring import SensorReading, SourceType
from app.models.core import MonitoringLocation, MonitoringUnit
from app.schemas.monitoring import SensorReadingIngest
from app.services.alert_service import evaluate_reading
from app.services.anomaly_service import check_anomaly_streaming
from app.core.redis import redis_client
import json
import uuid

router = APIRouter(prefix="/readings", tags=["Readings"])

@router.post("/")
async def ingest_reading(reading_in: SensorReadingIngest, db: AsyncSession = Depends(get_db)):
    # Resolve location
    try:
        loc_uuid = uuid.UUID(reading_in.location_id)
        loc_condition = (MonitoringLocation.id == loc_uuid)
    except ValueError:
        loc_condition = (MonitoringLocation.iot_device_id == reading_in.location_id)

    loc_res = await db.execute(select(MonitoringLocation).where(loc_condition))
    location = loc_res.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Resolve parameter
    param_res = await db.execute(select(MonitoringUnit).where(MonitoringUnit.parameter == reading_in.parameter))
    unit = param_res.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail="Parameter not found")

    reading = SensorReading(
        location_id=location.id,
        parameter_id=unit.id,
        value=reading_in.value,
        unit_id=unit.id,
        source=reading_in.source
    )
    
    # Anomaly Check
    await check_anomaly_streaming(reading, db)

    db.add(reading)
    await db.commit()
    await db.refresh(reading)

    # Publish to Redis
    payload = {
        "location_id": str(location.id),
        "parameter_id": str(unit.id),
        "parameter": unit.parameter,
        "value": reading.value,
        "recorded_at": reading.recorded_at.isoformat()
    }
    await redis_client.publish(f"readings:{location.id}", json.dumps(payload))

    # Evaluate for alerts
    await evaluate_reading(reading, db)

    return {"status": "success"}

