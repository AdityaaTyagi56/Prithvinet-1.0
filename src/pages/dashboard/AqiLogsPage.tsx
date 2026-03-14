import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { hasLiveData, getCachedSnapshot, fetchLiveSnapshot } from '../../lib/liveData';
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
  Clock,
  ArrowRight,
  Search,
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

interface PollutantStat {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

interface AiInsight {
  trend: string;
  risk_level: string;
  risk_areas: string[];
  recommendations: string[];
  forecast_context: string;
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

interface ForecastPoint {
  time: string;
  label: string;
  PM10: number;
  'PM2.5': number;
  SO2: number;
  NO2: number;
  aqi: number;
  category: string;
}

type SortKey = 'timestamp' | 'station_name' | 'district' | 'PM10' | 'PM2.5' | 'SO2' | 'NO2';

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
  unknown: 'bg-gray-100 text-gray-600 border-gray-300',
};

const AQI_CATEGORIES: [number, string, string][] = [
  [50, 'Good', 'text-green-700 bg-green-50'],
  [100, 'Satisfactory', 'text-lime-700 bg-lime-50'],
  [200, 'Moderate', 'text-amber-700 bg-amber-50'],
  [300, 'Poor', 'text-orange-700 bg-orange-50'],
  [400, 'Very Poor', 'text-red-700 bg-red-50'],
  [500, 'Severe', 'text-red-900 bg-red-100'],
];

function getAqiCategory(aqi: number): { label: string; color: string } {
  for (const [threshold, label, color] of AQI_CATEGORIES) {
    if (aqi <= threshold) return { label, color };
  }
  return { label: 'Severe', color: 'text-red-900 bg-red-100' };
}

/** Sub-index for a single pollutant using CPCB AQI breakpoints. */
function calcSubIndex(param: string, val: number): number {
  const BP: Record<string, [number, number, number, number][]> = {
    'PM2.5': [[0, 30, 0, 50], [31, 60, 51, 100], [61, 90, 101, 200], [91, 120, 201, 300], [121, 250, 301, 400], [251, 500, 401, 500]],
    PM10:    [[0, 50, 0, 50], [51, 100, 51, 100], [101, 250, 101, 200], [251, 350, 201, 300], [351, 430, 301, 400], [431, 600, 401, 500]],
    SO2:     [[0, 40, 0, 50], [41, 80, 51, 100], [81, 380, 101, 200], [381, 800, 201, 300], [801, 1600, 301, 400], [1601, 2000, 401, 500]],
    NO2:     [[0, 40, 0, 50], [41, 80, 51, 100], [81, 180, 101, 200], [181, 280, 201, 300], [281, 400, 301, 400], [401, 600, 401, 500]],
  };
  const ranges = BP[param];
  if (!ranges) return 0;
  for (const [cLo, cHi, iLo, iHi] of ranges) {
    if (val >= cLo && val <= cHi) {
      return Math.round(((iHi - iLo) / (cHi - cLo)) * (val - cLo) + iLo);
    }
  }
  return val > 0 ? 500 : 0;
}

function formatRowTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

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

// Diurnal weight factors: morning rush peaking at 8-9, evening at 18-21, lowest 2-5 AM.
const DIURNAL: Record<number, number> = {
  0: 0.85, 1: 0.78, 2: 0.72, 3: 0.70, 4: 0.72, 5: 0.78,
  6: 0.90, 7: 1.05, 8: 1.18, 9: 1.15, 10: 1.05, 11: 0.95,
  12: 0.90, 13: 0.88, 14: 0.88, 15: 0.92, 16: 1.00, 17: 1.10,
  18: 1.20, 19: 1.22, 20: 1.18, 21: 1.10, 22: 1.00, 23: 0.92,
};

function computeAnalysisFromRows(rows: AqiRow[], dateStr: string): AnalysisResult {
  const pollutants = ['PM10', 'PM2.5', 'SO2', 'NO2'] as const;
  const stats: Record<string, PollutantStat> = {};
  let worstStation = '';
  let worstValue = 0;

  for (const p of pollutants) {
    const vals = rows.map(r => parseFloat((r as any)[p])).filter(v => !isNaN(v) && v > 0);
    stats[p] = {
      count: vals.length,
      avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null,
      min: vals.length ? Math.round(Math.min(...vals) * 10) / 10 : null,
      max: vals.length ? Math.round(Math.max(...vals) * 10) / 10 : null,
    };
  }

  // Find worst station by PM2.5
  for (const r of rows) {
    const v = parseFloat(r['PM2.5']);
    if (!isNaN(v) && v > worstValue) {
      worstValue = Math.round(v * 10) / 10;
      worstStation = r.station_name;
    }
  }

  const pm25Avg = stats['PM2.5'].avg || 0;
  const pm10Avg = stats['PM10'].avg || 0;
  let riskLevel = 'low';
  if (pm25Avg > 90 || pm10Avg > 250) riskLevel = 'critical';
  else if (pm25Avg > 60 || pm10Avg > 150) riskLevel = 'high';
  else if (pm25Avg > 30 || pm10Avg > 80) riskLevel = 'medium';

  const uniqueStations = new Set(rows.map(r => r.station_name));
  const uniqueDistricts = new Set(rows.map(r => r.district));

  // Build risk_areas from actual exceedances
  const riskAreas: string[] = [];
  const stationPm25: Record<string, number[]> = {};
  for (const r of rows) {
    const v = parseFloat(r['PM2.5']);
    if (!isNaN(v)) {
      (stationPm25[r.station_name] ||= []).push(v);
    }
  }
  for (const [stn, vals] of Object.entries(stationPm25)) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg > 60) {
      riskAreas.push(`${stn}: average PM2.5 at ${avg.toFixed(1)} µg/m³ — exceeds NAAQS 24h standard of 60`);
    }
  }
  const so2Max = stats.SO2.max || 0;
  if (so2Max > 60) {
    riskAreas.push(`SO2 peak of ${so2Max} µg/m³ detected — approaching CPCB prescribed limit of 80`);
  }
  if (riskAreas.length === 0 && riskLevel !== 'low') {
    riskAreas.push(`Multiple stations report elevated particulate matter across ${uniqueDistricts.size} districts`);
  }

  // Build recommendations based on actual data
  const recs: string[] = [];
  if (worstValue > 60) recs.push(`Increase monitoring frequency at ${worstStation} — highest PM2.5 recorded at ${worstValue} µg/m³`);
  if (pm25Avg > 40) recs.push(`Issue public advisory for sensitive groups in areas with PM2.5 above 60 µg/m³`);
  if (pm10Avg > 100) recs.push(`Deploy mobile monitoring for continuous PM10 sampling in worst-affected districts`);
  if (so2Max > 50) recs.push(`Coordinate emission audit near industrial installations contributing to SO2 levels`);
  if (recs.length === 0) recs.push('All parameters within safe limits — continue routine monitoring');

  const trend = pm25Avg > 60
    ? `PM2.5 levels average ${pm25Avg.toFixed(1)} µg/m³ across ${uniqueStations.size} stations — above the NAAQS 24h standard. PM10 averages ${pm10Avg.toFixed(1)} µg/m³. Industrial areas and traffic corridors show the highest concentrations.`
    : `Air quality is ${riskLevel === 'low' ? 'within safe limits' : 'moderate'} with PM2.5 averaging ${pm25Avg.toFixed(1)} µg/m³ and PM10 at ${pm10Avg.toFixed(1)} µg/m³ across ${uniqueStations.size} monitored stations in ${uniqueDistricts.size} districts.`;

  const forecastContext = `Current ${uniqueStations.size}-station average (PM2.5: ${pm25Avg.toFixed(1)}, PM10: ${pm10Avg.toFixed(1)}) serves as the baseline for 48h projections. ${riskLevel === 'high' || riskLevel === 'critical' ? 'Elevated industrial emissions should be weighted higher in forecasts.' : 'Stable baseline suggests minimal deviation in short-term forecasts.'}`;

  return {
    date: dateStr,
    generated_at: new Date().toISOString(),
    aggregates: {
      pollutant_stats: stats,
      worst_station: worstStation || null,
      worst_value: worstValue || null,
      total_readings: rows.length,
      unique_stations: uniqueStations.size,
      unique_districts: uniqueDistricts.size,
    },
    ai_insight: {
      trend,
      risk_level: riskLevel,
      risk_areas: riskAreas,
      recommendations: recs,
      forecast_context: forecastContext,
    },
  };
}

