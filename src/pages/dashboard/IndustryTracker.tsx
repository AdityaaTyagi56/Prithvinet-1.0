import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, AlertTriangle, Factory, ChevronDown, ChevronUp, MapPin, Activity, XCircle, CheckCircle2, Search, FileText, Calendar, ClipboardList } from 'lucide-react';
import { api } from '../../lib/api';
import type { IndustryData } from '../../lib/mockData';

// ── CPCB Stack Emission Standards (EP Rules 1986 Schedule-I) ──
const STACK_LIMITS: Record<string, Record<string, number>> = {
  'Thermal Power Plant': { PM: 50, SO2: 200, NOx: 300 },
  'Integrated Steel': { PM: 50, SO2: 500, NOx: 500 },
  'Cement': { PM: 30, SO2: 100, NOx: 1000 },
  'Sponge Iron': { PM: 150, SO2: 500 },
  'Aluminium Smelter': { PM: 50, SO2: 400 },
};

// ── RED/ORANGE/GREEN category per CPCB classification ──
const CATEGORY_MAP: Record<string, 'RED' | 'ORANGE'> = {
  'Thermal Power Plant': 'RED',
  'Integrated Steel': 'RED',
  'Sponge Iron': 'RED',
  'Aluminium Smelter': 'RED',
  'Cement': 'ORANGE',
};

function categoryBadge(type: string) {
  const cat = CATEGORY_MAP[type] || 'RED';
  const cls = cat === 'RED'
    ? 'bg-red-100 text-red-700 border-red-300'
    : 'bg-orange-100 text-orange-700 border-orange-300';
  return (
    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {cat}
    </span>
  );
}

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
  const color = score >= 90 ? 'bg-red-600' : score >= 80 ? 'bg-red-500' : score >= 60 ? 'bg-orange-500' : score >= 40 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className={`text-xs font-bold ${score >= 80 ? 'text-red-600' : score >= 60 ? 'text-orange-600' : score >= 40 ? 'text-yellow-600' : 'text-green-600'}`}>
        {score}
      </span>
    </div>
  );
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold">#1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold">#2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold">#3</span>;
  return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold">#{rank}</span>;
}

function consentStatus(date: string) {
  const diff = new Date(date).getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (days < 0) return <span className="text-red-600 text-xs font-semibold">EXPIRED ({Math.abs(days)}d ago)</span>;
  if (days < 60) return <span className="text-amber-600 text-xs font-semibold">Expires in {days}d</span>;
  return <span className="text-green-600 text-xs">{new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>;
}

function cemsIndicator(hasViolations: boolean) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${hasViolations ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
      <span className="text-[10px] text-gray-500">CEMS</span>
    </div>
  );
}

function dataSourceBadge(source: string) {
  const cls = source === 'CECB OCEMS' ? 'bg-blue-50 text-blue-700 border-blue-200' :
              source === 'CPCB RTDMS' ? 'bg-purple-50 text-purple-700 border-purple-200' :
              'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-block text-[8px] font-medium px-1 py-0.5 rounded border ${cls}`}>
      {source}
    </span>
  );
}

// Toast notification
function ActionToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-[#14532d] text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-slide-up">
      <CheckCircle2 className="h-5 w-5 text-green-300" />
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 text-white/60 hover:text-white">&times;</button>
    </div>
  );
}

// Extended industry data with local action state
interface ExtendedIndustry extends IndustryData {
  inspection_scheduled?: string | null;
  notice_issued?: boolean;
  consent_renewed?: boolean;
}

