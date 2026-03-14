"""
Generate a synthetic noise quality dataset for Chhattisgarh monitoring stations.
Outputs: backend/data/noise_data.csv

2 years of daily readings (2022-01-01 to 2023-12-31) per station.
Run from the repo root: python backend/scripts/generate_noise_dataset.py
"""

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(20260314)

# Station definitions: (name, city, zone_type, base_leq_day, base_leq_night, limit_day, limit_night)
STATIONS = [
    ("Korba Industrial Area",   "Korba",    "Industrial",   82.0, 74.0, 75.0, 70.0),
    ("Bhilai Steel Zone",       "Bhilai",   "Industrial",   79.0, 71.0, 75.0, 70.0),
    ("Raipur Commercial Hub",   "Raipur",   "Commercial",   68.0, 58.0, 65.0, 55.0),
    ("Raipur Civil Lines",      "Raipur",   "Residential",  58.0, 48.0, 55.0, 45.0),
    ("Bilaspur Residential",    "Bilaspur", "Residential",  54.0, 44.0, 55.0, 45.0),
]

START = date(2022, 1, 1)
END   = date(2023, 12, 31)

# Diwali window: last week of October
DIWALI_MONTHS = {10, 11}  # apply spike Oct 24–Nov 3 approx
WINTER_MONTHS = {12, 1, 2}


def is_diwali(d: date) -> bool:
    return d.month == 10 and d.day >= 24 or d.month == 11 and d.day <= 3


def noise_factor(d: date) -> float:
    factor = 1.0
    if d.weekday() < 5:          # weekday
        factor *= 1.08
    if is_diwali(d):             # Diwali spike
        factor *= 1.40
    elif d.month in WINTER_MONTHS:  # winter boost
        factor *= 1.10
    return factor


def apply_noise(base: float) -> float:
    """Gaussian noise ±3%."""
    f = 1.0 + random.gauss(0.0, 0.03)
    f = max(0.94, min(1.06, f))
    return round(base * f, 1)


def main() -> None:
    here = Path(__file__).resolve()
    out_dir = here.parents[1] / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "noise_data.csv"

    fieldnames = [
        "city", "station", "zone_type",
        "date", "day_reading", "night_reading",
        "leq_day", "leq_night", "lmax", "lmin",
    ]

    rows = []
    current = START
    while current <= END:
        for name, city, zone, base_day, base_night, _, _ in STATIONS:
            factor = noise_factor(current)
            leq_day   = apply_noise(base_day   * factor)
            leq_night = apply_noise(base_night * factor)
            lmax      = round(leq_day * 1.15, 1)
            lmin      = round(leq_day * 0.72, 1)

            rows.append({
                "city":         city,
                "station":      name,
                "zone_type":    zone,
                "date":         current.isoformat(),
                "day_reading":  leq_day,
                "night_reading": leq_night,
                "leq_day":      leq_day,
                "leq_night":    leq_night,
                "lmax":         lmax,
                "lmin":         lmin,
            })
        current += timedelta(days=1)

    with out_path.open("w", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} rows → {out_path}")
    # Summary
    from collections import Counter
    by_station = Counter(r["station"] for r in rows)
    for stn, count in by_station.items():
        print(f"  {stn}: {count} rows")


if __name__ == "__main__":
    main()
