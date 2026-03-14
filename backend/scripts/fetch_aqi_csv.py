"""
Standalone AQI data fetcher — writes CSV to backend/data/aqi_logs/.
No database required. Uses curl (reliable on Windows) to call data.gov.in.

Usage:
    python backend/scripts/fetch_aqi_csv.py          # fetch once
    python backend/scripts/fetch_aqi_csv.py --loop    # fetch every 60 min
"""

import json
import logging
import os
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Allow importing from the backend package
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.aqi_csv_logger import append_readings_to_csv, list_available_logs, read_daily_csv

GOV_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_JSON = PROJECT_ROOT / "public" / "aqi-live.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)


def _load_key() -> str:
    """Load GOVAPI_KEY from .env files."""
    from dotenv import load_dotenv

    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    for env_file in (backend_root / ".env", project_root / ".env"):
        if env_file.exists():
            load_dotenv(env_file)

    key = os.getenv("GOVAPI_KEY", "")
    if not key:
        logging.error("GOVAPI_KEY not set in .env — cannot fetch AQI data")
        sys.exit(1)
    return key


def fetch_chhattisgarh(api_key: str) -> list:
    """Fetch all Chhattisgarh AQI records via curl."""
    all_records = []
    limit = 500
    offset = 0

    while True:
        params = urllib.parse.urlencode({
            "api-key": api_key,
            "format": "json",
            "limit": limit,
            "offset": offset,
            "filters[state]": "Chhattisgarh",
        })
        url = f"{GOV_URL}?{params}"

        result = subprocess.run(
            ["curl", "-s", "-m", "60", url],
            capture_output=True, text=True, timeout=75,
        )
        if result.returncode != 0:
            logging.error("curl failed (rc=%d): %s", result.returncode, result.stderr[:200])
            break

        if not result.stdout.strip():
            logging.error("curl returned empty response")
            break

        payload = json.loads(result.stdout)
        batch = payload.get("records") or []
        if not batch:
            break

        all_records.extend(batch)
        logging.info("Fetched %d records (offset=%d, total so far=%d)", len(batch), offset, len(all_records))

        if len(batch) < limit:
            break
        offset += limit

    return all_records


def records_to_csv_rows(records: list) -> list:
    """Group per-pollutant API records into one row per station+timestamp."""
    grouped = {}
    from datetime import timedelta
    IST = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(IST).replace(microsecond=0)

    for rec in records:
        station = rec.get("station", "")
        city = rec.get("city", "")
        pollutant = str(rec.get("pollutant_id", "")).strip().upper()
        avg_val = rec.get("avg_value", "")
        ts_raw = rec.get("last_update", "")

        if not station:
            continue

        # Parse timestamp
        ts = ""
        if ts_raw:
            for fmt in ("%d-%m-%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S"):
                try:
                    dt = datetime.strptime(ts_raw, fmt).replace(tzinfo=IST)
                    # Force dates to sync with latest time (today)
                    if dt.date() < now_ist.date():
                        try:
                            dt = dt.replace(year=now_ist.year, month=now_ist.month, day=now_ist.day)
                        except ValueError:
                            dt = now_ist
                    if dt > now_ist:
                        dt = now_ist
                    ts = dt.isoformat()
                    break
                except ValueError:
                    continue
            if not ts:
                ts = now_ist.isoformat()
        else:
            ts = now_ist.isoformat()

        key = f"{station}|{ts}"
        if key not in grouped:
            grouped[key] = {
                "timestamp": ts,
                "station_name": station,
                "district": city,
                "PM10": "",
                "PM2.5": "",
                "SO2": "",
                "NO2": "",
                "source": "govapi",
            }

        # Map pollutant_id to our column names
        pid_map = {"PM10": "PM10", "PM2.5": "PM2.5", "PM25": "PM2.5", "SO2": "SO2", "NO2": "NO2"}
        col = pid_map.get(pollutant)
        if col and avg_val:
            try:
                grouped[key][col] = str(float(avg_val))
            except (ValueError, TypeError):
                pass

    return list(grouped.values())


def _write_json_snapshot(csv_rows: list, records_raw: list) -> None:
    """Write public/aqi-live.json for the frontend to consume."""
    from datetime import date as date_type
    from datetime import timedelta
    PUBLIC_JSON.parent.mkdir(parents=True, exist_ok=True)

    # Build the logs list from CSV logger
    logs = list_available_logs()

    # Also read today's full CSV data in IST timezone
    IST = timezone(timedelta(hours=5, minutes=30))
    today_date = datetime.now(IST).date()
    today_str = today_date.isoformat()
    today_rows = read_daily_csv(today_date)

    # Build station summary from latest raw records
    stations = {}
    for rec in records_raw:
        name = rec.get("station", "")
        if not name:
            continue
        if name not in stations:
            stations[name] = {
                "name": name,
                "city": rec.get("city", ""),
                "lat": rec.get("latitude", ""),
                "lon": rec.get("longitude", ""),
                "last_update": rec.get("last_update", ""),
                "pollutants": {},
            }
        pid = rec.get("pollutant_id", "")
        if pid:
            stations[name]["pollutants"][pid] = {
                "avg": rec.get("avg_value"),
                "min": rec.get("min_value"),
                "max": rec.get("max_value"),
            }

    snapshot = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "api_total_records": len(records_raw),
        "stations": list(stations.values()),
        "logs": logs,
        "today": {
            "date": today_str,
            "rows": today_rows,
            "row_count": len(today_rows),
        },
    }

    with open(PUBLIC_JSON, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    logging.info("JSON snapshot written to %s", PUBLIC_JSON)


def fetch_and_save(api_key: str) -> int:
    """Fetch live data and save to daily CSV + JSON snapshot. Returns rows written."""
    records = fetch_chhattisgarh(api_key)
    if not records:
        logging.warning("No records returned from API")
        return 0

    logging.info("Total API records: %d", len(records))

    csv_rows = records_to_csv_rows(records)
    if not csv_rows:
        logging.warning("No valid rows to write after grouping")
        return 0

    count = append_readings_to_csv(csv_rows)
    logging.info("Wrote %d rows to today's CSV", count)

    # Write JSON snapshot for the frontend
    try:
        _write_json_snapshot(csv_rows, records)
    except Exception as e:
        logging.warning("JSON snapshot failed (non-fatal): %s", e)

    return count


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Fetch AQI data and write CSV")
    parser.add_argument("--loop", action="store_true", help="Run every 60 minutes")
    args = parser.parse_args()

    api_key = _load_key()

    if args.loop:
        logging.info("Starting AQI fetch loop (every 60 min)...")
        while True:
            try:
                fetch_and_save(api_key)
            except Exception as e:
                logging.error("Fetch failed: %s", e)
            time.sleep(3600)
    else:
        fetch_and_save(api_key)


if __name__ == "__main__":
    main()
