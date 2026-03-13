import numpy as np
from typing import Any, cast
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.monitoring import SensorReading
from app.models.alerts import AlertType, AlertSeverity
from app.services.alert_service import create_alert
from app.core.redis import redis_client
import json

async def check_anomaly_streaming(reading: SensorReading, db: AsyncSession):
    # Streaming Z-score check
    # We maintain a rolling mean and std in Redis for fast access
    stats_key = f"stats:{reading.location_id}:{reading.parameter_id}"
    stats_data = await redis_client.get(stats_key)
    
    if stats_data:
        stats = json.loads(stats_data)
        mean = stats.get("mean", 0)
        std = stats.get("std", 1)
        count = stats.get("count", 0)
        
        if std > 0 and count > 10:
            z_score = abs((reading.value - mean) / std)
            if z_score > 3: # 3 sigma rule
                cast(Any, reading).quality_flag = "anomaly"
                # Fire alert
                # We need to get industry_id and region_id. For simplicity, we can fetch location
                loc_query = text("SELECT industry_id, region_id FROM monitoring_locations WHERE id = :loc_id")
                loc_res = await db.execute(loc_query, {"loc_id": reading.location_id})
                loc_row = loc_res.fetchone()
                if loc_row:
                    await create_alert(
                        db=db,
                        alert_type=AlertType.anomaly,
                        location_id=reading.location_id,
                        industry_id=loc_row[0],
                        parameter_id=reading.parameter_id,
                        value=reading.value,
                        threshold=mean + (3 * std),
                        severity=AlertSeverity.medium,
                        region_id=loc_row[1]
                    )
        
        # Update rolling stats (simplified)
        new_count = count + 1
        new_mean = mean + (reading.value - mean) / new_count
        new_var = ((std ** 2) * count + (reading.value - mean) * (reading.value - new_mean)) / new_count
        new_std = np.sqrt(new_var)
        
        await redis_client.set(stats_key, json.dumps({"mean": new_mean, "std": new_std, "count": new_count}))
    else:
        # Initialize stats
        await redis_client.set(stats_key, json.dumps({"mean": reading.value, "std": 0, "count": 1}))

async def run_isolation_forest_batch(db: AsyncSession):
    # Placeholder for batch IsolationForest wrapper run by Celery
    pass
