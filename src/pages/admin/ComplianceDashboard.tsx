import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle, XCircle, Factory, FileText, Download,
  ChevronDown, ChevronUp, Search, Filter, Eye,
} from 'lucide-react';
import { api } from '../../lib/api';
import { hasLiveData, getCachedSnapshot } from '../../lib/liveData';
import {
  type PollutionType, type IndustryData,
  PARAMS_BY_TYPE, UNITS, LIMITS, getLatestReadings,
} from '../../lib/mockData';

/* ── Types ── */
interface ViolationRow {
  industry: string;
  violation_type: string;
  date: string | null;
  severity: string;
  status: string;
}

interface ComplianceMetrics {
  total_industries: number;
  compliant_industries: number;
  active_violations: number;
  pending_escalations: number;
  pollution_type: string;
  recent_violations: ViolationRow[];
}

interface EmissionReading {
  parameter: string;
  value: number;
  limit: number;
  unit: string;
  exceeded: boolean;
}

interface ComplianceDashboardProps {
  pollutionType: PollutionType;
}

/* ── Helpers ── */
const TYPE_LABELS: Record<PollutionType, string> = {
  air: 'Air Emission Compliance',
  water: 'Effluent Discharge Compliance',
  noise: 'Noise Level Compliance',
};

const TYPE_ICONS: Record<PollutionType, string> = {
  air: '🌬️',
  water: '💧',
  noise: '🔊',
};

function overallStatus(ind: IndustryData): 'red' | 'yellow' | 'green' {
  const statuses = [ind.air_status, ind.water_status, ind.noise_status];
  if (statuses.includes('non-compliant')) return 'red';
  if (statuses.includes('warning')) return 'yellow';
  return 'green';
}

const STATUS_CONFIG = {
  red: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', dot: 'bg-red-500', label: 'Non-Compliant' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', dot: 'bg-yellow-500', label: 'Warning' },
  green: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', dot: 'bg-green-500', label: 'Compliant' },
};

function getEmissionReadings(industry: IndustryData, type: PollutionType): EmissionReading[] {
  let readings = getLatestReadings(industry.id.replace('ind-', 'air-'), type);

  // Live Data Override for Air readings
  if (type === 'air' && hasLiveData()) {
    const snapshot = getCachedSnapshot();
    if (snapshot && snapshot.stations) {
      // Find the best station by matching industry's region/city
      const regionMatch = industry.region.toLowerCase();
      let activeStats = snapshot.stations.find(s => 
        s.city.toLowerCase().includes(regionMatch) || 
        s.name.toLowerCase().includes(regionMatch)
      );
      
      // Fallback if no exact regional match
      if (!activeStats) activeStats = snapshot.stations.find(r => r.city === 'Bhilai' || r.city === 'Raipur') || snapshot.stations[0];

      if (activeStats && activeStats.pollutants) {
        // Use EXACT active API values for the region
        readings = readings.map((r) => {
          let liveVal = r.value;
          const p = r.parameter.toLowerCase();
          
          if (p.includes('pm2.5') && activeStats?.pollutants['PM2.5']) liveVal = parseFloat(activeStats.pollutants['PM2.5'].avg);
          else if (p.includes('pm10') && activeStats?.pollutants['PM10']) liveVal = parseFloat(activeStats.pollutants['PM10'].avg);
          else if (p.includes('so2') && activeStats?.pollutants['SO2']) liveVal = parseFloat(activeStats.pollutants['SO2'].avg);
          else if (p.includes('no2') && activeStats?.pollutants['NO2']) liveVal = parseFloat(activeStats.pollutants['NO2'].avg);
          else if (p.includes('co') && activeStats?.pollutants['CO']) liveVal = parseFloat(activeStats.pollutants['CO'].avg);
          else if (p.includes('o3') && activeStats?.pollutants['OZONE']) liveVal = parseFloat(activeStats.pollutants['OZONE'].avg);

          return { ...r, value: isNaN(liveVal) ? r.value : liveVal };
        });
      }
    }
  }

  return readings.map(r => ({
    parameter: r.parameter,
    value: r.value,
    limit: LIMITS[r.parameter] ?? 0,
    unit: UNITS[r.parameter] ?? '',
    exceeded: r.parameter === 'pH'
      ? (r.value < 6.5 || r.value > 8.5)
      : r.parameter === 'DO'
        ? r.value < LIMITS[r.parameter]
        : r.value > LIMITS[r.parameter],
  }));
}