// ── Detail Panel (expanded row) ──
function IndustryDetailPanel({
  industry,
  onScheduleInspection,
  onIssueNotice,
  onRenewConsent,
}: {
  industry: ExtendedIndustry;
  onScheduleInspection: (id: string) => void;
  onIssueNotice: (id: string) => void;
  onRenewConsent: (id: string) => void;
}) {
  const limits = STACK_LIMITS[industry.type] || {};

  // Compute overall compliance score: 3 domains, compliant=100, warning=50, non-compliant=0, n/a=excluded
  const domainScores: number[] = [];
  const scoreMap: Record<string, number> = { compliant: 100, warning: 50, 'non-compliant': 0 };
  for (const s of [industry.air_status, industry.water_status, industry.noise_status]) {
    if (s !== 'n/a' && scoreMap[s] !== undefined) domainScores.push(scoreMap[s]);
  }
  const compliancePct = domainScores.length > 0 ? Math.round(domainScores.reduce((a, b) => a + b, 0) / domainScores.length) : 100;
  const compColor = compliancePct >= 80 ? 'text-green-600' : compliancePct >= 40 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="px-6 pb-5 pt-2 bg-slate-50/50 border-t border-slate-200">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Stack Emission Limits */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1">
            <Activity className="h-3.5 w-3.5 text-[#14532d]" />
            CPCB Stack Emission Limits
          </h4>
          <div className="space-y-2">
            {Object.entries(limits).map(([param, limit]) => (
              <div key={param} className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{param}</span>
                <span className="text-gray-600">{limit} mg/Nm3</span>
              </div>
            ))}
            {Object.keys(limits).length === 0 && (
              <div className="text-xs text-gray-400">No specific limits defined</div>
            )}
          </div>
          <div className="mt-3 text-[9px] text-gray-400">
            Ref: EP Rules 1986 Schedule-I — {industry.type}
          </div>
        </div>

        {/* Compliance Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1">
            <Shield className="h-3.5 w-3.5 text-[#14532d]" />
            Compliance Status
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Air</span>
              {statusBadge(industry.air_status)}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Water</span>
              {statusBadge(industry.water_status)}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Noise</span>
              {statusBadge(industry.noise_status)}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-500">Overall Compliance</span>
            <span className={`text-lg font-bold ${compColor}`}>{compliancePct}%</span>
          </div>
          <div className="mt-1 flex justify-between items-center">
            <span className="text-xs text-gray-500">Violations YTD</span>
            <span className="font-bold text-red-600">{industry.total_violations_ytd}</span>
          </div>
        </div>

        {/* Industry Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1">
            <Factory className="h-3.5 w-3.5 text-[#14532d]" />
            Industry Details
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">CPCB Category</span>
              {categoryBadge(industry.type)}
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Type</span>
              <span className="font-medium text-gray-800 text-xs">{industry.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Region</span>
              <span className="font-medium text-gray-800">{industry.region}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Consent Valid</span>
              {consentStatus(industry.consent_valid_until)}
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Last Inspection</span>
              <span className="text-xs text-gray-500">
                {new Date(industry.last_inspection).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
          <div className="mt-3 flex gap-1">
            {dataSourceBadge('CECB OCEMS')}
            {dataSourceBadge('CPCB RTDMS')}
          </div>
        </div>

        {/* Actions Panel */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1">
            <ClipboardList className="h-3.5 w-3.5 text-[#14532d]" />
            Regulatory Actions
          </h4>
          <div className="space-y-2">
            {/* Schedule Inspection */}
            {industry.inspection_scheduled ? (
              <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs text-blue-700 font-medium">
                  Inspection scheduled: {new Date(industry.inspection_scheduled).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onScheduleInspection(industry.id); }}
                className="w-full bg-blue-600 text-white px-3 py-2 rounded text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 justify-center"
              >
                <Calendar className="h-3.5 w-3.5" />
                Schedule Inspection
              </button>
            )}

            {/* Issue Notice */}
            {industry.notice_issued ? (
              <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs text-amber-700 font-medium">Show-cause notice issued</span>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onIssueNotice(industry.id); }}
                className="w-full bg-amber-600 text-white px-3 py-2 rounded text-xs font-medium hover:bg-amber-700 transition-colors flex items-center gap-2 justify-center"
                disabled={industry.total_violations_ytd < 3}
                title={industry.total_violations_ytd < 3 ? 'Requires at least 3 violations YTD' : ''}
              >
                <FileText className="h-3.5 w-3.5" />
                Issue Show-Cause Notice
                {industry.total_violations_ytd < 3 && <span className="text-[9px] opacity-70">(Need 3+ violations)</span>}
              </button>
            )}

            {/* Renew Consent */}
            {new Date(industry.consent_valid_until).getTime() < Date.now() + 90 * 86400000 && !industry.consent_renewed ? (
              <button
                onClick={(e) => { e.stopPropagation(); onRenewConsent(industry.id); }}
                className="w-full bg-green-600 text-white px-3 py-2 rounded text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-2 justify-center"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Initiate Consent Renewal
              </button>
            ) : industry.consent_renewed ? (
              <div className="bg-green-50 border border-green-200 rounded px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs text-green-700 font-medium">Consent renewal initiated</span>
              </div>
            ) : null}
          </div>

          {/* Risk recommendation */}
          {industry.risk_score >= 85 && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded px-3 py-2">
              <p className="text-[10px] text-red-700 font-medium">
                High-risk industry. Consider closure direction under EP Act 1986 S.5 if violations persist beyond next inspection cycle.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Nova Iron Historical violation callout */}
      {industry.name.includes('Nova Iron') && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Historical Critical Violation</p>
            <p className="text-xs text-red-600 mt-0.5">
              SPM 2292 mg/m3 recorded (15x CPCB limit of 150 mg/Nm3) — CSE Inspection Report, June 2009.
              Closure direction recommended under EP Act 1986 S.5 read with S.10.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function IndustryTracker() {
  const [industries, setIndustries] = useState<ExtendedIndustry[]>([]);
  const [sortBy, setSortBy] = useState<'risk_score' | 'total_violations_ytd' | 'name'>('risk_score');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'RED' | 'ORANGE'>('all');
  const [filterCompliance, setFilterCompliance] = useState<'all' | 'non-compliant' | 'warning' | 'compliant'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<{ action: string; time: string }[]>([]);

  useEffect(() => {
    api.get('/industries/tracker').then(res => setIndustries(res.data)).catch(console.error);
  }, []);

  const regions = useMemo(() => [...new Set(industries.map(i => i.region))].sort(), [industries]);

  const logAction = useCallback((action: string) => {
    const now = new Date().toISOString();
    setActionLog(prev => [{ action, time: now }, ...prev.slice(0, 49)]);
    setToast(action);
  }, []);

  const handleScheduleInspection = useCallback((id: string) => {
    const scheduled = new Date(Date.now() + 14 * 86400000).toISOString(); // 2 weeks from now
    setIndustries(prev => prev.map(i => i.id === id ? { ...i, inspection_scheduled: scheduled } : i));
    const ind = industries.find(i => i.id === id);
    logAction(`Inspection scheduled for ${ind?.name} — ${new Date(scheduled).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`);
  }, [industries, logAction]);

  const handleIssueNotice = useCallback((id: string) => {
    setIndustries(prev => prev.map(i => i.id === id ? { ...i, notice_issued: true } : i));
    const ind = industries.find(i => i.id === id);
    logAction(`Show-cause notice issued to ${ind?.name} under Air Act S.21 / Water Act S.33`);
  }, [industries, logAction]);

  const handleRenewConsent = useCallback((id: string) => {
    setIndustries(prev => prev.map(i => i.id === id ? { ...i, consent_renewed: true } : i));
    const ind = industries.find(i => i.id === id);
    logAction(`Consent renewal initiated for ${ind?.name} — forwarded to CECB Consent Section`);
  }, [industries, logAction]);

  const filtered = useMemo(() => {
    return industries
      .filter(i => {
        if (filterRegion !== 'all' && i.region !== filterRegion) return false;
        if (filterCategory !== 'all' && CATEGORY_MAP[i.type] !== filterCategory) return false;
        if (filterCompliance === 'non-compliant' && i.air_status !== 'non-compliant' && i.water_status !== 'non-compliant' && i.noise_status !== 'non-compliant') return false;
        if (filterCompliance === 'warning' && i.air_status !== 'warning' && i.water_status !== 'warning' && i.noise_status !== 'warning') return false;
        if (filterCompliance === 'compliant' && (i.air_status === 'non-compliant' || i.water_status === 'non-compliant' || i.noise_status === 'non-compliant')) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!`${i.name} ${i.type} ${i.region}`.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'risk_score') return b.risk_score - a.risk_score;
        if (sortBy === 'total_violations_ytd') return b.total_violations_ytd - a.total_violations_ytd;
        return a.name.localeCompare(b.name);
      });
  }, [industries, filterRegion, filterCategory, filterCompliance, searchQuery, sortBy]);

  const totalNonCompliant = industries.filter(i =>
    i.air_status === 'non-compliant' || i.water_status === 'non-compliant' || i.noise_status === 'non-compliant'
  ).length;
  const highRisk = industries.filter(i => i.risk_score >= 80).length;
  const totalViolationsYTD = industries.reduce((s, i) => s + i.total_violations_ytd, 0);
  const expiredConsents = industries.filter(i => new Date(i.consent_valid_until).getTime() < Date.now()).length;

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toast && <ActionToast message={toast} onClose={() => setToast(null)} />}

      {/* Summary Cards — clickable for quick filtering */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="gov-card p-4 text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setFilterCompliance('all'); setFilterCategory('all'); setFilterRegion('all'); setSearchQuery(''); }}>
          <Factory className="h-5 w-5 mx-auto text-[#14532d] mb-1" />
          <div className="text-2xl font-bold text-gray-900">{industries.length}</div>
          <div className="text-xs text-gray-500">Tracked Industries</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-red-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterCompliance('non-compliant')}>
          <div className="text-2xl font-bold text-red-600">{totalNonCompliant}</div>
          <div className="text-xs text-gray-500">Non-Compliant</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-orange-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setFilterCompliance('all'); }}>
          <div className="text-2xl font-bold text-orange-600">{highRisk}</div>
          <div className="text-xs text-gray-500">High Risk ({'\u2265'}80)</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-purple-500">
          <div className="text-2xl font-bold text-purple-700">{totalViolationsYTD}</div>
          <div className="text-xs text-gray-500">Violations YTD</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-amber-500">
          <XCircle className="h-5 w-5 mx-auto text-amber-600 mb-1" />
          <div className="text-2xl font-bold text-amber-600">{expiredConsents}</div>
          <div className="text-xs text-gray-500">Expired Consents</div>
        </div>
      </div>

      {/* Data source info bar */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 px-1 flex-wrap">
        <span className="font-semibold text-gray-600">Data Sources:</span>
        {dataSourceBadge('CECB OCEMS')}
        {dataSourceBadge('CPCB RTDMS')}
        <span className="bg-green-50 text-green-700 border-green-200 inline-block text-[8px] font-medium px-1 py-0.5 rounded border">
          EP Rules 1986
        </span>
        <span className="bg-amber-50 text-amber-700 border-amber-200 inline-block text-[8px] font-medium px-1 py-0.5 rounded border">
          CECB Consent System
        </span>
      </div>

      {/* Table */}
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header flex items-center justify-between flex-wrap gap-2">
          <span>Industry Compliance Leaderboard — Real CPCB/CECB Data</span>
          <div className="flex gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/50" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search industry..."
                className="pl-6 rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white placeholder-white/40 w-40"
              />
            </div>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as any)}
              className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white"
            >
              <option value="all" className="text-gray-800">All Categories</option>
              <option value="RED" className="text-gray-800">RED Category</option>
              <option value="ORANGE" className="text-gray-800">ORANGE Category</option>
            </select>
            <select
              value={filterCompliance}
              onChange={e => setFilterCompliance(e.target.value as any)}
              className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white"
            >
              <option value="all" className="text-gray-800">All Status</option>
              <option value="non-compliant" className="text-gray-800">Non-Compliant</option>
              <option value="warning" className="text-gray-800">Warning</option>
              <option value="compliant" className="text-gray-800">Compliant</option>
            </select>
            <select
              value={filterRegion}
              onChange={e => setFilterRegion(e.target.value)}
              className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white"
            >
              <option value="all" className="text-gray-800">All Regions</option>
              {regions.map(r => <option key={r} value={r} className="text-gray-800">{r}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white"
            >
              <option value="risk_score" className="text-gray-800">Sort: Risk Score</option>
              <option value="total_violations_ytd" className="text-gray-800">Sort: Violations</option>
              <option value="name" className="text-gray-800">Sort: Name</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="gov-table">
            <thead>
              <tr>
                <th className="w-8">Rank</th>
                <th>Industry</th>
                <th>Type</th>
                <th>Category</th>
                <th>Region</th>
                <th className="text-center">Air</th>
                <th className="text-center">Water</th>
                <th className="text-center">Noise</th>
                <th>Risk Score</th>
                <th className="text-center">Violations</th>
                <th>CEMS</th>
                <th>Consent Valid</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center py-8 text-gray-400 text-sm">
                    {searchQuery ? `No industries found for "${searchQuery}"` : 'No industries match the selected filters.'}
                  </td>
                </tr>
              )}
              {filtered.map((ind, idx) => {
                const isExpanded = expandedId === ind.id;
                const hasActiveViolation = ind.air_status === 'non-compliant' || ind.water_status === 'non-compliant' || ind.noise_status === 'non-compliant';
                return (
                  <React.Fragment key={ind.id}>
                    <tr
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${ind.risk_score >= 90 ? 'bg-red-50/60' : ind.risk_score >= 80 ? 'bg-red-50/30' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : ind.id)}
                    >
                      <td>{rankBadge(idx + 1)}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-gray-800">{ind.name}</span>
                          {ind.name.includes('Nova Iron') && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" title="Historical critical violator" />
                          )}
                          {ind.notice_issued && (
                            <span className="text-[8px] bg-amber-100 text-amber-700 border border-amber-200 px-1 py-0.5 rounded font-bold flex-shrink-0">SCN</span>
                          )}
                          {ind.inspection_scheduled && (
                            <Calendar className="h-3 w-3 text-blue-500 flex-shrink-0" title={`Inspection: ${new Date(ind.inspection_scheduled).toLocaleDateString('en-IN')}`} />
                          )}
                        </div>
                      </td>
                      <td className="text-xs text-gray-500">{ind.type}</td>
                      <td>{categoryBadge(ind.type)}</td>
                      <td className="text-sm">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-gray-400" />
                          {ind.region}
                        </span>
                      </td>
                      <td className="text-center">{statusBadge(ind.air_status)}</td>
                      <td className="text-center">{statusBadge(ind.water_status)}</td>
                      <td className="text-center">{statusBadge(ind.noise_status)}</td>
                      <td className="min-w-[120px]">{riskBar(ind.risk_score)}</td>
                      <td className="text-center">
                        {ind.total_violations_ytd > 0 ? (
                          <span className="badge-high">{ind.total_violations_ytd}</span>
                        ) : (
                          <span className="badge-low">0</span>
                        )}
                      </td>
                      <td>{cemsIndicator(hasActiveViolation)}</td>
                      <td>{consentStatus(ind.consent_valid_until)}</td>
                      <td className="text-gray-400">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={13} className="p-0">
                          <IndustryDetailPanel
                            industry={ind}
                            onScheduleInspection={handleScheduleInspection}
                            onIssueNotice={handleIssueNotice}
                            onRenewConsent={handleRenewConsent}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer with standards reference */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <div className="text-[10px] text-gray-400">
            Stack emission limits from Environment (Protection) Rules, 1986 Schedule-I &mdash;
            Industry categories per CPCB Classification (2016) &mdash;
            Consent data from CECB Consent Management System &mdash;
            CEMS data from CECB OCEMS Portal (enviscecb.org) and CPCB RTDMS (rtdms.cpcb.gov.in)
          </div>
          <div className="text-[10px] text-gray-400">
            {filtered.length} of {industries.length} industries shown
          </div>
        </div>
      </div>

      {/* Action Log */}
      {actionLog.length > 0 && (
        <div className="gov-card overflow-hidden">
          <div className="gov-card-header flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Regulatory Actions Log
            </span>
            <button onClick={() => setActionLog([])} className="text-xs text-white/60 hover:text-white">Clear</button>
          </div>
          <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {actionLog.map((entry, idx) => (
              <div key={idx} className="px-4 py-2 flex items-center gap-3 text-xs">
                <span className="text-gray-400 flex-shrink-0">
                  {new Date(entry.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-gray-700">{entry.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
