import json
from datetime import datetime, timedelta

import holidays
import pandas as pd
from app.core.redis import redis_client
from prophet import Prophet
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _fallback_forecast(df: pd.DataFrame, hours: int):
    # Lightweight fallback if Prophet/Stan is unavailable in local setup.
    last_window = df.tail(min(24, len(df)))
    baseline = float(last_window["y"].mean())
    volatility = (
        float(last_window["y"].std())
        if len(last_window) > 1
        else max(baseline * 0.1, 1.0)
    )
    lower_gap = max(volatility * 0.8, 0.5)
    upper_gap = max(volatility * 1.2, 1.0)

    last_ds = df["ds"].max()
    result = []
    for i in range(1, hours + 1):
        ts = last_ds + timedelta(hours=i)
        # Soft daily cycle so the graph is not perfectly flat.
        cycle = ((i % 24) - 12) * 0.04
        point = round(max(0.0, baseline * (1 + cycle)), 2)
        result.append(
            {
                "timestamp": ts.isoformat() + "Z",
                "point": point,
                "lower": round(max(0.0, point - lower_gap), 2),
                "upper": round(point + upper_gap, 2),
            }
        )
    return result


async def get_historical_data(db: AsyncSession, location_id: str, parameter_id: str):
    rows = []

    # Preferred path: use pre-aggregated hourly series when available.
    try:
        query = text("""
            SELECT hour as ds, avg_value as y
            FROM hourly_readings
            WHERE location_id = :loc_id AND parameter_id = :param_id
            ORDER BY hour ASC
        """)
        result = await db.execute(
            query, {"loc_id": location_id, "param_id": parameter_id}
        )
        rows = result.fetchall()
    except Exception:
        rows = []

    # Fallback for environments without Timescale continuous aggregates.
    if not rows:
        fallback_query = text("""
            SELECT date_trunc('hour', recorded_at) AS ds, AVG(value) AS y
            FROM sensor_readings
            WHERE location_id::text = :loc_id AND parameter_id::text = :param_id
            GROUP BY 1
            ORDER BY 1 ASC
        """)
        fallback_result = await db.execute(
            fallback_query, {"loc_id": location_id, "param_id": parameter_id}
        )
        rows = fallback_result.fetchall()

    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows, columns=["ds", "y"])
    df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)
    return df


async def generate_forecast(
    db: AsyncSession, location_id: str, parameter_id: str, hours: int = 72
):
    cache_key = f"forecast:{location_id}:{parameter_id}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    df = await get_historical_data(db, location_id, parameter_id)
    if len(df) < 24:
        return []

    try:
        m = Prophet(
            yearly_seasonality=False, weekly_seasonality=True, daily_seasonality=True
        )
        m.add_country_holidays(country_name="IN")
        m.fit(df)

        future = m.make_future_dataframe(periods=hours, freq="H")
        forecast = m.predict(future)

        last_ds = df["ds"].max()
        future_forecast = forecast[forecast["ds"] > last_ds].head(hours)

        result = []
        for _, row in future_forecast.iterrows():
            result.append(
                {
                    "timestamp": row["ds"].isoformat() + "Z",
                    "point": round(row["yhat"], 2),
                    "lower": round(row["yhat_lower"], 2),
                    "upper": round(row["yhat_upper"], 2),
                }
            )
    except Exception as e:
        print(f"Prophet unavailable, using fallback forecast: {e}")
        result = _fallback_forecast(df, hours)

    await redis_client.setex(cache_key, 3600, json.dumps(result))

    # Store latest forecast snapshot in forecasts table.
    try:
        point_forecast = [
            {"timestamp": p["timestamp"], "value": p["point"]} for p in result
        ]
        lower_bound = [
            {"timestamp": p["timestamp"], "value": p["lower"]} for p in result
        ]
        upper_bound = [
            {"timestamp": p["timestamp"], "value": p["upper"]} for p in result
        ]

        await db.execute(
            text(
                "DELETE FROM forecasts WHERE location_id = :loc_id AND parameter_id = :param_id"
            ),
            {"loc_id": location_id, "param_id": parameter_id},
        )

        await db.execute(
            text("""
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
                    CAST(:point_forecast AS jsonb),
                    CAST(:lower_bound AS jsonb),
                    CAST(:upper_bound AS jsonb),
                    :model_version,
                    :created_at
                )
            """),
            {
                "loc_id": location_id,
                "param_id": parameter_id,
                "hours": hours,
                "point_forecast": json.dumps(point_forecast),
                "lower_bound": json.dumps(lower_bound),
                "upper_bound": json.dumps(upper_bound),
                "model_version": "prophet-v1",
                "created_at": datetime.utcnow(),
            },
        )
        await db.commit()
    except Exception as e:
        print(f"Failed to store forecast in DB: {e}")

    return result
