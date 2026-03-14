"""
industry_compliance.py
──────────────────────
Stack emission compliance engine using real CPCB standards from EP Rules 1986.
Evaluates industry CEMS readings against prescribed limits and generates
compliance events with severity classification.
"""
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── CPCB Stack Emission Standards (mg/Nm3) — EP Rules 1986 Schedule-I ──
STACK_LIMITS: Dict[str, Dict[str, Dict[str, float]]] = {
    "Thermal Power Plant": {
        "PM":  {"limit": 50,  "unit": "mg/Nm3"},
        "SO2": {"limit": 200, "unit": "mg/Nm3"},
        "NOx": {"limit": 300, "unit": "mg/Nm3"},
    },
    "Integrated Steel": {
        "PM":  {"limit": 50,  "unit": "mg/Nm3"},
        "SO2": {"limit": 500, "unit": "mg/Nm3"},
        "NOx": {"limit": 500, "unit": "mg/Nm3"},
    },
    "Cement": {
        "PM":  {"limit": 30,  "unit": "mg/Nm3"},
        "SO2": {"limit": 100, "unit": "mg/Nm3"},
        "NOx": {"limit": 1000, "unit": "mg/Nm3"},
    },
    "Sponge Iron": {
        "PM":  {"limit": 150, "unit": "mg/Nm3"},
        "SO2": {"limit": 500, "unit": "mg/Nm3"},
    },
    "Aluminium Smelter": {
        "PM":  {"limit": 50,  "unit": "mg/Nm3"},
        "SO2": {"limit": 400, "unit": "mg/Nm3"},
    },
}

# Nova Iron Bilaspur — documented 2292 mg/m3 PM (CSE Inspection June 2009)
HISTORICAL_CRITICAL_VIOLATORS = ["Nova Iron & Steel Bilaspur"]

PARAM_NAME_MAP = {1: "PM", 3: "SO2", 4: "NOx"}


@dataclass
class StackComplianceResult:
    is_violation: bool
    severity: Optional[str] = None
    limit_value: Optional[float] = None
    excess_percent: Optional[float] = None
    rule_ref: Optional[str] = None


def evaluate_stack_reading(
    industry_type: str,
    parameter_id: int,
    value: float,
    industry_name: str = "",
) -> StackComplianceResult:
    param_name = PARAM_NAME_MAP.get(parameter_id)
    if param_name is None:
        return StackComplianceResult(False)

    limits = STACK_LIMITS.get(industry_type, {})
    param_limits = limits.get(param_name)
    if param_limits is None:
        return StackComplianceResult(False)

    limit = param_limits["limit"]
    if value <= limit:
        return StackComplianceResult(False)

    excess_pct = round(((value - limit) / limit) * 100, 1)

    if value > limit * 3.0:
        severity = "CRITICAL"
    elif value > limit * 1.5:
        severity = "HIGH"
    else:
        severity = "MODERATE"

    # Historical critical violators get elevated severity
    if industry_name in HISTORICAL_CRITICAL_VIOLATORS and severity == "MODERATE":
        severity = "HIGH"

    rule_ref = f"EP Rules 1986 Schedule-I {industry_type} — {param_name} limit {limit} mg/Nm3"

    return StackComplianceResult(
        is_violation=True,
        severity=severity,
        limit_value=limit,
        excess_percent=excess_pct,
        rule_ref=rule_ref,
    )


async def evaluate_and_record_stack_compliance(
    db: AsyncSession,
    station_id: int,
    parameter_id: int,
    reading_time: datetime,
    value: float,
    industry_type: str,
    industry_name: str = "",
) -> Optional[dict]:
    result = evaluate_stack_reading(industry_type, parameter_id, value, industry_name)
    if not result.is_violation:
        return None

    reading_time = reading_time if reading_time.tzinfo else reading_time.replace(tzinfo=timezone.utc)

    # Dedup
    exists = (await db.execute(text("""
        SELECT 1 FROM compliance_events
        WHERE station_id = :sid AND parameter_id = :pid AND reading_time = :time
        LIMIT 1
    """), {"sid": station_id, "pid": parameter_id, "time": reading_time})).first()
    if exists:
        return None

    await db.execute(text("""
        INSERT INTO compliance_events (station_id, parameter_id, reading_time, value, limit_value, severity, created_at)
        VALUES (:sid, :pid, :time, :val, :lim, :sev, NOW())
    """), {
        "sid": station_id, "pid": parameter_id, "time": reading_time,
        "val": value, "lim": result.limit_value, "sev": result.severity,
    })

    payload = {
        "station_id": station_id,
        "industry_name": industry_name,
        "industry_type": industry_type,
        "parameter": PARAM_NAME_MAP.get(parameter_id, "Unknown"),
        "value": value,
        "limit_value": result.limit_value,
        "excess_percent": result.excess_percent,
        "severity": result.severity,
        "rule_ref": result.rule_ref,
        "reading_time": reading_time.isoformat(),
    }

    try:
        from app.core.redis import redis_client
        await redis_client.publish(f"alerts:stack", json.dumps(payload))
    except Exception as exc:
        logger.warning("Failed to publish stack alert to Redis: %s", exc)

    return payload
