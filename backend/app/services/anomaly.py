"""
FastAPI dependency: check_anomaly()
Loads the saved IsolationForest model for a given station+parameter and
returns True if the value is an anomaly.
Used by ComplianceEngine / readings ingest pipeline.
"""

import logging
import pickle
from pathlib import Path
from typing import Optional

_MODELS_DIR = Path(__file__).resolve().parents[1] / "ml_models"
_model_cache: dict = {}


def _load_model(location_id: str, parameter_id: str):
    key = f"{location_id}:{parameter_id}"
    if key in _model_cache:
        return _model_cache[key]

    model_path = _MODELS_DIR / f"isoforest_{location_id}_{parameter_id}.pkl"
    if not model_path.exists():
        return None

    try:
        with model_path.open("rb") as fp:
            model = pickle.load(fp)
        _model_cache[key] = model
        return model
    except Exception as exc:
        logging.warning("Failed to load anomaly model %s: %s", model_path, exc)
        return None


def check_anomaly(location_id: str, parameter_id: str, value: float) -> bool:
    """
    Returns True if value is anomalous according to the saved IsolationForest
    model for the given location + parameter combination.
    Returns False if no model exists (fail-open: don't flag without evidence).
    """
    model = _load_model(location_id, parameter_id)
    if model is None:
        return False

    try:
        prediction = model.predict([[value]])
        return int(prediction[0]) == -1
    except Exception as exc:
        logging.warning(
            "Anomaly check failed for loc=%s param=%s value=%s: %s",
            location_id,
            parameter_id,
            value,
            exc,
        )
        return False


def invalidate_cache(location_id: Optional[str] = None, parameter_id: Optional[str] = None) -> None:
    """Clear cached models (call after retraining)."""
    global _model_cache
    if location_id and parameter_id:
        _model_cache.pop(f"{location_id}:{parameter_id}", None)
    else:
        _model_cache.clear()
