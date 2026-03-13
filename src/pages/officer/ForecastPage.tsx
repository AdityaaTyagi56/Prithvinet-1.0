import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { ForecastChart } from '../../components/charts/ForecastChart';
import { PARAMS_BY_TYPE, UNITS } from '../../lib/mockData';
import type { PollutionType } from '../../lib/mockData';

interface ForecastPageProps {
  pollutionType: PollutionType;
}

const TYPE_LABELS: Record<PollutionType, string> = {
  air: '📈 AI-Powered Air Quality Forecast (48 Hours)',
  water: '📈 AI-Powered Water Quality Forecast (48 Hours)',
  noise: '📈 AI-Powered Noise Level Forecast (48 Hours)',
};

export function ForecastPage({ pollutionType }: ForecastPageProps) {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const params = PARAMS_BY_TYPE[pollutionType];
  const [parameter, setParameter] = useState<string>(params[0]);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset parameter when pollution type changes
  useEffect(() => {
    setParameter(PARAMS_BY_TYPE[pollutionType][0]);
  }, [pollutionType]);

  useEffect(() => {
    api.get(`/locations?type=${pollutionType}`).then(res => {
      setLocations(res.data);
      if (res.data.length > 0) {
        setSelectedLocation(res.data[0].id);
      }
    });
  }, [pollutionType]);

  useEffect(() => {
    if (selectedLocation && parameter) {
      setLoading(true);
      api.get(`/forecast/${selectedLocation}?parameter=${parameter}`)
        .then(res => setForecastData(res.data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [selectedLocation, parameter]);

  const unit = UNITS[parameter] || '';

  return (
    <div className="space-y-6">

      <div className="gov-card overflow-hidden">
        <div className="gov-card-header">{TYPE_LABELS[pollutionType]}</div>
        <div className="p-5">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-600 mb-1">Monitoring Station</label>
              <select 
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full rounded border border-gray-300 bg-white text-gray-800 px-3 py-2 focus:outline-none focus:border-[#1a365d] focus:ring-1 focus:ring-[#1a365d]"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-48">
              <label className="block text-sm font-medium text-gray-600 mb-1">Parameter</label>
              <select 
                value={parameter}
                onChange={(e) => setParameter(e.target.value)}
                className="w-full rounded border border-gray-300 bg-white text-gray-800 px-3 py-2 focus:outline-none focus:border-[#1a365d] focus:ring-1 focus:ring-[#1a365d]"
              >
                {params.map(p => (
                  <option key={p} value={p}>{p} {UNITS[p] ? `(${UNITS[p]})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="h-72 flex items-center justify-center text-gray-400">
              Generating forecast model...
            </div>
          ) : forecastData.length > 0 ? (
            <ForecastChart data={forecastData} parameter={parameter} unit={unit} />
          ) : (
            <div className="h-72 flex items-center justify-center text-gray-400">
              No forecast data available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
