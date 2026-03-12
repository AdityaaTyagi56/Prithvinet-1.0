from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.services.ml_service import generate_forecast
from app.models.core import MonitoringUnit

router = APIRouter(prefix="/forecast", tags=["Forecast"])

@router.get("/{location_id}")
async def get_forecast(location_id: str, parameter: str, db: AsyncSession = Depends(get_db)):
    # Resolve parameter to ID
    param_res = await db.execute(select(MonitoringUnit).where(MonitoringUnit.parameter == parameter))
    unit = param_res.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail="Parameter not found")
        
    forecast = await generate_forecast(db, location_id, str(unit.id), hours=72)
    return forecast
