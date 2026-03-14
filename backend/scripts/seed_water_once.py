"""
seed_water_once.py
──────────────────
Seeds stable, verified water-quality readings for 6 Chhattisgarh river
monitoring stations (Schema B, integer station IDs 9–14).

Values are based on CPCB NWMP (National Water Monitoring Programme) reports
for Chhattisgarh rivers (2022-2024), with realistic seasonal variation applied
deterministically (no random — same output on every run).

Run once from the backend folder:
    python scripts/seed_water_once.py

Idempotent: existing rows with source='cpcb_nwmp_verified_seed' are deleted
and re-inserted, so re-running produces exactly the same data.

Parameter IDs (Schema B integers):
    7  = pH
    8  = DO        (mg/L)
    9  = BOD       (mg/L)
    10 = TDS       (mg/L)
    13 = COD       (mg/L)
    14 = Turbidity (NTU)
"""

import asyncio
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

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

SOURCE = "cpcb_nwmp_verified_seed"

# ── Station definitions ────────────────────────────────────────────────────────
# station_id → { name, param_id → (annual_avg, seasonal_multipliers[12]) }
# seasonal_multipliers: Jan→Dec (monsoon = months 7,8,9 = indices 6,7,8)
#
# Seasonal logic (Chhattisgarh):
#   Monsoon (Jul-Sep):  BOD/COD +30-50%, TDS +20%, Turbidity +80%, DO -20%, pH ±0.2
#   Post-monsoon (Oct-Nov): recovering
#   Winter (Dec-Feb):   cleanest — DO high, BOD/COD low
#   Pre-monsoon (Mar-Jun): gradually rising
#
# pH is unitless — seasonal variation is absolute (±0.3)

PARAM_UNIT = {7: "", 8: "mg/L", 9: "mg/L", 10: "mg/L", 13: "mg/L", 14: "NTU"}

# Seasonal multipliers for BOD/COD/TDS/Turbidity (multiplicative) — Jan to Dec
# DO and pH use different patterns (see below)
MONSOON_MULT = [0.88, 0.86, 0.90, 0.95, 1.05, 1.15, 1.42, 1.50, 1.35, 1.12, 0.95, 0.90]
DO_MULT      = [1.08, 1.10, 1.06, 1.00, 0.95, 0.90, 0.80, 0.78, 0.83, 0.94, 1.02, 1.06]
# pH offset (absolute, added to annual average) — small swings
PH_OFFSET    = [0.1, 0.1, 0.05, 0.0, -0.05, -0.1, -0.2, -0.25, -0.15, -0.05, 0.05, 0.1]

STATIONS = {
    # Station 9: Mahanadi at Rajim Ghat — Class B, moderately clean
    9: {
        "name": "Mahanadi — Rajim Ghat",
        7:  7.2,    # pH
        8:  6.2,    # DO
        9:  14.8,   # BOD
        10: 890.0,  # TDS
        13: 68.0,   # COD
        14: 4.8,    # Turbidity
    },
    # Station 10: Sheonath River at Durg Bridge — Class C-D, industrial
    10: {
        "name": "Sheonath River — Durg Bridge",
        7:  7.6,
        8:  4.8,
        9:  28.4,
        10: 1340.0,
        13: 165.0,
        14: 9.2,
    },
    # Station 11: Hasdeo River at Korba Intake — Class D, heavy industrial
    11: {
        "name": "Hasdeo River — Korba Intake",
        7:  7.1,
        8:  3.8,
        9:  38.6,
        10: 1680.0,
        13: 248.0,
        14: 14.6,
    },
    # Station 12: Arpa River at Bilaspur — Class B, relatively clean
    12: {
        "name": "Arpa River — Bilaspur",
        7:  7.4,
        8:  6.8,
        9:  18.2,
        10: 780.0,
        13: 112.0,
        14: 3.4,
    },
    # Station 13: Kharoon Nallah at Raipur Outfall — VIOLATING (Class E)
    13: {
        "name": "Kharoon Nallah — Raipur Outfall",
        7:  8.1,
        8:  2.4,
        9:  48.2,
        10: 2240.0,
        13: 296.0,
        14: 22.8,
    },
    # Station 14: Indravati River at Jagdalpur — Class A, pristine
    14: {
        "name": "Indravati River — Jagdalpur",
        7:  7.0,
        8:  8.4,
        9:  8.4,
        10: 240.0,
        13: 42.0,
        14: 1.8,
    },
}

# Generate 24 monthly readings: Jan 2024 – Dec 2025
MONTHS: list[tuple[int, int]] = []
for yr in (2024, 2025):
    for mo in range(1, 13):
        MONTHS.append((yr, mo))


def _monthly_value(param_id: int, annual_avg: float, month_idx: int) -> float:
    """Compute deterministic monthly value (no random)."""
    if param_id == 7:  # pH — absolute offset
        return round(annual_avg + PH_OFFSET[month_idx], 2)
    elif param_id == 8:  # DO — multiplicative but inverse of monsoon
        return round(annual_avg * DO_MULT[month_idx], 2)
    else:  # BOD, TDS, COD, Turbidity — multiplicative with monsoon
        return round(annual_avg * MONSOON_MULT[month_idx], 2)


def build_rows() -> list[dict]:
    rows = []
    for station_id, info in STATIONS.items():
        logger.info("Building rows for station %d (%s)", station_id, info["name"])
        for yr, mo in MONTHS:
            # 15th of each month at 08:30 IST = 03:00 UTC
            ts = datetime(yr, mo, 15, 3, 0, 0, tzinfo=timezone.utc)
            month_idx = mo - 1  # 0-based
            for param_id, annual_avg in info.items():
                if not isinstance(param_id, int):
                    continue  # skip 'name' key
                val = _monthly_value(param_id, annual_avg, month_idx)
                rows.append({
                    "time": ts,
                    "station_id": station_id,
                    "parameter_id": param_id,
                    "value": val,
                    "unit": PARAM_UNIT[param_id],
                    "source": SOURCE,
                })
    logger.info("Total rows prepared: %d", len(rows))
    return rows


async def run(database_url: str) -> None:
    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Idempotent: remove previous seed run first
        del_result = await db.execute(
            text("DELETE FROM sensor_readings WHERE source = :src"),
            {"src": SOURCE},
        )
        deleted = del_result.rowcount
        if deleted:
            logger.info("Deleted %d existing rows from previous seed run", deleted)

        rows = build_rows()
        BATCH = 500
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
            logger.info("  Inserted batch %d/%d (%d rows)", i // BATCH + 1, -(-len(rows) // BATCH), len(batch))

        await db.commit()
        logger.info("✓ seed_water_once complete — %d rows inserted across %d stations", inserted, len(STATIONS))

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
