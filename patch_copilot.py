import re
import os

path = r'backend\app\services\copilot_service.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_func = """async def _tool_simulate_intervention(args: dict[str, Any]) -> dict[str, Any]:
    location_name = args.get("location_name", "")
    parameter = args.get("parameter", "")
    reduction_percent = float(args.get("reduction_percent", 15))
    duration_hours = int(args.get("duration_hours", 24))
    
    async with AsyncSessionLocal() as db:
        engine = CausalSimulationEngine(db)
        result = await engine.simulate_reduction_intervention(
            industry_or_region=location_name,
            parameter=parameter,
            reduction_percent=reduction_percent,
            duration_hours=duration_hours
        )
    return result
"""

# We just do a regex replace
pattern = re.compile(r'async def _tool_simulate_intervention.*?return \{.*?\}', re.DOTALL)
content = pattern.sub(new_func, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
