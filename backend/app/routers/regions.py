from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user, role_required
from app.models.core import Industry, RegionalOffice
from app.models.users import User, UserRole
from app.schemas.core import (
    IndustryResponse,
    RegionalOfficeCreate,
    RegionalOfficeResponse,
)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/regions", tags=["Regions"])


@router.post(
    "/",
    response_model=RegionalOfficeResponse,
    dependencies=[Depends(role_required([UserRole.super_admin]))],
)
async def create_region(
    region: RegionalOfficeCreate, db: AsyncSession = Depends(get_db)
):
    db_region = RegionalOffice(**region.model_dump())
    db.add(db_region)
    await db.commit()
    await db.refresh(db_region)
    return db_region


@router.get("/analytics")
async def get_regional_analytics(db: AsyncSession = Depends(get_db)):
    """
    Returns per-region aggregated environmental metrics.
    Air AQI is computed from real PM2.5 readings.
    Water / Noise are estimated placeholders (no water/noise sensors seeded).
    Trend is computed by comparing the last 24 h average vs the prior 24 h.
    """

    # ── 1. Per-region station counts ─────────────────────────────────────────
    station_rows = (
        (
            await db.execute(
                text(
                    """
                SELECT
                    ro.name          AS region,
                    ro.id::text      AS region_id,
                    COUNT(ml.id)     AS stations
                FROM regional_offices ro
                LEFT JOIN monitoring_locations ml ON ml.region_id = ro.id
                GROUP BY ro.id, ro.name
                ORDER BY ro.name
                """
                )
            )
        )
        .mappings()
        .all()
    )

    if not station_rows:
        return []

    # ── 2. Latest 24-h and prior 24-h PM2.5 averages per region ─────────────
    pm25_rows = (
        (
            await db.execute(
                text(
                    """
                SELECT
                    ml.region_id::text                AS region_id,
                    AVG(CASE WHEN sr.recorded_at >= now() - interval '24 hours'
                             THEN sr.value END)        AS recent_avg,
                    AVG(CASE WHEN sr.recorded_at >= now() - interval '48 hours'
                              AND sr.recorded_at  < now() - interval '24 hours'
                             THEN sr.value END)        AS prior_avg
                FROM sensor_readings sr
                JOIN monitoring_units mu  ON mu.id  = sr.parameter_id
                JOIN monitoring_locations ml ON ml.id = sr.location_id
                WHERE mu.parameter = 'PM2.5'
                  AND sr.recorded_at >= now() - interval '48 hours'
                GROUP BY ml.region_id
                """
                )
            )
        )
        .mappings()
        .all()
    )

    pm25_map: dict[str, dict] = {
        row["region_id"]: {
            "recent_avg": float(row["recent_avg"])
            if row["recent_avg"] is not None
            else None,
            "prior_avg": float(row["prior_avg"])
            if row["prior_avg"] is not None
            else None,
        }
        for row in pm25_rows
    }

    # ── 3. Open alert counts per region ──────────────────────────────────────
    alert_rows = (
        (
            await db.execute(
                text(
                    """
                SELECT
                    ml.region_id::text AS region_id,
                    COUNT(a.id)        AS violation_count
                FROM alerts a
                JOIN monitoring_locations ml ON ml.id = a.location_id
                WHERE a.status::text IN ('open', 'escalated')
                GROUP BY ml.region_id
                """
                )
            )
        )
        .mappings()
        .all()
    )

    alert_map: dict[str, int] = {
        row["region_id"]: int(row["violation_count"]) for row in alert_rows
    }

    # ── 4. Assemble response ──────────────────────────────────────────────────
    def _trend(recent, prior) -> str:
        if recent is None or prior is None or prior == 0:
            return "stable"
        delta = (recent - prior) / prior
        if delta > 0.05:
            return "up"
        if delta < -0.05:
            return "down"
        return "stable"

    def _aqi_from_pm25(pm25: float | None) -> float:
        """Very rough linear AQI approximation from PM2.5 (µg/m³)."""
        if pm25 is None:
            return 0.0
        # CPCB breakpoints (simplified)
        if pm25 <= 30:
            return round(pm25 / 30 * 50, 1)
        if pm25 <= 60:
            return round(50 + (pm25 - 30) / 30 * 50, 1)
        if pm25 <= 90:
            return round(100 + (pm25 - 60) / 30 * 100, 1)
        if pm25 <= 120:
            return round(200 + (pm25 - 90) / 30 * 100, 1)
        return round(min(300 + (pm25 - 120) / 30 * 100, 500), 1)

    result = []
    for row in station_rows:
        rid = row["region_id"]
        pm = pm25_map.get(rid, {})
        recent_pm = pm.get("recent_avg")
        prior_pm = pm.get("prior_avg")

        air_aqi = _aqi_from_pm25(recent_pm) if recent_pm is not None else 0.0

        # Water / noise: no sensors seeded — use placeholder derived from air AQI
        # so the UI renders something sensible instead of zeros.
        water_wqi = round(max(20.0, 90.0 - air_aqi * 0.15), 1)
        noise_db = round(55.0 + (air_aqi / 500.0) * 25.0, 1)

        result.append(
            {
                "region": row["region"],
                "air_aqi": air_aqi,
                "air_trend": _trend(recent_pm, prior_pm),
                "water_wqi": water_wqi,
                "water_trend": "stable",
                "noise_db": noise_db,
                "noise_trend": "stable",
                "stations": int(row["stations"]),
                "violations": alert_map.get(rid, 0),
            }
        )

    return result


@router.get("/", response_model=list[RegionalOfficeResponse])
async def get_regions(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(RegionalOffice))
    return result.scalars().all()


@router.get("/{id}", response_model=RegionalOfficeResponse)
async def get_region(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(RegionalOffice).where(RegionalOffice.id == id))
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    return region


@router.get("/{id}/industries", response_model=list[IndustryResponse])
async def get_region_industries(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Industry).where(Industry.region_office_id == id))
    return result.scalars().all()
