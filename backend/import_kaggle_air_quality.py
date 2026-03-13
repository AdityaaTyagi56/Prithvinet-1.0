"""
Import script: Time Series Air Quality Data of India (2010-2023)
Kaggle dataset: abhisheksjha/time-series-air-quality-data-of-india-2010-2023

Usage (from backend/ directory):
    python import_kaggle_air_quality.py
    python import_kaggle_air_quality.py --cities Raipur,Delhi,Mumbai
    python import_kaggle_air_quality.py --years 2020,2021,2022,2023
    python import_kaggle_air_quality.py --dry-run
"""

import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import pandas as pd

# ---------------------------------------------------------------------------
# City coordinates lookup (lat, lng) for common Indian cities in CPCB data
# ---------------------------------------------------------------------------
CITY_COORDS: dict[str, tuple[float, float]] = {
    "Raipur": (21.2514, 81.6296),
    "Bilaspur": (22.0797, 82.1409),
    "Korba": (22.3595, 82.7501),
    "Durg": (21.1904, 81.2849),
    "Bhilai": (21.2099, 81.4285),
    "Delhi": (28.6139, 77.2090),
    "Mumbai": (19.0760, 72.8777),
    "Chennai": (13.0827, 80.2707),
    "Kolkata": (22.5726, 88.3639),
    "Bangalore": (12.9716, 77.5946),
    "Bengaluru": (12.9716, 77.5946),
    "Hyderabad": (17.3850, 78.4867),
    "Ahmedabad": (23.0225, 72.5714),
    "Pune": (18.5204, 73.8567),
    "Lucknow": (26.8467, 80.9462),
    "Kanpur": (26.4499, 80.3319),
    "Jaipur": (26.9124, 75.7873),
    "Patna": (25.5941, 85.1376),
    "Bhopal": (23.2599, 77.4126),
    "Indore": (22.7196, 75.8577),
    "Nagpur": (21.1458, 79.0882),
    "Surat": (21.1702, 72.8311),
    "Varanasi": (25.3176, 82.9739),
    "Agra": (27.1767, 78.0081),
    "Visakhapatnam": (17.6868, 83.2185),
    "Guwahati": (26.1445, 91.7362),
    "Chandigarh": (30.7333, 76.7794),
    "Amritsar": (31.6340, 74.8723),
    "Jodhpur": (26.2389, 73.0243),
    "Kochi": (9.9312, 76.2673),
    "Thiruvananthapuram": (8.5241, 76.9366),
}

# ---------------------------------------------------------------------------
# Canonical parameter name normalisation
# ---------------------------------------------------------------------------
PARAM_NORMALISE: dict[str, str] = {
    "pm2.5": "PM2.5",
    "pm 2.5": "PM2.5",
    "pm2_5": "PM2.5",
    "pm10": "PM10",
    "pm 10": "PM10",
    "no": "NO",
    "no2": "NO2",
    "nox": "NOx",
    "so2": "SO2",
    "co": "CO",
    "o3": "O3",
    "ozone": "O3",
    "nh3": "NH3",
    "benzene": "Benzene",
    "toluene": "Toluene",
    "xylene": "Xylene",
    "mp-xylene": "Xylene",
    "eth-benzene": "Ethyl-Benzene",
    "aqi": "AQI",
}

PARAM_UNITS: dict[str, str] = {
    "PM2.5": "ug/m3",
    "PM10": "ug/m3",
    "NO2": "ug/m3",
    "SO2": "ug/m3",
    "CO": "mg/m3",
    "O3": "ug/m3",
    "NH3": "ug/m3",
    "Benzene": "ug/m3",
    "Toluene": "ug/m3",
    "Xylene": "ug/m3",
    "AQI": "index",
}

# Parameters we actually want to import (skip AQI — it's derived)
IMPORT_PARAMETERS = {"PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3", "NO"}

# State code prefix → state name mapping for CPCB station codes (e.g. CG001 = Chhattisgarh)
STATE_PREFIX_MAP: dict[str, str] = {
    "CG": "Chhattisgarh",
    "AP": "Andhra Pradesh",
    "AR": "Arunachal Pradesh",
    "AS": "Assam",
    "BR": "Bihar",
    "CH": "Chandigarh",
    "DD": "Daman & Diu",
    "DL": "Delhi",
    "GA": "Goa",
    "GJ": "Gujarat",
    "HR": "Haryana",
    "HP": "Himachal Pradesh",
    "JH": "Jharkhand",
    "JK": "Jammu & Kashmir",
    "KA": "Karnataka",
    "KL": "Kerala",
    "MH": "Maharashtra",
    "MN": "Manipur",
    "MP": "Madhya Pradesh",
    "MZ": "Mizoram",
    "NL": "Nagaland",
    "OD": "Odisha",
    "PB": "Punjab",
    "PY": "Puducherry",
    "RJ": "Rajasthan",
    "SK": "Sikkim",
    "TG": "Telangana",
    "TN": "Tamil Nadu",
    "TR": "Tripura",
    "UK": "Uttarakhand",
    "UP": "Uttar Pradesh",
    "WB": "West Bengal",
}


