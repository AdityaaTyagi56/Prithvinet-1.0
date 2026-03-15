from app.routers import (
    air,
    alerts,
    aqi_logs,
    auth,
    copilot,
    forecast,
    industries,
    limits,
    locations,
    public,
    readings,
    regions,
    users,
    ws,
)
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.database import engine


# ── Fallback reading generator ────────────────────────────────────────────────
# When the IoT simulator is not running, this background task generates the
# next reading for any station that has been silent for >2 minutes.
# Uses a small random walk step (±1%) so the dashboard always shows movement.

async def _fallback_generator_loop() -> None:
    """Runs every 30 s; inserts synthetic readings only for stale stations."""
    import random

    STALE_THRESHOLD = timedelta(seconds=120)
    TICK = 30

    while True:
        await asyncio.sleep(TICK)
        try:
            async with engine.begin() as conn:
                # Find stations with no reading in the last 2 minutes
                stale = await conn.execute(
                    text(
                        """
                        SELECT DISTINCT ON (ml.id, mu.id)
                            ml.id::text  AS loc_id,
                            mu.id::text  AS param_id,
                            mu.parameter AS param_name,
                            sr.value     AS last_value,
                            sr.recorded_at
                        FROM monitoring_locations ml
                        CROSS JOIN monitoring_units mu
                        LEFT JOIN sensor_readings sr
                            ON sr.location_id = ml.id
                            AND sr.parameter_id = mu.id
                        WHERE ml.is_active = TRUE
                          AND mu.parameter IN ('PM2.5', 'PM10', 'SO2', 'NO2', 'CO', 'O3')
                        ORDER BY ml.id, mu.id, sr.recorded_at DESC NULLS LAST
                        """
                    )
                )
                rows = stale.fetchall()

            now = datetime.now(timezone.utc)
            inserts = []

            for row in rows:
                loc_id, param_id, param_name, last_val, last_ts = row

                # Skip if recently updated
                if last_ts and (now - last_ts.replace(tzinfo=timezone.utc)) < STALE_THRESHOLD:
                    continue
                if last_val is None:
                    continue  # No baseline to walk from

                # Random walk: ±1% step from last known value
                step = float(last_val) * (random.gauss(0, 0.01))
                new_val = max(0.01, round(float(last_val) + step, 4))

                inserts.append((loc_id, param_id, new_val, now, "fallback_generator"))

            if inserts:
                async with engine.begin() as conn:
                    await conn.execute(
                        text(
                            """
                            INSERT INTO sensor_readings
                                (id, location_id, parameter_id, value, recorded_at, source)
                            VALUES
                                (gen_random_uuid(), :loc, :param, :val, :ts, :src)
                            """
                        ),
                        [
                            {"loc": loc, "param": param, "val": val, "ts": ts, "src": src}
                            for loc, param, val, ts, src in inserts
                        ],
                    )
                logging.info(
                    "Fallback generator inserted %d readings for stale stations", len(inserts)
                )
        except Exception as exc:
            # Non-fatal — log and continue on next tick
            logging.debug("Fallback generator tick error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch fallback generator
    task = asyncio.create_task(_fallback_generator_loop())
    yield
    # Shutdown: cancel background task
    task.cancel()


app = FastAPI(title="PrithviNet API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(regions.router, prefix="/api/v1")
app.include_router(industries.router, prefix="/api/v1")
app.include_router(locations.router, prefix="/api/v1")
app.include_router(limits.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(readings.router, prefix="/api/v1")
app.include_router(forecast.router, prefix="/api/v1")
app.include_router(copilot.router, prefix="/api/v1")
app.include_router(public.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(aqi_logs.router, prefix="/api/v1")
app.include_router(air.router, prefix="/api/v1")
app.include_router(ws.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
