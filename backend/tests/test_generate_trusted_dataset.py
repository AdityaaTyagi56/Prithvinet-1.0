from generate_trusted_dataset import LocationInfo, build_rows, parse_coordinates


def test_parse_coordinates_handles_valid_and_invalid_values() -> None:
    assert parse_coordinates("21.2514,81.6296") == (21.2514, 81.6296)
    assert parse_coordinates("bad,coords") is None
    assert parse_coordinates(None) is None


def test_build_rows_maps_payload_to_records() -> None:
    location = LocationInfo(
        id="loc-1",
        name="Central Station",
        latitude=21.25,
        longitude=81.62,
    )
    payload = {
        "hourly": {
            "time": ["2026-03-14T00:00", "2026-03-14T01:00"],
            "pm2_5": [12.1, 13.2],
            "nitrogen_dioxide": [9.0, None],
            "sulphur_dioxide": [3.0, 3.5],
        }
    }

    rows = build_rows(location, payload)

    assert len(rows) == 5
    assert all(r["location_id"] == "loc-1" for r in rows)
    assert all(r["source"] == "open-meteo-cams" for r in rows)
