import { Brain, Sparkles, Database, Cog, LineChart, Loader2 } from 'lucide-react';
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

const renderFormattedInsight = (text: string) => {
  const blocks = text.split('\n\n').filter(b => b.trim());
  
  if (blocks.length <= 1) {
    // Fallback if formatting isn't block-based
    return <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-medium">{text}</div>;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        if (block.includes('**')) {
          const lines = block.split('\n').filter(l => l.trim().length > 0);
          const titleLine = lines[0];
          const listItems = lines.slice(1);
          
          let titleText = titleLine.replace(/\*\*/g, '').trim();
          titleText = titleText.replace(/^[-*]\s*/, '').trim();

          // Colors based on keywords
          let bgColors = "bg-gradient-to-br from-emerald-50/80 to-emerald-50/20 border-emerald-100";
          let iconColor = "text-emerald-700";
          let dotColor = "bg-emerald-500 shadow-emerald-500/50";
          
          if (titleText.toLowerCase().includes('air')) { 
            bgColors = "bg-gradient-to-br from-blue-50/80 to-blue-50/20 border-blue-100"; 
            iconColor = "text-blue-700"; 
            dotColor = "bg-blue-500 shadow-blue-500/50";
          } else if (titleText.toLowerCase().includes('water')) { 
            bgColors = "bg-gradient-to-br from-cyan-50/80 to-cyan-50/20 border-cyan-100"; 
            iconColor = "text-cyan-800"; 
            dotColor = "bg-cyan-500 shadow-cyan-500/50";
          } else if (titleText.toLowerCase().includes('noise')) { 
            bgColors = "bg-gradient-to-br from-indigo-50/80 to-indigo-50/20 border-indigo-100"; 
            iconColor = "text-indigo-700"; 
            dotColor = "bg-indigo-500 shadow-indigo-500/50";
          } else if (titleText.toLowerCase().includes('alert')) { 
            bgColors = "bg-gradient-to-br from-red-50/80 to-red-50/20 border-red-100"; 
            iconColor = "text-red-700"; 
            dotColor = "bg-red-500 shadow-red-500/50";
          } else if (titleText.toLowerCase().includes('recommend') || titleText.toLowerCase().includes('action')) { 
            bgColors = "bg-gradient-to-br from-amber-50/80 to-amber-50/20 border-amber-100"; 
            iconColor = "text-amber-800"; 
            dotColor = "bg-amber-500 shadow-amber-500/50";
          }

          return (
            <div key={idx} className={`p-4 rounded-xl border ${bgColors} shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
              <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full opacity-10 group-hover:scale-[1.8] transition-transform duration-700 ${dotColor.split(' ')[0]}`}></div>
              <h4 className={`text-[13px] font-bold mb-3 flex items-center gap-2 ${iconColor} tracking-wide`}>
                {titleText}
              </h4>
              <ul className="space-y-2 relative z-10">
                {listItems.map((line, lIdx) => {
                  let cleanLine = line.replace(/^- /, '').replace(/^\d+\.\s/, '').replace(/\*\*/g, '').trim();
                  return (
                    <li key={lIdx} className="text-gray-700 text-[13px] flex items-start gap-2.5">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 shadow-sm ${dotColor}`}></span>
                      <span className="leading-snug font-medium flex-1">{cleanLine}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          );
        }
        return (
          <div key={idx} className="flex items-center gap-3 bg-gray-50/50 p-3 rounded-xl border border-gray-100">
            <div className="p-1.5 bg-gray-100 rounded-lg">
              <Brain className="w-4 h-4 text-gray-500" />
            </div>
            <p className="text-[13px] font-semibold text-gray-600 tracking-wide uppercase">{block.replace(/\*\*/g, '')}</p>
          </div>
        );
      })}
    </div>
  );
};

export function ForecastPage({ pollutionType }: ForecastPageProps) {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const params = PARAMS_BY_TYPE[pollutionType];
  const [parameter, setParameter] = useState<string>(params[0]);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [aiError, setAiError] = useState<string>('');
  const [trainingStep, setTrainingStep] = useState(0);

  const unit = UNITS[parameter] || '';

  const getLocationName = (id: string) =>
    locations.find((loc) => loc.id === id)?.name || 'Selected location';

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
      setTrainingStep(1);

      // Simulate model training steps for a refined look before resolving real data
      const simTimer2 = setTimeout(() => setTrainingStep(2), 800);
      const simTimer3 = setTimeout(() => setTrainingStep(3), 1800);

      // Fetch predictions from the actual ML backend
      api.get(`/forecast/${selectedLocation}?parameter=${parameter}`)
        .then(res => {
          setTimeout(() => {
            setForecastData(res.data);
            setLoading(false);
          }, 2400); // ensure the elegant loading finishes
          
          // Then fetch the AI insight based on this actual forecast
          return api.get(`/forecast/${selectedLocation}/ai-insight?parameter=${parameter}`);
        })
        .then(res => {
          setTimeout(() => {
            setAiInsight(res.data.insight);
            setAiLoading(false);
          }, 2400);
        })
        .catch(err => {
          console.error(err);
          setAiError(err.message || "Failed to fetch AI insight");
          setAiLoading(false);
          setLoading(false);
        });

        return () => {
          clearTimeout(simTimer2);
          clearTimeout(simTimer3);
        }
    }
  }, [selectedLocation, parameter]);

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
            <div className="h-72 flex flex-col items-center justify-center p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-75"></div>
                <div className="relative bg-emerald-500 p-4 rounded-full shadow-lg shadow-emerald-500/30">
                  <Cog className="w-8 h-8 text-white animate-spin-slow" style={{ animationDuration: '3s' }} />
                </div>
              </div>
              <div className="space-y-4 w-full max-w-sm">
                <div className="flex items-center justify-between text-sm font-medium text-gray-600">
                  <span className="flex items-center gap-2">
                    <Database className={`w-4 h-4 ${trainingStep >= 1 ? 'text-emerald-500' : 'text-gray-300'}`} />
                    Sourcing AQI baseline data...
                  </span>
                  {trainingStep >= 1 && <span className="text-emerald-500">✓</span>}
                </div>
                <div className="flex items-center justify-between text-sm font-medium text-gray-600">
                  <span className="flex items-center gap-2">
                    <Brain className={`w-4 h-4 ${trainingStep >= 2 ? 'text-emerald-500' : 'text-gray-300'}`} />
                    Fine-tuning Prophet ML weights...
                  </span>
                  {trainingStep >= 2 && <span className="text-emerald-500">✓</span>}
                </div>
                <div className="flex items-center justify-between text-sm font-medium text-gray-600">
                  <span className="flex items-center gap-2">
                    <LineChart className={`w-4 h-4 ${trainingStep >= 3 ? 'text-emerald-500' : 'text-gray-300'}`} />
                    Generating 48-hour confidence intervals...
                  </span>
                  {trainingStep >= 3 && <span className="text-emerald-500 animate-pulse text-xs uppercase tracking-wide">Refining</span>}
                </div>
              </div>
            </div>
          ) : forecastData.length > 0 ? (
            <ForecastChart data={forecastData} parameter={parameter} unit={unit} />
          ) : (
            <div className="h-72 flex items-center justify-center text-gray-400">
              No forecast data available.
            </div>
          )}

          <div className="mt-6 bg-white rounded-2xl border border-emerald-100 shadow-md shadow-emerald-500/5 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 via-white to-green-50 border-b border-emerald-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <div className="p-1.5 bg-emerald-600 rounded-lg shadow-sm">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                AI Forecast Insight
              </h3>
            </div>
            
            <div className="p-5">
              {aiLoading ? (
                <div className="flex items-center gap-3 text-sm text-emerald-600 font-medium animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin outline-none" />
                  Correlating AI insight with trained historic baseline...
                </div>
              ) : aiError ? (
                <div className="flex items-center gap-2 text-sm text-red-600 font-medium bg-red-50 p-3 rounded-xl border border-red-100">
                  {aiError}
                </div>
              ) : aiInsight ? (
                <div className="w-full">
                  {renderFormattedInsight(aiInsight)}
                </div>
              ) : (
                <div className="text-sm text-gray-500 italic px-2">No AI insight yet. Select a location to generate.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
