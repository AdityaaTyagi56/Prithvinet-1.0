"""
import_ocems_cecb.py
────────────────────
Imports downloaded CECB OCEMS CSV files from data/ocems/ into sensor_readings.
Each CSV follows CECB standard format with columns:
  Date_Time, Industry_Name, Stack_ID, PM_mg_Nm3, SO2_mg_Nm3, NOx_mg_Nm3, Flow_m3_hr, Status

Runs industry compliance engine on every imported reading.

Usage: python scripts/import_ocems_cecb.py
"""
import asyncio
import logging
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

HERE = Path(__file__).resolve()
BACKEND_ROOT = HERE.parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

logger = logging.getLogger(__name__)

# ── CPCB Stack Emission Standards (mg/Nm3) — EP Rules 1986 ──
STACK_LIMITS: Dict[str, Dict[str, float]] = {
    "Thermal Power Plant": {"PM": 50, "SO2": 200, "NOx": 300},
    "Integrated Steel": {"PM": 50, "SO2": 500, "NOx": 500},
    "Cement": {"PM": 30, "SO2": 100, "NOx": 1000},
    "Sponge Iron": {"PM": 150, "SO2": 500},
    "Aluminium Smelter": {"PM": 50, "SO2": 400},
}

# ── Industry name fuzzy matching ──
INDUSTRY_ALIASES: Dict[str, Tuple[str, str]] = {
    "bhilai steel": ("CG/CECB/RED/001", "Integrated Steel"),
    "sail bhilai": ("CG/CECB/RED/001", "Integrated Steel"),
    "ntpc korba": ("CG/CECB/RED/002", "Thermal Power Plant"),
    "ntpc sipat": ("CG/CECB/RED/003", "Thermal Power Plant"),
    "cseb korba": ("CG/CECB/RED/004", "Thermal Power Plant"),
    "korba west": ("CG/CECB/RED/004", "Thermal Power Plant"),
    "balco": ("CG/CECB/RED/005", "Aluminium Smelter"),
    "vedanta": ("CG/CECB/RED/005", "Aluminium Smelter"),
    "acc cement": ("CG/CECB/RED/006", "Cement"),
    "acc jamul": ("CG/CECB/RED/006", "Cement"),
    "ultratech": ("CG/CECB/RED/007", "Cement"),
    "hirmi": ("CG/CECB/RED/007", "Cement"),
    "monnet": ("CG/CECB/RED/008", "Sponge Iron"),
    "jindal": ("CG/CECB/RED/009", "Integrated Steel"),
    "jspl": ("CG/CECB/RED/009", "Integrated Steel"),
    "nova iron": ("CG/CECB/RED/010", "Sponge Iron"),
}

# ── Parameter mapping ──
PARAM_MAP = {
    "pm_mg_nm3": ("PM", 1),
    "pm": ("PM", 1),
    "so2_mg_nm3": ("SO2", 3),
    "so2": ("SO2", 3),
    "nox_mg_nm3": ("NOx", 4),
    "nox": ("NOx", 4),
}


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")


def _load_env() -> str:
    project_root = BACKEND_ROOT.parent
    for env_file in (BACKEND_ROOT / ".env", project_root / ".env"):
        if env_file.exists():
            load_dotenv(env_file)
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL not set")
    return database_url


def _match_industry(name: str) -> Optional[Tuple[str, str]]:
    name_lower = name.lower().strip()
    for alias, (reg, itype) in INDUSTRY_ALIASES.items():
        if alias in name_lower:
            return (reg, itype)
    return None


def _check_severity(value: float, limit: float) -> str:
    if value > limit * 3.0:
        return "CRITICAL"
    if value > limit * 1.5:
        return "HIGH"
    if value > limit:
        return "MODERATE"
    return "OK"


async def _insert_reading(
    db: AsyncSession, station_id: int, parameter_id: int, value: float, ts: datetime, source: str
) -> bool:
    result = await db.execute(text("""
        INSERT INTO sensor_readings (time, station_id, parameter_id, value, unit, source, is_anomaly)
        SELECT :time, :station_id, :parameter_id, :value, 'mg/Nm3', :source, FALSE
        WHERE NOT EXISTS (
            SELECT 1 FROM sensor_readings
            WHERE station_id = :station_id AND parameter_id = :parameter_id AND time = :time
        )
        RETURNING station_id
    """), {
        "time": ts, "station_id": station_id, "parameter_id": parameter_id,
        "value": value, "source": source,
    })
    return result.fetchone() is not None


