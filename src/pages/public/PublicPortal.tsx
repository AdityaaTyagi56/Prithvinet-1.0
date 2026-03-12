import React, { useEffect, useState } from 'react';
import { PollutionMap } from '../../components/map/PollutionMap';
import { api } from '../../lib/api';
import type { PollutionType } from '../../lib/mockData';

interface PublicLocation {
  location_id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  pm25: number;
  recorded_at: string;
}

interface PublicOverview {
  current_aqi: number;
  current_category: string;
  index_label: string;
  forecast: { label: string; aqi: number }[];
  locations: PublicLocation[];
}

interface PublicPortalProps {
  pollutionType: PollutionType;
}

const TYPE_CONFIG: Record<PollutionType, { mapTitle: string; indexTitle: string; forecastTitle: string; scale: string }> = {
  air:   { mapTitle: '📍 Live Air Pollution Heatmap', indexTitle: 'National Air Quality Index', forecastTitle: '3-Day AQI Forecast', scale: 'CPCB AQI Scale' },
  water: { mapTitle: '📍 Water Quality Monitoring Points', indexTitle: 'Water Quality Index', forecastTitle: '3-Day WQI Forecast', scale: 'CPCB WQI Scale' },
  noise: { mapTitle: '📍 Noise Monitoring Network', indexTitle: 'Ambient Noise Level', forecastTitle: '3-Day Noise Forecast', scale: 'CPCB Noise Scale' },
};

export function PublicPortal({ pollutionType }: PublicPortalProps) {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const cfg = TYPE_CONFIG[pollutionType];

  useEffect(() => {
    async function loadOverview() {
      try {
        const res = await api.get(`/public/overview?type=${pollutionType}`);
        setOverview(res.data);
      } catch (error) {
        console.error('Failed to load public overview', error);
      }
    }

    loadOverview();
  }, [pollutionType]);

  const getIndexClass = (val: number) => {
    if (pollutionType === 'water') {
      // WQI: higher = better
      if (val >= 80) return 'aqi-good';
      if (val >= 60) return 'aqi-satisfactory';
      if (val >= 40) return 'aqi-moderate';
      if (val >= 20) return 'aqi-poor';
      return 'aqi-severe';
    }
    if (pollutionType === 'noise') {
      // dB(A): lower = better
      if (val <= 50) return 'aqi-good';
      if (val <= 65) return 'aqi-satisfactory';
      if (val <= 75) return 'aqi-moderate';
      if (val <= 85) return 'aqi-poor';
      return 'aqi-severe';
    }
    // AQI: lower = better
    if (val <= 50) return 'aqi-good';
    if (val <= 100) return 'aqi-satisfactory';
    if (val <= 200) return 'aqi-moderate';
    if (val <= 300) return 'aqi-poor';
    if (val <= 400) return 'aqi-very-poor';
    return 'aqi-severe';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Map Card */}
        <div className="gov-card md:col-span-2 overflow-hidden">
          <div className="gov-card-header">{cfg.mapTitle} — Chhattisgarh Region</div>
          <div className="p-4">
            <PollutionMap locations={overview?.locations || []} />
          </div>
        </div>

        <div className="space-y-6">
          {/* Current Index */}
          <div className="gov-card overflow-hidden">
            <div className="gov-card-header">{cfg.indexTitle}</div>
            <div className="p-6 text-center">
              <div className={`inline-flex items-center justify-center w-28 h-28 rounded-full text-5xl font-bold mb-3 ${overview ? getIndexClass(overview.current_aqi) : 'bg-gray-200 text-gray-500'}`}>
                {overview ? Math.round(overview.current_aqi) : '--'}
              </div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {overview?.index_label || 'AQI'}
              </div>
              <div className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {overview?.current_category || 'Loading...'}
              </div>
              <div className="mt-3 flex justify-center gap-1">
                <span className="w-5 h-2 rounded-sm aqi-good" title="Good" />
                <span className="w-5 h-2 rounded-sm aqi-satisfactory" title="Satisfactory" />
                <span className="w-5 h-2 rounded-sm aqi-moderate" title="Moderate" />
                <span className="w-5 h-2 rounded-sm aqi-poor" title="Poor" />
                <span className="w-5 h-2 rounded-sm aqi-very-poor" title="Very Poor" />
                <span className="w-5 h-2 rounded-sm aqi-severe" title="Severe" />
              </div>
              <div className="text-[10px] text-gray-400 mt-1">{cfg.scale}</div>
            </div>
          </div>

          {/* Forecast */}
          <div className="gov-card overflow-hidden">
            <div className="gov-card-header">{cfg.forecastTitle}</div>
            <div className="p-4 space-y-2">
              {(overview?.forecast || []).map((item) => (
                <div key={item.label} className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-100">
                  <span className="text-gray-700 text-sm">{item.label}</span>
                  <span className={`text-sm font-bold px-2.5 py-0.5 rounded ${getIndexClass(item.aqi)}`}>{Math.round(item.aqi)}</span>
                </div>
              ))}
              {overview && overview.forecast.length === 0 && (
                <div className="text-sm text-gray-400 py-4 text-center">Forecast data not available.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
