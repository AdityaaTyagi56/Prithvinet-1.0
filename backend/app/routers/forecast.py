import json as json_module
from datetime import date as date_type, timedelta

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.config import settings
from app.services.ml_service import generate_forecast
from app.services.aqi_csv_logger import get_daily_analysis_path
from app.models.core import MonitoringLocation, MonitoringUnit

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


@router.get("/{location_id}/ai-insight")
async def get_forecast_ai_insight(
    location_id: str,
    parameter: str,
    hours: int = 48,
    db: AsyncSession = Depends(get_db),
):
    if not settings.OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY is not configured")

    hours = max(12, min(hours, 168))

    param_res = await db.execute(select(MonitoringUnit).where(MonitoringUnit.parameter == parameter))
    unit = param_res.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail="Parameter not found")

    location_res = await db.execute(select(MonitoringLocation).where(MonitoringLocation.id == location_id))
    location = location_res.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    forecast = await generate_forecast(db, location_id, str(unit.id), hours=hours)
    if not forecast:
        raise HTTPException(status_code=404, detail="Forecast not available (insufficient data)")

    latest_q = text(
        """
        SELECT sr.value, sr.recorded_at
        FROM sensor_readings sr
        WHERE sr.location_id::text = :loc_id AND sr.parameter_id::text = :param_id
        ORDER BY sr.recorded_at DESC
        LIMIT 1
        """
    )
    latest = (await db.execute(latest_q, {"loc_id": location_id, "param_id": str(unit.id)})).first()
    latest_value = float(latest[0]) if latest else None
    latest_at = latest[1].isoformat() if latest and latest[1] else None

    first_point = float(forecast[0]["point"])
    last_point = float(forecast[-1]["point"])
    min_point = min(float(p["point"]) for p in forecast)
    max_point = max(float(p["point"]) for p in forecast)
    trend = "rising" if last_point > first_point else "falling" if last_point < first_point else "flat"

    sample_points = [
        {
            "timestamp": p["timestamp"],
            "point": p["point"],
            "lower": p["lower"],
            "upper": p["upper"],
        }
        for p in forecast[:12]
    ]

    client = AsyncOpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": settings.OPENROUTER_SITE_URL,
            "X-Title": settings.OPENROUTER_APP_NAME,
        },
    )

    system_prompt = (
        "You are an environmental forecasting analyst for industrial compliance. "
        "Provide concise, practical output for operations teams in India. "
        "Keep the response under 120 words and avoid markdown tables."
    )
    # Load latest daily analysis context to enrich the forecast prompt
    daily_context = ""
    today = date_type.today()
    for delta in range(3):
        check_date = today - timedelta(days=delta)
        analysis_path = get_daily_analysis_path(check_date)
        if analysis_path.exists():
            try:
                with open(analysis_path, "r", encoding="utf-8") as af:
                    analysis = json_module.load(af)
                fc = (analysis.get("ai_insight") or {}).get("forecast_context", "")
                if fc:
                    daily_context = f"\nRecent daily analysis ({check_date}): {fc}"
                    break
            except Exception:
                pass

    user_prompt = (
        f"Location: {location.name}\n"
        f"Pollution type: {location.type.value}\n"
        f"Parameter: {unit.parameter} ({unit.unit})\n"
        f"Horizon: {hours} hours\n"
        f"Latest reading: {latest_value if latest_value is not None else 'N/A'} at {latest_at or 'N/A'}\n"
        f"Trend: {trend}; min={round(min_point, 2)}, max={round(max_point, 2)}\n"
        f"Sample forecast points: {sample_points}\n"
        f"{daily_context}\n\n"
        "Return exactly 3 short bullet points:"
        " (1) trend summary, (2) risk level low/medium/high with reason,"
        " (3) one actionable recommendation for the next 24 hours."
    )

    try:
        response = await client.chat.completions.create(
            model=settings.OPENROUTER_MODEL,
            temperature=0.2,
            max_tokens=220,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI insight generation failed: {str(exc)}")

    insight = (response.choices[0].message.content or "").strip()
    if not insight:
        insight = "AI insight was empty. Please try again."

    return {
        "location_id": location_id,
        "location_name": location.name,
        "parameter": unit.parameter,
        "unit": unit.unit,
        "hours": hours,
        "latest_reading": latest_value,
        "trend": trend,
        "insight": insight,
    }
