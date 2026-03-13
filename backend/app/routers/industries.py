from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user, role_required
from app.models.core import Industry
from app.models.users import User, UserRole
from app.schemas.core import IndustryCreate, IndustryResponse
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/industries", tags=["Industries"])


@router.post(
    "/",
    response_model=IndustryResponse,
    dependencies=[
        Depends(role_required([UserRole.super_admin, UserRole.regional_officer]))
    ],
)
async def create_industry(industry: IndustryCreate, db: AsyncSession = Depends(get_db)):
    db_industry = Industry(**industry.model_dump())
    db.add(db_industry)
    await db.commit()
    await db.refresh(db_industry)
    return db_industry


@router.get("/", response_model=list[IndustryResponse])
async def get_industries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Industry))
    return result.scalars().all()


@router.get("/compliance/metrics")
async def get_compliance_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_industries = (
        await db.execute(text("SELECT COUNT(*)::int FROM industries"))
    ).scalar_one()

    latest_period = (
        await db.execute(text("SELECT MAX(period) FROM compliance_records"))
    ).scalar_one()

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
        (
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
        )
        .mappings()
        .all()
    )

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
                "date": row["created_at"].date().isoformat()
                if row["created_at"]
                else None,
                "severity": row["severity"],
                "status": row["status"],
            }
            for row in recent_rows
        ],
    }


@router.get("/tracker")
async def get_industry_tracker(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        (
            await db.execute(
                text(
                    """
                    SELECT
                        i.id::text AS id,
                        i.name,
                        i.type,
                        COALESCE(ro.district, 'Unknown') AS region,
                        to_char((CURRENT_DATE + INTERVAL '180 days'), 'YYYY-MM-DD') AS consent_valid_until,
                        'n/a'::text AS air_status,
                        'n/a'::text AS water_status,
                        'n/a'::text AS noise_status,
                        COALESCE(to_char(MAX(a.created_at), 'YYYY-MM-DD'), to_char(CURRENT_DATE, 'YYYY-MM-DD')) AS last_inspection,
                        COUNT(a.id)::int AS total_violations_ytd,
                        LEAST(100, COUNT(a.id)::int * 12 + 20)::int AS risk_score
                    FROM industries i
                    LEFT JOIN regional_offices ro ON ro.id = i.region_office_id
                    LEFT JOIN alerts a ON a.industry_id = i.id
                    GROUP BY i.id, i.name, i.type, ro.district
                    ORDER BY risk_score DESC, i.name ASC
                    """
                )
            )
        )
        .mappings()
        .all()
    )

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "type": row["type"],
            "region": row["region"],
            "consent_valid_until": row["consent_valid_until"],
            "air_status": row["air_status"],
            "water_status": row["water_status"],
            "noise_status": row["noise_status"],
            "last_inspection": row["last_inspection"],
            "total_violations_ytd": row["total_violations_ytd"],
            "risk_score": row["risk_score"],
        }
        for row in rows
    ]


@router.get("/{id}", response_model=IndustryResponse)
async def get_industry(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Industry).where(Industry.id == id))
    industry = result.scalar_one_or_none()
    if not industry:
        raise HTTPException(status_code=404, detail="Industry not found")
    return industry
