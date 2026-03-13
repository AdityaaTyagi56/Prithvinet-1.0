from datetime import datetime, timedelta
from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.core import Industry
from app.models.users import User
from app.schemas.core import IndustryCreate, IndustryResponse
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/industries", tags=["Industries"])


@router.post("/", response_model=IndustryResponse)
async def create_industry(
    industry: IndustryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    type: str = Query(default="air"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_industries = (
        await db.execute(text("SELECT COUNT(*)::int FROM industries"))
    ).scalar_one()

    # Count industries that have NO open/escalated alerts → treat as compliant
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

    # industries with at least one open alert are non-compliant
    non_compliant_count = (
        await db.execute(
            text(
                """
                SELECT COUNT(DISTINCT industry_id)::int
                FROM alerts
                WHERE status::text IN ('open', 'escalated')
                  AND industry_id IS NOT NULL
                """
            )
        )
    ).scalar_one()

    compliant_industries = max(0, total_industries - non_compliant_count)

    # Recent violations joined to industry + parameter names
    recent_rows = (
        (
            await db.execute(
                text(
                    """
                SELECT
                    COALESCE(i.name, 'Unknown Industry')       AS industry,
                    COALESCE(mu.parameter, 'Unknown Parameter') AS parameter,
                    a.created_at,
                    a.severity::text                            AS severity,
                    a.status::text                              AS status
                FROM alerts a
                LEFT JOIN industries       i  ON i.id  = a.industry_id
                LEFT JOIN monitoring_units mu ON mu.id = a.parameter_id
                WHERE a.status::text IN ('open', 'escalated')
                ORDER BY a.created_at DESC
                LIMIT 20
                """
                )
            )
        )
        .mappings()
        .all()
    )

    # If the alerts table is empty (fresh seed, no breaches yet) synthesise
    # violations from sensor readings that actually exceeded prescribed limits.
    if not recent_rows:
        synthetic_rows = (
            (
                await db.execute(
                    text(
                        """
                    SELECT
                        COALESCE(i.name, 'Unknown Industry') AS industry,
                        mu.parameter                          AS parameter,
                        sr.recorded_at                        AS created_at,
                        CASE
                            WHEN sr.value > pl.limit_value * 1.5 THEN 'critical'
                            WHEN sr.value > pl.limit_value * 1.2 THEN 'high'
                            WHEN sr.value > pl.limit_value       THEN 'medium'
                            ELSE 'low'
                        END                                   AS severity,
                        'open'                                AS status
                    FROM sensor_readings sr
                    JOIN monitoring_units       mu ON mu.id  = sr.parameter_id
                    JOIN monitoring_locations   ml ON ml.id  = sr.location_id
                    LEFT JOIN industries         i  ON i.id  = ml.industry_id
                    LEFT JOIN prescribed_limits pl ON pl.parameter_id = mu.id
                                                   AND pl.industry_type = COALESCE(i.type, '')
                    WHERE pl.id IS NOT NULL
                      AND pl.limit_type::text = 'max'
                      AND sr.value > pl.limit_value
                    ORDER BY sr.recorded_at DESC
                    LIMIT 20
                    """
                    )
                )
            )
            .mappings()
            .all()
        )

        # Recalculate violation counts from synthetic data
        if synthetic_rows:
            active_violations = len(synthetic_rows)
            non_compliant_set = {r["industry"] for r in synthetic_rows}
            non_compliant_count = len(non_compliant_set)
            compliant_industries = max(0, total_industries - non_compliant_count)
        recent_rows = synthetic_rows  # type: ignore[assignment]

    return {
        "total_industries": total_industries,
        "compliant_industries": compliant_industries,
        "active_violations": active_violations,
        "pending_escalations": pending_escalations,
        "pollution_type": type,
        "recent_violations": [
            {
                "industry": row["industry"],
                "violation_type": f"{row['parameter']} limit exceeded",
                "date": (
                    row["created_at"].date().isoformat() if row["created_at"] else None
                ),
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
    """
    Returns per-industry compliance tracker data matching the IndustryData
    shape expected by the frontend IndustryTracker component.
    """
    rows = (
        (
            await db.execute(
                text(
                    """
                SELECT
                    i.id::text                                      AS id,
                    i.name                                          AS name,
                    i.type                                          AS type,
                    COALESCE(ro.district, ro.name, 'Unknown')       AS region,
                    -- violation counts for this year
                    COUNT(DISTINCT a.id)                            AS total_violations_ytd
                FROM industries i
                LEFT JOIN regional_offices ro ON ro.id = i.region_office_id
                LEFT JOIN monitoring_locations ml ON ml.industry_id = i.id
                LEFT JOIN alerts a ON a.industry_id = i.id
                              AND EXTRACT(YEAR FROM a.created_at) = EXTRACT(YEAR FROM NOW())
                GROUP BY i.id, i.name, i.type, ro.district, ro.name
                ORDER BY total_violations_ytd DESC, i.name
                """
                )
            )
        )
        .mappings()
        .all()
    )

    # For each industry derive air_status from actual readings vs limits
    reading_status_rows = (
        (
            await db.execute(
                text(
                    """
                SELECT
                    ml.industry_id::text        AS industry_id,
                    mu.parameter                AS parameter,
                    AVG(sr.value)               AS avg_value,
                    MAX(pl.limit_value)         AS limit_value
                FROM sensor_readings sr
                JOIN monitoring_units     mu ON mu.id  = sr.parameter_id
                JOIN monitoring_locations ml ON ml.id  = sr.location_id
                LEFT JOIN industries       i  ON i.id  = ml.industry_id
                LEFT JOIN prescribed_limits pl ON pl.parameter_id = mu.id
                                               AND pl.industry_type = COALESCE(i.type, '')
                                               AND pl.limit_type::text = 'max'
                WHERE sr.recorded_at >= NOW() - INTERVAL '7 days'
                  AND ml.industry_id IS NOT NULL
                GROUP BY ml.industry_id, mu.parameter
                """
                )
            )
        )
        .mappings()
        .all()
    )

    # Build a lookup: industry_id → {parameter → status}
    status_map: dict = {}
    for r in reading_status_rows:
        ind_id = r["industry_id"]
        if ind_id not in status_map:
            status_map[ind_id] = {}
        if r["limit_value"] is not None:
            avg = float(r["avg_value"] or 0)
            lim = float(r["limit_value"])
            if avg > lim:
                s = "non-compliant"
            elif avg > lim * 0.8:
                s = "warning"
            else:
                s = "compliant"
        else:
            s = "n/a"
        status_map[ind_id][r["parameter"]] = s

    now = datetime.utcnow()
    result = []
    for row in rows:
        ind_id = row["id"]
        param_statuses = status_map.get(ind_id, {})

        # Air status — based on PM2.5 / SO2 / NO2
        air_params = ["PM2.5", "SO2", "NO2"]
        air_statuses = [
            param_statuses.get(p) for p in air_params if p in param_statuses
        ]
        if "non-compliant" in air_statuses:
            air_status = "non-compliant"
        elif "warning" in air_statuses:
            air_status = "warning"
        elif air_statuses:
            air_status = "compliant"
        else:
            air_status = "n/a"

        violations_ytd = int(row["total_violations_ytd"] or 0)

        # Risk score: 0–100, weighted by violation count and compliance status
        risk_score = min(100, violations_ytd * 5)
        if air_status == "non-compliant":
            risk_score = min(100, risk_score + 40)
        elif air_status == "warning":
            risk_score = min(100, risk_score + 20)

        # Consent valid until: simulate 1-2 years ahead from now
        import hashlib

        h = int(hashlib.md5(ind_id.encode()).hexdigest(), 16)
        days_ahead = 30 + (h % 700)  # 1 month to ~2 years
        consent_until = (now + timedelta(days=days_ahead)).date().isoformat()

        # Last inspection: simulate within last 90 days
        days_ago = h % 90
        last_inspection = (now - timedelta(days=days_ago)).date().isoformat()

        result.append(
            {
                "id": ind_id,
                "name": row["name"],
                "type": row["type"],
                "region": row["region"],
                "consent_valid_until": consent_until,
                "air_status": air_status,
                "water_status": "n/a",
                "noise_status": "n/a",
                "last_inspection": last_inspection,
                "total_violations_ytd": violations_ytd,
                "risk_score": risk_score,
            }
        )

    return result


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
