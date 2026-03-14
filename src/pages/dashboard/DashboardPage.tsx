import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAlertStore } from '../../store/alertStore';
import { useReadingsStore } from '../../store/readingsStore';
import { AlertTriangle, Activity } from 'lucide-react';
import { api } from '../../lib/api';
import { getLatestReadings, PARAMS_BY_TYPE, UNITS, LIMITS } from '../../lib/mockData';
import type { PollutionType } from '../../lib/mockData';
import { useInterpolatedValue } from '../../hooks/useInterpolatedValue';
import type { Reading } from '../../store/readingsStore';
import { getCachedSnapshot } from '../../lib/liveData';

interface LocationItem {
  id: string;
  name: string;
}

interface DashboardPageProps {
  pollutionType: PollutionType;
}

const TYPE_LABELS: Record<PollutionType, string> = {
  air: '🌬️ Air Quality — Continuous Emission Monitoring',
  water: '💧 Water Quality — Effluent & River Monitoring',
  noise: '🔊 Noise Level — Ambient Sound Monitoring',
};

function getStatusColor(param: string, value: number): string {
  const limit = LIMITS[param] || 100;
  if (param === 'pH') {
    if (value < 6.5 || value > 8.5) return 'text-red-600';
    if (value < 6.8 || value > 8.2) return 'text-amber-600';
    return 'text-green-600';
  }
  if (param === 'DO') {
    if (value < limit) return 'text-red-600';
    if (value < limit * 1.3) return 'text-amber-600';
    return 'text-green-600';
  }
  if (value > limit) return 'text-red-600';
  if (value > limit * 0.75) return 'text-amber-600';
  return 'text-green-600';
}

const SkeletonCard = () => (
  <div className="bg-gray-50 p-4 rounded border border-gray-200 animate-pulse">
    <div className="h-3 w-12 bg-gray-200 rounded mb-3" />
    <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
    <div className="h-2 w-20 bg-gray-100 rounded" />
  </div>
);

const ReadingCard = React.memo(function ReadingCard({
  param,
  reading,
}: {
  param: string;
  reading: Reading | undefined;
}) {
  const rawValue = reading?.value ?? null;
  const smoothValue = useInterpolatedValue(rawValue, 4800);
  const unit = UNITS[param] || '';
  const limit = LIMITS[param];

  return (
    <div className="bg-gray-50 p-4 rounded border border-gray-200 hover:shadow transition-shadow">
      <div className="flex justify-between items-start">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{param}</p>
        <Activity className="text-[#14532d]/40 h-4 w-4" />
      </div>
      <h3 className={`text-2xl font-bold mt-2 transition-colors duration-300 ${smoothValue != null ? getStatusColor(param, smoothValue) : 'text-gray-300'}`}>
        {smoothValue != null ? smoothValue.toFixed(1) : '--'}
      </h3>
      <div className="text-[10px] text-gray-400 mt-1">
        {unit} {limit ? `(Limit: ${limit})` : ''}
      </div>
      <div className="mt-2 text-[10px] text-gray-400">
        {reading ? new Date(reading.recorded_at).toLocaleTimeString() : 'Awaiting data...'}
      </div>
    </div>
  );
});

