"""
AI-powered daily analysis of AQI readings.

Reads a day's CSV, computes aggregate statistics, sends a summary to
OpenRouter / Claude, and stores the structured result as a JSON sidecar
file alongside the CSV.
"""

import json
import logging
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.aqi_csv_logger import get_daily_analysis_path, read_daily_csv


def _compute_aggregates(rows: List[Dict]) -> Dict[str, Any]:
    """Per-pollutant stats + worst station + station/district counts."""
    pollutants = ["PM10", "PM2.5", "SO2", "NO2"]
    stats: Dict[str, Any] = {}

    for p in pollutants:
        values: List[float] = []
        for row in rows:
            val = row.get(p, "")
            if val and val not in ("None", ""):
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    continue
        if values:
            stats[p] = {
                "count": len(values),
                "avg": round(sum(values) / len(values), 2),
                "min": round(min(values), 2),
                "max": round(max(values), 2),
            }
        else:
            stats[p] = {"count": 0, "avg": None, "min": None, "max": None}

    worst_station = None
    worst_value = -1.0
    for row in rows:
        for p in ["PM2.5", "PM10"]:
            val = row.get(p, "")
            if val and val not in ("None", ""):
                try:
                    fv = float(val)
                    if fv > worst_value:
                        worst_value = fv
                        worst_station = row.get("station_name", "Unknown")
                except (ValueError, TypeError):
                    continue

    stations = sorted({row.get("station_name", "") for row in rows if row.get("station_name")})
    districts = sorted({row.get("district", "") for row in rows if row.get("district")})

    return {
        "pollutant_stats": stats,
        "worst_station": worst_station,
        "worst_value": round(worst_value, 2) if worst_value > 0 else None,
        "total_readings": len(rows),
        "unique_stations": len(stations),
        "unique_districts": len(districts),
        "stations_list": stations,
        "districts_list": districts,
    }


async def generate_daily_analysis(
    target_date: date,
    rows: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """Generate AI daily analysis and store as JSON sidecar."""
    if rows is None:
        rows = read_daily_csv(target_date)

    if not rows:
        return {"date": target_date.isoformat(), "error": "No readings available for analysis"}

    aggregates = _compute_aggregates(rows)

    system_prompt = (
        "You are an environmental data analyst for the Chhattisgarh Environment Conservation Board (CECB). "
        "Analyze the daily AQI monitoring data and provide actionable insights. "
        "Be concise and data-driven. Structure your response as JSON with keys: "
        '"trend" (string), "risk_level" (low/medium/high/critical), '
        '"risk_areas" (list of strings), "recommendations" (list of strings), '
        '"forecast_context" (string: note useful for improving the next 48h forecast)'
    )

    user_prompt = (
        f"Date: {target_date.isoformat()}\n"
        f"Total readings: {aggregates['total_readings']}\n"
        f"Stations: {aggregates['unique_stations']} across {aggregates['unique_districts']} districts\n\n"
        f"Pollutant Statistics:\n"
    )
    for p, s in aggregates["pollutant_stats"].items():
        if s["count"] > 0:
            user_prompt += f"  {p}: avg={s['avg']}, min={s['min']}, max={s['max']} ({s['count']} readings)\n"
    if aggregates["worst_station"]:
        user_prompt += f"\nWorst station: {aggregates['worst_station']} (peak: {aggregates['worst_value']})\n"
    user_prompt += "\nProvide your analysis as the JSON structure described."

    analysis_result: Dict[str, Any] = {
        "date": target_date.isoformat(),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "aggregates": aggregates,
        "ai_insight": None,
    }

    if not settings.OPENROUTER_API_KEY:
        analysis_result["ai_insight"] = {
            "trend": "AI analysis unavailable (OPENROUTER_API_KEY not configured)",
            "risk_level": "unknown",
            "risk_areas": [],
            "recommendations": [],
            "forecast_context": "",
        }
    else:
        try:
            client = AsyncOpenAI(
                api_key=settings.OPENROUTER_API_KEY,
                base_url="https://openrouter.ai/api/v1",
                default_headers={
                    "HTTP-Referer": settings.OPENROUTER_SITE_URL,
                    "X-Title": settings.OPENROUTER_APP_NAME,
                },
            )
            response = await client.chat.completions.create(
                model=settings.OPENROUTER_MODEL,
                temperature=0.2,
                max_tokens=500,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            raw = (response.choices[0].message.content or "").strip()
            try:
                insight = json.loads(raw)
            except json.JSONDecodeError:
                m = re.search(r"\{.*\}", raw, re.DOTALL)
                insight = json.loads(m.group()) if m else {
                    "trend": raw,
                    "risk_level": "unknown",
                    "risk_areas": [],
                    "recommendations": [],
                    "forecast_context": "",
                }
            analysis_result["ai_insight"] = insight
        except Exception as exc:
            logging.error("AI daily analysis failed: %s", exc)
            analysis_result["ai_insight"] = {
                "trend": f"Analysis generation failed: {exc}",
                "risk_level": "unknown",
                "risk_areas": [],
                "recommendations": [],
                "forecast_context": "",
            }

    # Store as JSON sidecar
    analysis_path = get_daily_analysis_path(target_date)
    try:
        with open(analysis_path, "w", encoding="utf-8") as f:
            json.dump(analysis_result, f, indent=2, ensure_ascii=False)
        logging.info("Daily analysis saved to %s", analysis_path.name)
    except Exception as exc:
        logging.warning("Failed to save analysis sidecar: %s", exc)

    return analysis_result
