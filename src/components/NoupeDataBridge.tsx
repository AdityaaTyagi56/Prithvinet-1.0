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
  
  // Dynamically map Government API station pollutants to Private Industries in the same district
  const dynamicIndustries = getIndustryTracker().map(industry => {
    const copy = { ...industry, live_emissions: { ...industry.live_emissions } };
    
    if (snapshotObj && snapshotObj.stations) {
      // Find a matching active government station for this industry's region
      const matchingStation = snapshotObj.stations.find((s: any) => {
        const sCity = (s.city || "").toLowerCase();
        const iRegion = (industry.region || "").toLowerCase();
        return sCity === iRegion || (iRegion === 'durg' && sCity === 'bhilai');
      });

      if (matchingStation && matchingStation.pollutants) {
        // Override mock data with real-time API values if available
        const p = matchingStation.pollutants;
        if (p['PM2.5']?.avg && !isNaN(parseFloat(p['PM2.5'].avg))) copy.live_emissions['PM2.5'] = parseFloat(p['PM2.5'].avg);
        if (p['PM10']?.avg && !isNaN(parseFloat(p['PM10'].avg))) copy.live_emissions['PM10'] = parseFloat(p['PM10'].avg);
        if (p['SO2']?.avg && !isNaN(parseFloat(p['SO2'].avg))) copy.live_emissions['SO2'] = parseFloat(p['SO2'].avg);
        if (p['NO2']?.avg && !isNaN(parseFloat(p['NO2'].avg))) copy.live_emissions['NO2'] = parseFloat(p['NO2'].avg);
      }
    }
    return copy;
  });

  const summary: any = {
    system: "PrithviNet Live Active Telemetry",
    ml_forecast_engine: "Prophet Time-Series (24 Active District Level Models Trained on NO2, SO2, PM2.5)",
    industrial_compliance_tracked: dynamicIndustries,
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