export function DashboardPage({ pollutionType }: DashboardPageProps) {
  const alerts = useAlertStore(state => state.alerts);
  const latestReadings = useReadingsStore(state => state.latestReadings);
  const addReading = useReadingsStore(state => state.addReading);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');

  /**
   * Tracks the current value per parameter so every 5s tick applies a tiny
   * random-walk step (±0.8%) rather than re-randomizing from a fixed base.
   * This eliminates the visual jump that occurred when values jumped ±15% independently.
   */
  const currentValuesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await api.get(`/locations?type=${pollutionType}`);
        const fetched = (res.data || []).map((loc: any) => ({ id: loc.id, name: loc.name }));
        setLocations(fetched);
        if (fetched.length > 0) {
          setSelectedLocationId(fetched[0].id);
        }
      } catch (error) {
        console.error('Failed to load locations', error);
      }
    }

    loadLocations();
  }, [pollutionType]);

  // Load initial readings and use actual live data for all air stations
  useEffect(() => {
    if (!selectedLocationId) return;

    let initial: Reading[] = [];
    
    // For ALL air stations, use live CPCB snapshot data where possible
    if (pollutionType === 'air') {
      const snap = getCachedSnapshot();
      if (snap?.stations?.length) {
        
        let targetStation = snap.stations[0];
        
        // Find specific live station (if starts with live-)
        if (selectedLocationId.startsWith('live-')) {
          const idx = parseInt(selectedLocationId.replace('live-', ''), 10);
          targetStation = snap.stations[idx] || targetStation;
        } else {
          // Attempt name mapping for mock stations
          const locName = locations.find(l => l.id === selectedLocationId)?.name.toLowerCase() || '';
          const match = snap.stations.find(s => locName.includes(s.city.toLowerCase()) || s.city.toLowerCase().includes(locName));
          if (match) targetStation = match;
        }

        if (targetStation?.pollutants) {
          const pidAlias: Record<string, string> = {
            'PM2.5': 'PM2.5', 'PM10': 'PM10', 'SO2': 'SO2',
            'NO2': 'NO2', 'CO': 'CO', 'OZONE': 'O3', 'NH3': 'NH3',
          };
          
          const liveReadings: Reading[] = Object.entries(targetStation.pollutants)
            .map(([pid, vals]: [string, any]) => {
              const param = pidAlias[pid] || pid;
              const val = parseFloat(vals?.avg || '0');
              return val > 0 ? {
                location_id: selectedLocationId, parameter_id: param, parameter: param,
                value: val, recorded_at: targetStation.last_update,
              } : null;
            })
            .filter((r): r is Reading => r !== null);
            
          if (liveReadings.length > 0) initial = liveReadings;
        }
      }
    }
    
    if (initial.length === 0) {
      initial = getLatestReadings(selectedLocationId, pollutionType);
    }

    const now = new Date().toISOString();
    initial.forEach(r => {
      currentValuesRef.current[r.parameter] = r.value;
      addReading({ ...r, recorded_at: now });
    });

    // Real alerts checking based on actual data
    const alertStore = useAlertStore.getState();
    const activeAlerts = alertStore.alerts.filter(a => a.status === 'active' && a.location_id === selectedLocationId);
    
    // Clear any previous mock alerts for this location to prevent fake data
    activeAlerts.forEach(a => {
        if(a.id.startsWith('alert-')) useAlertStore.setState({ alerts: alertStore.alerts.filter(al => al.id !== a.id) });
    });

    initial.forEach(r => {
      const limit = LIMITS[r.parameter];
      if (limit && r.value > limit) {
         alertStore.addAlert({
            id: `live-alert-${r.parameter}-${selectedLocationId}`,
            type: 'threshold_breach',
            location_id: selectedLocationId,
            industry_id: 'auto-sys',
            parameter_id: r.parameter,
            value: r.value,
            threshold: limit,
            severity: r.value > limit * 1.5 ? 'critical' : 'high',
            status: 'active',
         });
      }
    });

    // Gentle polling for new state, without random jumping
    // We simply keep reading fresh values when API data updates
    const interval = setInterval(() => {
        // Just trigger re-adds so interpolations and timers stay fresh.
        // Let the actual backend script updates give us new numbers!
        initial.forEach(r => {
            addReading({
                ...r,
                recorded_at: new Date().toISOString()
            });
        });
    }, 60000);

    return () => clearInterval(interval);
  }, [selectedLocationId, pollutionType, locations]);

  const selectedLocation = useMemo(
    () => locations.find(l => l.id === selectedLocationId),
    [locations, selectedLocationId]
  );

  const activeStationAlerts = useMemo(
    () => alerts.filter(a => a.location_id === selectedLocationId && a.status === 'active'),
    [alerts, selectedLocationId]
  );

  const locationReadings = selectedLocationId ? latestReadings[selectedLocationId] || {} : {};
  const params = PARAMS_BY_TYPE[pollutionType];

  const dataReady = locations.length > 0 && selectedLocationId !== '';

  return (
    <div className="space-y-6">
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header flex items-center justify-between">
          <span>{TYPE_LABELS[pollutionType]} — Live Telemetry</span>
          <select
            className="rounded border border-white/30 px-3 py-1 text-sm bg-white/10 text-white focus:outline-none"
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
          >
            {locations.length === 0 && <option value="">Loading stations...</option>}
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id} className="text-gray-800">{loc.name}</option>
            ))}
          </select>
        </div>

        <div className="p-5">
          {selectedLocation && (
            <div className="text-sm text-gray-600 mb-4">
              Station: <span className="font-semibold text-[#14532d]">{selectedLocation.name}</span>
              {dataReady ? (
                <span className="ml-2 inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="ml-2 inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  Connecting...
                </span>
              )}
            </div>
          )}

          {activeStationAlerts.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-4 rounded mb-4 flex items-center space-x-3">
              <AlertTriangle className="text-red-600 h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-red-800 font-semibold text-sm">
                  ⚠ ALERT: {activeStationAlerts[0].type.replace('_', ' ').toUpperCase()}
                </p>
                <p className="text-red-600 text-sm">
                  {activeStationAlerts[0].parameter_id} exceeded threshold {activeStationAlerts[0].threshold} {UNITS[activeStationAlerts[0].parameter_id] || ''} — recorded value: {activeStationAlerts[0].value} {UNITS[activeStationAlerts[0].parameter_id] || ''}
                </p>
              </div>
              <span className="badge-critical uppercase">{activeStationAlerts[0].severity}</span>
            </div>
          )}

          <div className={`grid grid-cols-2 md:grid-cols-3 ${params.length > 3 ? 'xl:grid-cols-6' : ''} gap-3`}>
            {!dataReady
              ? params.map(p => <SkeletonCard key={p} />)
              : params.map(param => (
                  <ReadingCard key={param} param={param} reading={locationReadings[param]} />
                ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}
