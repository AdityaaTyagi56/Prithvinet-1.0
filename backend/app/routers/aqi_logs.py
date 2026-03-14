import json
from datetime import date

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
