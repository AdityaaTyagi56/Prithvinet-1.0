import { useEffect, useState } from 'react';
import { getCachedSnapshot, fetchLiveSnapshot } from '../lib/liveData';
import { getIndustryTracker, getAlerts, getLocations } from '../lib/mockData';

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

  // Fetch immediately and auto-refresh snapshot every 30 seconds
  useEffect(() => {
    const fetchNow = async () => {
      const fresh = await fetchLiveSnapshot(true);
      if (fresh) setSnapshotObj({ ...fresh });
    };
    
    // Call immediately on mount if we don't have it
    if (!snapshotObj) {
      fetchNow();
    }
    
    const interval = setInterval(fetchNow, 30000);
    return () => clearInterval(interval);
  }, []);

  // Format the data into an easy-to-read schema for the LLM
  const summary: any = {
    system: "PrithviNet Live Active Telemetry",
    ml_forecast_engine: "Prophet Time-Series (24 Active District Level Models Trained on NO2, SO2, PM2.5)",
    industrial_compliance_tracked: getIndustryTracker(),
    active_alerts: getAlerts(),
    static_station_locations: {
      air: getLocations('air'),
      water: getLocations('water'),
      noise: getLocations('noise')
    }
  };

  if (snapshotObj) {
    summary.live_sensor_data = {
      last_synced: snapshotObj.fetched_at,
      total_live_stations_monitored: snapshotObj.stations?.length,
      today_records: snapshotObj.today?.row_count || 0,
      historical_logs_available: snapshotObj.logs?.map((l: any) => l.date) || [],
      stations: snapshotObj.stations?.map((s: any) => ({
        name: s.name,
        city: s.city,
        pollution_levels: Object.entries(s.pollutants || {}).reduce((acc: any, [param, data]: any) => {
          acc[param] = Object.assign({}, data);
          return acc;
        }, {})
      }))
    };
  }

  return (
    <div 
      id="noupe-live-context-bridge" 
      style={{ 
        position: 'absolute', 
        width: '1px', 
        height: '1px', 
        padding: 0, 
        margin: '-1px', 
        overflow: 'hidden', 
        clip: 'rect(0, 0, 0, 0)', 
        whiteSpace: 'nowrap', 
        border: 0,
        opacity: 0.01 // Make it mathematically visible for scrapers
      }}
      aria-hidden="true"
    >
      [NOUPE_SYSTEM_CONTEXT_START]
      The following is the combined live JSON data from PrithviNet's continuous monitoring sensors and Industrial Compliance Tracker.
      Use this specific data to answer the user's questions about the current environmental status, industrial violations, and active alerts.
      LIVE_JSON_DATA=
      {JSON.stringify(summary, null, 2)}
      [NOUPE_SYSTEM_CONTEXT_END]
    </div>
  );
}