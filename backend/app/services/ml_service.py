import pandas as pd
from prophet import Prophet
import holidays
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.redis import redis_client
import json
from datetime import datetime, timedelta

async def get_historical_data(db: AsyncSession, location_id: str, parameter_id: str):
    query = text("""
        SELECT hour as ds, avg_value as y
        FROM hourly_readings
        WHERE location_id = :loc_id AND parameter_id = :param_id
        ORDER BY hour ASC
    """)
    result = await db.execute(query, {"loc_id": location_id, "param_id": parameter_id})
    rows = result.fetchall()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows, columns=['ds', 'y'])
    df['ds'] = pd.to_datetime(df['ds']).dt.tz_localize(None)
    return df

async def generate_forecast(db: AsyncSession, location_id: str, parameter_id: str, hours: int = 72):
    cache_key = f"forecast:{location_id}:{parameter_id}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    df = await get_historical_data(db, location_id, parameter_id)
    if len(df) < 24:
        return []

    m = Prophet(yearly_seasonality=False, weekly_seasonality=True, daily_seasonality=True)
    m.add_country_holidays(country_name='IN')
    m.fit(df)

    future = m.make_future_dataframe(periods=hours, freq='H')
    forecast = m.predict(future)

    last_ds = df['ds'].max()
    future_forecast = forecast[forecast['ds'] > last_ds].head(hours)

    result = []
    for _, row in future_forecast.iterrows():
        result.append({
            "timestamp": row['ds'].isoformat() + "Z",
            "point": round(row['yhat'], 2),
            "lower": round(row['yhat_lower'], 2),
            "upper": round(row['yhat_upper'], 2)
        })

    await redis_client.setex(cache_key, 3600, json.dumps(result))
    
    # Store latest forecast snapshot in forecasts table.
    try:
        query = text("""
            DELETE FROM forecasts
            WHERE location_id = :loc_id AND parameter_id = :param_id;

            INSERT INTO forecasts (
                location_id,
                parameter_id,
                horizon_hours,
                point_forecast,
                lower_bound,
                upper_bound,
                model_version,
                created_at
            )
            VALUES (
                :loc_id,
                :param_id,
                :hours,
                :point_forecast::jsonb,
                :lower_bound::jsonb,
                :upper_bound::jsonb,
                :model_version,
                :created_at
            );
        """)

        point_forecast = [{"timestamp": p["timestamp"], "value": p["point"]} for p in result]
        lower_bound = [{"timestamp": p["timestamp"], "value": p["lower"]} for p in result]
        upper_bound = [{"timestamp": p["timestamp"], "value": p["upper"]} for p in result]

        await db.execute(query, {
            "loc_id": location_id,
            "param_id": parameter_id,
            "hours": hours,
            "point_forecast": json.dumps(point_forecast),
            "lower_bound": json.dumps(lower_bound),
            "upper_bound": json.dumps(upper_bound),
            "model_version": "prophet-v1",
            "created_at": datetime.utcnow()
        })
        await db.commit()
    except Exception as e:
        print(f"Failed to store forecast in DB: {e}")

    return result
