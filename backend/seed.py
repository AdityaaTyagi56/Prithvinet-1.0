import asyncio
import random
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.base import Base
from app.models.users import User, UserRole
from app.models.core import RegionalOffice, Industry, IndustryStatus, MonitoringLocation, LocationType, MonitoringUnit, PrescribedLimit, LimitType
from app.models.monitoring import SensorReading, SourceType

async def seed_db():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
        
        # Setup TimescaleDB
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb;"))
        
        try:
            await conn.execute(text("SELECT create_hypertable('sensor_readings', 'recorded_at', if_not_exists => TRUE);"))
        except Exception as e:
            print(f"Hypertable creation error (might already exist): {e}")
            
        try:
            await conn.execute(text("SELECT add_compression_policy('sensor_readings', INTERVAL '7 days');"))
        except Exception:
            pass
            
        try:
            await conn.execute(text("""
            CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_readings WITH (timescaledb.continuous) AS
            SELECT time_bucket('1 hour', recorded_at) AS hour,
            location_id, parameter_id, AVG(value) as avg_value, MAX(value) as max_value, MIN(value) as min_value
            FROM sensor_readings GROUP BY 1, 2, 3;
            """))
        except Exception as e:
            print(f"Continuous aggregate error: {e}")
            
        try:
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sensor_readings_loc_param_time ON sensor_readings (location_id, parameter_id, recorded_at DESC);"))
        except Exception:
            pass

    async with AsyncSessionLocal() as session:
        # Check if already seeded
        result = await session.execute(text("SELECT count(*) FROM industries"))
        if result.scalar() > 0:
            print("Database already seeded.")
            return

        # 1. Create Regional Office
        ro = RegionalOffice(name="Raipur HQ", district="Raipur", state="Chhattisgarh")
        session.add(ro)
        await session.flush()

        # 1.1 Create admin user required for initial login
        admin_user = User(
            email="admin@cecb.gov.in",
            password_hash=get_password_hash("password123"),
            role=UserRole.super_admin,
            region_office_id=ro.id,
        )
        session.add(admin_user)

        # 2. Create Monitoring Units & Limits
        pm25 = MonitoringUnit(parameter="PM2.5", unit="ug/m3", description="Particulate Matter < 2.5 microns")
        so2 = MonitoringUnit(parameter="SO2", unit="ug/m3", description="Sulfur Dioxide")
        no2 = MonitoringUnit(parameter="NO2", unit="ug/m3", description="Nitrogen Dioxide")
        session.add_all([pm25, so2, no2])
        await session.flush()

        limits = [
            PrescribedLimit(parameter_id=pm25.id, industry_type="Steel", limit_value=150.0, limit_type=LimitType.max),
            PrescribedLimit(parameter_id=so2.id, industry_type="Steel", limit_value=80.0, limit_type=LimitType.max),
            PrescribedLimit(parameter_id=no2.id, industry_type="Steel", limit_value=80.0, limit_type=LimitType.max),
            PrescribedLimit(parameter_id=pm25.id, industry_type="Cement", limit_value=100.0, limit_type=LimitType.max),
            PrescribedLimit(parameter_id=so2.id, industry_type="Cement", limit_value=50.0, limit_type=LimitType.max),
            PrescribedLimit(parameter_id=no2.id, industry_type="Cement", limit_value=50.0, limit_type=LimitType.max),
        ]
        session.add_all(limits)

        # 3. Create Industries (including named sample required by product spec)
        industries = [
            Industry(
                name="Bharat Steel",
                type="Steel",
                registration_no="REG-STE-1001",
                region_office_id=ro.id,
                status=IndustryStatus.active,
            )
        ]
        for i in range(2, 11):
            ind_type = "Steel" if i <= 5 else "Cement"
            industries.append(
                Industry(
                    name=f"{ind_type} Plant {i}",
                    type=ind_type,
                    registration_no=f"REG-{ind_type[:3].upper()}-{1000+i}",
                    region_office_id=ro.id,
                    status=IndustryStatus.active,
                )
            )
        session.add_all(industries)
        await session.flush()

        # 4. Create monitoring locations including requested named locations
        locations = [
            MonitoringLocation(
                name="Central Station",
                location="21.2514,81.6296",
                type=LocationType.air,
                region_id=ro.id,
                iot_device_id="iot_001",
            ),
            MonitoringLocation(
                name="Bharat Steel",
                location="21.2315,81.6521",
                type=LocationType.air,
                industry_id=industries[0].id,
                region_id=ro.id,
                iot_device_id="iot_002",
            ),
        ]
        for i in range(3, 26):
            ind = industries[(i - 1) % len(industries)]
            locations.append(
                MonitoringLocation(
                    name=f"Stack {i} - {ind.name}",
                    location=f"{21.20 + (i * 0.01):.4f},{81.55 + (i * 0.008):.4f}",
                    type=LocationType.air,
                    industry_id=ind.id,
                    region_id=ro.id,
                    iot_device_id=f"iot_{i:03d}",
                )
            )
        session.add_all(locations)
        await session.flush()

        # 5. Generate 90 days of readings (hourly to save time/space for seed)
        # In real scenario it's every 30s, but for 90 days * 25 locs * 3 params * 2880 = 19M rows.
        # We'll seed hourly data for the past 90 days to populate the continuous aggregate.
        print("Generating 90 days of hourly readings...")
        now = datetime.utcnow()
        start_date = now - timedelta(days=90)
        
        readings = []
        for loc in locations:
            for param, base_val in [(pm25, 80), (so2, 40), (no2, 40)]:
                current_time = start_date
                while current_time < now:
                    val = random.gauss(base_val, base_val * 0.2)
                    readings.append(SensorReading(
                        location_id=loc.id,
                        parameter_id=param.id,
                        value=round(max(0, val), 2),
                        unit_id=param.id,
                        recorded_at=current_time,
                        source=SourceType.iot
                    ))
                    current_time += timedelta(hours=1)
                    
                    if len(readings) >= 10000:
                        session.add_all(readings)
                        await session.flush()
                        readings = []
                        
        if readings:
            session.add_all(readings)
            
        await session.commit()
        print("Database seeded and TimescaleDB configured successfully.")

if __name__ == "__main__":
    asyncio.run(seed_db())
