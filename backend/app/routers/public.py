from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.ml_service import generate_forecast

router = APIRouter(prefix="/public", tags=["Public"])


def _parse_coordinates(raw: str | None):
    if not raw:
        return None
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 2:
        return None
    try:
        lat = float(parts[0])
        lng = float(parts[1])
    except ValueError:
        return None
    return lat, lng


def _pm25_to_aqi(c: float) -> float:
    if c <= 30:
        return ((50 - 0) / (30 - 0)) * (c - 0) + 0
    elif c <= 60:
        return ((100 - 51) / (60 - 31)) * (c - 31) + 51
    elif c <= 90:
        return ((200 - 101) / (90 - 61)) * (c - 61) + 101
    elif c <= 120:
        return ((300 - 201) / (120 - 91)) * (c - 91) + 201
    elif c <= 250:
        return ((400 - 301) / (250 - 121)) * (c - 121) + 301
    else:
        return min(500.0, ((500 - 401) / (380 - 250)) * (c - 250) + 401)

def _aqi_category(value: float) -> str:
    if value <= 50:
        return "Good"
    elif value <= 100:
        return "Satisfactory"
    elif value <= 200:
        return "Moderate"
    elif value <= 300:
        return "Poor"
    elif value <= 400:
        return "Very Poor"
    else:
        return "Severe"


@router.get("/overview")
async def get_public_overview(db: AsyncSession = Depends(get_db)):
    latest_pm25_rows = (
        await db.execute(
            text(
                """
                SELECT DISTINCT ON (sr.location_id)
                    ml.id::text AS location_id,
                    ml.name AS location_name,
                    ml.location AS location_coordinates,
                    sr.value,
                    sr.recorded_at,
                    sr.parameter_id::text AS parameter_id
                FROM sensor_readings sr
                JOIN monitoring_units mu ON mu.id = sr.parameter_id
                JOIN monitoring_locations ml ON ml.id = sr.location_id
                WHERE mu.parameter = 'PM2.5'
                                    AND ml.name NOT ILIKE 'Stack %'
                ORDER BY sr.location_id, sr.recorded_at DESC
                """
            )
        )
    ).mappings().all()

    map_locations = []
    for index, row in enumerate(latest_pm25_rows):
        parsed = _parse_coordinates(row["location_coordinates"])

        # Fallbacks for known seeded locations and deterministic offsets.
        if parsed is None and row["location_name"] == "Central Station":
            parsed = (21.2514, 81.6296)
        if parsed is None and row["location_name"] == "Bharat Steel":
            parsed = (21.2315, 81.6521)
        if parsed is None:
            parsed = (21.2514 + (index * 0.005), 81.6296 + (index * 0.004))

        map_locations.append(
            {
                "location_id": row["location_id"],
                "location_name": row["location_name"],
                "latitude": parsed[0],
                "longitude": parsed[1],
                "pm25": float(row["value"]),
                "recorded_at": row["recorded_at"].isoformat() if row["recorded_at"] else None,
            }
        )

    avg_pm25 = sum(loc["pm25"] for loc in map_locations) / len(map_locations) if map_locations else 0.0
    current_aqi = round(_pm25_to_aqi(avg_pm25), 2)

    forecast_cards = []
    if latest_pm25_rows:
        first = latest_pm25_rows[0]
        forecast_points = []
        try:
            forecast_points = await generate_forecast(
                db,
                location_id=first["location_id"],
                parameter_id=first["parameter_id"],
                hours=48,
            )
        except Exception:
            await db.rollback()
            recent_avg = (
                await db.execute(
                    text(
                        """
                        SELECT AVG(sr.value)::float AS avg_pm25
                        FROM sensor_readings sr
                        WHERE sr.location_id::text = :location_id
                          AND sr.parameter_id::text = :parameter_id
                          AND sr.recorded_at >= now() - interval '48 hours'
                        """
                    ),
                    {"location_id": first["location_id"], "parameter_id": first["parameter_id"]},
                )
            ).scalar()
            if recent_avg is not None:
                baseline = float(recent_avg)
                forecast_cards = [
                    {"label": "Tomorrow", "aqi": round(_pm25_to_aqi(baseline * 1.03), 2)},
                    {"label": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%A"), "aqi": round(_pm25_to_aqi(baseline * 0.98), 2)},
                ]

        if forecast_points and not forecast_cards:
            now = datetime.now(timezone.utc)
            tomorrow = (now + timedelta(days=1)).date()
            day_after = (now + timedelta(days=2)).date()

            def daily_avg(day):
                points = [p["point"] for p in forecast_points if datetime.fromisoformat(p["timestamp"].replace("Z", "")).date() == day]
                return round(_pm25_to_aqi(sum(points) / len(points)), 2) if points else None

            tomorrow_avg = daily_avg(tomorrow)
            day_after_avg = daily_avg(day_after)
            if tomorrow_avg is not None:
                forecast_cards.append({"label": "Tomorrow", "aqi": tomorrow_avg})
            if day_after_avg is not None:
                forecast_cards.append({"label": day_after.strftime("%A"), "aqi": day_after_avg})

    return {
        "current_aqi": current_aqi,
        "current_category": _aqi_category(current_aqi),
        "index_label": "AQI",
        "forecast": forecast_cards,
        "locations": map_locations,
    }
