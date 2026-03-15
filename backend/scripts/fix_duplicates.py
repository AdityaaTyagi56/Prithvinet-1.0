import csv
from pathlib import Path

logs_dir = Path("backend/data/aqi_logs")
for csv_file in logs_dir.glob("*.csv"):
    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    
    unique_rows = {}
    for row in rows:
        key = f"{row.get('station_name')}|{row.get('timestamp')}"
        unique_rows[key] = row
        
    if len(rows) != len(unique_rows):
        print(f"Fixed {csv_file.name}: {len(rows)} down to {len(unique_rows)}")
        with open(csv_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(unique_rows.values())
    else:
        print(f"No duplicates in {csv_file.name}")
