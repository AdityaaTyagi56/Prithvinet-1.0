"""
High-quality Prophet model training from Chhattisgarh air quality CSV datasets.

Trains per (location_id, parameter) pair. Saves pkl models + metadata JSON to
backend/ml_models/ which ml_service.py can load at forecast time for better
accuracy than on-demand DB training.

Quality settings used:
  - changepoint_prior_scale=0.15  (more flexible trend changes)
  - seasonality_prior_scale=15    (stronger seasonality allowed)
  - multiplicative seasonality    (better for diurnal air quality cycles)
  - Indian national holidays
  - Industrial weekly cycle (Mon-Fri higher emissions)
  - Outlier removal (3-sigma rolling window)
  - Cross-validation with MAE / RMSE / MAPE / Coverage reporting
"""

import json
import logging
import pickle
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from prophet import Prophet

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "trusted_sources"
AQI_LOGS_DIR = Path(__file__).resolve().parents[1] / "data" / "aqi_logs"
MODEL_DIR = Path(__file__).resolve().parents[1] / "ml_models"

# Read all project trusted-source CSVs and newly fetched AQI logs
CSV_GLOBS = [
    str(DATA_DIR / "*.csv"),
    str(AQI_LOGS_DIR / "*.csv"),
]

MIN_POINTS = 200  # minimum hourly points to attempt training

# Quality-focused Prophet config (tuned for air quality, Chhattisgarh region)
PROPHET_KWARGS = dict(
    changepoint_prior_scale=0.15,   # default 0.05 — allows more trend flexibility
    seasonality_prior_scale=15.0,   # default 10.0 — stronger seasonality fits
    seasonality_mode="multiplicative",
    yearly_seasonality=False,        # need >1 year data; disabled with 90-day set
    weekly_seasonality=True,
    daily_seasonality=True,
    interval_width=0.95,
)


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


def _normalize_source_df(df: pd.DataFrame, source_name: str) -> pd.DataFrame:
    """Normalize different CSV schemas to: ds, y, location, parameter, location_id."""
    if df.empty:
        return pd.DataFrame(columns=["location_id", "location", "parameter", "ds", "y"])

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Main trusted CSV schema
    if {"timestamp_utc", "value", "location_name", "parameter"}.issubset(df.columns):
        df = df.rename(columns={
            "timestamp_utc": "ds",
            "value": "y",
            "location_name": "location",
        })
        if "location_id" not in df.columns:
            df["location_id"] = df["location"].astype(str).map(
                lambda x: str(uuid.uuid5(uuid.NAMESPACE_DNS, f"prithvinet:{x}"))
            )

    # CPCB/official schema
    elif {"last_update", "avg_value", "station", "pollutant_id"}.issubset(df.columns):
        df = df.rename(columns={
            "last_update": "ds",
            "avg_value": "y",
            "station": "location",
            "pollutant_id": "parameter",
        })
        df["location_id"] = df["location"].astype(str).map(
            lambda x: str(uuid.uuid5(uuid.NAMESPACE_DNS, f"prithvinet:{x}"))
        )
    else:
        logging.warning("Skipping unsupported schema file: %s", source_name)
        return pd.DataFrame(columns=["location_id", "location", "parameter", "ds", "y"])

    df["ds"] = pd.to_datetime(df["ds"], utc=True, errors="coerce").dt.tz_localize(None)
    df["y"] = pd.to_numeric(df["y"], errors="coerce")
    df["location"] = df["location"].astype(str).str.strip()
    df["parameter"] = df["parameter"].astype(str).str.strip()
    df["location_id"] = df["location_id"].astype(str)

    df = df.dropna(subset=["ds", "y", "location", "parameter", "location_id"])
    df = df[df["y"] >= 0]
    return df[["location_id", "location", "parameter", "ds", "y"]]


def load_all_csvs() -> pd.DataFrame:
    """Load and combine all trusted-source CSVs in the project."""
    from glob import glob

    csv_files = sorted({p for pattern in CSV_GLOBS for p in glob(pattern) if p.endswith(".csv")})
    if not csv_files:
        return pd.DataFrame(columns=["location_id", "location", "parameter", "ds", "y"])

    frames: list[pd.DataFrame] = []
    for path in csv_files:
        try:
            src = pd.read_csv(path)
            norm = _normalize_source_df(src, path)
            if not norm.empty:
                frames.append(norm)
                logging.info("Loaded %s rows from %s", len(norm), Path(path).name)
        except Exception as exc:
            logging.warning("Failed reading %s: %s", path, exc)

    if not frames:
        return pd.DataFrame(columns=["location_id", "location", "parameter", "ds", "y"])

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(subset=["location_id", "parameter", "ds"], keep="last")
    return combined


def remove_outliers(series: pd.Series, n_std: float = 3.0) -> pd.Series:
    """Clip outliers outside n_std rolling-window standard deviations."""
    roll_mean = series.rolling(window=24, center=True, min_periods=1).mean()
    roll_std = series.rolling(window=24, center=True, min_periods=1).std().fillna(1.0)
    return series.clip(lower=roll_mean - n_std * roll_std,
                       upper=roll_mean + n_std * roll_std)


def prepare_series(df: pd.DataFrame, location: str, parameter: str) -> pd.DataFrame:
    """Filter → hourly resample → outlier-clean."""
    mask = (df["location"].str.lower() == location.lower()) & \
           (df["parameter"].str.lower() == parameter.lower())
    subset = df[mask][["ds", "y"]].copy()
    if subset.empty:
        return pd.DataFrame()
    subset = subset.set_index("ds").sort_index()
    subset = subset.resample("1h").mean().dropna()
    subset = subset.reset_index()
    subset["y"] = remove_outliers(subset["y"])
    return subset


