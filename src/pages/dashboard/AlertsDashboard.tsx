import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Clock,
  Shield,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "../../lib/api";
import type { AlertData, PollutionType } from "../../lib/mockData";

const TYPE_ICONS: Record<PollutionType, string> = {
  air: "🌬️",
  water: "💧",
  noise: "🔊",
};

function severityBadge(s: string) {
  const cls =
    s === "critical"
      ? "badge-critical"
      : s === "high"
        ? "badge-high"
        : s === "medium"
          ? "badge-medium"
          : "badge-low";
  return <span className={cls}>{s}</span>;
}

function statusLabel(s: string) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    active: { color: "text-red-600", icon: <Bell className="h-3.5 w-3.5" /> },
    acknowledged: {
      color: "text-amber-600",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    },
    escalated: {
      color: "text-purple-700",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    "auto-escalated": {
      color: "text-purple-700",
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    resolved: {
      color: "text-green-600",
      icon: <Shield className="h-3.5 w-3.5" />,
    },
  };
  const m = map[s] || map.active;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${m.color}`}
    >
      {m.icon} {s.replace("-", " ").toUpperCase()}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

function timeUntil(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Imminent";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.round(mins / 60)}h ${mins % 60}m`;
}

export function AlertsDashboard() {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [filter, setFilter] = useState<"all" | PollutionType>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/public/alerts")
      .then((res) => setAlerts(res.data))
      .catch(console.error);
    const interval = setInterval(() => {
      api
        .get("/public/alerts")
        .then((res) => setAlerts(res.data))
        .catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = alerts.filter((a) => {
    if (filter !== "all" && a.pollution_type !== filter) return false;
    if (severityFilter !== "all" && a.severity !== severityFilter) return false;
    return true;
  });

  const counts = {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    high: alerts.filter((a) => a.severity === "high").length,
    active: alerts.filter((a) => a.status === "active").length,
    escalated: alerts.filter(
      (a) => a.status === "escalated" || a.status === "auto-escalated",
    ).length,
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
          <div className="text-3xl font-bold text-red-600">
            {counts.critical}
          </div>
          <div className="text-xs text-gray-500 mt-1">Critical</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-orange-500">
          <div className="text-3xl font-bold text-orange-600">
            {counts.high}
          </div>
          <div className="text-xs text-gray-500 mt-1">High</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-blue-600">
          <div className="text-3xl font-bold text-blue-700">
            {counts.active}
          </div>
          <div className="text-xs text-gray-500 mt-1">Active</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-purple-600">
          <div className="text-3xl font-bold text-purple-700">
            {counts.escalated}
          </div>
          <div className="text-xs text-gray-500 mt-1">Escalated</div>
        </div>
      </div>

      {/* Filters */}
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header flex items-center justify-between">
          <span>🚨 Intelligent Alert Console — Real-Time</span>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white"
            >
              <option value="all" className="text-gray-800">
                All Types
              </option>
              <option value="air" className="text-gray-800">
                🌬️ Air
              </option>
              <option value="water" className="text-gray-800">
                💧 Water
              </option>
              <option value="noise" className="text-gray-800">
                🔊 Noise
              </option>
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded border border-white/30 px-2 py-1 text-xs bg-white/10 text-white"
            >
              <option value="all" className="text-gray-800">
                All Severity
              </option>
              <option value="critical" className="text-gray-800">
                Critical
              </option>
              <option value="high" className="text-gray-800">
                High
              </option>
              <option value="medium" className="text-gray-800">
                Medium
              </option>
              <option value="low" className="text-gray-800">
                Low
              </option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              No alerts match the selected filters.
            </div>
          )}
          {filtered.map((alert) => {
            const isExpanded = expandedId === alert.id;
            const escalationTime = timeUntil(alert.auto_escalation_at);
            return (
              <div
                key={alert.id}
                className={`${alert.severity === "critical" ? "bg-red-50/50" : ""}`}
              >
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                >
                  {/* Type icon */}
                  <span className="text-xl flex-shrink-0">
                    {TYPE_ICONS[alert.pollution_type]}
                  </span>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {severityBadge(alert.severity)}
                      <span className="font-semibold text-gray-900 text-sm">
                        {alert.parameter} — {alert.value}{" "}
                        {alert.value > 100
                          ? ""
                          : alert.parameter === "pH"
                            ? ""
                            : alert.parameter.includes("L")
                              ? "dB(A)"
                              : "µg/m³"}
                      </span>
                      <span className="text-xs text-gray-400">
                        Limit: {alert.threshold}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {alert.location} · {alert.industry} · {alert.region}
                    </div>
                  </div>

                  {/* Status & time */}
                  <div className="text-right flex-shrink-0">
                    {statusLabel(alert.status)}
                    <div className="text-[10px] text-gray-400 mt-1">
                      {timeAgo(alert.triggered_at)}
                    </div>
                  </div>

                  {/* Auto-escalation timer */}
                  {escalationTime && alert.status === "active" && (
                    <div className="flex-shrink-0 text-center px-2">
                      <div
                        className={`text-xs font-bold ${escalationTime === "Imminent" ? "text-red-600 animate-pulse" : "text-amber-600"}`}
                      >
                        ⏱ {escalationTime}
                      </div>
                      <div className="text-[9px] text-gray-400">
                        Auto-escalation
                      </div>
                    </div>
                  )}

                  {/* Expand chevron */}
                  <div className="flex-shrink-0 text-gray-400">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>

                {/* Expanded action panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-blue-50/30 border-t border-blue-100">
                    <div className="text-xs font-semibold text-[#1a365d] mb-1">
                      Recommended Action:
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {alert.recommended_action}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button className="bg-[#1a365d] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#2a4a7f] transition-colors">
                        Acknowledge
                      </button>
                      <button className="bg-red-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-red-700 transition-colors">
                        Escalate Now
                      </button>
                      <button className="bg-white text-gray-600 border border-gray-300 px-3 py-1.5 rounded text-xs font-medium hover:bg-gray-50 transition-colors">
                        View History
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
