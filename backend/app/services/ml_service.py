import json
import pickle
from datetime import datetime, timedelta, timezone
from pathlib import Path

import holidays
import pandas as pd
from app.core.redis import redis_client
from prophet import Prophet
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_MODEL_DIR = Path(__file__).resolve().parents[2] / "ml_models"


def _load_pkl_model(location_id: str, parameter_name: str):
    """Load a pre-trained Prophet pkl from ml_models/ if available."""
    safe_param = parameter_name.replace(".", "_").replace(" ", "_")
    pkl_path = _MODEL_DIR / f"{location_id}_{safe_param}.pkl"
    if pkl_path.exists():
        try:
            with open(pkl_path, "rb") as fh:
                return pickle.load(fh)
        except Exception as exc:
            print(f"Failed to load pkl model {pkl_path}: {exc}")
    return None


async def _get_parameter_name(db: AsyncSession, parameter_id: str) -> str | None:
    """Resolve parameter name from its UUID."""
    row = (await db.execute(
        text("SELECT parameter FROM monitoring_units WHERE id::text = :pid"),
        {"pid": parameter_id},
    )).first()
    return row[0] if row else None


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
        # Clear failed transaction state so fallback query can execute.
        await db.rollback()
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

    # ── Try pre-trained pkl model first (higher quality) ──────────────────
    parameter_name = await _get_parameter_name(db, parameter_id)
    if parameter_name:
        pkl_model = _load_pkl_model(location_id, parameter_name)
        if pkl_model:
            try:
                future = pkl_model.make_future_dataframe(periods=hours, freq="h")
                forecast_df = pkl_model.predict(future)
                result = [
                    {
                        "timestamp": row["ds"].isoformat() + "Z",
                        "point": round(max(0.0, float(row["yhat"])), 2),
                        "lower": round(max(0.0, float(row["yhat_lower"])), 2),
                        "upper": round(max(0.0, float(row["yhat_upper"])), 2),
                    }
                    for _, row in forecast_df.tail(hours).iterrows()
                ]
                await redis_client.setex(cache_key, 3600, json.dumps(result))
                return result
            except Exception as exc:
                print(f"Pre-trained pkl prediction failed, falling back to DB: {exc}")

    # ── Fall back: train from DB historical data ────────────────────────────
    df = await get_historical_data(db, location_id, parameter_id)
    if len(df) < 2:
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
                "created_at": datetime.now(timezone.utc),
            },
        )
        await db.commit()
    except Exception as e:
        print(f"Failed to store forecast in DB: {e}")

    return result