def download_dataset() -> Path:
    """Download dataset via kagglehub and return the directory path."""
    try:
        import kagglehub
    except ImportError:
        print("ERROR: kagglehub not installed. Run: pip3 install --user kagglehub")
        sys.exit(1)

    print("Downloading dataset from Kaggle (this may take a few minutes for 487 MB)...")
    path = kagglehub.dataset_download(
        "abhisheksjha/time-series-air-quality-data-of-india-2010-2023"
    )
    dataset_dir = Path(path)
    print(f"Downloaded to: {dataset_dir}")
    return dataset_dir


def find_csv_files(dataset_dir: Path) -> list[Path]:
    """Recursively find all CSV files in the downloaded dataset."""
    csvs = sorted(dataset_dir.rglob("*.csv"))
    print(f"Found {len(csvs)} CSV file(s)")
    return csvs


def detect_city_from_path(csv_path: Path) -> str:
    """Use station code as location name (e.g. CG001, DL005)."""
    return csv_path.stem.upper()


def get_state_prefix(csv_path: Path) -> str:
    """Extract 2-letter state prefix from station code filename."""
    stem = csv_path.stem.upper()
    # Handle both 2-letter (CG) and 2-letter+digits (CG001)
    return stem[:2] if len(stem) >= 2 else stem


def detect_date_column(df: pd.DataFrame) -> str | None:
    """Find the date/timestamp column by common CPCB names."""
    # Exact matches first — CPCB format uses 'From Date'
    candidates = [
        "From Date",
        "from_date",
        "Date",
        "date",
        "Timestamp",
        "timestamp",
        "datetime",
        "DateTime",
        "time",
        "Time",
        "Dates",
    ]
    for col in candidates:
        if col in df.columns:
            return col
    # Fall back: first column containing 'date' or 'time' (case-insensitive)
    for col in df.columns:
        if "date" in col.lower() or "time" in col.lower():
            return col
    return None


def normalise_param_column(col: str) -> str | None:
    """Map a CSV column header to a canonical parameter name, or None to skip."""
    key = col.strip().lower()
    # Strip unit suffixes like "(ug/m3)", "(mg/m3)"
    for suffix in ["(ug/m3)", "(mg/m3)", "(ppb)", "(ppm)", "(index)", "ug/m3", "mg/m3"]:
        key = key.replace(suffix, "").strip()
    return PARAM_NORMALISE.get(key)


def parse_csv(
    csv_path: Path, city_name: str, year_filter: set[int] | None
) -> pd.DataFrame:
    """
    Parse one CSV file into a long-format DataFrame with columns:
        city, timestamp, parameter, value
    """
    df = pd.read_csv(csv_path, low_memory=False)
    if df.empty:
        return pd.DataFrame()

    # ------------------------------------------------------------------
    # Detect date column
    # ------------------------------------------------------------------
    date_col = detect_date_column(df)
    if not date_col:
        print(f"  SKIP {csv_path.name}: no date column found")
        return pd.DataFrame()

    # ------------------------------------------------------------------
    # Detect pollutant columns
    # ------------------------------------------------------------------
    param_cols: dict[str, str] = {}  # csv_col -> canonical_param
    for col in df.columns:
        if col == date_col:
            continue
        param = normalise_param_column(col)
        if param and param in IMPORT_PARAMETERS:
            param_cols[col] = param

    if not param_cols:
        print(f"  SKIP {csv_path.name}: no recognised pollutant columns")
        return pd.DataFrame()

    # ------------------------------------------------------------------
    # Parse timestamps
    # ------------------------------------------------------------------
    # Parse ISO-like formats first, then retry unresolved values with day-first format.
    parsed_dates = pd.to_datetime(df[date_col], errors="coerce", dayfirst=False)
    unresolved = parsed_dates.isna()
    if unresolved.any():
        parsed_dates.loc[unresolved] = pd.to_datetime(
            df.loc[unresolved, date_col], errors="coerce", dayfirst=True
        )
    df[date_col] = parsed_dates
    df = df.dropna(subset=[date_col])

    if year_filter:
        df = df[df[date_col].dt.year.isin(year_filter)]

    if df.empty:
        return pd.DataFrame()

    # ------------------------------------------------------------------
    # Melt wide → long
    # ------------------------------------------------------------------
    id_vars = [date_col]
    value_vars = list(param_cols.keys())

    wide_df = cast(pd.DataFrame, df.loc[:, id_vars + value_vars])
    melted = wide_df.melt(
        id_vars=id_vars, value_vars=value_vars, var_name="csv_col", value_name="value"
    )
    melted["parameter"] = melted["csv_col"].map(
        lambda csv_col: param_cols.get(str(csv_col))
    )
    melted["timestamp"] = melted[date_col]
    melted["city"] = city_name
    melted = melted.dropna(subset=["value"])
    melted["value"] = pd.to_numeric(melted["value"], errors="coerce")
    melted = melted.dropna(subset=["value"])
    melted = melted[melted["value"] >= 0]  # drop negative/sentinel values

    output_subset = cast(
        pd.DataFrame,
        melted.loc[:, ["city", "timestamp", "parameter", "value"]],
    )
    output_df = output_subset.reset_index(drop=True)
    return output_df


