import asyncio
import os
import sys

import asyncpg

# Read DATABASE_URL from backend/.env
env_path = os.path.join(os.path.dirname(__file__), ".env")
db_url = None
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                db_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                break

if not db_url:
    print("ERROR: DATABASE_URL not found in backend/.env")
    sys.exit(1)

# asyncpg uses postgresql:// not postgresql+asyncpg://
db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")


async def create_aggregate():
    print(f"Connecting to: {db_url.split('@')[-1]}")  # hide credentials
    conn = await asyncpg.connect(db_url)

    try:
        # Check if hypertable exists
        ht = await conn.fetchval(
            "SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'sensor_readings'"
        )
        if not ht:
            print(
                "ERROR: sensor_readings hypertable does not exist. Run seed.py first."
            )
            return

        # Check if continuous aggregate already exists
        existing = await conn.fetchval(
            "SELECT count(*) FROM timescaledb_information.continuous_aggregates WHERE view_name = 'hourly_readings'"
        )
        if existing:
            print(
                "hourly_readings continuous aggregate already exists — skipping creation."
            )
        else:
            print("Creating hourly_readings continuous aggregate...")
            # Must run outside a transaction block — asyncpg autocommit mode
            await conn.execute("""
                CREATE MATERIALIZED VIEW hourly_readings
                WITH (timescaledb.continuous) AS
                SELECT
                    time_bucket('1 hour', recorded_at) AS hour,
                    location_id,
                    parameter_id,
                    AVG(value)  AS avg_value,
                    MAX(value)  AS max_value,
                    MIN(value)  AS min_value
                FROM sensor_readings
                GROUP BY 1, 2, 3
                WITH NO DATA;
            """)
            print("✅ hourly_readings continuous aggregate created.")

        # Refresh to populate it with the seeded data
        print("Refreshing hourly_readings (this may take a moment)...")
        await conn.execute(
            "CALL refresh_continuous_aggregate('hourly_readings', NULL, NULL);"
        )
        print("✅ hourly_readings refreshed with seeded data.")

        # Verify row count
        count = await conn.fetchval("SELECT count(*) FROM hourly_readings")
        print(f"✅ hourly_readings contains {count} rows.")

    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(create_aggregate())
