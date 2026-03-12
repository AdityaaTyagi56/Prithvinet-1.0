import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle, Calendar, Factory } from 'lucide-react';
import { api } from '../../lib/api';
import type { IndustryData } from '../../lib/mockData';

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
  if (days < 0) return <span className="text-red-600 text-xs font-semibold">EXPIRED</span>;
  if (days < 60) return <span className="text-amber-600 text-xs font-semibold">Expires in {days}d</span>;
  return <span className="text-green-600 text-xs">{new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>;
}

export function IndustryTracker() {
  const [industries, setIndustries] = useState<IndustryData[]>([]);
  const [sortBy, setSortBy] = useState<'risk_score' | 'total_violations_ytd' | 'name'>('risk_score');
  const [filterRegion, setFilterRegion] = useState('all');

  useEffect(() => {
    api.get('/industries/tracker').then(res => setIndustries(res.data)).catch(console.error);
  }, []);

  const regions = [...new Set(industries.map(i => i.region))].sort();

  const filtered = industries
    .filter(i => filterRegion === 'all' || i.region === filterRegion)
    .sort((a, b) => {
      if (sortBy === 'risk_score') return b.risk_score - a.risk_score;
      if (sortBy === 'total_violations_ytd') return b.total_violations_ytd - a.total_violations_ytd;
      return a.name.localeCompare(b.name);
    });

  const totalNonCompliant = industries.filter(i =>
    i.air_status === 'non-compliant' || i.water_status === 'non-compliant' || i.noise_status === 'non-compliant'
  ).length;
  const highRisk = industries.filter(i => i.risk_score >= 70).length;
  const totalViolationsYTD = industries.reduce((s, i) => s + i.total_violations_ytd, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="gov-card p-4 text-center">
          <Factory className="h-5 w-5 mx-auto text-[#1a365d] mb-1" />
          <div className="text-2xl font-bold text-gray-900">{industries.length}</div>
          <div className="text-xs text-gray-500">Tracked Industries</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-red-500">
          <div className="text-2xl font-bold text-red-600">{totalNonCompliant}</div>
          <div className="text-xs text-gray-500">Non-Compliant</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-orange-500">
          <div className="text-2xl font-bold text-orange-600">{highRisk}</div>
          <div className="text-xs text-gray-500">High Risk (≥70)</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-purple-500">
          <div className="text-2xl font-bold text-purple-700">{totalViolationsYTD}</div>
          <div className="text-xs text-gray-500">Violations YTD</div>
        </div>
      </div>

      {/* Table */}
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header flex items-center justify-between">
          <span>🏭 Industry Compliance Tracker — Consent & Pollution Status</span>
          <div className="flex gap-2">
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
                <th>Industry</th>
                <th>Type</th>
                <th>Region</th>
                <th className="text-center">🌬️ Air</th>
                <th className="text-center">💧 Water</th>
                <th className="text-center">🔊 Noise</th>
                <th>Risk Score</th>
                <th className="text-center">Violations</th>
                <th>Consent Valid</th>
                <th>Last Inspection</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ind => (
                <tr key={ind.id} className={ind.risk_score >= 80 ? 'bg-red-50/50' : ''}>
                  <td className="font-semibold text-gray-800">{ind.name}</td>
                  <td className="text-xs text-gray-500">{ind.type}</td>
                  <td className="text-sm">{ind.region}</td>
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
                  <td>{consentStatus(ind.consent_valid_until)}</td>
                  <td className="text-xs text-gray-500">
                    {new Date(ind.last_inspection).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
