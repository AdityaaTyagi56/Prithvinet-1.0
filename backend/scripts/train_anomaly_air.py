"""
Train IsolationForest anomaly detection models for all AIR station+parameter combos.
- Uses last 30 days of readings per combo
- Saves models to ml_models/isoforest_{location_id}_{parameter_id}.pkl
- Retroactively marks quality_flag='anomaly' in sensor_readings
- Schedules retraining every 6 hours (--scheduler flag)
Run: python scripts/train_anomaly_air.py
"""

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
from typing import List, Optional

import numpy as np
import pandas as pd
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from sklearn.ensemble import IsolationForest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

MIN_POINTS = 30
CONTAMINATION = 0.05
N_ESTIMATORS = 100
RANDOM_STATE = 42
LOOKBACK_DAYS = 30


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
    for env_file in (backend_root / ".env", project_root / ".env"):
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


def _model_path(models_dir: Path, location_id: uuid.UUID, parameter_id: uuid.UUID) -> Path:
    return models_dir / f"isoforest_{location_id}_{parameter_id}.pkl"


async def _list_air_combos(session: AsyncSession) -> List[Combo]:
    result = await session.execute(
        text(
            """
            SELECT DISTINCT sr.location_id, ml.name, sr.parameter_id, mu.parameter
            FROM sensor_readings sr
            JOIN monitoring_locations ml ON ml.id = sr.location_id
            JOIN monitoring_units     mu ON mu.id = sr.parameter_id
            WHERE ml.type = 'air'
            ORDER BY ml.name, mu.parameter
            """
        )
    )
    return [Combo(row[0], row[1] or "", row[2], row[3] or "") for row in result.fetchall()]


async def _fetch_recent_values(
    session: AsyncSession,
    combo: Combo,
    lookback_days: int,
) -> pd.DataFrame:
    result = await session.execute(
        text(
            """
            SELECT id::text, value, recorded_at
            FROM sensor_readings
            WHERE location_id = :loc_id
              AND parameter_id = :param_id
              AND recorded_at >= NOW() - INTERVAL ':days days'
            ORDER BY recorded_at ASC
            """
        ),
        {"loc_id": combo.location_id, "param_id": combo.parameter_id, "days": lookback_days},
    )
    rows = result.fetchall()
    if not rows:
        return pd.DataFrame(columns=["id", "value", "recorded_at"])
    df = pd.DataFrame(rows, columns=["id", "value", "recorded_at"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])
    return df


async def _fetch_all_values(
    session: AsyncSession,
    combo: Combo,
) -> pd.DataFrame:
    result = await session.execute(
        text(
            """
            SELECT id::text, value, recorded_at
            FROM sensor_readings
            WHERE location_id = :loc_id
              AND parameter_id = :param_id
            ORDER BY recorded_at ASC
            """
        ),
        {"loc_id": combo.location_id, "param_id": combo.parameter_id},
    )
    rows = result.fetchall()
    if not rows:
        return pd.DataFrame(columns=["id", "value", "recorded_at"])
    df = pd.DataFrame(rows, columns=["id", "value", "recorded_at"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])
    return df


async def _mark_anomalies(
    session: AsyncSession,
    anomaly_ids: List[str],
) -> None:
    if not anomaly_ids:
        return
    # Execute in batches of 500
    batch_size = 500
    for i in range(0, len(anomaly_ids), batch_size):
        batch = anomaly_ids[i : i + batch_size]
        # Build a parameterized query using ANY
        await session.execute(
            text(
                """
                UPDATE sensor_readings
                SET quality_flag = 'anomaly'
                WHERE id = ANY(:ids::uuid[])
                """
            ),
            {"ids": batch},
        )
    await session.commit()


def _train_isoforest(values: np.ndarray) -> IsolationForest:
    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
    )
    model.fit(values.reshape(-1, 1))
    return model


async def _train_once(session: AsyncSession, models_dir: Path) -> None:
    start_all = time.perf_counter()
    combos = await _list_air_combos(session)

    trained = 0
    skipped = 0
    total_anomalies_found = 0

    for combo in combos:
        t0 = time.perf_counter()

        # Train on recent data
        recent_df = await _fetch_recent_values(session, combo, LOOKBACK_DAYS)

        if len(recent_df) < MIN_POINTS:
            skipped += 1
            logging.info(
                "Skipping %s / %s: only %d points in last %d days",
                combo.location_name,
                combo.parameter_name,
                len(recent_df),
                LOOKBACK_DAYS,
            )
            continue

        values = recent_df["value"].values
        model = _train_isoforest(values)

        # Save model
        pkl_path = _model_path(models_dir, combo.location_id, combo.parameter_id)
        with pkl_path.open("wb") as fp:
            pickle.dump(model, fp)

        # Run retroactively on ALL historical data
        all_df = await _fetch_all_values(session, combo)
        if not all_df.empty:
            preds = model.predict(all_df["value"].values.reshape(-1, 1))
            anomaly_ids = all_df.loc[preds == -1, "id"].tolist()
            await _mark_anomalies(session, anomaly_ids)
            total_anomalies_found += len(anomaly_ids)
            logging.info(
                "%s / %s: %d anomalies found in %d historical readings",
                combo.location_name,
                combo.parameter_name,
                len(anomaly_ids),
                len(all_df),
            )

        trained += 1
        logging.info(
            "Trained %s / %s in %.2fs",
            combo.location_name,
            combo.parameter_name,
            time.perf_counter() - t0,
        )

    total_elapsed = time.perf_counter() - start_all
    logging.info(
        "Anomaly training complete. trained=%d skipped=%d total_anomalies=%d time=%.2fs",
        trained,
        skipped,
        total_anomalies_found,
        total_elapsed,
    )


async def _run_scheduler(session_factory: sessionmaker, models_dir: Path) -> None:
    scheduler = AsyncIOScheduler(timezone="UTC")

    async def _job() -> None:
        async with session_factory() as session:
            await _train_once(session, models_dir)

    scheduler.add_job(_job, trigger="interval", hours=6, max_instances=1, coalesce=True)
    scheduler.start()
    logging.info("APScheduler started: retraining anomaly models every 6 hours")
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
    models_dir = _models_dir()

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        if run_scheduler:
            await _run_scheduler(session_factory, models_dir)
        else:
            async with session_factory() as session:
                await _train_once(session, models_dir)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train IsolationForest anomaly models")
    parser.add_argument(
        "--scheduler",
        action="store_true",
        help="Run continuously and retrain every 6 hours",
    )
    args = parser.parse_args()

    try:
        asyncio.run(main(run_scheduler=args.scheduler))
    except Exception as exc:
        logging.exception("Anomaly training failed: %s", exc)
        sys.exit(1)
