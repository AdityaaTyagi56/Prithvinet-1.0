import argparse
import asyncio
import logging
import os
import pickle
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import List

import pandas as pd
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from prophet import Prophet
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker


MIN_POINTS = 500
HORIZON_HOURS = 72
MODEL_VERSION = "prophet-cg-v1"


@dataclass
class Combo:
    location_id: uuid.UUID
    location_name: str
    parameter_id: uuid.UUID
    parameter_name: str


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def _load_env() -> str:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    env_candidates = [backend_root / ".env", project_root / ".env"]
    for env_file in env_candidates:
        if env_file.exists():
            load_dotenv(env_file)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL not found in environment")
    return database_url


def _models_dir() -> Path:
    root = Path(__file__).resolve().parents[1]
    out = root / "ml_models"
    out.mkdir(parents=True, exist_ok=True)
    return out


def _is_winter(series: pd.Series) -> pd.Series:
    return series.dt.month.isin([10, 11, 12, 1, 2]).astype(int)


async def _list_air_combos(session: AsyncSession) -> List[Combo]:
    result = await session.execute(
        text(
            """
            SELECT ml.id, ml.name, mu.id, mu.parameter
            FROM monitoring_locations ml
            CROSS JOIN monitoring_units mu
            WHERE ml.type = 'air'
            ORDER BY ml.created_at ASC, mu.parameter ASC
            """
        )
    )
    combos = [Combo(row[0], row[1], row[2], row[3]) for row in result.fetchall()]
    return combos


async def _fetch_training_data(session: AsyncSession, combo: Combo) -> pd.DataFrame:
    rows = await session.execute(
        text(
            """
            SELECT recorded_at AS ds, value AS y
            FROM sensor_readings
            WHERE location_id = :loc_id
              AND parameter_id = :param_id
            ORDER BY recorded_at ASC
            """
        ),
        {"loc_id": combo.location_id, "param_id": combo.parameter_id},
    )
    data = rows.fetchall()
    if not data:
        return pd.DataFrame()
    frame = pd.DataFrame(data, columns=["ds", "y"])
    frame["ds"] = pd.to_datetime(frame["ds"], utc=True).dt.tz_localize(None)
    frame["y"] = pd.to_numeric(frame["y"], errors="coerce")
    frame = frame.dropna(subset=["ds", "y"])
    return frame


async def _store_forecast(
    session: AsyncSession,
    combo: Combo,
    forecast_rows: pd.DataFrame,
) -> None:
    point_data = []
    lower_data = []
    upper_data = []

    for _, row in forecast_rows.iterrows():
        ts = row["ds"].to_pydatetime().isoformat() + "Z"
        point_data.append({"timestamp": ts, "value": float(row["yhat"])})
        lower_data.append({"timestamp": ts, "value": float(row["yhat_lower"])})
        upper_data.append({"timestamp": ts, "value": float(row["yhat_upper"])})

    await session.execute(
        text(
            """
            DELETE FROM forecasts
            WHERE location_id = :loc_id
              AND parameter_id = :param_id
            """
        ),
        {"loc_id": combo.location_id, "param_id": combo.parameter_id},
    )

    await session.execute(
        text(
            """
            INSERT INTO forecasts (
                id,
                location_id,
                parameter_id,
                horizon_hours,
                point_forecast,
                lower_bound,
                upper_bound,
                model_version
            ) VALUES (
                :id,
                :loc_id,
                :param_id,
                :horizon_hours,
                CAST(:point_forecast AS jsonb),
                CAST(:lower_bound AS jsonb),
                CAST(:upper_bound AS jsonb),
                :model_version
            )
            """
        ),
        {
            "id": uuid.uuid4(),
            "loc_id": combo.location_id,
            "param_id": combo.parameter_id,
            "horizon_hours": HORIZON_HOURS,
            "point_forecast": pd.DataFrame(point_data).to_json(orient="records"),
            "lower_bound": pd.DataFrame(lower_data).to_json(orient="records"),
            "upper_bound": pd.DataFrame(upper_data).to_json(orient="records"),
            "model_version": MODEL_VERSION,
        },
    )


async def _train_once(session: AsyncSession, model_dir: Path) -> None:
    start_all = time.perf_counter()
    combos = await _list_air_combos(session)
    trained = 0
    skipped = 0

    for combo in combos:
        one_start = time.perf_counter()
        frame = await _fetch_training_data(session, combo)
        if len(frame) < MIN_POINTS:
            skipped += 1
            logging.info(
                "Skipping %s / %s: only %d points",
                combo.location_name,
                combo.parameter_name,
                len(frame),
            )
            continue

        frame = frame[["ds", "y"]].copy()
        frame["is_winter"] = _is_winter(frame["ds"])

        model = Prophet(
            changepoint_prior_scale=0.05,
            seasonality_mode="multiplicative",
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=True,
        )
        model.add_seasonality(name="coal_plant_cycle", period=0.5, fourier_order=5)
        model.add_regressor("is_winter")
        model.fit(frame)

        future = model.make_future_dataframe(periods=HORIZON_HOURS, freq="h")
        future["is_winter"] = _is_winter(pd.to_datetime(future["ds"]))
        forecast = model.predict(future)

        last_ds = frame["ds"].max()
        next_points = forecast.loc[forecast["ds"] > last_ds, ["ds", "yhat", "yhat_lower", "yhat_upper"]].head(HORIZON_HOURS)

        await _store_forecast(session, combo, next_points)

        model_path = model_dir / f"prophet_{combo.location_id}_{combo.parameter_id}.pkl"
        with model_path.open("wb") as fp:
            pickle.dump(model, fp)

        await session.commit()
        trained += 1
        elapsed = time.perf_counter() - one_start
        logging.info(
            "Trained %s / %s in %.2fs",
            combo.location_name,
            combo.parameter_name,
            elapsed,
        )

    total_elapsed = time.perf_counter() - start_all
    logging.info(
        "Training run complete. trained=%d skipped=%d total_time=%.2fs",
        trained,
        skipped,
        total_elapsed,
    )


async def _run_scheduler(session_factory: sessionmaker, model_dir: Path) -> None:
    scheduler = AsyncIOScheduler(timezone="UTC")

    async def _job() -> None:
        async with session_factory() as session:
            await _train_once(session, model_dir)

    scheduler.add_job(_job, trigger="interval", hours=6, max_instances=1, coalesce=True)
    scheduler.start()
    logging.info("APScheduler started: retraining every 6 hours")
    await _job()

    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        pass
    finally:
        scheduler.shutdown(wait=False)


async def main(run_scheduler: bool) -> None:
    _configure_logging()
    database_url = _load_env()
    model_dir = _models_dir()

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        if run_scheduler:
            await _run_scheduler(session_factory, model_dir)
        else:
            async with session_factory() as session:
                await _train_once(session, model_dir)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Prophet air models for PrithviNet")
    parser.add_argument(
        "--scheduler",
        action="store_true",
        help="Run continuously and retrain every 6 hours",
    )
    args = parser.parse_args()

    try:
        asyncio.run(main(run_scheduler=args.scheduler))
    except Exception as exc:
        logging.exception("Prophet training failed: %s", exc)
        sys.exit(1)
