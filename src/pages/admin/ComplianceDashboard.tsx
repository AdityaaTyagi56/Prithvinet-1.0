import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { PollutionType } from '../../lib/mockData';

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

interface ComplianceDashboardProps {
  pollutionType: PollutionType;
}

const TYPE_LABELS: Record<PollutionType, string> = {
  air: '🌬️ Air Emission Compliance',
  water: '💧 Effluent Discharge Compliance',
  noise: '🔊 Noise Level Compliance',
};

export function ComplianceDashboard({ pollutionType }: ComplianceDashboardProps) {
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await api.get(`/industries/compliance/metrics?type=${pollutionType}`);
        setMetrics(res.data);
      } catch (error) {
        console.error('Failed to load compliance metrics', error);
      }
    }

    loadMetrics();
  }, [pollutionType]);

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="gov-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-500 font-medium text-sm">Compliant Industries</h3>
            <CheckCircle className="text-green-600 h-5 w-5" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">{metrics?.compliant_industries ?? '--'}</p>
          <p className="text-xs text-gray-400 mt-1">As per CPCB norms</p>
        </div>
        <div className="gov-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-500 font-medium text-sm">Active Violations</h3>
            <XCircle className="text-red-600 h-5 w-5" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">{metrics?.active_violations ?? '--'}</p>
          <p className="text-xs text-gray-400 mt-1">Under investigation</p>
        </div>
        <div className="gov-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-500 font-medium text-sm">Pending Escalations</h3>
            <AlertTriangle className="text-amber-500 h-5 w-5" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">{metrics?.pending_escalations ?? '--'}</p>
          <p className="text-xs text-gray-400 mt-1">Awaiting officer action</p>
        </div>
      </div>

      <div className="gov-card overflow-hidden">
        <div className="gov-card-header">📋 {TYPE_LABELS[pollutionType]} — Industry Compliance Register</div>
        <div className="overflow-x-auto">
          <table className="gov-table">
            <thead>
              <tr>
                <th>Industry</th>
                <th>Violation Type</th>
                <th>Date</th>
                <th>Severity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.recent_violations || []).map((row, idx) => (
                <tr key={`${row.industry}-${idx}`}>
                  <td className="font-medium text-gray-800">{row.industry}</td>
                  <td>{row.violation_type}</td>
                  <td>{row.date || '--'}</td>
                  <td>
                    <span className={`${
                      row.severity === 'critical' ? 'badge-critical' :
                      row.severity === 'high' ? 'badge-high' :
                      row.severity === 'medium' ? 'badge-medium' :
                      'badge-low'
                    }`}>{row.severity}</span>
                  </td>
                  <td>
                    <button className="text-[#1a365d] font-semibold hover:underline text-sm">{row.status === 'escalated' ? 'Review' : 'Escalate'}</button>
                  </td>
                </tr>
              ))}
              {metrics && metrics.recent_violations.length === 0 && (
                <tr>
                  <td className="text-gray-400" colSpan={5}>No active violations recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