function generateReport(ind: IndustryData, emissions: EmissionReading[], pollutionType: PollutionType) {
  const violations = emissions.filter(e => e.exceeded);
  const status = overallStatus(ind);
  const now = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '         CHHATTISGARH ENVIRONMENT CONSERVATION BOARD          ',
    '          INDUSTRY COMPLIANCE MONITORING REPORT               ',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Report Date       : ${now}`,
    `Report Type       : ${TYPE_LABELS[pollutionType]}`,
    '',
    '── INDUSTRY DETAILS ──────────────────────────────────────────',
    `Name              : ${ind.name}`,
    `Type              : ${ind.type}`,
    `Region            : ${ind.region}`,
    `Consent Valid Till: ${new Date(ind.consent_valid_until).toLocaleDateString('en-IN')}`,
    `Last Inspection   : ${new Date(ind.last_inspection).toLocaleDateString('en-IN')}`,
    `Risk Score        : ${ind.risk_score}/100`,
    `Violations YTD    : ${ind.total_violations_ytd}`,
    '',
    '── COMPLIANCE STATUS ─────────────────────────────────────────',
    `Overall Status    : ${STATUS_CONFIG[status].label.toUpperCase()}`,
    `Air Status        : ${ind.air_status.toUpperCase()}`,
    `Water Status      : ${ind.water_status.toUpperCase()}`,
    `Noise Status      : ${ind.noise_status.toUpperCase()}`,
    '',
    `── EMISSION READINGS vs PERMITTED LIMITS (${pollutionType.toUpperCase()}) ──`,
    '',
    'Parameter'.padEnd(15) + 'Value'.padEnd(12) + 'Limit'.padEnd(12) + 'Unit'.padEnd(12) + 'Status',
    '─'.repeat(65),
  ];

  emissions.forEach(e => {
    const statusText = e.exceeded ? '❌ EXCEEDED' : '✅ WITHIN';
    lines.push(
      e.parameter.padEnd(15) +
      e.value.toFixed(2).padEnd(12) +
      e.limit.toFixed(2).padEnd(12) +
      e.unit.padEnd(12) +
      statusText
    );
  });

  lines.push('');
  if (violations.length > 0) {
    lines.push('── VIOLATIONS DETECTED ───────────────────────────────────────');
    lines.push(`Total Parameters Exceeded: ${violations.length} / ${emissions.length}`);
    lines.push('');
    violations.forEach(v => {
      const pct = ((v.value - v.limit) / v.limit * 100).toFixed(1);
      lines.push(`  • ${v.parameter}: ${v.value} ${v.unit} (limit ${v.limit}) — Exceeded by ${pct}%`);
    });
    lines.push('');
    lines.push('── RECOMMENDED ACTIONS ───────────────────────────────────────');
    lines.push('  1. Issue Show Cause Notice to the industry');
    lines.push('  2. Schedule immediate inspection within 48 hours');
    lines.push('  3. Verify pollution control equipment operations');
    lines.push('  4. Deploy continuous monitoring at boundary');
  } else {
    lines.push('── NO VIOLATIONS DETECTED ────────────────────────────────────');
    lines.push('All parameters within permitted limits. Continue monitoring.');
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  Generated by PrithviNet — Environmental Monitoring System  ');
  lines.push('  CECB, Government of Chhattisgarh | Ministry of Environment ');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/* ── Industry Detail Panel ── */
function IndustryDetailPanel({
  industry,
  pollutionType,
  onClose,
}: {
  industry: IndustryData;
  pollutionType: PollutionType;
  onClose: () => void;
}) {
  const emissions = useMemo(() => getEmissionReadings(industry, pollutionType), [industry, pollutionType]);
  const violations = emissions.filter(e => e.exceeded);
  const status = overallStatus(industry);
  const cfg = STATUS_CONFIG[status];

  const handleDownload = () => {
    const report = generateReport(industry, emissions, pollutionType);
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_report_${industry.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="gov-card overflow-hidden">
      <div className="gov-card-header justify-between">
        <span className="flex items-center gap-2">
          <Factory className="h-4 w-4" />
          {industry.name} — {TYPE_LABELS[pollutionType]}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded px-2 py-1 text-xs transition-colors"
          >
            <Download className="h-3 w-3" /> Report
          </button>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Industry info row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-gray-400 text-xs">Type</div>
            <div className="font-medium text-gray-800">{industry.type}</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Region</div>
            <div className="font-medium text-gray-800">{industry.region}</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Consent Valid</div>
            <div className="font-medium text-gray-800">
              {new Date(industry.consent_valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Overall Status</div>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Emissions vs Limits table */}
        <div className="overflow-x-auto">
          <table className="gov-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th className="text-right">Current Value</th>
                <th className="text-right">Permitted Limit</th>
                <th>Unit</th>
                <th className="text-center">Status</th>
                <th>Deviation</th>
              </tr>
            </thead>
            <tbody>
              {emissions.map(e => {
                const deviation = e.parameter === 'DO'
                  ? ((e.limit - e.value) / e.limit * 100)
                  : ((e.value - e.limit) / e.limit * 100);
                return (
                  <tr key={e.parameter} className={e.exceeded ? 'bg-red-50/60' : ''}>
                    <td className="font-semibold text-gray-800">{e.parameter}</td>
                    <td className={`text-right font-mono ${e.exceeded ? 'text-red-700 font-bold' : 'text-gray-700'}`}>
                      {e.value.toFixed(2)}
                    </td>
                    <td className="text-right font-mono text-gray-500">{e.limit.toFixed(2)}</td>
                    <td className="text-gray-500 text-xs">{e.unit}</td>
                    <td className="text-center">
                      {e.exceeded ? (
                        <span className="badge-critical">EXCEEDED</span>
                      ) : (
                        <span className="badge-low">WITHIN</span>
                      )}
                    </td>
                    <td>
                      {e.exceeded ? (
                        <span className="text-red-600 text-xs font-semibold">+{deviation.toFixed(1)}%</span>
                      ) : (
                        <span className="text-green-600 text-xs">Within range</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Violations summary */}
        {violations.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800 font-semibold text-sm mb-2">
              <AlertTriangle className="h-4 w-4" />
              {violations.length} Parameter{violations.length > 1 ? 's' : ''} Exceeding Permitted Limits
            </div>
            <ul className="space-y-1">
              {violations.map(v => (
                <li key={v.parameter} className="text-red-700 text-xs flex items-center gap-2">
                  <XCircle className="h-3 w-3 flex-shrink-0" />
                  <span><strong>{v.parameter}</strong>: {v.value.toFixed(2)} {v.unit} (limit: {v.limit} {v.unit})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {violations.length === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
              <CheckCircle className="h-4 w-4" />
              All parameters within permitted limits for {pollutionType} domain
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Dashboard ── */
export function ComplianceDashboard({ pollutionType }: ComplianceDashboardProps) {
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null);
  const [industries, setIndustries] = useState<IndustryData[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [sortBy, setSortBy] = useState<'risk' | 'name' | 'violations'>('risk');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.get(`/industries/compliance/metrics?type=${pollutionType}`).then(res => setMetrics(res.data)).catch(console.error);
    api.get('/industries/tracker').then(res => setIndustries(res.data)).catch(console.error);
  }, [pollutionType]);

  // Periodically refresh the data to show predictive shifting
  useEffect(() => {
    if (pollutionType === 'air' && hasLiveData()) {
      const interval = setInterval(() => {
        setTick(t => t + 1); // trigger re-render
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [pollutionType]);

  // Compute per-industry emissions and violation counts
  const industryData = useMemo(() => {
    return industries.map(ind => {
      const emissions = getEmissionReadings(ind, pollutionType);
      const violationCount = emissions.filter(e => e.exceeded).length;
      
      // Inherit properties but optionally make them dynamic
      let modifiedInd = { ...ind };
      
      // Dynamic status based on live violation counts
      if (violationCount > 2) {
         modifiedInd.air_status = 'non-compliant';
         modifiedInd.risk_score = Math.min(100, modifiedInd.risk_score + 15);
      } else if (violationCount > 0) {
         modifiedInd.air_status = 'warning';
      }

      const status = overallStatus(modifiedInd);
      
      return { ...modifiedInd, emissions, violationCount, status };
    });
  }, [industries, pollutionType, tick]);

  // Filter and sort
  const filtered = useMemo(() => {
    let list = industryData;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.type.toLowerCase().includes(q) || i.region.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      list = list.filter(i => i.status === statusFilter);
    }
    list = [...list].sort((a, b) => {
      if (sortBy === 'risk') return b.risk_score - a.risk_score;
      if (sortBy === 'violations') return b.violationCount - a.violationCount;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [industryData, searchQuery, statusFilter, sortBy]);

  // Aggregate totals
  const totals = useMemo(() => {
    const red = industryData.filter(i => i.status === 'red').length;
    const yellow = industryData.filter(i => i.status === 'yellow').length;
    const green = industryData.filter(i => i.status === 'green').length;
    const totalViolations = industryData.reduce((s, i) => s + i.violationCount, 0);
    return { red, yellow, green, totalViolations };
  }, [industryData]);

  const handleGenerateAllReports = () => {
    const allReports = filtered.map(ind => {
      const emissions = getEmissionReadings(ind, pollutionType);
      return generateReport(ind, emissions, pollutionType);
    }).join('\n\n\n');

    const blob = new Blob([allReports], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_report_all_${pollutionType}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="gov-card p-4 text-center">
          <Factory className="h-5 w-5 mx-auto text-[#14532d] mb-1" />
          <div className="text-2xl font-bold text-gray-900">{metrics?.total_industries ?? '--'}</div>
          <div className="text-xs text-gray-500">Total Industries</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-green-500">
          <CheckCircle className="h-5 w-5 mx-auto text-green-600 mb-1" />
          <div className="text-2xl font-bold text-green-700">{totals.green}</div>
          <div className="text-xs text-gray-500">Compliant</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-yellow-500">
          <AlertTriangle className="h-5 w-5 mx-auto text-yellow-600 mb-1" />
          <div className="text-2xl font-bold text-yellow-700">{totals.yellow}</div>
          <div className="text-xs text-gray-500">Warning</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-red-500">
          <XCircle className="h-5 w-5 mx-auto text-red-600 mb-1" />
          <div className="text-2xl font-bold text-red-700">{totals.red}</div>
          <div className="text-xs text-gray-500">Non-Compliant</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-purple-500">
          <div className="text-2xl font-bold text-purple-700">{totals.totalViolations}</div>
          <div className="text-xs text-gray-500">Limit Violations</div>
          <div className="text-[10px] text-gray-400">Real-time readings</div>
        </div>
      </div>

      {/* ── Industry Detail View (when selected) ── */}
      {selectedIndustry && (
        <IndustryDetailPanel
          industry={selectedIndustry}
          pollutionType={pollutionType}
          onClose={() => setSelectedIndustry(null)}
        />
      )}

      {/* ── Industry Compliance Register ── */}
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {TYPE_ICONS[pollutionType]} {TYPE_LABELS[pollutionType]} — Industry Register
          </span>
          <button
            onClick={handleGenerateAllReports}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded px-3 py-1 text-xs transition-colors"
          >
            <Download className="h-3 w-3" /> Download All Reports
          </button>
        </div>

        {/* Filters bar */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, type, or region..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-600 focus:border-green-600"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-green-600"
            >
              <option value="all">All Status</option>
              <option value="green">Compliant</option>
              <option value="yellow">Warning</option>
              <option value="red">Non-Compliant</option>
            </select>
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-green-600"
          >
            <option value="risk">Sort: Risk Score</option>
            <option value="violations">Sort: Violations</option>
            <option value="name">Sort: Name</option>
          </select>
          <div className="text-xs text-gray-400">
            Showing {filtered.length} of {industryData.length} industries
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="gov-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Industry</th>
                <th>Type</th>
                <th>Region</th>
                <th className="text-center">🌬️ Air</th>
                <th className="text-center">💧 Water</th>
                <th className="text-center">🔊 Noise</th>
                <th className="text-center">Limit Violations</th>
                <th>Risk Score</th>
                <th>Consent Valid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ind => {
                const cfg = STATUS_CONFIG[ind.status];
                return (
                  <tr key={ind.id} className={ind.status === 'red' ? 'bg-red-50/40' : ind.status === 'yellow' ? 'bg-yellow-50/40' : ''}>
                    <td>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="font-semibold text-gray-800">{ind.name}</td>
                    <td className="text-xs text-gray-500">{ind.type}</td>
                    <td className="text-sm">{ind.region}</td>
                    <td className="text-center">{statusBadge(ind.air_status)}</td>
                    <td className="text-center">{statusBadge(ind.water_status)}</td>
                    <td className="text-center">{statusBadge(ind.noise_status)}</td>
                    <td className="text-center">
                      {ind.violationCount > 0 ? (
                        <span className="badge-critical">{ind.violationCount} / {PARAMS_BY_TYPE[pollutionType].length}</span>
                      ) : (
                        <span className="badge-low">0 / {PARAMS_BY_TYPE[pollutionType].length}</span>
                      )}
                    </td>
                    <td className="min-w-[100px]">
                      {riskBar(ind.risk_score)}
                    </td>
                    <td className="text-xs">
                      {consentStatus(ind.consent_valid_until)}
                    </td>
                    <td>
                      <button
                        onClick={() => setSelectedIndustry(ind)}
                        className="flex items-center gap-1 text-[#14532d] font-semibold hover:underline text-xs"
                      >
                        <Eye className="h-3 w-3" /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-gray-400 py-8">
                    No industries match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Recent Violations (from compliance API) ── */}
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header">
          <AlertTriangle className="h-4 w-4" />
          Recent Violations — {TYPE_LABELS[pollutionType]}
        </div>
        <div className="overflow-x-auto">
          <table className="gov-table">
            <thead>
              <tr>
                <th>Industry</th>
                <th>Violation Type</th>
                <th>Date</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.recent_violations || []).map((row, idx) => (
                <tr key={`${row.industry}-${idx}`}>
                  <td className="font-medium text-gray-800">{row.industry}</td>
                  <td>{row.violation_type}</td>
                  <td className="text-sm">{row.date || '--'}</td>
                  <td>
                    <span className={
                      row.severity === 'critical' ? 'badge-critical' :
                      row.severity === 'high' ? 'badge-high' :
                      row.severity === 'medium' ? 'badge-medium' :
                      'badge-low'
                    }>{row.severity}</span>
                  </td>
                  <td>
                    <span className={`text-xs font-semibold ${
                      row.status === 'escalated' ? 'text-red-600' :
                      row.status === 'resolved' ? 'text-green-600' :
                      'text-amber-600'
                    }`}>{row.status.toUpperCase()}</span>
                  </td>
                  <td>
                    <button className="text-[#14532d] font-semibold hover:underline text-sm">
                      {row.status === 'escalated' ? 'Review' : row.status === 'resolved' ? 'Archive' : 'Escalate'}
                    </button>
                  </td>
                </tr>
              ))}
              {metrics && metrics.recent_violations.length === 0 && (
                <tr>
                  <td className="text-gray-400 text-center" colSpan={6}>No active violations recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Shared helpers (from IndustryTracker) ── */
function statusBadge(s: string) {
  const map: Record<string, string> = {
    compliant: 'bg-green-100 text-green-800 border-green-200',
    'non-compliant': 'bg-red-100 text-red-800 border-red-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'n/a': 'bg-gray-100 text-gray-400 border-gray-200',
  };
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${map[s] || map['n/a']}`}>
      {s === 'n/a' ? '—' : s.toUpperCase()}
    </span>
  );
}

function riskBar(score: number) {
  const color = score >= 80 ? 'bg-red-500' : score >= 60 ? 'bg-orange-500' : score >= 40 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold ${score >= 80 ? 'text-red-600' : score >= 60 ? 'text-orange-600' : score >= 40 ? 'text-yellow-600' : 'text-green-600'}`}>
        {score}
      </span>
    </div>
  );
}

function consentStatus(date: string) {
  const diff = new Date(date).getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (days < 0) return <span className="text-red-600 font-semibold">EXPIRED</span>;
  if (days < 60) return <span className="text-amber-600 font-semibold">Expires in {days}d</span>;
  return <span className="text-green-600">{new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>;
}
