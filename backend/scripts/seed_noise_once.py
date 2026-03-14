"""
seed_noise_once.py
──────────────────
Seeds stable noise-level readings for 5 Chhattisgarh noise monitoring
stations (Schema B, integer station IDs 16–20) with 730 daily readings
(Jan 2024 – Dec 2025, one row per station per parameter per day).

Values are grounded in CPCB NANMN (National Ambient Noise Monitoring Network)
and published CG district noise research. Generation uses numpy.random.seed(42)
so every run produces **identical** rows — fully deterministic.

Run once from the backend folder:
    python scripts/seed_noise_once.py

Idempotent: rows with source='nanmn_pattern_cg_research_seed' are deleted
and re-inserted on every run.

Parameter IDs (Schema B integers):
    20 = Leq_day   dB(A) — equivalent continuous sound level (daytime)
    21 = Leq_night dB(A) — equivalent continuous sound level (night)
    22 = Lmax       dB(A) — maximum instantaneous level
"""

import asyncio
import logging
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

HERE = Path(__file__).resolve()
BACKEND_ROOT = HERE.parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

SOURCE = "nanmn_pattern_cg_research_seed"

# ── Noise standards (CPCB Noise Pollution Rules 2000) ─────────────────────────
# Zone         Day limit  Night limit
# Industrial   75 dB(A)   70 dB(A)
# Commercial   65 dB(A)   55 dB(A)
# Residential  55 dB(A)   45 dB(A)
# Silence      50 dB(A)   40 dB(A)

STATIONS = [
    # id, zone,         leq_day, leq_night, lmax_day
    (16, "Industrial",  82.0,    74.0,      97.0),   # Raipur — Pandri Industrial (EXCEEDS day+night)
    (17, "Industrial",  79.8,    71.4,      94.2),   # Bhilai — Sector 6 Market
    (18, "Commercial",  72.4,    61.8,      88.6),   # Raipur — Telibandha (EXCEEDS day)
    (19, "Residential", 58.6,    49.2,      74.6),   # Bilaspur — Bus Stand (borderline)
    (20, "Residential", 54.2,    44.8,      70.4),   # Rajnandgaon — Hospital Zone (near limit)
]

# Pre-generate ALL values now with fixed seed — before any DB operation
# This guarantees reproducibility regardless of when the script is run.
np.random.seed(42)  # FIXED — never change this

START_DATE = date(2024, 1, 1)
END_DATE   = date(2025, 12, 31)
TOTAL_DAYS = (END_DATE - START_DATE).days + 1  # 731

# Weekend/weekday adjustment: weekends +2 dB(A) for commercial/residential
# (more traffic, leisure), weekdays +0
def _day_of_week_delta(d: date, zone: str) -> float:
    if d.weekday() >= 5:  # Saturday=5, Sunday=6
        return 1.8 if zone in ("Commercial", "Residential") else 0.5
    return 0.0


def build_rows() -> list[dict]:
    """Return list of dicts ready for parameterised INSERT."""
    rows: list[dict] = []

    for station_id, zone, base_day, base_night, base_lmax in STATIONS:
        logger.info("Generating %d days for station %d (%s, %s)", TOTAL_DAYS, station_id, zone, zone)

        for day_offset in range(TOTAL_DAYS):
            d = START_DATE + timedelta(days=day_offset)
            # 09:00 IST = 03:30 UTC for daytime reading
            ts_day   = datetime(d.year, d.month, d.day, 3, 30, tzinfo=timezone.utc)
            # 23:00 IST = 17:30 UTC for night reading
            ts_night = datetime(d.year, d.month, d.day, 17, 30, tzinfo=timezone.utc)

            wk_delta = _day_of_week_delta(d, zone)

            # Generate with fixed-seed numpy random — small Gaussian noise ±1.5 dB(A)
            leq_day   = float(np.clip(
                np.random.normal(base_day + wk_delta, 1.5), base_day - 4, base_day + 5
            ))
            leq_night = float(np.clip(
                np.random.normal(base_night + wk_delta * 0.5, 1.2), base_night - 3, base_night + 4
            ))
            lmax      = float(np.clip(
                np.random.normal(base_lmax + wk_delta, 2.0), base_lmax - 6, base_lmax + 8
            ))

            rows.append({
                "time":         ts_day,
                "station_id":   station_id,
                "parameter_id": 20,    # Leq_day
                "value":        round(leq_day, 1),
                "unit":         "dB(A)",
                "source":       SOURCE,
            })
            rows.append({
                "time":         ts_night,
                "station_id":   station_id,
                "parameter_id": 21,    # Leq_night
                "value":        round(leq_night, 1),
                "unit":         "dB(A)",
                "source":       SOURCE,
            })
            rows.append({
                "time":         ts_day,
                "station_id":   station_id,
                "parameter_id": 22,    # Lmax
                "value":        round(lmax, 1),
                "unit":         "dB(A)",
                "source":       SOURCE,
            })

    logger.info("Total noise rows prepared: %d", len(rows))
    return rows


async def run(database_url: str) -> None:
    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Pre-generate all values (fixed seed) BEFORE opening DB connection
    rows = build_rows()

    async with async_session() as db:
        # Idempotent: remove previous seed run
        del_result = await db.execute(
            text("DELETE FROM sensor_readings WHERE source = :src"),
            {"src": SOURCE},
        )
        deleted = del_result.rowcount
        if deleted:
            logger.info("Deleted %d rows from previous seed run", deleted)

        BATCH = 1000
        inserted = 0
        for i in range(0, len(rows), BATCH):
            batch = rows[i : i + BATCH]
            await db.execute(
                text(
                    """
                    INSERT INTO sensor_readings
                        (time, station_id, parameter_id, value, unit, source, is_anomaly)
                    VALUES
                        (:time, :station_id, :parameter_id, :value, :unit, :source, FALSE)
                    ON CONFLICT DO NOTHING
                    """
                ),
                batch,
            )
            inserted += len(batch)
            logger.info(
                "  Inserted batch %d/%d (%d rows)",
                i // BATCH + 1,
                -(-len(rows) // BATCH),
                len(batch),
            )

        await db.commit()
        logger.info(
            "✓ seed_noise_once complete — %d rows for %d stations × 3 params × %d days",
            inserted,
            len(STATIONS),
            TOTAL_DAYS,
        )

    await engine.dispose()


def _load_db_url() -> str:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    for env_file in (backend_root / ".env", backend_root.parent / ".env"):
        if env_file.exists():
            load_dotenv(env_file)
    url = os.getenv("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Add it to backend/.env")
    return url


if __name__ == "__main__":
    asyncio.run(run(_load_db_url()))
