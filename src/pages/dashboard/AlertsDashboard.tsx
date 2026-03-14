import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, Clock, Shield, CheckCircle2, ChevronDown, ChevronUp, Activity, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import type { AlertData, PollutionType } from '../../lib/mockData';

type AlertTab = 'all' | 'air' | 'stack' | 'water' | 'noise';

const TAB_CONFIG: { key: AlertTab; label: string; icon: string }[] = [
  { key: 'all', label: 'All Alerts', icon: '' },
  { key: 'air', label: 'Air (Ambient)', icon: '' },
  { key: 'stack', label: 'Stack (CEMS)', icon: '' },
  { key: 'water', label: 'Water', icon: '' },
  { key: 'noise', label: 'Noise', icon: '' },
];

function severityBadge(s: string) {
  const cls =
    s === 'critical' || s === 'CRITICAL' ? 'badge-critical' :
    s === 'high' || s === 'HIGH' ? 'badge-high' :
    s === 'medium' || s === 'MODERATE' ? 'badge-medium' : 'badge-low';
  return <span className={cls}>{s.toUpperCase()}</span>;
}

function statusLabel(s: string) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    active: { color: 'text-red-600', icon: <Bell className="h-3.5 w-3.5" /> },
    acknowledged: { color: 'text-amber-600', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    escalated: { color: 'text-purple-700', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    'auto-escalated': { color: 'text-purple-700', icon: <Clock className="h-3.5 w-3.5" /> },
    resolved: { color: 'text-green-600', icon: <Shield className="h-3.5 w-3.5" /> },
  };
  const m = map[s] || map.active;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${m.color}`}>
      {m.icon} {s.replace('-', ' ').toUpperCase()}
    </span>
  );
}

function dataSourceBadge(source: string) {
  if (!source) return null;
  const cls = source.includes('OCEMS') ? 'bg-blue-50 text-blue-700 border-blue-200' :
              source.includes('RTDMS') ? 'bg-purple-50 text-purple-700 border-purple-200' :
              source.includes('NAMP') || source.includes('data.gov') ? 'bg-green-50 text-green-700 border-green-200' :
              source.includes('NWMP') ? 'bg-cyan-50 text-cyan-700 border-cyan-200' :
              'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-block text-[8px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>
      {source}
    </span>
  );
}

function pollutionIcon(type: string) {
  if (type === 'stack') return <Activity className="h-4 w-4 text-orange-500" />;
  if (type === 'water') return <span className="text-lg leading-none">💧</span>;
  if (type === 'noise') return <span className="text-lg leading-none">🔊</span>;
  return <span className="text-lg leading-none">🌬️</span>;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function timeUntil(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Imminent';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.round(mins / 60)}h ${mins % 60}m`;
}

// Extended AlertData with extra fields from our backend
interface ExtendedAlert extends AlertData {
  industry_type?: string;
  excess_percent?: number;
  data_source?: string;
}

