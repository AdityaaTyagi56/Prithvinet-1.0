import json
import asyncio
from typing import Any, cast

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam, ChatCompletionToolParam
from sqlalchemy import text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.redis import redis_client
from app.services.ml_service import generate_forecast

async def get_session_history(session_id: str):
    data = await redis_client.get(f"copilot_session:{session_id}")
    if data:
        return json.loads(data)
    return []

async def save_session_history(session_id: str, history: list):
    # Keep last 10 turns (20 messages)
    history = history[-20:]
    await redis_client.setex(f"copilot_session:{session_id}", 1800, json.dumps(history))


SYSTEM_PROMPT = (
    "You are Prithvi Copilot, an environmental monitoring assistant for industrial compliance. "
    "Be concise, practical, and explain findings in plain language. "
    "When possible, use tools to fetch live readings, compliance details, limits, and forecasts."
)


TOOLS: list[ChatCompletionToolParam] = [
    {
        "type": "function",
        "function": {
            "name": "get_current_readings",
            "description": "Fetch latest sensor readings, optionally filtered by location and parameter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location_name": {"type": "string"},
                    "parameter": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_compliance_status",
            "description": "Get compliance status for industries and active violations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "industry_name": {"type": "string"},
                    "period": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_intervention",
            "description": "Simulate impact of intervention on a pollutant at a location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location_name": {"type": "string"},
                    "parameter": {"type": "string"},
                    "reduction_percent": {"type": "number", "minimum": 0, "maximum": 100},
                    "duration_hours": {"type": "integer", "minimum": 1, "maximum": 240},
                },
                "required": ["location_name", "parameter"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_forecast",
            "description": "Generate or fetch forecast for a location and parameter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location_id": {"type": "string"},
                    "location_name": {"type": "string"},
                    "parameter": {"type": "string"},
                    "hours": {"type": "integer", "minimum": 1, "maximum": 168},
                },
                "required": ["parameter"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_regulations",
            "description": "Search prescribed limits by industry type and pollutant parameter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "industry_type": {"type": "string"},
                    "parameter": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50},
                },
            },
        },
    },
]


