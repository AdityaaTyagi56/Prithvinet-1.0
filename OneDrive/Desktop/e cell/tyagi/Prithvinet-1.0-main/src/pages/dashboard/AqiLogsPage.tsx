import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { hasLiveData } from '../../lib/liveData';
import {
  Download,
  Brain,
  Calendar,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Shield,
  Lightbulb,
  BarChart3,
  Radio,
} from 'lucide-react';

interface LogEntry {
  date: string;
  row_count: number;
  file_size_bytes: number;
  has_analysis: boolean;
}

interface AqiRow {
  timestamp: string;
  station_name: string;
  district: string;
  PM10: string;
  'PM2.5': string;
  SO2: string;
  NO2: string;
  source: string;
}

interface AiInsight {
  trend: string;
  risk_level: string;
  risk_areas: string[];
  recommendations: string[];
  forecast_context: string;
}

interface PollutantStat {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

interface AnalysisResult {
  date: string;
  generated_at: string;
  aggregates: {
    pollutant_stats: Record<string, PollutantStat>;
    worst_station: string | null;
    worst_value: number | null;
    total_readings: number;
    unique_stations: number;
    unique_districts: number;
  };
  ai_insight: AiInsight;
}

type SortKey = 'timestamp' | 'station_name' | 'district' | 'PM10' | 'PM2.5' | 'SO2' | 'NO2';

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
  unknown: 'bg-gray-100 text-gray-600 border-gray-300',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function pollutantColor(param: string, value: string): string {
  const v = parseFloat(value);
  if (isNaN(v)) return '';
  const limits: Record<string, number> = { PM10: 100, 'PM2.5': 60, SO2: 80, NO2: 80 };
  const limit = limits[param];
  if (!limit) return '';
  if (v > limit) return 'text-red-700 font-semibold bg-red-50';
  if (v > limit * 0.8) return 'text-amber-700 bg-amber-50';
  return 'text-green-700';
}

export function AqiLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [rows, setRows] = useState<AqiRow[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortAsc, setSortAsc] = useState(true);

