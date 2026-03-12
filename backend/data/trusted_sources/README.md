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