export function AlertsDashboard() {
  const [alerts, setAlerts] = useState<ExtendedAlert[]>([]);
  const [activeTab, setActiveTab] = useState<AlertTab>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/alerts').then(res => setAlerts(res.data)).catch(console.error);
    const interval = setInterval(() => {
      api.get('/alerts').then(res => setAlerts(res.data)).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      if (activeTab !== 'all' && a.pollution_type !== activeTab) return false;
      if (severityFilter !== 'all' && a.severity.toLowerCase() !== severityFilter) return false;
      return true;
    });
  }, [alerts, activeTab, severityFilter]);

  const counts = useMemo(() => ({
    total: alerts.length,
    critical: alerts.filter(a => ['critical', 'CRITICAL'].includes(a.severity)).length,
    high: alerts.filter(a => ['high', 'HIGH'].includes(a.severity)).length,
    active: alerts.filter(a => a.status === 'active').length,
    escalated: alerts.filter(a => a.status === 'escalated' || a.status === 'auto-escalated').length,
    air: alerts.filter(a => a.pollution_type === 'air').length,
    stack: alerts.filter(a => a.pollution_type === 'stack').length,
    water: alerts.filter(a => a.pollution_type === 'water').length,
    noise: alerts.filter(a => a.pollution_type === 'noise').length,
  }), [alerts]);

  const tabCounts: Record<AlertTab, number> = {
    all: counts.total,
    air: counts.air,
    stack: counts.stack,
    water: counts.water,
    noise: counts.noise,
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="gov-card p-4 text-center">
          <div className="text-3xl font-bold text-gray-900">{counts.total}</div>
          <div className="text-xs text-gray-500 mt-1">Total Alerts</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-red-600">
          <div className="text-3xl font-bold text-red-600">{counts.critical}</div>
          <div className="text-xs text-gray-500 mt-1">Critical</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-orange-500">
          <div className="text-3xl font-bold text-orange-600">{counts.high}</div>
          <div className="text-xs text-gray-500 mt-1">High</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-blue-600">
          <div className="text-3xl font-bold text-blue-700">{counts.active}</div>
          <div className="text-xs text-gray-500 mt-1">Active</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-purple-600">
          <div className="text-3xl font-bold text-purple-700">{counts.escalated}</div>
          <div className="text-xs text-gray-500 mt-1">Escalated</div>
        </div>
      </div>

      {/* Data source info bar */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 px-1">
        <span className="font-semibold text-gray-600">Alert Sources:</span>
        {dataSourceBadge('CECB OCEMS')}
        {dataSourceBadge('CPCB RTDMS')}
        {dataSourceBadge('CPCB NAMP / data.gov.in')}
        {dataSourceBadge('CPCB NWMP')}
        <span className="ml-auto flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] text-green-600 font-medium">LIVE — polling every 30s</span>
        </span>
      </div>

      {/* Tabs + Alert List */}
      <div className="gov-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-4 py-3 text-xs font-semibold transition-colors relative ${
                activeTab === tab.key
                  ? 'text-[#14532d] bg-white border-b-2 border-[#14532d]'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-4 text-[10px] rounded-full px-1 ${
                  activeTab === tab.key ? 'bg-[#14532d] text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="gov-card-header flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Intelligent Alert Console — Real-Time Monitoring
          </span>
          <div className="flex gap-2">
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white"
            >
              <option value="all" className="text-gray-800">All Severity</option>
              <option value="critical" className="text-gray-800">Critical</option>
              <option value="high" className="text-gray-800">High</option>
              <option value="medium" className="text-gray-800">Medium</option>
              <option value="low" className="text-gray-800">Low</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">No alerts match the selected filters.</div>
          )}
          {filtered.map(alert => {
            const isExpanded = expandedId === alert.id;
            const escalationTime = timeUntil(alert.auto_escalation_at);
            const excessPct = alert.excess_percent || (
              alert.threshold > 0 ? Math.round(((alert.value - alert.threshold) / alert.threshold) * 100) : 0
            );
            return (
              <div key={alert.id} className={`${['critical', 'CRITICAL'].includes(alert.severity) ? 'bg-red-50/50' : ''}`}>
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                >
                  {/* Type icon */}
                  <div className="flex-shrink-0">{pollutionIcon(alert.pollution_type)}</div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {severityBadge(alert.severity)}
                      <span className="font-semibold text-gray-900 text-sm">
                        {alert.parameter} — {alert.value}
                        {alert.parameter === 'pH' ? '' : alert.pollution_type === 'noise' ? ' dB(A)' : alert.pollution_type === 'stack' ? ' mg/Nm3' : ' µg/m³'}
                      </span>
                      <span className="text-xs text-gray-400">
                        Limit: {alert.threshold}
                      </span>
                      {excessPct > 0 && (
                        <span className={`text-[10px] font-bold ${excessPct > 100 ? 'text-red-600' : excessPct > 50 ? 'text-orange-600' : 'text-amber-600'}`}>
                          +{excessPct}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>{alert.location} · {alert.industry} · {alert.region}</span>
                      {alert.data_source && dataSourceBadge(alert.data_source)}
                    </div>
                  </div>

                  {/* Status & time */}
                  <div className="text-right flex-shrink-0">
                    {statusLabel(alert.status)}
                    <div className="text-[10px] text-gray-400 mt-1">{timeAgo(alert.triggered_at)}</div>
                  </div>

                  {/* Auto-escalation timer */}
                  {escalationTime && alert.status === 'active' && (
                    <div className="flex-shrink-0 text-center px-2">
                      <div className={`text-xs font-bold ${escalationTime === 'Imminent' ? 'text-red-600 animate-pulse' : 'text-amber-600'}`}>
                        ⏱ {escalationTime}
                      </div>
                      <div className="text-[9px] text-gray-400">Auto-escalation</div>
                    </div>
                  )}

                  {/* Expand chevron */}
                  <div className="flex-shrink-0 text-gray-400">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {/* Expanded action panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-blue-50/30 border-t border-blue-100">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-[#1a365d] mb-1">Recommended Action:</div>
                        <p className="text-sm text-gray-700 leading-relaxed">{alert.recommended_action}</p>

                        {/* CPCB standard reference for stack alerts */}
                        {alert.pollution_type === 'stack' && alert.industry_type && (
                          <div className="mt-2 text-[10px] text-gray-500 bg-white rounded px-2 py-1 border border-gray-200 inline-block">
                            CPCB Standard: EP Rules 1986 Schedule-I — {alert.industry_type} — {alert.parameter} limit {alert.threshold} mg/Nm3
                          </div>
                        )}

                        {/* Historical violation tag for Nova Iron */}
                        {alert.industry.includes('Nova Iron') && (
                          <div className="mt-2 bg-red-100 text-red-700 text-[10px] rounded px-2 py-1 inline-block border border-red-200">
                            Historical Critical Violator — CSE Inspection Report June 2009
                          </div>
                        )}
                      </div>

                      {/* Excess gauge */}
                      {excessPct > 0 && (
                        <div className="flex-shrink-0 text-center w-20">
                          <div className={`text-2xl font-bold ${excessPct > 100 ? 'text-red-600' : excessPct > 50 ? 'text-orange-600' : 'text-amber-600'}`}>
                            {excessPct}%
                          </div>
                          <div className="text-[9px] text-gray-400">Above limit</div>
                        </div>
                      )}
                    </div>

                    {/* Resolution workflow buttons */}
                    <div className="flex gap-2 mt-3">
                      <button className="bg-[#14532d] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#166534] transition-colors">
                        Acknowledge
                      </button>
                      <button className="bg-red-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-red-700 transition-colors">
                        Escalate Now
                      </button>
                      <button className="bg-amber-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-amber-700 transition-colors">
                        Issue Show-Cause
                      </button>
                      <button className="bg-white text-gray-600 border border-gray-300 px-3 py-1.5 rounded text-xs font-medium hover:bg-gray-50 transition-colors">
                        View History
                      </button>
                      <button className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-green-700 transition-colors ml-auto">
                        Mark Resolved
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer with standards reference */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-400">
          Stack limits: EP Rules 1986 Schedule-I &mdash;
          Ambient air: NAAQS 2009 &mdash;
          Water: CPCB General Discharge Standards &mdash;
          Noise: Noise Pollution Rules 2000 &mdash;
          Sources: CECB OCEMS (enviscecb.org), CPCB RTDMS (rtdms.cpcb.gov.in), CPCB NAMP via data.gov.in
        </div>
      </div>
    </div>
  );
}