def train_model(series: pd.DataFrame) -> tuple:
    """Train a quality-focused Prophet model. Returns (model, cv_metrics_dict)."""
    model = Prophet(**PROPHET_KWARGS)
    model.add_country_holidays(country_name="IN")
    # Industrial weekly cycle: captures Mon-Fri elevated factory emissions
    model.add_seasonality(name="industrial_weekly", period=7, fourier_order=8)
    model.fit(series[["ds", "y"]])

    metrics = {}
    n = len(series)
    if n >= 200:
        try:
            from prophet.diagnostics import cross_validation, performance_metrics
            # Use 60% of total data as initial window, minimum 7 days
            total_days = n / 24
            initial_days = max(7, int(total_days * 0.60))
            horizon_days = min(2, max(1, int(total_days * 0.10)))
            # Ensure initial + horizon < total_days
            if initial_days + horizon_days >= total_days:
                initial_days = max(3, int(total_days * 0.50))
                horizon_days = max(1, int(total_days * 0.10))
            cv = cross_validation(
                model,
                initial=f"{initial_days} days",
                period="3 days",
                horizon=f"{horizon_days * 24} hours",
                parallel=None,
            )
            pm = performance_metrics(cv)
            metrics = {
                "mae": round(float(pm["mae"].mean()), 3),
                "rmse": round(float(pm["rmse"].mean()), 3),
                "mape": round(float(pm["mape"].mean()), 5),
                "coverage": round(float(pm["coverage"].mean()), 3),
                "n_cv_windows": int(len(pm)),
            }
            logging.info(
                "  CV → MAE=%.3f  RMSE=%.3f  MAPE=%.5f  Coverage=%.0f%%",
                metrics["mae"], metrics["rmse"], metrics["mape"],
                metrics["coverage"] * 100,
            )
        except Exception as exc:
            logging.warning("  Cross-validation failed: %s", exc)

    return model, metrics


def save_model(model: Prophet, location_id: str, location_name: str,
               parameter: str, n_points: int, metrics: dict) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    safe_param = parameter.replace(".", "_").replace(" ", "_")
    stem = f"{location_id}_{safe_param}"

    with open(MODEL_DIR / f"{stem}.pkl", "wb") as fh:
        pickle.dump(model, fh)

    meta = {
        "location_id": location_id,
        "location_name": location_name,
        "parameter": parameter,
        "n_training_points": n_points,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "prophet-quality-v2",
        "prophet_kwargs": {k: str(v) for k, v in PROPHET_KWARGS.items()},
        "cv_metrics": metrics,
    }
    with open(MODEL_DIR / f"{stem}.meta.json", "w") as fh:
        json.dump(meta, fh, indent=2)

    logging.info("  Saved → %s.pkl  (%d pts)", stem, n_points)


def main() -> None:
    configure_logging()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    df = load_all_csvs()
    if df.empty:
        logging.error("No valid training rows found across trusted-source CSV files")
        sys.exit(1)

    # Exclude known synthetic Stack stations from model training.
    before = len(df)
    df = df[~df["location"].str.contains(r"^stack\b", case=False, regex=True)]
    removed = before - len(df)
    if removed:
        logging.info("Excluded %d Stack rows from training", removed)

    combos = (
        df.groupby(["location_id", "location", "parameter"])
        .size()
        .reset_index(name="count")
    )
    combos = combos[combos["count"] >= MIN_POINTS]
    logging.info("Training %d model(s) (>= %d pts each)…", len(combos), MIN_POINTS)

    results = []
    for _, row in combos.iterrows():
        loc_id  = row["location_id"]
        loc     = row["location"]
        param   = row["parameter"]
        logging.info("▶ %s / %s  (%d raw pts)", loc, param, row["count"])

        series = prepare_series(df, loc, param)
        if len(series) < MIN_POINTS:
            logging.warning("  Only %d pts after cleaning — skipping", len(series))
            results.append({"location": loc, "parameter": param, "status": "skipped"})
            continue

        try:
            model, metrics = train_model(series)
            save_model(model, loc_id, loc, param, len(series), metrics)
            results.append({
                "location": loc, "location_id": loc_id,
                "parameter": param, "n_points": len(series),
                "status": "trained", "cv_metrics": metrics,
            })
        except Exception as exc:
            logging.error("  FAILED: %s", exc)
            results.append({"location": loc, "parameter": param,
                             "status": "failed", "error": str(exc)})

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  TRAINING SUMMARY")
    print("=" * 60)
    for r in results:
        s = r["status"]
        lbl = f"{r['location']} / {r['parameter']}"
        if s == "trained":
            cv = r.get("cv_metrics", {})
            mae  = cv.get("mae", "N/A")
            rmse = cv.get("rmse", "N/A")
            cov  = cv.get("coverage", "N/A")
            print(f"  ✓  {lbl}")
            print(f"     pts={r['n_points']}  MAE={mae}  RMSE={rmse}  Coverage={cov}")
        elif s == "skipped":
            print(f"  —  {lbl}: skipped (insufficient data)")
        else:
            print(f"  ✗  {lbl}: FAILED — {r.get('error', '')}")
    trained = sum(1 for r in results if r["status"] == "trained")
    print("=" * 60)
    print(f"  Total trained: {trained}/{len(results)}")
    print("=" * 60)

    out = MODEL_DIR / "training_run.json"
    with open(out, "w") as fh:
        json.dump({"run_at": datetime.now(timezone.utc).isoformat(),
                   "results": results}, fh, indent=2)
    logging.info("Full results → %s", out)


if __name__ == "__main__":
    main()
