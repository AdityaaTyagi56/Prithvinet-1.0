import asyncio
import os
import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

async def add_pm10():
    database_url = "postgresql+asyncpg://adityatyagi@127.0.0.1:5432/prithvinet"
    engine = create_async_engine(database_url, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Check if PM10 exists
        res = await session.execute(text("SELECT id FROM monitoring_units WHERE parameter = 'PM10'"))
        if not res.fetchone():
            print("Adding PM10 parameter...")
            await session.execute(
                text("""
                INSERT INTO monitoring_units (id, parameter, unit, description, created_at, updated_at) 
                VALUES (:id, :param, :unit, :desc, :now, :now)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "param": "PM10",
                    "unit": "µg/m³",
                    "desc": "Particulate Matter < 10 µm",
                    "now": datetime.utcnow()
                }
            )
            await session.commit()
            print("PM10 added successfully!")
        else:
            print("PM10 already exists in the database.")

if __name__ == "__main__":
    asyncio.run(add_pm10())