from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user_optional, role_required
from app.models.core import LocationType, MonitoringLocation
from app.models.users import UserRole
from app.schemas.core import MonitoringLocationCreate, MonitoringLocationResponse
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/locations", tags=["Locations"])


@router.post(
    "/",
    response_model=MonitoringLocationResponse,
    dependencies=[
        Depends(role_required([UserRole.super_admin, UserRole.regional_officer]))
    ],
)
async def create_location(
    location: MonitoringLocationCreate, db: AsyncSession = Depends(get_db)
):
    db_location = MonitoringLocation(**location.model_dump())
    db.add(db_location)
    await db.commit()
    await db.refresh(db_location)
    return db_location


@router.get("/", response_model=list[MonitoringLocationResponse])
async def get_locations(
    type: Optional[str] = Query(
        None, description="Filter by location type: air, water, noise"
    ),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    query = select(MonitoringLocation).where(MonitoringLocation.is_active == True)

    if type:
        try:
            loc_type = LocationType(type.lower())
            query = query.where(MonitoringLocation.type == loc_type)
        except ValueError:
            # Unknown type — ignore filter and return all
            pass

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{id}", response_model=MonitoringLocationResponse)
async def get_location(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    result = await db.execute(
        select(MonitoringLocation).where(MonitoringLocation.id == id)
    )
    location = result.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location
