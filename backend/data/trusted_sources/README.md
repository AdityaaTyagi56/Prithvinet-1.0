# Trusted Dataset Generation

This folder stores generated air-quality datasets pulled from a public source for hackathon demos.

## Source

- Provider: Open-Meteo Air Quality API
- Backing dataset: Copernicus Atmosphere Monitoring Service (CAMS)
- Docs: https://open-meteo.com/en/docs/air-quality-api
- Variables used: `pm2_5`, `nitrogen_dioxide`, `sulphur_dioxide`

## How to Generate

Run from `backend/`:

```bash
.venv311/bin/python generate_trusted_dataset.py --days 30 --import-db --replace-range
```

Options:

- `--days`: Number of past days to fetch (default: 30)
- `--import-db`: Insert generated rows into `sensor_readings`
- `--replace-range`: Delete existing readings in selected date range before import

## Output

Each run creates:

- `air_quality_dataset_<timestamp>.csv`
- `air_quality_dataset_<timestamp>_sources.json`

The JSON manifest records source details and generation metadata for transparency.

## Official Chhattisgarh Dataset (data.gov.in)

Use this script to build a statewide Chhattisgarh air dataset from the official Government of India open data API and optionally import it into the platform DB.

Run from `backend/`:

```bash
python3 scripts/build_official_chhattisgarh_air_dataset.py --import-db
```

Required environment variables:

- `GOVAPI_KEY`
- `DATABASE_URL` (only required when using `--import-db`)

Output files:

- `official_air_chhattisgarh_<timestamp>.csv`
- `official_air_chhattisgarh_<timestamp>_sources.json`

Notes:

- Source API: `https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`
- State filter includes both spellings found in records (`Chhattisgarh` / `Chattisgarh`) by normalized matching.
- Rows are idempotent on import (same station, parameter, timestamp is skipped).

## Multi-Dataset Official Fetch (Process Starter)

To start adding more official datasets (air now, water/others next), use:

```bash
python3 scripts/fetch_official_datasets.py
```

This writes outputs under `backend/data/trusted_sources/official/` with:

- `<dataset_name>_<timestamp>.csv`
- `<dataset_name>_<timestamp>_sources.json`

By default it fetches Chhattisgarh air quality from data.gov.in. To add more datasets without code edits, set:

- `OFFICIAL_DATASETS_JSON` as a JSON array in environment.

Example:

```json
[
	{
		"name": "air_quality_chhattisgarh_pm10",
		"resource_id": "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69",
		"filters": {"state": "Chhattisgarh", "pollutant_id": "PM10"}
	},
	{
		"name": "water_quality_chhattisgarh",
		"resource_id": "<water-resource-id>",
		"filters": {"state": "Chhattisgarh"}
	}
]
```
