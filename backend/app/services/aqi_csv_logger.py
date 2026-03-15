"""
Daily AQI CSV spreadsheet logger.

Every time the government API sync runs (every 60 min), readings are appended
to a daily CSV file at  backend/data/aqi_logs/YYYY-MM-DD.csv  with columns:
  timestamp, station_name, district, PM10, PM2.5, SO2, NO2, source

A companion JSON sidecar (<date>.analysis.json) stores the AI daily analysis.
"""

import csv
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

_AQI_LOGS_DIR = Path(__file__).resolve().parents[2] / "data" / "aqi_logs"

CSV_COLUMNS = [
    "timestamp",
    "station_name",
    "district",
    "PM10",
    "PM2.5",
    "SO2",
    "NO2",
    "source",
]


def _ensure_log_dir() -> Path:
    _AQI_LOGS_DIR.mkdir(parents=True, exist_ok=True)
    return _AQI_LOGS_DIR


def get_daily_csv_path(target_date: date) -> Path:
    return _ensure_log_dir() / f"{target_date.isoformat()}.csv"


def get_daily_analysis_path(target_date: date) -> Path:
    return _ensure_log_dir() / f"{target_date.isoformat()}.analysis.json"


def append_readings_to_csv(
    readings: List[Dict],
    target_date: Optional[date] = None,
) -> int:
    """Append reading dicts to the daily CSV but strictly prevents duplicates and uses reading timestamps. Returns rows written."""
    if not readings:
        return 0

    from collections import defaultdict
    by_date = defaultdict(list)
    
    # 1. Group records by their internal timestamp
    for row in readings:
        ts = row.get("timestamp", "")
        if ts and len(ts) >= 10:
            d_str = ts[:10]  # Grab YYYY-MM-DD
        else:
            d_str = datetime.now(timezone.utc).date().isoformat()
        by_date[d_str].append(row)
        
    total_written = 0
    
    for date_str, rows in by_date.items():
        try:
            current_date = date.fromisoformat(date_str)
        except ValueError:
            current_date = datetime.now(timezone.utc).date()
            
        # Optional override target_date handling just in case
        if target_date is not None:
            current_date = target_date

        csv_path = get_daily_csv_path(current_date)
        
        # 2. Prevent Duplicates
        existing_keys = set()
        if csv_path.exists() and csv_path.stat().st_size > 0:
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    existing_keys.add(f"{r.get('station_name')}|{r.get('timestamp')}")
                    
        new_rows = []
        for row in rows:
            key = f"{row.get('station_name')}|{row.get('timestamp')}"
            if key not in existing_keys:
                new_rows.append(row)
                existing_keys.add(key)
                
        if not new_rows:
            continue

        file_exists = csv_path.exists() and csv_path.stat().st_size > 0

        with open(csv_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
            if not file_exists:
                writer.writeheader()
            for row in new_rows:
                writer.writerow({col: row.get(col, "") for col in CSV_COLUMNS})

        logging.info("CSV logger: appended %d new unique rows to %s", len(new_rows), csv_path.name)
        total_written += len(new_rows)
        
    return total_written


def list_available_logs() -> List[Dict]:
    """List daily CSV logs with metadata (date, row_count, file_size, has_analysis)."""
    log_dir = _ensure_log_dir()
    results = []
    for csv_file in sorted(log_dir.glob("????-??-??.csv"), reverse=True):
        date_str = csv_file.stem
        file_size = csv_file.stat().st_size
        with open(csv_file, "r", encoding="utf-8") as f:
            row_count = max(0, sum(1 for _ in f) - 1)
        analysis_path = log_dir / f"{date_str}.analysis.json"
        results.append(
            {
                "date": date_str,
                "row_count": row_count,
                "file_size_bytes": file_size,
                "has_analysis": analysis_path.exists(),
            }
        )
    return results


def read_daily_csv(target_date: date) -> List[Dict]:
    """Read all rows from a day's CSV as a list of dicts."""
    csv_path = get_daily_csv_path(target_date)
    if not csv_path.exists():
        return []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)
