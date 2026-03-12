from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import role_required, get_current_user
from app.models.users import UserRole, User
from app.models.core import MonitoringLocation
from app.schemas.core import MonitoringLocationCreate, MonitoringLocationResponse
from uuid import UUID

router = APIRouter(prefix="/locations", tags=["Locations"])

@router.post("/", response_model=MonitoringLocationResponse, dependencies=[Depends(role_required([UserRole.super_admin, UserRole.regional_officer]))])
async def create_location(location: MonitoringLocationCreate, db: AsyncSession = Depends(get_db)):
    db_location = MonitoringLocation(**location.model_dump())
    db.add(db_location)
    await db.commit()
    await db.refresh(db_location)
    return db_location

@router.get("/", response_model=list[MonitoringLocationResponse])
async def get_locations(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(MonitoringLocation))
    return result.scalars().all()

@router.get("/{id}", response_model=MonitoringLocationResponse)
async def get_location(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(MonitoringLocation).where(MonitoringLocation.id == id))
    location = result.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location