async def run_import(
    dataset_dir: Path,
    city_filter: set[str] | None,
    year_filter: set[int] | None,
    dry_run: bool,
    state_filter: set[str] | None = None,
) -> None:
    # Import here so the script can be run from backend/ without path issues
    from app.core.config import settings
    from app.models.core import (
        LocationType,
        MonitoringLocation,
        MonitoringUnit,
        RegionalOffice,
    )
    from app.models.monitoring import SensorReading, SourceType
    from sqlalchemy import select, text
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    AsyncSessionLocal = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    csv_files = find_csv_files(dataset_dir)
    if not csv_files:
        print("No CSV files found in dataset directory.")
        return

    async with AsyncSessionLocal() as session:
        # ------------------------------------------------------------------
        # 1. Ensure a regional office exists for the import
        # ------------------------------------------------------------------
        ro_res = await session.execute(select(RegionalOffice).limit(1))
        regional_office = ro_res.scalar_one_or_none()
        if not regional_office:
            print("No regional office found. Run seed.py first.")
            return
        ro_id = regional_office.id

        # ------------------------------------------------------------------
        # 2. Build / cache monitoring units
        # ------------------------------------------------------------------
        unit_res = await session.execute(select(MonitoringUnit))
        unit_cache: dict[str, MonitoringUnit] = {
            str(u.parameter): u for u in unit_res.scalars()
        }

        def get_or_create_unit(param: str) -> MonitoringUnit:
            if param not in unit_cache:
                u = MonitoringUnit(
                    parameter=param,
                    unit=PARAM_UNITS.get(param, "ug/m3"),
                    description=f"{param} - imported from CPCB dataset",
                )
                session.add(u)
                unit_cache[param] = u
            return unit_cache[param]

        # ------------------------------------------------------------------
        # 3. Build / cache monitoring locations
        # ------------------------------------------------------------------
        loc_res = await session.execute(select(MonitoringLocation))
        loc_cache: dict[str, MonitoringLocation] = {
            str(l.name): l for l in loc_res.scalars()
        }

        def get_or_create_location(city: str) -> MonitoringLocation:
            if city not in loc_cache:
                coords = CITY_COORDS.get(city)
                coord_str = f"{coords[0]},{coords[1]}" if coords else None
                device_id = f"kaggle_{city.lower().replace(' ', '_')}"
                loc = MonitoringLocation(
                    name=city,
                    location=coord_str,
                    type=LocationType.air,
                    region_id=ro_id,
                    iot_device_id=device_id,
                    is_active=True,
                )
                session.add(loc)
                loc_cache[city] = loc
            return loc_cache[city]

        # ------------------------------------------------------------------
        # 4. Process each CSV
        # ------------------------------------------------------------------
        total_inserted = 0

        for csv_path in csv_files:
            city_name = detect_city_from_path(csv_path)  # e.g. "CG001"
            state_prefix = get_state_prefix(csv_path)  # e.g. "CG"

            # Apply state filter (--states CG,DL) — primary filter for this dataset
            if state_filter:
                if state_prefix not in state_filter:
                    continue

            # Apply city filter (--cities) — matches against station code OR state name
            if city_filter:
                state_name = STATE_PREFIX_MAP.get(state_prefix, "")
                match = any(
                    f.lower() in city_name.lower() or f.lower() in state_name.lower()
                    for f in city_filter
                )
                if not match:
                    continue

            print(f"\nProcessing: {csv_path.name}  →  city={city_name}")

            long_df = parse_csv(csv_path, city_name, year_filter)
            if long_df.empty:
                print(f"  No usable rows.")
                continue

            print(f"  Rows after cleaning: {len(long_df):,}")
            print(f"  Parameters found: {long_df['parameter'].unique().tolist()}")
            print(
                f"  Date range: {long_df['timestamp'].min()} → {long_df['timestamp'].max()}"
            )

            if dry_run:
                print("  DRY RUN — skipping DB insert")
                continue

            # Flush to get IDs for new locations/units
            await session.flush()

            location = get_or_create_location(city_name)
            await session.flush()

            # Pre-create all units needed by this CSV and flush so ids are available.
            needed_params = sorted(set(long_df["parameter"].dropna().tolist()))
            for p in needed_params:
                get_or_create_unit(p)
            await session.flush()

            readings: list[SensorReading] = []
            for _, row in cast(Any, long_df).iterrows():
                param_name = str(row["parameter"])
                unit = unit_cache.get(param_name)
                if unit is None or unit.id is None:
                    continue
                ts = pd.Timestamp(row["timestamp"]).to_pydatetime()
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)

                readings.append(
                    SensorReading(
                        id=uuid.uuid4(),
                        location_id=location.id,
                        parameter_id=unit.id,
                        value=float(row["value"]),
                        unit_id=unit.id,
                        recorded_at=ts,
                        source=SourceType.manual,
                        quality_flag="kaggle_import",
                    )
                )

            # Chunk inserts using raw SQL with ON CONFLICT DO NOTHING to skip duplicates
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            # Keep batch small enough to stay under asyncpg's max bind parameter limit.
            # We insert 8 columns per row, so 4000 rows can exceed 32767 parameters.
            chunk_size = 2000
            chunk_inserted = 0
            for i in range(0, len(readings), chunk_size):
                chunk = readings[i : i + chunk_size]
                rows_data = [
                    {
                        "id": r.id,
                        "location_id": r.location_id,
                        "parameter_id": r.parameter_id,
                        "value": r.value,
                        "unit_id": r.unit_id,
                        "recorded_at": r.recorded_at,
                        "source": r.source.value
                        if hasattr(r.source, "value")
                        else r.source,
                        "quality_flag": r.quality_flag,
                    }
                    for r in chunk
                ]
                stmt = (
                    pg_insert(SensorReading.__table__)
                    .values(rows_data)
                    .on_conflict_do_nothing()
                )
                result = await session.execute(stmt)
                chunk_inserted += (
                    result.rowcount if result.rowcount >= 0 else len(chunk)
                )
                print(
                    f"  Inserted chunk {i // chunk_size + 1} / {(len(readings) - 1) // chunk_size + 1}"
                )

            total_inserted += chunk_inserted
            print(f"  Total so far: {total_inserted:,} rows")

        if not dry_run:
            await session.commit()
            print(f"\nDone. Committed {total_inserted:,} sensor readings to database.")
        else:
            print(f"\nDry run complete.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import Kaggle air quality dataset into PrithviNet DB"
    )
    parser.add_argument(
        "--cities",
        type=str,
        default="",
        help="Comma-separated city names to import (default: all). E.g. Raipur,Delhi",
    )
    parser.add_argument(
        "--years",
        type=str,
        default="",
        help="Comma-separated years to import (default: all). E.g. 2020,2021,2022,2023",
    )
    parser.add_argument(
        "--states",
        type=str,
        default="",
        help="Comma-separated 2-letter state codes to import. E.g. CG,DL,MH (CG=Chhattisgarh)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate without writing to the database",
    )
    parser.add_argument(
        "--dataset-path",
        type=str,
        default="",
        help="Path to already-downloaded dataset directory (skip re-download)",
    )
    args = parser.parse_args()

    city_filter: set[str] | None = None
    if args.cities:
        city_filter = {c.strip() for c in args.cities.split(",") if c.strip()}

    state_filter: set[str] | None = None
    if args.states:
        state_filter = {s.strip().upper() for s in args.states.split(",") if s.strip()}

    year_filter: set[int] | None = None
    if args.years:
        year_filter = {int(y.strip()) for y in args.years.split(",") if y.strip()}

    if args.dataset_path:
        dataset_dir = Path(args.dataset_path)
        if not dataset_dir.exists():
            print(f"ERROR: --dataset-path does not exist: {dataset_dir}")
            sys.exit(1)
    else:
        dataset_dir = download_dataset()

    asyncio.run(
        run_import(dataset_dir, city_filter, year_filter, args.dry_run, state_filter)
    )


if __name__ == "__main__":
    main()
