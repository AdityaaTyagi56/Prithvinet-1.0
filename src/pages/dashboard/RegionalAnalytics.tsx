import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../lib/api";
import type { RegionalData } from "../../lib/mockData";

const trendIcon = (t: string) => {
  if (t === "up") return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
  if (t === "down")
    return <TrendingDown className="h-3.5 w-3.5 text-green-500" />;
  return <Minus className="h-3.5 w-3.5 text-gray-400" />;
};

function aqiColor(aqi: number) {
  if (aqi <= 50) return "aqi-good";
  if (aqi <= 100) return "aqi-satisfactory";
  if (aqi <= 200) return "aqi-moderate";
  if (aqi <= 300) return "aqi-poor";
  if (aqi <= 400) return "aqi-very-poor";
  return "aqi-severe";
}

function wqiColor(wqi: number) {
  if (wqi >= 80) return "bg-green-100 text-green-800";
  if (wqi >= 60) return "bg-blue-100 text-blue-800";
  if (wqi >= 40) return "bg-yellow-100 text-yellow-800";
  if (wqi >= 20) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

function noiseColor(db: number) {
  if (db <= 50) return "bg-green-100 text-green-800";
  if (db <= 65) return "bg-blue-100 text-blue-800";
  if (db <= 75) return "bg-yellow-100 text-yellow-800";
  if (db <= 85) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

export function RegionalAnalytics() {
  const [data, setData] = useState<RegionalData[]>([]);

  useEffect(() => {
    api
      .get("/public/regions/analytics")
      .then((res) => setData(res.data))
      .catch(console.error);
    const interval = setInterval(() => {
      api
        .get("/public/regions/analytics")
        .then((res) => setData(res.data))
        .catch(console.error);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Totals
  const totalStations = data.reduce((s, r) => s + r.stations, 0);
  const totalViolations = data.reduce((s, r) => s + r.violations, 0);
  const avgAqi = data.length
    ? Math.round(data.reduce((s, r) => s + r.air_aqi, 0) / data.length)
    : 0;
  const avgWqi = data.length
    ? Math.round(data.reduce((s, r) => s + r.water_wqi, 0) / data.length)
    : 0;
  const avgNoise = data.length
    ? Math.round(data.reduce((s, r) => s + r.noise_db, 0) / data.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="gov-card p-4 text-center">
          <MapPin className="h-5 w-5 mx-auto text-[#1a365d] mb-1" />
          <div className="text-2xl font-bold text-gray-900">{data.length}</div>
          <div className="text-xs text-gray-500">Regions</div>
        </div>
        <div className="gov-card p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {totalStations}
          </div>
          <div className="text-xs text-gray-500">Total Stations</div>
        </div>
        <div className="gov-card p-4 text-center">
          <div
            className={`inline-block text-2xl font-bold px-3 py-0.5 rounded ${aqiColor(avgAqi)}`}
          >
            {avgAqi}
          </div>
          <div className="text-xs text-gray-500 mt-1">Avg AQI</div>
        </div>
        <div className="gov-card p-4 text-center">
          <div
            className={`inline-block text-2xl font-bold px-3 py-0.5 rounded ${wqiColor(avgWqi)}`}
          >
            {avgWqi}
          </div>
          <div className="text-xs text-gray-500 mt-1">Avg WQI</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-red-500">
          <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-1" />
          <div className="text-2xl font-bold text-red-600">
            {totalViolations}
          </div>
          <div className="text-xs text-gray-500">Active Violations</div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header">
          📊 Regional Environmental Dashboard — Chhattisgarh
        </div>
        <div className="overflow-x-auto">
          <table className="gov-table">
            <thead>
              <tr>
                <th>Region</th>
                <th className="text-center">🌬️ Air AQI</th>
                <th className="text-center">Trend</th>
                <th className="text-center">💧 Water WQI</th>
                <th className="text-center">Trend</th>
                <th className="text-center">🔊 Noise dB(A)</th>
                <th className="text-center">Trend</th>
                <th className="text-center">Stations</th>
                <th className="text-center">Violations</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.region}>
                  <td className="font-semibold text-gray-800">{r.region}</td>
                  <td className="text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-sm font-bold ${aqiColor(r.air_aqi)}`}
                    >
                      {Math.round(r.air_aqi)}
                    </span>
                  </td>
                  <td className="text-center">{trendIcon(r.air_trend)}</td>
                  <td className="text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-sm font-bold ${wqiColor(r.water_wqi)}`}
                    >
                      {Math.round(r.water_wqi)}
                    </span>
                  </td>
                  <td className="text-center">{trendIcon(r.water_trend)}</td>
                  <td className="text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-sm font-bold ${noiseColor(r.noise_db)}`}
                    >
                      {Math.round(r.noise_db)}
                    </span>
                  </td>
                  <td className="text-center">{trendIcon(r.noise_trend)}</td>
                  <td className="text-center text-sm text-gray-600">
                    {r.stations}
                  </td>
                  <td className="text-center">
                    {r.violations > 0 ? (
                      <span className="badge-high">{r.violations}</span>
                    ) : (
                      <span className="badge-low">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Region Cards — visual grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.map((r) => (
          <div key={r.region} className="gov-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">{r.region}</h3>
              <span className="text-xs text-gray-400">
                {r.stations} stations
              </span>
            </div>
            {/* Air */}
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
              <span className="text-xs text-gray-500">🌬️ Air AQI</span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-bold px-2 py-0.5 rounded ${aqiColor(r.air_aqi)}`}
                >
                  {Math.round(r.air_aqi)}
                </span>
                {trendIcon(r.air_trend)}
              </div>
            </div>
            {/* Water */}
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
              <span className="text-xs text-gray-500">💧 Water WQI</span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-bold px-2 py-0.5 rounded ${wqiColor(r.water_wqi)}`}
                >
                  {Math.round(r.water_wqi)}
                </span>
                {trendIcon(r.water_trend)}
              </div>
            </div>
            {/* Noise */}
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
              <span className="text-xs text-gray-500">🔊 Noise</span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-bold px-2 py-0.5 rounded ${noiseColor(r.noise_db)}`}
                >
                  {Math.round(r.noise_db)} dB
                </span>
                {trendIcon(r.noise_trend)}
              </div>
            </div>
            {/* Violations */}
            {r.violations > 0 && (
              <div className="mt-2 text-xs text-red-600 font-medium">
                ⚠ {r.violations} active violation{r.violations > 1 ? "s" : ""}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