function generateForecast(rows: AqiRow[]): ForecastPoint[] {
  if (rows.length === 0) return [];

  const pollutants = ['PM10', 'PM2.5', 'SO2', 'NO2'] as const;
  // Compute current station-wide averages
  const avgs: Record<string, number> = {};
  for (const p of pollutants) {
    const vals = rows.map(r => parseFloat((r as any)[p])).filter(v => !isNaN(v) && v > 0);
    avgs[p] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  // Determine base hour from latest row timestamp
  const latestTs = rows.reduce((latest, r) => {
    const t = new Date(r.timestamp).getTime();
    return t > latest ? t : latest;
  }, 0);
  const baseDate = latestTs > 0 ? new Date(latestTs) : new Date();

  // Forecast at +3h, +6h, +12h, +24h, +48h
  const offsets = [3, 6, 12, 24, 48];
  const points: ForecastPoint[] = [];

  for (const h of offsets) {
    const forecastTime = new Date(baseDate.getTime() + h * 3600000);
    const hour = forecastTime.getHours();
    const diurnalFactor = DIURNAL[hour] ?? 1.0;
    // Add slight random drift (±5%) seeded by offset to keep deterministic per render
    const drift = 1 + (((h * 7 + 3) % 11) - 5) / 100;

    const pm10 = Math.round(avgs.PM10 * diurnalFactor * drift * 10) / 10;
    const pm25 = Math.round(avgs['PM2.5'] * diurnalFactor * drift * 10) / 10;
    const so2 = Math.round(avgs.SO2 * diurnalFactor * drift * 10) / 10;
    const no2 = Math.round(avgs.NO2 * diurnalFactor * drift * 10) / 10;

    // AQI = max of sub-indices
    const aqi = Math.max(
      calcSubIndex('PM2.5', pm25),
      calcSubIndex('PM10', pm10),
      calcSubIndex('SO2', so2),
      calcSubIndex('NO2', no2),
    );

    const cat = getAqiCategory(aqi);
    points.push({
      time: forecastTime.toISOString(),
      label: `+${h}h`,
      PM10: pm10,
      'PM2.5': pm25,
      SO2: so2,
      NO2: no2,
      aqi,
      category: cat.label,
    });
  }

  return points;
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
  const [searchQuery, setSearchQuery] = useState('');

  const [snapshotObj, setSnapshotObj] = useState(getCachedSnapshot());
  const snap = snapshotObj;

  // Auto-refresh snapshot every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const fresh = await fetchLiveSnapshot(true);
      if (fresh) {
        setSnapshotObj({ ...fresh });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchedAt = snap?.fetched_at ? new Date(snap.fetched_at) : null;

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

  // Filtered and Sorted rows
  const sortedRows = useMemo(() => {
    let copy = [...rows];
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      copy = copy.filter(r => 
        r.station_name.toLowerCase().includes(q) || 
        r.district.toLowerCase().includes(q)
      );
    }

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
  }, [rows, sortKey, sortAsc, searchQuery]);

  // Forecast computed from current rows
  const forecast = useMemo(() => generateForecast(rows), [rows]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const runAnalysis = () => {
    if (rows.length === 0) return;
    setLoadingAnalysis(true);
    // Simulate short computation delay
    setTimeout(() => {
      setAnalysis(computeAnalysisFromRows(rows, selectedDate));
      setLoadingAnalysis(false);
    }, 400);
  };

  const handleDownload = () => {
    if (rows.length === 0) return;
    const headers = ['Timestamp', 'Station', 'District', 'PM10', 'PM2.5', 'SO2', 'NO2', 'Source'];
    const csvLines = [
      headers.join(','),
      ...sortedRows.map(r => [
        `"${formatRowTime(r.timestamp)}"`,
        `"${r.station_name}"`,
        `"${r.district}"`,
        r.PM10,
        r['PM2.5'],
        r.SO2,
        r.NO2,
        r.source,
      ].join(',')),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aqi_logs_${selectedDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ChevronUp className="h-3 w-3 text-gray-300" />;
    return sortAsc ? <ChevronUp className="h-3 w-3 text-[#14532d]" /> : <ChevronDown className="h-3 w-3 text-[#14532d]" />;
  };

  const selectedLog = logs.find(l => l.date === selectedDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#14532d] flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            AQI Daily Logs
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            AQI readings from CPCB Government API (data.gov.in)
            {hasLiveData() && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold uppercase tracking-wide">
                <Radio className="h-3 w-3 animate-pulse" />
                Live Data
              </span>
            )}
            {fetchedAt && (
              <span className="ml-2 text-xs text-gray-400">
                Last synced: {fetchedAt.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
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
              onClick={runAnalysis}
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

        {/* Right panel: Data table + Forecast + Analysis */}
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
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-[#14532d]" />
                Readings — {selectedDate || 'Select a date'}
              </h3>
              
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search station or district..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#14532d] focus:border-[#14532d] w-full sm:w-56"
                  />
                </div>
                <span className="text-xs text-gray-400">{sortedRows.length} rows</span>
              </div>
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
                          {formatRowTime(row.timestamp)}
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

          {/* AQI Forecast */}
          {forecast.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-blue-600" />
                  48hr AQI Forecast — based on current readings
                </h3>
                <span className="text-[10px] text-blue-500">Diurnal pattern applied</span>
              </div>
              <div className="p-4">
                {/* Forecast cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  {forecast.map(fp => {
                    const cat = getAqiCategory(fp.aqi);
                    return (
                      <div key={fp.label} className="border border-gray-200 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
                          <ArrowRight className="h-3 w-3" />
                          {fp.label}
                        </div>
                        <div className="text-xs text-gray-500 mb-2">
                          {new Date(fp.time).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                        </div>
                        <div className={`text-2xl font-bold ${cat.color} rounded-lg py-1`}>{fp.aqi}</div>
                        <div className={`text-[10px] font-semibold mt-1 ${cat.color} rounded px-1.5 py-0.5 inline-block`}>{cat.label}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Forecast detail table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-semibold">Time</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-semibold">PM2.5</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-semibold">PM10</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-semibold">SO2</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-semibold">NO2</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-semibold">AQI</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-semibold">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {forecast.map(fp => {
                        const cat = getAqiCategory(fp.aqi);
                        return (
                          <tr key={fp.label} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-gray-600">
                              {new Date(fp.time).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                              <span className="ml-1.5 text-blue-500 font-semibold">{fp.label}</span>
                            </td>
                            <td className={`px-3 py-2 text-right font-mono ${pollutantColor('PM2.5', String(fp['PM2.5']))}`}>{fp['PM2.5']}</td>
                            <td className={`px-3 py-2 text-right font-mono ${pollutantColor('PM10', String(fp.PM10))}`}>{fp.PM10}</td>
                            <td className={`px-3 py-2 text-right font-mono ${pollutantColor('SO2', String(fp.SO2))}`}>{fp.SO2}</td>
                            <td className={`px-3 py-2 text-right font-mono ${pollutantColor('NO2', String(fp.NO2))}`}>{fp.NO2}</td>
                            <td className="px-3 py-2 text-right font-bold">{fp.aqi}</td>
                            <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cat.color}`}>{cat.label}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

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
                    onClick={runAnalysis}
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
                        <div className="text-lg font-bold text-gray-800">{stat.avg?.toFixed(1) ?? '—'}</div>
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
