"""add timescaledb objects

Revision ID: 5a8f8f7b66f1
Revises: e468c490bbaf
Create Date: 2026-03-10 21:55:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "5a8f8f7b66f1"
down_revision: Union[str, None] = "e468c490bbaf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ensure TimescaleDB extension exists.
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb;")

    # Convert sensor_readings to hypertable if not already converted.
    op.execute(
        """
        SELECT create_hypertable(
            'sensor_readings',
            'recorded_at',
            migrate_data => TRUE,
            if_not_exists => TRUE
        );
        """
    )

    # Index to accelerate latest/value range lookups.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sensor_readings_loc_param_time
        ON sensor_readings (location_id, parameter_id, recorded_at DESC);
        """
    )

    # Continuous aggregate for forecasting and dashboard trend queries.
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_readings
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 hour', recorded_at) AS hour,
            location_id,
            parameter_id,
            AVG(value) AS avg_value,
            MAX(value) AS max_value,
            MIN(value) AS min_value
        FROM sensor_readings
        GROUP BY 1, 2, 3
        WITH NO DATA;
        """
    )

    # Compression policy is optional in dev but useful in long-running environments.
    op.execute(
        """
        DO $$
        BEGIN
            BEGIN
                PERFORM add_compression_policy('sensor_readings', INTERVAL '7 days');
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS hourly_readings;")
    op.execute("DROP INDEX IF EXISTS idx_sensor_readings_loc_param_time;")
    # Keep extension and hypertable in downgrade to avoid destructive data operations.
