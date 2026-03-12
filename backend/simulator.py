import asyncio
import httpx
import random
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.core.config import settings
from app.models.core import MonitoringLocation

PARAMS = {'PM2.5': (20, 180), 'SO2': (5, 120), 'NO2': (10, 200)}

async def get_locations():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(MonitoringLocation.id))
        return [str(row[0]) for row in result.all()]

async def simulate():
    locations = await get_locations()
    if not locations:
        print("No locations found in DB. Run seed.py first.")
        return

    print(f"Starting simulator for {len(locations)} locations...")
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        while True:
            for loc in locations:
                for param, (lo, hi) in PARAMS.items():
                    val = random.gauss((lo+hi)/2, (hi-lo)/6)
                    try:
                        await client.post('/api/v1/readings/', json={
                            'location_id': loc,
                            'parameter': param,
                            'value': round(max(0, val), 2),
                            'source': 'iot'
                        })
                    except Exception as e:
                        print(f"Simulator error: {e}")
            print("Pushed readings for all locations.")
            await asyncio.sleep(30)

if __name__ == "__main__":
    asyncio.run(simulate())
