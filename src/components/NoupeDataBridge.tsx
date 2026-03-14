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
  
  // Also push to global window object just in case Noupe's scraper prefers executing JS directly
  useEffect(() => {
    (window as any).__PRITHVINET_NOUPE_LIVE_CONTEXT__ = summary;
  }, [summary]);

  return (
    <div 
      id="noupe-live-context-bridge" 
      style={{ 
        position: 'absolute', 
        width: '100%', 
        height: '100%', 
        top: 0,
        left: 0,
        zIndex: -9999, // Push physically behind all content
        opacity: 0.001, // Make it mathematically visible but invisible to eye
        pointerEvents: 'none', // Prevent interactions
        color: 'transparent' // Ensure text cannot be highlighted
      }}
      aria-hidden="false" // Purposely keep explicitly false so AI tools parsing accessibility trees don't ignore it
    >
      <h1>PRITHVINET ACTIVE LIVE DATABASE FOR NOUPE SYSTEM CONTEXT - READ IMMEDIATELY</h1>
      <pre id="noupe-data-string">
{JSON.stringify(summary, null, 2)}
      </pre>
    </div>
  );
}