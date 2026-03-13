import argparse
import asyncio
import csv
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import httpx
from dotenv import load_dotenv

BASE_URL = "https://api.data.gov.in/resource/{resource_id}"


@dataclass
class DatasetConfig:
    name: str
    resource_id: str
    filters: Dict[str, str]


def load_env() -> str:
    here = Path(__file__).resolve()
    backend_root = here.parents[1]
    project_root = backend_root.parent

    for env_file in (backend_root / ".env", project_root / ".env"):
        if env_file.exists():
            load_dotenv(env_file)

    api_key = os.getenv("GOVAPI_KEY")
    if not api_key:
        raise RuntimeError("GOVAPI_KEY is missing in environment")
    return api_key


def default_datasets() -> List[DatasetConfig]:
    base_resource_id = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
    datasets: List[DatasetConfig] = [
        DatasetConfig(
            name="air_quality_chhattisgarh_all",
            resource_id=base_resource_id,
            filters={"state": "Chhattisgarh"},
        )
    ]

    # More official datasets from the same verified CPCB resource.
    pollutant_ids = ["PM10", "PM2.5", "NO2", "SO2", "CO", "NH3", "OZONE"]
    for pollutant in pollutant_ids:
        safe_name = pollutant.lower().replace(".", "").replace(" ", "")
        datasets.append(
            DatasetConfig(
                name=f"air_quality_chhattisgarh_{safe_name}",
                resource_id=base_resource_id,
                filters={
                    "state": "Chhattisgarh",
                    "pollutant_id": pollutant,
                },
            )
        )

    city_filters = ["Raipur", "Bhilai", "Korba", "Tumidih"]
    for city in city_filters:
        datasets.append(
            DatasetConfig(
                name=f"air_quality_chhattisgarh_{city.lower()}",
                resource_id=base_resource_id,
                filters={
                    "state": "Chhattisgarh",
                    "city": city,
                },
            )
        )

    extra_json = os.getenv("OFFICIAL_DATASETS_JSON", "").strip()
    if extra_json:
        parsed = json.loads(extra_json)
        if not isinstance(parsed, list):
            raise RuntimeError("OFFICIAL_DATASETS_JSON must be a JSON list")
        for item in parsed:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            resource_id = str(item.get("resource_id") or "").strip()
            filters = item.get("filters")
            if not isinstance(filters, dict):
                state_filter = str(item.get("state_filter") or "Chhattisgarh").strip()
                filters = {"state": state_filter}

            normalized_filters: Dict[str, str] = {}
            for k, v in filters.items():
                key = str(k).strip()
                value = str(v).strip()
                if key and value:
                    normalized_filters[key] = value

            if name and resource_id:
                datasets.append(
                    DatasetConfig(
                        name=name,
                        resource_id=resource_id,
                        filters=normalized_filters,
                    )
                )
    return datasets


async def fetch_records(
    *,
    client: httpx.AsyncClient,
    api_key: str,
    resource_id: str,
    filters: Dict[str, str],
    limit: int,
) -> List[Dict[str, Any]]:
    all_rows: List[Dict[str, Any]] = []
    offset = 0

    while True:
        params: Dict[str, Any] = {
            "api-key": api_key,
            "format": "json",
            "limit": limit,
            "offset": offset,
        }
        for key, value in filters.items():
            params[f"filters[{key}]"] = value

        response = None
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = await client.get(
                    BASE_URL.format(resource_id=resource_id),
                    params=params,
                    timeout=httpx.Timeout(45.0),
                )
                response.raise_for_status()
                break
            except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_error = exc
                if attempt == 2:
                    raise
                await asyncio.sleep(1.5 * (attempt + 1))

        if response is None:
            if last_error is not None:
                raise last_error
            raise RuntimeError("Failed to fetch records: unknown error")

        payload = response.json()
        rows = payload.get("records") or []
        if not isinstance(rows, list) or not rows:
            break

        all_rows.extend(rows)
        if len(rows) < limit:
            break
        offset += limit

    return all_rows


def save_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return

    keys = sorted({k for row in rows for k in row.keys()})
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)


def save_manifest(path: Path, manifest: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)


async def run(limit: int) -> None:
    api_key = load_env()
    datasets = default_datasets()

    out_dir = Path(__file__).resolve().parents[1] / "data" / "trusted_sources" / "official"
    out_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    async with httpx.AsyncClient() as client:
        for ds in datasets:
            try:
                rows = await fetch_records(
                    client=client,
                    api_key=api_key,
                    resource_id=ds.resource_id,
                    filters=ds.filters,
                    limit=limit,
                )
            except Exception as exc:
                print(f"Dataset failed: {ds.name} ({exc})")
                print("---")
                continue

            csv_path = out_dir / f"{ds.name}_{timestamp}.csv"
            manifest_path = out_dir / f"{ds.name}_{timestamp}_sources.json"

            save_csv(csv_path, rows)
            save_manifest(
                manifest_path,
                {
                    "name": ds.name,
                    "resource_id": ds.resource_id,
                    "provider": "data.gov.in",
                    "filters": ds.filters,
                    "generated_at_utc": datetime.now(timezone.utc).isoformat(),
                    "row_count": len(rows),
                    "output_csv": str(csv_path),
                },
            )

            print(f"Dataset: {ds.name}")
            print(f"Rows: {len(rows)}")
            print(f"CSV: {csv_path}")
            print(f"Manifest: {manifest_path}")
            print("---")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch official Chhattisgarh datasets from data.gov.in")
    parser.add_argument("--limit", type=int, default=1000, help="Page size per API call")
    args = parser.parse_args()

    asyncio.run(run(limit=args.limit))


if __name__ == "__main__":
    main()
