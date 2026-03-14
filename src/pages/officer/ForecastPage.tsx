import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { getBytezStatus, runBytezChat } from '../../lib/bytez';
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
  const bytezStatus = getBytezStatus();
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const params = PARAMS_BY_TYPE[pollutionType];
  const [parameter, setParameter] = useState<string>(params[0]);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [aiError, setAiError] = useState<string>('');

  const getLocationName = (id: string) =>
    locations.find((loc) => loc.id === id)?.name || 'Selected location';

  const generateBytezInsight = async (forecastSeries: any[]) => {
    if (!forecastSeries?.length) {
      return 'AI insight unavailable right now.';
    }

    const points = forecastSeries.slice(0, 12).map((p) => ({
      timestamp: p.timestamp,
      point: p.point,
      lower: p.lower,
      upper: p.upper,
    }));

    return runBytezChat([
      {
        role: 'system',
        content:
          'You are an environmental forecasting analyst. Respond with exactly 3 short bullet points: trend summary, risk level with reason, and one actionable recommendation for the next 24 hours.',
      },
      {
        role: 'user',
        content:
          `Location: ${getLocationName(selectedLocation)}\n` +
          `Parameter: ${parameter} (${unit || 'unit'})\n` +
          `Horizon: 48 hours\n` +
          `Forecast sample points: ${JSON.stringify(points)}`,
      },
    ]);
  };

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
      setAiLoading(true);
      setAiInsight('');
      setAiError('');

      Promise.allSettled([
        api.get(`/forecast/${selectedLocation}?parameter=${parameter}`),
        api.get(`/forecast/${selectedLocation}/ai-insight?parameter=${parameter}&hours=48`),
      ])
        .then(async ([forecastResult, insightResult]) => {
          let nextForecastData: any[] = [];

          if (forecastResult.status === 'fulfilled') {
            nextForecastData = forecastResult.value.data || [];
            setForecastData(nextForecastData);
          } else {
            console.error(forecastResult.reason);
            setForecastData([]);
          }

          if (insightResult.status === 'fulfilled') {
            setAiInsight(insightResult.value.data?.insight || '');
          } else {
            console.error(insightResult.reason);
            try {
              const fallbackInsight = await generateBytezInsight(nextForecastData);
              setAiInsight(fallbackInsight);
            } catch (bytezError) {
              console.error(bytezError);
              setAiError(bytezError instanceof Error ? bytezError.message : 'AI insight unavailable right now.');
            }
          }
        })
        .finally(() => {
          setLoading(false);
          setAiLoading(false);
        });
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

          <div className="mt-6 rounded border border-[#d6e4ff] bg-[#f8fbff] p-4">
            <div className="text-sm font-semibold text-[#1a365d] mb-2">AI Forecast Insight (Bytez fallback enabled)</div>
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <span className={`rounded px-2 py-0.5 border ${bytezStatus.configured ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {bytezStatus.configured ? 'Configured' : 'Missing Key'}
              </span>
              <span className="rounded px-2 py-0.5 border bg-blue-50 text-blue-700 border-blue-200">
                {bytezStatus.providerLabel}
              </span>
              <span className="text-gray-500">{bytezStatus.model}</span>
            </div>
            {aiLoading ? (
              <div className="text-sm text-gray-500">Analyzing trend with Claude...</div>
            ) : aiError ? (
              <div className="text-sm text-amber-700">{aiError}</div>
            ) : aiInsight ? (
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{aiInsight}</div>
            ) : (
              <div className="text-sm text-gray-500">No AI insight yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
