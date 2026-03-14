import { useEffect, useState } from 'react';
import { getCachedSnapshot, fetchLiveSnapshot } from '../lib/liveData';

/**
 * This component acts as a silent data bridge for the Noupe Chatbot.
 * It periodically pulls the latest real-time AQI data from our live snapshot
 * and renders it into a visually hidden DOM element.
 * 
 * When the chatbot scans the current webpage to answer user queries,
 * it will read this hidden text block and gain full context of the latest environmental stats.
 */
export function NoupeDataBridge() {
  const [snapshotObj, setSnapshotObj] = useState(getCachedSnapshot());

  // Auto-refresh snapshot every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const fresh = await fetchLiveSnapshot(true);
      if (fresh) {
        setSnapshotObj({ ...fresh });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!snapshotObj) return null;

  // Format the data into an easy-to-read schema for the LLM
  const summary = {
    system: "PrithviNet Live Active Telemetry",
    last_synced: snapshotObj.fetched_at,
    total_live_stations_monitored: snapshotObj.stations?.length,
    stations: snapshotObj.stations?.map(s => ({
      name: s.name,
      city: s.city,
      pollution_levels: Object.entries(s.pollutants || {}).reduce((acc, [param, data]) => {
        acc[param] = Object.assign({}, data);
        return acc;
      }, {} as Record<string, any>)
    }))
  };

  return (
    <div 
      id="noupe-live-context-bridge" 
      style={{ display: 'none', position: 'absolute', opacity: 0, width: 0, height: 0, overflow: 'hidden' }}
      aria-hidden="true"
    >
      [NOUPE_SYSTEM_CONTEXT_START]
      The following is the live real-time JSON data from PrithviNet's continuous monitoring sensors.
      Use this specific data to answer the user's questions about the current environmental status.
      LIVE_JSON_DATA=
      {JSON.stringify(summary, null, 2)}
      [NOUPE_SYSTEM_CONTEXT_END]
    </div>
  );
}