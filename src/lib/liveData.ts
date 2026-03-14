/**
 * Live AQI data loader — fetches the JSON snapshot produced by
 * `backend/scripts/fetch_aqi_csv.py` from `/aqi-live.json`.
 *
 * This file is served as a static asset by Vite from the `public/` directory.
 * The snapshot is refreshed whenever the Python fetch script runs (every 60 min).
 */

export interface LiveStation {
  name: string;
  city: string;
  lat: string;
  lon: string;
  last_update: string;
  pollutants: Record<string, { avg: string; min: string; max: string }>;
}

export interface LiveLogEntry {
  date: string;
  row_count: number;
  file_size_bytes: number;
  has_analysis: boolean;
}

export interface LiveAqiRow {
  timestamp: string;
  station_name: string;
  district: string;
  PM10: string;
  'PM2.5': string;
  SO2: string;
  NO2: string;
  source: string;
}

export interface LiveSnapshot {
  fetched_at: string;
  api_total_records: number;
  stations: LiveStation[];
  logs: LiveLogEntry[];
  today: {
    date: string;
    rows: LiveAqiRow[];
    row_count: number;
  };
}

let _cached: LiveSnapshot | null = null;
let _fetchPromise: Promise<LiveSnapshot | null> | null = null;
let _lastFetchTime = 0;

/**
 * Fetch the live AQI snapshot. Caches the result for 60 seconds.
 * Returns null if the snapshot doesn't exist yet (fetch script hasn't run).
 */
export async function fetchLiveSnapshot(forceRefresh = false): Promise<LiveSnapshot | null> {
  const isStale = Date.now() - _lastFetchTime > 60000;
  if (_cached && !forceRefresh && !isStale) return _cached;
  if (_fetchPromise && !forceRefresh && !isStale) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const resp = await fetch('/aqi-live.json?_t=' + Date.now());
      if (!resp.ok) return null;
      const data: LiveSnapshot = await resp.json();
      _cached = data;
      _lastFetchTime = Date.now();
      return data;
    } catch {
      return null;
    }
  })();

  return _fetchPromise;
}

/** Check if live data is available (non-blocking, returns cached state). */
export function hasLiveData(): boolean {
  return _cached !== null;
}

/** Get the cached snapshot without fetching (null if not yet loaded). */
export function getCachedSnapshot(): LiveSnapshot | null {
  return _cached;
}
