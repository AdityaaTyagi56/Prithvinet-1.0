from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import role_required, get_current_user
from app.models.users import UserRole, User
from app.models.core import RegionalOffice, Industry
from app.schemas.core import RegionalOfficeCreate, RegionalOfficeResponse, IndustryResponse
from uuid import UUID

router = APIRouter(prefix="/regions", tags=["Regions"])

@router.post("/", response_model=RegionalOfficeResponse, dependencies=[Depends(role_required([UserRole.super_admin]))])
async def create_region(region: RegionalOfficeCreate, db: AsyncSession = Depends(get_db)):
    db_region = RegionalOffice(**region.model_dump())
    db.add(db_region)
    await db.commit()
    await db.refresh(db_region)
    return db_region

@router.get("/", response_model=list[RegionalOfficeResponse])
async def get_regions(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(RegionalOffice))
    return result.scalars().all()

@router.get("/{id}", response_model=RegionalOfficeResponse)
async def get_region(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(RegionalOffice).where(RegionalOffice.id == id))
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    return region

@router.get("/{id}/industries", response_model=list[IndustryResponse])
async def get_region_industries(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Industry).where(Industry.region_office_id == id))
    return result.scalars().all()
