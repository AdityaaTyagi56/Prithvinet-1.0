"""
Generate a synthetic water quality dataset for Chhattisgarh monitoring stations.
Outputs: backend/data/water_quality.csv

Matches the column structure expected by import_water_chhattisgarh.py.
Run from the repo root: python backend/scripts/generate_water_dataset.py
"""

import csv
import random
import os
from pathlib import Path

random.seed(20260314)

STATIONS = [
    {
        "code": "CG001",
        "location": "Mahanadi at Arrang",
        "state": "Chhattisgarh",
        "temp": 24.5,
        "do": 6.8,
        "ph": 7.2,
        "cond": 285.0,
        "bod": 2.1,
        "nitrate": 1.8,
        "fecal_coli": 32.0,
        "total_coli": 45.0,
    },
    {
        "code": "CG002",
        "location": "Kharoon River at Bundri",
        "state": "Chhattisgarh",
        "temp": 26.1,
        "do": 5.2,
        "ph": 6.9,
        "cond": 340.0,
        "bod": 4.8,
        "nitrate": 2.4,
        "fecal_coli": 90.0,
        "total_coli": 120.0,
    },
    {
        "code": "CG003",
        "location": "Seonath River at Durg",
        "state": "Chhattisgarh",
        "temp": 23.8,
        "do": 7.1,
        "ph": 7.4,
        "cond": 265.0,
        "bod": 1.8,
        "nitrate": 1.5,
        "fecal_coli": 20.0,
        "total_coli": 28.0,
    },
    {
        "code": "CG004",
        "location": "Arpa River DS Bilaspur",
        "state": "Chhattisgarh",
        "temp": 24.2,
        "do": 6.5,
        "ph": 7.1,
        "cond": 310.0,
        "bod": 2.4,
        "nitrate": 2.0,
        "fecal_coli": 28.0,
        "total_coli": 38.0,
    },
    {
        "code": "CG005",
        "location": "Kelo River US Raigarh",
        "state": "Chhattisgarh",
        "temp": 23.5,
        "do": 7.2,
        "ph": 7.3,
        "cond": 255.0,
        "bod": 1.6,
        "nitrate": 1.3,
        "fecal_coli": 16.0,
        "total_coli": 22.0,
    },
    {
        "code": "CG006",
        "location": "Kelo River DS Raigarh",
        "state": "Chhattisgarh",
        "temp": 25.8,
        "do": 4.9,
        "ph": 6.8,
        "cond": 380.0,
        "bod": 5.2,
        "nitrate": 2.8,
        "fecal_coli": 135.0,
        "total_coli": 180.0,
    },
    {
        "code": "CG007",
        "location": "Dengur Nallah Korba",
        "state": "Chhattisgarh",
        "temp": 28.2,
        "do": 3.1,
        "ph": 6.2,
        "cond": 520.0,
        "bod": 12.4,
        "nitrate": 5.6,
        "fecal_coli": 640.0,
        "total_coli": 850.0,
    },
]

YEARS = [2018, 2019, 2020, 2021, 2022]
NOISE_FRAC = 0.05  # ±5% gaussian noise


def noise(base: float) -> float:
    """Apply ±5% gaussian noise, clipped at ±8%."""
    factor = 1.0 + random.gauss(0.0, NOISE_FRAC)
    factor = max(0.92, min(1.08, factor))
    return round(base * factor, 2)


def main() -> None:
    here = Path(__file__).resolve()
    out_dir = here.parents[1] / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "water_quality.csv"

    # Year-over-year degradation trend for polluted stations
    # Each year: DO drops slightly, BOD/coliform rise slightly
    TREND = {
        2018: {"do_delta": +0.2, "bod_delta": -0.1, "coli_delta": -0.05},
        2019: {"do_delta": +0.1, "bod_delta": -0.05, "coli_delta": -0.02},
        2020: {"do_delta": 0.0, "bod_delta": 0.0, "coli_delta": 0.0},
        2021: {"do_delta": -0.1, "bod_delta": +0.05, "coli_delta": +0.02},
        2022: {"do_delta": -0.2, "bod_delta": +0.10, "coli_delta": +0.05},
    }

    fieldnames = [
        "STATION CODE",
        "LOCATIONS",
        "STATE",
        "YEAR",
        "Temp",
        "D.O. (mg/l)",
        "PH",
        "CONDUCTIVITY (µmhos/cm)",
        "B.O.D. (mg/l)",
        "NITRATE+NITRITE (mg/l)",
        "FECAL COLIFORM (MPN/100ml)",
        "TOTAL COLIFORM (MPN/100ml)",
    ]

    rows = []
    for station in STATIONS:
        for year in YEARS:
            trend = TREND[year]
            rows.append({
                "STATION CODE": station["code"],
                "LOCATIONS": station["location"],
                "STATE": station["state"],
                "YEAR": year,
                "Temp": noise(station["temp"]),
                "D.O. (mg/l)": round(noise(max(0.5, station["do"] + trend["do_delta"])), 2),
                "PH": round(noise(station["ph"]), 2),
                "CONDUCTIVITY (µmhos/cm)": noise(station["cond"]),
                "B.O.D. (mg/l)": round(noise(max(0.1, station["bod"] + trend["bod_delta"])), 2),
                "NITRATE+NITRITE (mg/l)": round(noise(station["nitrate"]), 2),
                "FECAL COLIFORM (MPN/100ml)": round(noise(max(1.0, station["fecal_coli"] * (1 + trend["coli_delta"]))), 0),
                "TOTAL COLIFORM (MPN/100ml)": round(noise(max(1.0, station["total_coli"] * (1 + trend["coli_delta"]))), 0),
            })

    with out_path.open("w", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} rows → {out_path}")


if __name__ == "__main__":
    main()
