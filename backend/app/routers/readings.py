import json
import uuid
from typing import Any, Optional

from app.core.database import get_db
from app.core.redis import redis_client
from app.models.core import MonitoringLocation, MonitoringUnit
from app.models.monitoring import SensorReading
from app.schemas.monitoring import SensorReadingIngest
from app.services.alert_service import evaluate_reading
from app.services.anomaly_service import check_anomaly_streaming
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/readings", tags=["Readings"])


@router.post("/")
async def ingest_reading(
    reading_in: SensorReadingIngest, db: AsyncSession = Depends(get_db)
):
    # Resolve location
    try:
        loc_uuid = uuid.UUID(reading_in.location_id)
        loc_condition = MonitoringLocation.id == loc_uuid
    except ValueError:
        loc_condition = MonitoringLocation.iot_device_id == reading_in.location_id

    loc_res = await db.execute(select(MonitoringLocation).where(loc_condition))
    location = loc_res.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Resolve parameter
    param_res = await db.execute(
        select(MonitoringUnit).where(MonitoringUnit.parameter == reading_in.parameter)
    )
    unit = param_res.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail="Parameter not found")

    reading = SensorReading(
        location_id=location.id,
        parameter_id=unit.id,
        value=reading_in.value,
        unit_id=unit.id,
        source=reading_in.source,
    )

    # Anomaly check
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
        "recorded_at": reading.recorded_at.isoformat(),
    }
    await redis_client.publish(f"readings:{location.id}", json.dumps(payload))

    # Evaluate for alerts
    await evaluate_reading(reading, db)

    return {"status": "success"}


@router.get("/latest/{location_id}")
async def get_latest_readings(
    location_id: str,
    pollution_type: Optional[str] = Query(
        default=None,
        alias="type",
        description="air | water | noise (optional). If omitted, all parameters for the location are returned.",
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Return latest reading per parameter for a location.

    Supports location_id as either:
    - UUID (monitoring_locations.id)
    - IoT device id (monitoring_locations.iot_device_id)

    Optional `type` filter narrows parameters by pollution domain.
    """
    # Resolve location
    try:
        loc_uuid = uuid.UUID(location_id)
        loc_condition = MonitoringLocation.id == loc_uuid
    except ValueError:
        loc_condition = MonitoringLocation.iot_device_id == location_id

    loc_res = await db.execute(select(MonitoringLocation).where(loc_condition))
    location = loc_res.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Domain parameter allowlists
    type_to_params = {
        "air": ["PM2.5", "PM10", "NO", "NO2", "SO2", "CO", "O3", "NH3"],
        "water": ["pH", "BOD", "COD", "TDS", "DO", "Turbidity"],
        "noise": ["Leq", "Lmax", "Lmin", "L10", "L90", "Ln"],
    }

    selected_params = None
    if pollution_type:
        key = pollution_type.strip().lower()
        if key not in type_to_params:
            raise HTTPException(
                status_code=400,
                detail="Invalid pollution type. Expected one of: air, water, noise",
            )
        selected_params = type_to_params[key]

    # Build query with optional parameter filter
    where_filter = ""
    bind_values: dict[str, Any] = {"location_id": str(location.id)}
    if selected_params:
        where_filter = "AND mu.parameter = ANY(:params)"
        bind_values["params"] = selected_params

    query = text(
        f"""
        SELECT DISTINCT ON (sr.parameter_id)
            sr.location_id::text AS location_id,
            sr.parameter_id::text AS parameter_id,
            mu.parameter AS parameter,
            sr.value AS value,
            sr.recorded_at AS recorded_at
        FROM sensor_readings sr
        JOIN monitoring_units mu ON mu.id = sr.parameter_id
        WHERE sr.location_id::text = :location_id
          {where_filter}
        ORDER BY sr.parameter_id, sr.recorded_at DESC
        """
    )

    rows = (await db.execute(query, bind_values)).mappings().all()

    return [
        {
            "location_id": row["location_id"],
            "parameter_id": row["parameter_id"],
            "parameter": row["parameter"],
            "value": float(row["value"]) if row["value"] is not None else None,
            "recorded_at": row["recorded_at"].isoformat()
            if row["recorded_at"]
            else None,
        }
        for row in rows
    ]
