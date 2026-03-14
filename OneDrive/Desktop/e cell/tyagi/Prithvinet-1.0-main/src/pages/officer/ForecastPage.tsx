import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { getBytezStatus, runBytezChat } from '../../lib/bytez';
import { ForecastChart } from '../../components/charts/ForecastChart';
import { PARAMS_BY_TYPE, UNITS, getForecastData } from '../../lib/mockData';
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

  const unit = UNITS[parameter] || '';

  const getLocationName = (id: string) =>
    locations.find((loc) => loc.id === id)?.name || 'Selected location';

  const generateBytezForecastData = async (param: string, locName: string, unit: string, currentVal: number | null) => {
    const valContext = currentVal !== null ? `The MUST-HAVE initial anchor reading for right now is ${currentVal} ${unit}. Make sure the forecast smoothly progresses from this base initial value.` : `Make sure it represents a realistic scenario.`;
    
    const prompt = `Generate realistic 48-hour future environmental forecasting data points for ${param} (${unit}) at ${locName}. 
Start from this hour: ${new Date().toISOString()}. ${valContext}
You MUST return ONLY a valid JSON array of 48 objects. Each object MUST have:
"timestamp" (ISO 8601 string, incrementing by 1 hour), "point" (number, realistic forecasted value), "lower" (number, lower bound), "upper" (number, upper bound).
Keep it brief. Do not output any markdown blocks (like \`\`\`json), explanations, or extra text. ONLY raw JSON.`;

    const result = await runBytezChat([
      { role: 'system', content: 'You are an environmental data prediction AI. You output ONLY valid JSON arrays and nothing else.' },
      { role: 'user', content: prompt }
    ]);

    try {
      const match = result.match(/\[\s*\{.*\}\s*\]/s);
      const jsonStr = match ? match[0] : result;
      return JSON.parse(jsonStr);
    } catch (e) {
      console.warn("Bytez forecast JSON unavailable, using demo forecast data.");
      return getForecastData(param);
    }
  };

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

      // Fetch the most recent live data to anchor the prediction
      api.get(`/readings/latest/${selectedLocation}?type=${pollutionType}`)
        .then(res => {
          let currentVal: number | null = null;
          if (res.data?.readings && res.data.readings.length > 0) {
            // Find current reading for the selected parameter
            const match = res.data.readings.find((r: any) => r.parameter === parameter);
            if (match && typeof match.value === 'number') {
              currentVal = match.value;
            }
          }
          return currentVal;
        })
        .catch(err => {
          console.warn("Could not fetch base reading, forecasting without anchor.", err);
          return null;
        })
        .then(currentVal => {
          // We actively predict data using Bytez instead of hardcoded backend, passing the live anchor reading
          return generateBytezForecastData(parameter, getLocationName(selectedLocation), unit, currentVal);
        })
        .then(async (generatedData) => {
          setForecastData(generatedData);
          setLoading(false);
          
          try {
            const fallbackInsight = await generateBytezInsight(generatedData);
            setAiInsight(fallbackInsight);
          } catch (bytezError) {
            console.error(bytezError);
            setAiError(bytezError instanceof Error ? bytezError.message : 'AI insight unavailable right now.');
          }
        })
        .catch(err => {
          console.error(err);
          setForecastData([]);
          setLoading(false);
          setAiError(err.message || "Forecast generation failed");
        })
        .finally(() => {
          setAiLoading(false);
        });
    }
  }, [selectedLocation, parameter, unit]);

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
                className="w-full rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2 focus:outline-none focus:border-green-700 focus:ring-1 focus:ring-green-700"
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
                className="w-full rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2 focus:outline-none focus:border-green-700 focus:ring-1 focus:ring-green-700"
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

          <div className="mt-6 rounded-lg border border-green-200 bg-green-50/30 p-4">
            <div className="text-sm font-semibold text-[#14532d] mb-2">AI Forecast Insight (Bytez fallback enabled)</div>
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
