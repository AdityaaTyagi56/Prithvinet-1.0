import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, Clock, Shield, CheckCircle2, ChevronDown, ChevronUp, FileText, Search, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import type { AlertData, PollutionType } from '../../lib/mockData';

const TYPE_ICONS: Record<PollutionType, string> = { air: '🌬️', water: '💧', noise: '🔊' };

type StatusFilter = 'all' | 'active' | 'acknowledged' | 'escalated' | 'resolved';

function severityBadge(s: string) {
  const cls =
    s === 'critical' ? 'badge-critical' :
    s === 'high' ? 'badge-high' :
    s === 'medium' ? 'badge-medium' : 'badge-low';
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

// Extended alert with local action state
interface ExtendedAlert extends AlertData {
  acknowledged_at?: string | null;
  escalated_at?: string | null;
  resolved_at?: string | null;
  show_cause_issued?: boolean;
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

export function AlertsDashboard() {
  const [alerts, setAlerts] = useState<ExtendedAlert[]>([]);
  const [filter, setFilter] = useState<'all' | PollutionType>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<{ id: string; action: string; time: string }[]>([]);

  useEffect(() => {
    api.get('/alerts').then(res => setAlerts(res.data)).catch(console.error);
    const interval = setInterval(() => {
      api.get('/alerts').then(res => {
        setAlerts(prev => {
          const modifiedIds = new Set(prev.filter(a => a.acknowledged_at || a.escalated_at || a.resolved_at).map(a => a.id));
          const incoming: ExtendedAlert[] = res.data;
          return incoming.map(a => {
            if (modifiedIds.has(a.id)) return prev.find(p => p.id === a.id) || a;
            return a;
          });
        });
      }).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Action handlers ────────────────────────────
  const updateAlert = useCallback((id: string, updates: Partial<ExtendedAlert>, actionText: string) => {
    const now = new Date().toISOString();
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    setActionLog(prev => [{ id, action: actionText, time: now }, ...prev.slice(0, 49)]);
    setToast(actionText);
    setExpandedId(null);
  }, []);

  const handleAcknowledge = useCallback((alert: ExtendedAlert) => {
    updateAlert(alert.id, {
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
      auto_escalation_at: null,
    }, `Alert ${alert.id} acknowledged — ${alert.parameter} at ${alert.location}`);
  }, [updateAlert]);

  const handleEscalate = useCallback((alert: ExtendedAlert) => {
    updateAlert(alert.id, {
      status: 'escalated',
      escalated_at: new Date().toISOString(),
      auto_escalation_at: null,
    }, `Alert ${alert.id} ESCALATED — ${alert.parameter} at ${alert.industry}`);
  }, [updateAlert]);

  const handleResolve = useCallback((alert: ExtendedAlert) => {
    updateAlert(alert.id, {
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      auto_escalation_at: null,
    }, `Alert ${alert.id} resolved — ${alert.parameter} at ${alert.location}`);
  }, [updateAlert]);

  const handleShowCause = useCallback((alert: ExtendedAlert) => {
    updateAlert(alert.id, {
      show_cause_issued: true,
      status: 'escalated',
      escalated_at: new Date().toISOString(),
      auto_escalation_at: null,
    }, `Show-cause notice issued to ${alert.industry} — ${alert.parameter} violation`);
  }, [updateAlert]);

  // Available buttons depending on current alert status
  function getAvailableActions(alert: ExtendedAlert) {
    const actions: { label: string; handler: () => void; cls: string; icon?: React.ReactNode }[] = [];
    if (alert.status === 'active') {
      actions.push({ label: 'Acknowledge', handler: () => handleAcknowledge(alert), cls: 'bg-[#14532d] text-white hover:bg-[#166534]', icon: <CheckCircle2 className="h-3.5 w-3.5" /> });
      actions.push({ label: 'Escalate Now', handler: () => handleEscalate(alert), cls: 'bg-red-600 text-white hover:bg-red-700', icon: <AlertTriangle className="h-3.5 w-3.5" /> });
      actions.push({ label: 'Issue Show-Cause', handler: () => handleShowCause(alert), cls: 'bg-amber-600 text-white hover:bg-amber-700', icon: <FileText className="h-3.5 w-3.5" /> });
    }
    if (alert.status === 'acknowledged') {
      actions.push({ label: 'Escalate Now', handler: () => handleEscalate(alert), cls: 'bg-red-600 text-white hover:bg-red-700', icon: <AlertTriangle className="h-3.5 w-3.5" /> });
      actions.push({ label: 'Issue Show-Cause', handler: () => handleShowCause(alert), cls: 'bg-amber-600 text-white hover:bg-amber-700', icon: <FileText className="h-3.5 w-3.5" /> });
      actions.push({ label: 'Mark Resolved', handler: () => handleResolve(alert), cls: 'bg-green-600 text-white hover:bg-green-700', icon: <Shield className="h-3.5 w-3.5" /> });
    }
    if (alert.status === 'escalated' || alert.status === 'auto-escalated') {
      if (!alert.show_cause_issued) {
        actions.push({ label: 'Issue Show-Cause', handler: () => handleShowCause(alert), cls: 'bg-amber-600 text-white hover:bg-amber-700', icon: <FileText className="h-3.5 w-3.5" /> });
      }
      actions.push({ label: 'Mark Resolved', handler: () => handleResolve(alert), cls: 'bg-green-600 text-white hover:bg-green-700', icon: <Shield className="h-3.5 w-3.5" /> });
    }
    return actions;
  }

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      if (filter !== 'all' && a.pollution_type !== filter) return false;
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!`${a.location} ${a.industry} ${a.parameter} ${a.region}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [alerts, filter, severityFilter, statusFilter, searchQuery]);

  const counts = useMemo(() => ({
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    active: alerts.filter(a => a.status === 'active').length,
    escalated: alerts.filter(a => a.status === 'escalated' || a.status === 'auto-escalated').length,
    resolved: alerts.filter(a => a.status === 'resolved').length,
  }), [alerts]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && <ActionToast message={toast} onClose={() => setToast(null)} />}

      {/* Summary Cards — clickable for quick filtering */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="gov-card p-4 text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setStatusFilter('all'); setSeverityFilter('all'); }}>
          <div className="text-3xl font-bold text-gray-900">{counts.total}</div>
          <div className="text-xs text-gray-500 mt-1">Total Alerts</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-red-600 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSeverityFilter('critical'); setStatusFilter('all'); }}>
          <div className="text-3xl font-bold text-red-600">{counts.critical}</div>
          <div className="text-xs text-gray-500 mt-1">Critical</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-blue-600 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setStatusFilter('active'); setSeverityFilter('all'); }}>
          <div className="text-3xl font-bold text-blue-700">{counts.active}</div>
          <div className="text-xs text-gray-500 mt-1">Active</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-purple-600 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setStatusFilter('escalated'); setSeverityFilter('all'); }}>
          <div className="text-3xl font-bold text-purple-700">{counts.escalated}</div>
          <div className="text-xs text-gray-500 mt-1">Escalated</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-green-600 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setStatusFilter('resolved'); setSeverityFilter('all'); }}>
          <div className="text-3xl font-bold text-green-600">{counts.resolved}</div>
          <div className="text-xs text-gray-500 mt-1">Resolved</div>
        </div>
      </div>

      {/* Alert List */}
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Intelligent Alert Console — Real-Time
          </span>
          <div className="flex gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/50" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search alerts..."
                className="pl-6 rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white placeholder-white/40 w-36"
              />
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value as any)} className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white">
              <option value="all" className="text-gray-800">All Types</option>
              <option value="air" className="text-gray-800">🌬️ Air</option>
              <option value="water" className="text-gray-800">💧 Water</option>
              <option value="noise" className="text-gray-800">🔊 Noise</option>
            </select>
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white">
              <option value="all" className="text-gray-800">All Severity</option>
              <option value="critical" className="text-gray-800">Critical</option>
              <option value="high" className="text-gray-800">High</option>
              <option value="medium" className="text-gray-800">Medium</option>
              <option value="low" className="text-gray-800">Low</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white">
              <option value="all" className="text-gray-800">All Status</option>
              <option value="active" className="text-gray-800">Active</option>
              <option value="acknowledged" className="text-gray-800">Acknowledged</option>
              <option value="escalated" className="text-gray-800">Escalated</option>
              <option value="resolved" className="text-gray-800">Resolved</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              {searchQuery ? `No alerts found for "${searchQuery}"` : 'No alerts match the selected filters.'}
            </div>
          )}
          {filtered.map(alert => {
            const isExpanded = expandedId === alert.id;
            const escalationTime = timeUntil(alert.auto_escalation_at);
            const isResolved = alert.status === 'resolved';
            const excessPct = alert.threshold > 0 ? Math.round(((alert.value - alert.threshold) / alert.threshold) * 100) : 0;
            const actions = getAvailableActions(alert);
            return (
              <div key={alert.id} className={`transition-all duration-300 ${
                isResolved ? 'opacity-60' : alert.severity === 'critical' ? 'bg-red-50/50' : ''
              }`}>
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                >
                  {/* Type icon */}
                  <span className="text-xl flex-shrink-0">{TYPE_ICONS[alert.pollution_type]}</span>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {severityBadge(alert.severity)}
                      <span className={`font-semibold text-sm ${isResolved ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {alert.parameter} — {alert.value} {alert.parameter === 'pH' ? '' : alert.parameter.includes('L') ? 'dB(A)' : 'µg/m³'}
                      </span>
                      <span className="text-xs text-gray-400">Limit: {alert.threshold}</span>
                      {excessPct > 0 && !isResolved && (
                        <span className={`text-[10px] font-bold ${excessPct > 100 ? 'text-red-600' : excessPct > 50 ? 'text-orange-600' : 'text-amber-600'}`}>
                          +{excessPct}%
                        </span>
                      )}
                      {alert.show_cause_issued && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                          SCN ISSUED
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {alert.location} · {alert.industry} · {alert.region}
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

                        {/* Action timeline */}
                        {(alert.acknowledged_at || alert.escalated_at || alert.resolved_at) && (
                          <div className="mt-3 border-l-2 border-gray-200 pl-3 space-y-1">
                            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Action Timeline</div>
                            {alert.acknowledged_at && (
                              <div className="text-xs text-amber-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Acknowledged at {new Date(alert.acknowledged_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                            {alert.show_cause_issued && (
                              <div className="text-xs text-amber-700 flex items-center gap-1">
                                <FileText className="h-3 w-3" /> Show-cause notice issued
                              </div>
                            )}
                            {alert.escalated_at && (
                              <div className="text-xs text-purple-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Escalated at {new Date(alert.escalated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                            {alert.resolved_at && (
                              <div className="text-xs text-green-600 flex items-center gap-1">
                                <Shield className="h-3 w-3" /> Resolved at {new Date(alert.resolved_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Excess gauge */}
                      {excessPct > 0 && !isResolved && (
                        <div className="flex-shrink-0 text-center w-20">
                          <div className={`text-2xl font-bold ${excessPct > 100 ? 'text-red-600' : excessPct > 50 ? 'text-orange-600' : 'text-amber-600'}`}>
                            {excessPct}%
                          </div>
                          <div className="text-[9px] text-gray-400">Above limit</div>
                        </div>
                      )}
                    </div>

                    {/* Working action buttons */}
                    {actions.length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {actions.map(action => (
                          <button
                            key={action.label}
                            onClick={(e) => { e.stopPropagation(); action.handler(); }}
                            className={`${action.cls} px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5`}
                          >
                            {action.icon}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Resolved banner */}
                    {isResolved && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded px-3 py-2 flex items-center gap-2">
                        <Shield className="h-4 w-4 text-green-600" />
                        <span className="text-xs font-medium text-green-700">
                          This alert has been resolved{alert.resolved_at ? ` at ${new Date(alert.resolved_at).toLocaleString('en-IN')}` : ''}.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-[10px] text-gray-400">
            Sources: CECB OCEMS · CPCB RTDMS · CPCB NAMP via data.gov.in · EP Rules 1986
          </div>
          <div className="text-[10px] text-gray-400">{filtered.length} of {alerts.length} alerts shown</div>
        </div>
      </div>

      {/* Action Log */}
      {actionLog.length > 0 && (
        <div className="gov-card overflow-hidden">
          <div className="gov-card-header flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Recent Actions Log
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