def _parse_json_args(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


async def _resolve_location_id(db, location_name: str | None) -> str | None:
    if not location_name:
        return None
    q = text(
        """
        SELECT id::text
        FROM monitoring_locations
        WHERE lower(name) = lower(:location_name)
        ORDER BY created_at DESC
        LIMIT 1
        """
    )
    row = (await db.execute(q, {"location_name": location_name})).first()
    return row[0] if row else None


async def _resolve_parameter_id(db, parameter: str | None) -> str | None:
    if not parameter:
        return None
    q = text(
        """
        SELECT id::text
        FROM monitoring_units
        WHERE lower(parameter) = lower(:parameter)
        LIMIT 1
        """
    )
    row = (await db.execute(q, {"parameter": parameter})).first()
    return row[0] if row else None


async def _tool_get_current_readings(args: dict[str, Any]) -> dict[str, Any]:
    limit = int(args.get("limit", 20))
    limit = max(1, min(limit, 100))

    async with AsyncSessionLocal() as db:
        location_name = args.get("location_name")
        parameter = args.get("parameter")
        filters = []
        params: dict[str, Any] = {"limit": limit}

        if location_name:
            filters.append("lower(ml.name) = lower(:location_name)")
            params["location_name"] = location_name
        if parameter:
            filters.append("lower(mu.parameter) = lower(:parameter)")
            params["parameter"] = parameter

        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        q = text(
            f"""
            SELECT DISTINCT ON (sr.location_id, sr.parameter_id)
                ml.name as location_name,
                mu.parameter as parameter,
                sr.value,
                sr.recorded_at,
                mu.unit
            FROM sensor_readings sr
            JOIN monitoring_locations ml ON ml.id = sr.location_id
            JOIN monitoring_units mu ON mu.id = sr.parameter_id
            {where_sql}
            ORDER BY sr.location_id, sr.parameter_id, sr.recorded_at DESC
            LIMIT :limit
            """
        )
        rows = (await db.execute(q, params)).mappings().all()

    return {
        "count": len(rows),
        "readings": [
            {
                "location_name": row["location_name"],
                "parameter": row["parameter"],
                "value": float(row["value"]),
                "unit": row["unit"],
                "recorded_at": row["recorded_at"].isoformat() if row["recorded_at"] else None,
            }
            for row in rows
        ],
    }


async def _tool_get_compliance_status(args: dict[str, Any]) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        industry_name = args.get("industry_name")
        period = args.get("period")

        where_parts = []
        params: dict[str, Any] = {}
        if industry_name:
            where_parts.append("lower(i.name) = lower(:industry_name)")
            params["industry_name"] = industry_name
        if period:
            where_parts.append("cr.period = :period")
            params["period"] = period

        where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

        q_records = text(
            f"""
            SELECT i.name AS industry_name,
                   mu.parameter,
                   cr.period,
                   cr.status::text AS status,
                   cr.violations_count,
                   cr.last_checked
            FROM compliance_records cr
            JOIN industries i ON i.id = cr.industry_id
            JOIN monitoring_units mu ON mu.id = cr.parameter_id
            {where_sql}
            ORDER BY cr.last_checked DESC NULLS LAST
            LIMIT 100
            """
        )
        records = (await db.execute(q_records, params)).mappings().all()

        q_viol = text(
            """
            SELECT COUNT(*)::int AS active_violations
            FROM alerts
            WHERE status::text IN ('open', 'escalated')
            """
        )
        active_violations = (await db.execute(q_viol)).scalar_one()

    compliant = sum(1 for r in records if r["status"] == "compliant")
    non_compliant = sum(1 for r in records if r["status"] == "non_compliant")

    return {
        "records_count": len(records),
        "compliant_count": compliant,
        "non_compliant_count": non_compliant,
        "active_violations": active_violations,
        "records": [
            {
                "industry_name": r["industry_name"],
                "parameter": r["parameter"],
                "period": r["period"],
                "status": r["status"],
                "violations_count": r["violations_count"],
                "last_checked": r["last_checked"].isoformat() if r["last_checked"] else None,
            }
            for r in records
        ],
    }


async def _tool_simulate_intervention(args: dict[str, Any]) -> dict[str, Any]:
    location_name = args.get("location_name")
    parameter = args.get("parameter")
    reduction_percent = float(args.get("reduction_percent", 15))
    duration_hours = int(args.get("duration_hours", 24))
    reduction_percent = max(0.0, min(reduction_percent, 100.0))
    duration_hours = max(1, min(duration_hours, 240))

    async with AsyncSessionLocal() as db:
        q = text(
            """
            SELECT AVG(sr.value)::float AS baseline
            FROM sensor_readings sr
            JOIN monitoring_locations ml ON ml.id = sr.location_id
            JOIN monitoring_units mu ON mu.id = sr.parameter_id
            WHERE lower(ml.name) = lower(:location_name)
              AND lower(mu.parameter) = lower(:parameter)
              AND sr.recorded_at >= now() - interval '24 hours'
            """
        )
        baseline = (await db.execute(q, {"location_name": location_name, "parameter": parameter})).scalar()

    baseline = float(baseline) if baseline is not None else 0.0
    projected = baseline * (1 - (reduction_percent / 100.0))
    absolute_reduction = baseline - projected

    return {
        "location_name": location_name,
        "parameter": parameter,
        "duration_hours": duration_hours,
        "baseline_24h_avg": round(baseline, 2),
        "reduction_percent": reduction_percent,
        "projected_avg": round(projected, 2),
        "estimated_absolute_reduction": round(absolute_reduction, 2),
        "note": "Projection is a first-order estimate based on last 24h average.",
    }


async def _tool_get_forecast(args: dict[str, Any]) -> dict[str, Any]:
    hours = int(args.get("hours", 72))
    hours = max(1, min(hours, 168))

    async with AsyncSessionLocal() as db:
        location_id = args.get("location_id")
        location_name = args.get("location_name")
        parameter = args.get("parameter")

        if not location_id and location_name:
            location_id = await _resolve_location_id(db, location_name)
        parameter_id = await _resolve_parameter_id(db, parameter)

        if not location_id:
            return {"error": "location_id or valid location_name is required."}
        if not parameter_id:
            return {"error": "Unknown parameter."}

        forecast = await generate_forecast(db, location_id, parameter_id, hours=hours)

    return {
        "location_id": location_id,
        "parameter": parameter,
        "hours": hours,
        "points": forecast,
        "points_count": len(forecast),
    }


async def _tool_search_regulations(args: dict[str, Any]) -> dict[str, Any]:
    limit = int(args.get("limit", 20))
    limit = max(1, min(limit, 50))

    async with AsyncSessionLocal() as db:
        industry_type = args.get("industry_type")
        parameter = args.get("parameter")
        where_parts = []
        params: dict[str, Any] = {"limit": limit}

        if industry_type:
            where_parts.append("lower(pl.industry_type) = lower(:industry_type)")
            params["industry_type"] = industry_type
        if parameter:
            where_parts.append("lower(mu.parameter) = lower(:parameter)")
            params["parameter"] = parameter

        where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
        q = text(
            f"""
            SELECT pl.industry_type,
                   mu.parameter,
                   pl.limit_value,
                   pl.limit_type::text AS limit_type,
                   mu.unit,
                   pl.effective_from
            FROM prescribed_limits pl
            JOIN monitoring_units mu ON mu.id = pl.parameter_id
            {where_sql}
            ORDER BY pl.industry_type, mu.parameter
            LIMIT :limit
            """
        )
        rows = (await db.execute(q, params)).mappings().all()

    return {
        "count": len(rows),
        "limits": [
            {
                "industry_type": row["industry_type"],
                "parameter": row["parameter"],
                "limit_value": float(row["limit_value"]),
                "limit_type": row["limit_type"],
                "unit": row["unit"],
                "effective_from": row["effective_from"],
            }
            for row in rows
        ],
    }


async def _run_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "get_current_readings":
        return await _tool_get_current_readings(args)
    if name == "get_compliance_status":
        return await _tool_get_compliance_status(args)
    if name == "simulate_intervention":
        return await _tool_simulate_intervention(args)
    if name == "get_forecast":
        return await _tool_get_forecast(args)
    if name == "search_regulations":
        return await _tool_search_regulations(args)
    return {"error": f"Unknown tool: {name}"}

async def stream_copilot_response(session_id: str, query: str):
    history = await get_session_history(session_id)
    user_message = {"role": "user", "content": query}

    api_key = settings.OPENAI_API_KEY
    if not api_key:
        err = "Copilot is not configured: set OPENAI_API_KEY in backend environment."
        yield f"data: {json.dumps({'content': err})}\n\n"
        yield "data: [DONE]\n\n"
        history.extend([user_message, {"role": "assistant", "content": err}])
        await save_session_history(session_id, history)
        return

    client = AsyncOpenAI(api_key=api_key)
    model = settings.OPENAI_MODEL or "gpt-4o-mini"

    # Persist only user/assistant text in redis history, but use tool messages inside this request.
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        user_message,
    ]

    final_text = ""
    max_tool_rounds = 5

    try:
        for _ in range(max_tool_rounds):
            response = await client.chat.completions.create(
                model=model,
                messages=cast(list[ChatCompletionMessageParam], messages),
                tools=cast(list[ChatCompletionToolParam], TOOLS),
                tool_choice="auto",
                temperature=0.2,
            )

            message = response.choices[0].message
            tool_calls = message.tool_calls or []

            if tool_calls:
                messages.append(
                    {
                        "role": "assistant",
                        "content": message.content or "",
                        "tool_calls": [
                            {
                                "id": call.id,
                                "type": "function",
                                "function": {
                                    "name": call.function.name,
                                    "arguments": call.function.arguments,
                                },
                            }
                            for call in tool_calls
                        ],
                    }
                )

                for call in tool_calls:
                    args = _parse_json_args(call.function.arguments)
                    result = await _run_tool(call.function.name, args)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "content": json.dumps(result),
                        }
                    )
                continue

            final_text = (message.content or "").strip()
            break

        if not final_text:
            final_text = "I could not generate a response at the moment. Please try again."

    except Exception as exc:
        final_text = f"Copilot request failed: {str(exc)}"

    for token in final_text.split(" "):
        yield f"data: {json.dumps({'content': token + ' '})}\n\n"
        await asyncio.sleep(0.01)

    history.extend([user_message, {"role": "assistant", "content": final_text}])
    await save_session_history(session_id, history)
    yield "data: [DONE]\n\n"