async def import_csv_file(db: AsyncSession, filepath: Path) -> Dict[str, Any]:
    import csv

    stats: Dict[str, Any] = {
        "file": filepath.name, "rows_read": 0, "imported": 0,
        "violations": 0, "skipped_status": 0, "skipped_unmapped": 0,
    }

    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            logger.warning("Empty or invalid CSV: %s", filepath)
            return stats

        # Normalize header names
        header_map = {h.strip().lower().replace(" ", "_"): h for h in reader.fieldnames}

        for row in reader:
            stats["rows_read"] += 1

            # Check Status
            status = (row.get("Status", "") or row.get("status", "")).strip().upper()
            if status in ("SHUTDOWN", "MAINTENANCE", "OFF"):
                stats["skipped_status"] += 1
                continue

            # Match industry
            industry_name = ""
            for key in ("Industry_Name", "industry_name", "Industry"):
                if key in row and row[key]:
                    industry_name = row[key]
                    break
            if not industry_name:
                industry_name = filepath.stem.replace("_emissions", "")

            match = _match_industry(industry_name)
            if not match:
                stats["skipped_unmapped"] += 1
                continue

            reg_no, industry_type = match

            # Parse timestamp
            date_str = row.get("Date_Time", row.get("date_time", row.get("DateTime", "")))
            ts = None
            for fmt in ("%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d"):
                try:
                    ts = datetime.strptime(date_str.strip(), fmt).replace(tzinfo=timezone.utc)
                    break
                except (ValueError, AttributeError):
                    continue
            if ts is None:
                continue

            # Use industry index as station_id (1-based from REAL_CG_INDUSTRIES order)
            idx = int(reg_no.split("/")[-1])

            # Process each parameter column
            limits = STACK_LIMITS.get(industry_type, {})
            for csv_key, (param_name, param_id) in PARAM_MAP.items():
                raw_val = None
                for possible_key in (csv_key, csv_key.upper(), header_map.get(csv_key, "")):
                    if possible_key in row and row[possible_key]:
                        try:
                            raw_val = float(row[possible_key])
                            break
                        except (ValueError, TypeError):
                            continue

                if raw_val is None or raw_val < 0:
                    continue

                if await _insert_reading(db, idx, param_id, raw_val, ts, "cecb_ocems_stack"):
                    stats["imported"] += 1

                    # Check compliance
                    limit = limits.get(param_name)
                    if limit and raw_val > limit:
                        severity = _check_severity(raw_val, limit)
                        try:
                            await db.execute(text("""
                                INSERT INTO compliance_events
                                    (station_id, parameter_id, reading_time, value, limit_value, severity, created_at)
                                SELECT :sid, :pid, :time, :val, :lim, :sev, NOW()
                                WHERE NOT EXISTS (
                                    SELECT 1 FROM compliance_events
                                    WHERE station_id = :sid AND parameter_id = :pid AND reading_time = :time
                                )
                            """), {
                                "sid": idx, "pid": param_id, "time": ts,
                                "val": raw_val, "lim": limit, "sev": severity,
                            })
                            stats["violations"] += 1
                        except Exception:
                            pass

    return stats


async def main() -> None:
    _configure_logging()
    database_url = _load_env()

    # Find OCEMS CSV files
    data_dir = BACKEND_ROOT / "data" / "ocems"
    if not data_dir.exists():
        data_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Created %s — place CECB OCEMS CSV files here", data_dir)

    csv_files = list(data_dir.glob("*.csv"))
    if not csv_files:
        logger.warning("No CSV files found in %s", data_dir)
        logger.info("Download OCEMS data from enviscecb.org/data.htm and save here as CSV")
        return

    engine = create_async_engine(database_url, echo=False)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with factory() as db:
            for csv_file in csv_files:
                logger.info("Importing: %s", csv_file.name)
                stats = await import_csv_file(db, csv_file)
                logger.info(
                    "  %s: read=%d imported=%d violations=%d skipped_status=%d unmapped=%d",
                    stats["file"], stats["rows_read"], stats["imported"],
                    stats["violations"], stats["skipped_status"], stats["skipped_unmapped"],
                )
            await db.commit()
            logger.info("OCEMS import complete")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        logging.exception("OCEMS import failed: %s", exc)
        sys.exit(1)