  // Fetch available log dates
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/aqi-logs/');
        setLogs(res.data.logs || []);
        if (res.data.logs?.length > 0) {
          setSelectedDate(res.data.logs[0].date);
        }
      } catch {
        setLogs([]);
      } finally {
        setLoadingLogs(false);
      }
    })();
  }, []);

  // Fetch rows when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoadingRows(true);
    setAnalysis(null);
    (async () => {
      try {
        const res = await api.get(`/aqi-logs/${selectedDate}`);
        setRows(res.data.rows || []);
      } catch {
        setRows([]);
      } finally {
        setLoadingRows(false);
      }
    })();
  }, [selectedDate]);

  // Sorted rows
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let va: string | number = (a as any)[sortKey] ?? '';
      let vb: string | number = (b as any)[sortKey] ?? '';
      if (['PM10', 'PM2.5', 'SO2', 'NO2'].includes(sortKey)) {
        va = parseFloat(va as string) || 0;
        vb = parseFloat(vb as string) || 0;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const fetchAnalysis = async (regenerate = false) => {
    if (!selectedDate) return;
    setLoadingAnalysis(true);
    try {
      const res = await api.get(`/aqi-logs/${selectedDate}/analysis${regenerate ? '?regenerate=true' : ''}`);
      setAnalysis(res.data);
    } catch {
      setAnalysis(null);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleDownload = () => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    window.open(`${API_URL}/api/v1/aqi-logs/${selectedDate}/download`, '_blank');
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ChevronUp className="h-3 w-3 text-gray-300" />;
    return sortAsc ? <ChevronUp className="h-3 w-3 text-[#14532d]" /> : <ChevronDown className="h-3 w-3 text-[#14532d]" />;
  };

  const selectedLog = logs.find(l => l.date === selectedDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#14532d] flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            AQI Daily Logs
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Hourly AQI readings from CPCB Government API — logged every 60 minutes
            {hasLiveData() && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold uppercase tracking-wide">
                <Radio className="h-3 w-3 animate-pulse" />
                Live Data — data.gov.in
              </span>
            )}
          </p>
        </div>
        {selectedDate && rows.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
            <button
              onClick={() => fetchAnalysis(false)}
              disabled={loadingAnalysis}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#14532d] text-white rounded-lg text-sm font-medium hover:bg-[#0a3a1f] transition-colors shadow-sm disabled:opacity-50"
            >
              <Brain className="h-4 w-4" />
              {loadingAnalysis ? 'Analyzing...' : 'AI Analysis'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left panel: Date list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-[#14532d]" />
                Available Logs
              </h3>
            </div>
            {loadingLogs ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                No AQI logs yet. Logs are created automatically when the government API sync runs.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {logs.map(log => (
                  <button
                    key={log.date}
                    onClick={() => setSelectedDate(log.date)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedDate === log.date
                        ? 'bg-green-50 border-l-3 border-l-[#14532d]'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${selectedDate === log.date ? 'text-[#14532d]' : 'text-gray-800'}`}>
                        {new Date(log.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {log.has_analysis && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">AI</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {log.row_count} readings &middot; {formatBytes(log.file_size_bytes)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Data table + Analysis */}
        <div className="lg:col-span-3 space-y-5">
          {/* Summary cards */}
          {selectedLog && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Date</div>
                <div className="text-lg font-bold text-[#14532d] mt-0.5">{selectedDate}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Total Readings</div>
                <div className="text-lg font-bold text-gray-800 mt-0.5">{rows.length}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Stations</div>
                <div className="text-lg font-bold text-gray-800 mt-0.5">
                  {new Set(rows.map(r => r.station_name)).size}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Districts</div>
                <div className="text-lg font-bold text-gray-800 mt-0.5">
                  {new Set(rows.map(r => r.district)).size}
                </div>
              </div>
            </div>
          )}

          {/* Data table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-[#14532d]" />
                Readings — {selectedDate || 'Select a date'}
              </h3>
              <span className="text-xs text-gray-400">{rows.length} rows</span>
            </div>
            {loadingRows ? (
              <div className="p-12 text-center text-sm text-gray-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gray-300" />
                Loading readings...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">
                No data for this date.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {(
                        [
                          ['timestamp', 'Time'],
                          ['station_name', 'Station'],
                          ['district', 'District'],
                          ['PM10', 'PM10'],
                          ['PM2.5', 'PM2.5'],
                          ['SO2', 'SO2'],
                          ['NO2', 'NO2'],
                        ] as [SortKey, string][]
                      ).map(([key, label]) => (
                        <th
                          key={key}
                          onClick={() => handleSort(key)}
                          className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                        >
                          <span className="flex items-center gap-1">
                            {label}
                            <SortIcon column={key} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap font-mono">
                          {new Date(row.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-800 font-medium whitespace-nowrap">{row.station_name}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{row.district}</td>
                        {(['PM10', 'PM2.5', 'SO2', 'NO2'] as const).map(p => (
                          <td key={p} className={`px-3 py-2 text-xs whitespace-nowrap text-right font-mono ${pollutantColor(p, (row as any)[p])}`}>
                            {parseFloat((row as any)[p])?.toFixed(1) || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI Analysis Card */}
          {analysis && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-1.5">
                  <Brain className="h-4 w-4 text-purple-600" />
                  AI Daily Analysis — {analysis.date}
                </h3>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${RISK_COLORS[analysis.ai_insight?.risk_level || 'unknown']}`}>
                    {(analysis.ai_insight?.risk_level || 'unknown').toUpperCase()} RISK
                  </span>
                  <button
                    onClick={() => fetchAnalysis(true)}
                    disabled={loadingAnalysis}
                    className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                    title="Regenerate analysis"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingAnalysis ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Pollutant Stats Grid */}
                {analysis.aggregates && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(analysis.aggregates.pollutant_stats).map(([param, stat]) => (
                      <div key={param} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                        <div className="text-xs font-semibold text-gray-500">{param}</div>
                        <div className="text-lg font-bold text-gray-800">{stat.avg ?? '—'}</div>
                        <div className="text-[10px] text-gray-400">
                          min {stat.min ?? '—'} / max {stat.max ?? '—'} ({stat.count})
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Trend */}
                {analysis.ai_insight?.trend && (
                  <div className="flex gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Trend Analysis</div>
                      <p className="text-sm text-gray-700 leading-relaxed">{analysis.ai_insight.trend}</p>
                    </div>
                  </div>
                )}

                {/* Risk Areas */}
                {analysis.ai_insight?.risk_areas?.length > 0 && (
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Risk Areas</div>
                      <ul className="space-y-1">
                        {analysis.ai_insight.risk_areas.map((area, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                            <span className="text-amber-400 mt-1">&#9679;</span>
                            {area}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {analysis.ai_insight?.recommendations?.length > 0 && (
                  <div className="flex gap-2">
                    <Lightbulb className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recommendations</div>
                      <ul className="space-y-1">
                        {analysis.ai_insight.recommendations.map((rec, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                            <CheckCircle className="h-3.5 w-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Forecast Context */}
                {analysis.ai_insight?.forecast_context && (
                  <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Forecast Enhancement Context</span>
                    </div>
                    <p className="text-xs text-indigo-800 leading-relaxed">{analysis.ai_insight.forecast_context}</p>
                  </div>
                )}

                {/* Generated timestamp */}
                <div className="text-[10px] text-gray-400 text-right pt-1 border-t border-gray-100">
                  Generated: {new Date(analysis.generated_at).toLocaleString('en-IN')}
                  {analysis.aggregates?.worst_station && (
                    <> &middot; Worst station: {analysis.aggregates.worst_station} ({analysis.aggregates.worst_value})</>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
