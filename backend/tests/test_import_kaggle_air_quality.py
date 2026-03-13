from pathlib import Path

import pandas as pd

from import_kaggle_air_quality import (
    detect_date_column,
    normalise_param_column,
    parse_csv,
)


def test_detect_date_column_prefers_known_name() -> None:
    df = pd.DataFrame(columns=["From Date", "PM2.5 (ug/m3)"])
    assert detect_date_column(df) == "From Date"


def test_normalise_param_column_strips_units() -> None:
    assert normalise_param_column("PM2.5 (ug/m3)") == "PM2.5"
    assert normalise_param_column("Ozone") == "O3"


def test_parse_csv_returns_clean_long_dataframe(tmp_path: Path) -> None:
    csv_path = tmp_path / "CG001.csv"
    csv_path.write_text(
        "From Date,PM2.5 (ug/m3),NO2 (ug/m3),AQI\n"
        "2023-01-01 00:00:00,42,13,80\n"
        "2023-01-01 01:00:00,-1,12,79\n"
        "2023-01-01 02:00:00,44,,81\n",
        encoding="utf-8",
    )

    out = parse_csv(csv_path, city_name="CG001", year_filter={2023})

    assert list(out.columns) == ["city", "timestamp", "parameter", "value"]
    assert not out.empty
    assert (out["city"] == "CG001").all()
    assert (out["value"] >= 0).all()
    assert set(out["parameter"].unique().tolist()) <= {"PM2.5", "NO2"}
