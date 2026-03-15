import json
import asyncio
import logging
from datetime import date, datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.aqi_csv_logger import (
    get_daily_analysis_path,
    get_daily_csv_path,
    list_available_logs,
    read_daily_csv,
)
from app.services.aqi_analysis_service import generate_daily_analysis

router = APIRouter(prefix="/aqi-logs", tags=["AQI Logs"])
logger = logging.getLogger(__name__)

_last_sync_time: float = 0  # epoch seconds of last successful sync
_SYNC_COOLDOWN = 120  # seconds – prevent hammering the govt API


@router.post("/sync")
async def sync_aqi_data():
    """Trigger an on-demand fetch from the government API (data.gov.in).

    Returns the refreshed snapshot. Throttled to once per 2 minutes.
    """
    global _last_sync_time
    import time

    now = time.time()
    if now - _last_sync_time < _SYNC_COOLDOWN:
        remaining = int(_SYNC_COOLDOWN - (now - _last_sync_time))
        logs = list_available_logs()
        ist = timezone(timedelta(hours=5, minutes=30))
        return {
            "synced": False,
            "reason": f"Cooldown active — retry in {remaining}s",
            "last_sync_ist": datetime.fromtimestamp(_last_sync_time, tz=ist).strftime("%d %b %Y, %I:%M %p IST") if _last_sync_time else None,
            "logs": logs,
            "count": len(logs),
        }

    try:
        # Import the fetch script functions
        import sys
        from pathlib import Path
        scripts_dir = str(Path(__file__).resolve().parents[2] / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from fetch_aqi_csv import fetch_and_save, _load_key

        api_key = _load_key()
        rows_written = await asyncio.to_thread(fetch_and_save, api_key)
        _last_sync_time = time.time()

        ist = timezone(timedelta(hours=5, minutes=30))
        sync_time_ist = datetime.now(ist).strftime("%d %b %Y, %I:%M %p IST")

        logs = list_available_logs()
        today = date.today()
        today_rows = read_daily_csv(today)

        logger.info("On-demand AQI sync complete: %d rows written at %s", rows_written, sync_time_ist)
        return {
            "synced": True,
            "rows_written": rows_written,
            "sync_time_ist": sync_time_ist,
            "logs": logs,
            "count": len(logs),
            "today": {
                "date": today.isoformat(),
                "rows": today_rows,
                "row_count": len(today_rows),
            },
        }
    except Exception as e:
        logger.error("On-demand AQI sync failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.get("/")
async def list_logs():
    """List all available daily AQI log files with metadata."""
    logs = list_available_logs()
    return {"logs": logs, "count": len(logs)}


@router.get("/{date_str}")
async def get_log_data(date_str: str):
    """Return CSV content for a specific date as JSON rows."""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    rows = read_daily_csv(target_date)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No AQI log found for {date_str}")

    return {"date": date_str, "rows": rows, "row_count": len(rows)}


@router.get("/{date_str}/download")
async def download_log(date_str: str):
    """Download the raw CSV file for a specific date."""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    csv_path = get_daily_csv_path(target_date)
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"No AQI log found for {date_str}")

    return FileResponse(
        path=str(csv_path),
        media_type="text/csv",
        filename=f"aqi_log_{date_str}.csv",
    )


@router.get("/{date_str}/analysis")
async def get_or_generate_analysis(date_str: str, regenerate: bool = False):
    """Get AI analysis for a day's readings. Pass ?regenerate=true to re-generate."""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    rows = read_daily_csv(target_date)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No AQI log found for {date_str}")

    analysis_path = get_daily_analysis_path(target_date)
    if analysis_path.exists() and not regenerate:
        with open(analysis_path, "r", encoding="utf-8") as f:
            return json.load(f)

    return await generate_daily_analysis(target_date, rows)
