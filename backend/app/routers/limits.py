from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import role_required, get_current_user
from app.models.users import UserRole, User
from app.models.core import PrescribedLimit
from app.schemas.core import PrescribedLimitCreate, PrescribedLimitResponse
from uuid import UUID

router = APIRouter(prefix="/limits", tags=["Limits"])

@router.post("/", response_model=PrescribedLimitResponse, dependencies=[Depends(role_required([UserRole.super_admin]))])
async def create_limit(limit: PrescribedLimitCreate, db: AsyncSession = Depends(get_db)):
    db_limit = PrescribedLimit(**limit.model_dump())
    db.add(db_limit)
    await db.commit()
    await db.refresh(db_limit)
    return db_limit

@router.get("/", response_model=list[PrescribedLimitResponse])
async def get_limits(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(PrescribedLimit))
    return result.scalars().all()

@router.get("/industry-type/{type}", response_model=list[PrescribedLimitResponse])
async def get_limits_by_industry(type: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(PrescribedLimit).where(PrescribedLimit.industry_type == type))
    return result.scalars().all()
