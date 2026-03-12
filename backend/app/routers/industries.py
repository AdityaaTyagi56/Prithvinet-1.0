from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.core.database import get_db
from app.core.dependencies import role_required, get_current_user
from app.models.users import UserRole, User
from app.models.core import Industry
from app.schemas.core import IndustryCreate, IndustryResponse
from uuid import UUID

router = APIRouter(prefix="/industries", tags=["Industries"])

@router.post("/", response_model=IndustryResponse, dependencies=[Depends(role_required([UserRole.super_admin, UserRole.regional_officer]))])
async def create_industry(industry: IndustryCreate, db: AsyncSession = Depends(get_db)):
    db_industry = Industry(**industry.model_dump())
    db.add(db_industry)
    await db.commit()
    await db.refresh(db_industry)
    return db_industry

@router.get("/", response_model=list[IndustryResponse])
async def get_industries(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Industry))
    return result.scalars().all()


@router.get("/compliance/metrics", dependencies=[Depends(role_required([UserRole.super_admin, UserRole.regional_officer]))])
async def get_compliance_metrics(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_industries = (await db.execute(text("SELECT COUNT(*)::int FROM industries"))).scalar_one()

    latest_period = (await db.execute(text("SELECT MAX(period) FROM compliance_records"))).scalar_one()

    if latest_period:
        compliant_industries = (
            await db.execute(
                text(
                    """
                    SELECT COUNT(DISTINCT industry_id)::int
                    FROM compliance_records
                    WHERE status::text = 'compliant' AND period = :period
                    """
                ),
                {"period": latest_period},
            )
        ).scalar_one()
    else:
        compliant_industries = 0

    active_violations = (
        await db.execute(
            text(
                """
                SELECT COUNT(*)::int
                FROM alerts
                WHERE status::text IN ('open', 'escalated')
                """
            )
        )
    ).scalar_one()

    pending_escalations = (
        await db.execute(
            text(
                """
                SELECT COUNT(*)::int
                FROM alerts
                WHERE status::text = 'escalated'
                """
            )
        )
    ).scalar_one()

    recent_rows = (
        await db.execute(
            text(
                """
                SELECT
                    i.name AS industry,
                    COALESCE(mu.parameter, 'Unknown') AS parameter,
                    a.created_at,
                    a.severity::text AS severity,
                    a.status::text AS status
                FROM alerts a
                LEFT JOIN industries i ON i.id = a.industry_id
                LEFT JOIN monitoring_units mu ON mu.id = a.parameter_id
                WHERE a.status::text IN ('open', 'escalated')
                ORDER BY a.created_at DESC
                LIMIT 10
                """
            )
        )
    ).mappings().all()

    return {
        "total_industries": total_industries,
        "latest_period": latest_period,
        "compliant_industries": compliant_industries,
        "active_violations": active_violations,
        "pending_escalations": pending_escalations,
        "recent_violations": [
            {
                "industry": row["industry"] or "Unknown Industry",
                "violation_type": f"{row['parameter']} limit exceeded",
                "date": row["created_at"].date().isoformat() if row["created_at"] else None,
                "severity": row["severity"],
                "status": row["status"],
            }
            for row in recent_rows
        ],
    }

@router.get("/{id}", response_model=IndustryResponse)
async def get_industry(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Industry).where(Industry.id == id))
    industry = result.scalar_one_or_none()
    if not industry:
        raise HTTPException(status_code=404, detail="Industry not found")
    return industry
