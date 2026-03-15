import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, MapPin, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { PollutionMap } from '../../components/map/PollutionMap';
import type { RegionalData } from '../../lib/mockData';

interface RegionalMapLocation {
  location_id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  pm25: number;
  recorded_at: string;
  region?: string;
}

interface RegionalOverview {
  locations: RegionalMapLocation[];
}

const trendIcon = (t: string) => {
  if (t === 'up') return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
  if (t === 'down') return <TrendingDown className="h-3.5 w-3.5 text-green-500" />;
  return <Minus className="h-3.5 w-3.5 text-gray-400" />;
};

function aqiColor(aqi: number) {
  if (aqi <= 50) return 'aqi-good';
  if (aqi <= 100) return 'aqi-satisfactory';
  if (aqi <= 200) return 'aqi-moderate';
  if (aqi <= 300) return 'aqi-poor';
  if (aqi <= 400) return 'aqi-very-poor';
  return 'aqi-severe';
}

function wqiColor(wqi: number) {
  if (wqi >= 80) return 'bg-green-100 text-green-800';
  if (wqi >= 60) return 'bg-blue-100 text-blue-800';
  if (wqi >= 40) return 'bg-yellow-100 text-yellow-800';
  if (wqi >= 20) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

function noiseColor(db: number) {
  if (db <= 50) return 'bg-green-100 text-green-800';
  if (db <= 65) return 'bg-blue-100 text-blue-800';
  if (db <= 75) return 'bg-yellow-100 text-yellow-800';
  if (db <= 85) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

function normalizeRegionName(value?: string): string {
  const name = (value || '').toLowerCase();
  if (name.includes('bhilai') || name.includes('durg')) return 'Durg';
  if (name.includes('raipur')) return 'Raipur';
  if (name.includes('korba')) return 'Korba';
  if (name.includes('bilaspur')) return 'Bilaspur';
  if (name.includes('rajnandgaon')) return 'Rajnandgaon';
  if (name.includes('jagdalpur') || name.includes('bastar')) return 'Bastar';
  if (name.includes('ambikapur') || name.includes('surguja')) return 'Surguja';
  return value || '';
}

export function RegionalAnalytics() {
  const [data, setData] = useState<RegionalData[]>([]);
  const [mapLocations, setMapLocations] = useState<RegionalMapLocation[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<RegionalMapLocation | null>(null);

  useEffect(() => {
    api.get('/regions/analytics').then(res => setData(res.data)).catch(console.error);
    api.get('/public/overview?type=air')
      .then(res => setMapLocations(((res.data as RegionalOverview).locations || []).map((location) => ({
        ...location,
        region: normalizeRegionName(location.region || location.location_name),
      }))))
      .catch(console.error);

    const interval = setInterval(() => {
      api.get('/regions/analytics').then(res => setData(res.data)).catch(console.error);
      api.get('/public/overview?type=air')
        .then(res => setMapLocations(((res.data as RegionalOverview).locations || []).map((location) => ({
          ...location,
          region: normalizeRegionName(location.region || location.location_name),
        }))))
        .catch(console.error);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Totals
  const totalStations = data.reduce((s, r) => s + r.stations, 0);
  const totalViolations = data.reduce((s, r) => s + r.violations, 0);
  const avgAqi = data.length ? Math.round(data.reduce((s, r) => s + r.air_aqi, 0) / data.length) : 0;
  const avgWqi = data.length ? Math.round(data.reduce((s, r) => s + r.water_wqi, 0) / data.length) : 0;
  const avgNoise = data.length ? Math.round(data.reduce((s, r) => s + r.noise_db, 0) / data.length) : 0;
  const focusedRegionData = data.find((region) => region.region === selectedRegion) || data[0] || null;
  const topRegions = [...data].sort((a, b) => b.air_aqi - a.air_aqi).slice(0, 3);

  const selectedRegionCount = selectedRegion
    ? mapLocations.filter((location) => location.region === selectedRegion).length
    : mapLocations.length;

  const focusRegion = (region: string) => {
    setSelectedLocation(null);
    setSelectedRegion((current) => (current === region ? null : region));
  };

  const handleLocationSelect = (location: RegionalMapLocation | null) => {
    setSelectedLocation(location);
    setSelectedRegion(location?.region || null);
  };

  const selectedRegionLabel = selectedLocation
    ? `${selectedLocation.location_name} selected`
    : selectedRegion
      ? `${selectedRegion} region focused`
      : 'All monitored regions visible';

  const selectedRegionLocationCount = selectedLocation ? 1 : selectedRegionCount;

  return (
    <div className="space-y-6">
      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="gov-card p-4 text-center">
          <MapPin className="h-5 w-5 mx-auto text-[#14532d] mb-1" />
          <div className="text-2xl font-bold text-gray-900">{data.length}</div>
          <div className="text-xs text-gray-500">Regions</div>
        </div>
        <div className="gov-card p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{totalStations}</div>
          <div className="text-xs text-gray-500">Total Stations</div>
        </div>
        <div className="gov-card p-4 text-center">
          <div className={`inline-block text-2xl font-bold px-3 py-0.5 rounded ${aqiColor(avgAqi)}`}>{avgAqi}</div>
          <div className="text-xs text-gray-500 mt-1">Avg AQI</div>
        </div>
        <div className="gov-card p-4 text-center">
          <div className={`inline-block text-2xl font-bold px-3 py-0.5 rounded ${wqiColor(avgWqi)}`}>{avgWqi}</div>
          <div className="text-xs text-gray-500 mt-1">Avg WQI</div>
        </div>
        <div className="gov-card p-4 text-center border-l-4 border-l-red-500">
          <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-1" />
          <div className="text-2xl font-bold text-red-600">{totalViolations}</div>
          <div className="text-xs text-gray-500">Active Violations</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="gov-card md:col-span-2 overflow-hidden rounded-xl shadow-sm border border-green-100">
          <div className="gov-card-header flex items-center gap-2 bg-[#14532d] text-white">
            <MapPin className="h-4 w-4" />
            Regional Environmental Map — Chhattisgarh
          </div>
          <div className="p-3 bg-gradient-to-b from-green-50/50 to-white">
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-green-100 bg-white/90 px-3 py-2 text-sm text-gray-600 shadow-sm">
              <div>
                <span className="font-semibold text-[#14532d]">
                  {selectedRegionLabel}
                </span>
                <span className="ml-2 text-xs text-gray-500">{selectedRegionLocationCount} mapped location{selectedRegionLocationCount === 1 ? '' : 's'}</span>
              </div>
              {(selectedRegion || selectedLocation) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLocation(null);
                    setSelectedRegion(null);
                  }}
                  className="rounded-md border border-green-200 px-2.5 py-1 text-xs font-semibold text-[#14532d] transition-colors hover:bg-green-50"
                >
                  Reset map focus
                </button>
              )}
            </div>
            <div className="w-full overflow-hidden rounded-xl border border-green-100 shadow-sm">
              <PollutionMap
                locations={mapLocations}
                pollutionType="air"
                selectedLocationId={selectedLocation?.location_id || null}
                selectedRegion={selectedRegion}
                heightClassName="h-[360px]"
                onLocationSelect={(location) => handleLocationSelect(location as RegionalMapLocation | null)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="gov-card overflow-hidden">
            <div className="gov-card-header flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Regional Snapshot
            </div>
            <div className="p-4 space-y-3">
              {selectedLocation ? (
                <>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected Location</div>
                    <div className="mt-1 text-lg font-bold text-gray-900">{selectedLocation.location_name}</div>
                    <div className="mt-1 text-sm text-gray-500">{selectedLocation.region || 'Chhattisgarh'} region</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-green-100 bg-green-50/70 p-3 text-center">
                      <div className="text-xs text-gray-500">Live AQI</div>
                      <div className={`mt-1 inline-block rounded px-2 py-0.5 text-lg font-bold ${aqiColor(selectedLocation.pm25)}`}>
                        {Math.round(selectedLocation.pm25)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-center">
                      <div className="text-xs text-gray-500">Recorded At</div>
                      <div className="mt-1 text-sm font-bold text-gray-900">{selectedLocation.recorded_at || 'N/A'}</div>
                    </div>
                    <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 text-center">
                      <div className="text-xs text-gray-500">Latitude</div>
                      <div className="mt-1 text-sm font-bold text-gray-900">{selectedLocation.latitude.toFixed(3)}</div>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-center">
                      <div className="text-xs text-gray-500">Longitude</div>
                      <div className="mt-1 text-sm font-bold text-gray-900">{selectedLocation.longitude.toFixed(3)}</div>
                    </div>
                  </div>
                </>
              ) : focusedRegionData ? (
                <>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Focused Region</div>
                    <div className="mt-1 text-lg font-bold text-gray-900">{focusedRegionData.region}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-green-100 bg-green-50/70 p-3 text-center">
                      <div className="text-xs text-gray-500">Air AQI</div>
                      <div className={`mt-1 inline-block rounded px-2 py-0.5 text-lg font-bold ${aqiColor(focusedRegionData.air_aqi)}`}>
                        {Math.round(focusedRegionData.air_aqi)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-center">
                      <div className="text-xs text-gray-500">Stations</div>
                      <div className="mt-1 text-lg font-bold text-gray-900">{focusedRegionData.stations}</div>
                    </div>
                    <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 text-center">
                      <div className="text-xs text-gray-500">Water WQI</div>
                      <div className={`mt-1 inline-block rounded px-2 py-0.5 text-lg font-bold ${wqiColor(focusedRegionData.water_wqi)}`}>
                        {Math.round(focusedRegionData.water_wqi)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-red-100 bg-red-50/70 p-3 text-center">
                      <div className="text-xs text-gray-500">Violations</div>
                      <div className="mt-1 text-lg font-bold text-red-600">{focusedRegionData.violations}</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">Regional snapshot unavailable.</div>
              )}
            </div>
          </div>

          <div className="gov-card overflow-hidden">
            <div className="gov-card-header">Highest Air Load</div>
            <div className="p-4 space-y-2">
              {topRegions.map((region) => (
                <button
                  key={region.region}
                  type="button"
                  onClick={() => focusRegion(region.region)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selectedRegion === region.region ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-white hover:bg-green-50/50'}`}
                >
                  <span className="font-medium text-gray-800">{region.region}</span>
                  <span className={`rounded px-2 py-0.5 text-sm font-bold ${aqiColor(region.air_aqi)}`}>{Math.round(region.air_aqi)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="gov-card overflow-hidden">
        <div className="gov-card-header">📊 Regional Environmental Dashboard — Chhattisgarh</div>
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
              {data.map(r => (
                <tr
                  key={r.region}
                  onClick={() => focusRegion(r.region)}
                  className={`cursor-pointer transition-colors hover:bg-green-50/60 ${selectedRegion === r.region ? 'bg-green-50' : ''}`}
                >
                  <td className="font-semibold text-gray-800">
                    <button
                      type="button"
                      onClick={() => focusRegion(r.region)}
                      className="flex items-center gap-2 text-left text-inherit"
                    >
                      <MapPin className="h-3.5 w-3.5 text-[#14532d]" />
                      {r.region}
                    </button>
                  </td>
                  <td className="text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded text-sm font-bold ${aqiColor(r.air_aqi)}`}>
                      {Math.round(r.air_aqi)}
                    </span>
                  </td>
                  <td className="text-center">{trendIcon(r.air_trend)}</td>
                  <td className="text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded text-sm font-bold ${wqiColor(r.water_wqi)}`}>
                      {Math.round(r.water_wqi)}
                    </span>
                  </td>
                  <td className="text-center">{trendIcon(r.water_trend)}</td>
                  <td className="text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded text-sm font-bold ${noiseColor(r.noise_db)}`}>
                      {Math.round(r.noise_db)}
                    </span>
                  </td>
                  <td className="text-center">{trendIcon(r.noise_trend)}</td>
                  <td className="text-center text-sm text-gray-600">{r.stations}</td>
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
        {data.map(r => (
          <button
            key={r.region}
            type="button"
            onClick={() => focusRegion(r.region)}
            className={`gov-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${selectedRegion === r.region ? 'ring-2 ring-green-300' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">{r.region}</h3>
              <span className="text-xs text-gray-400">{r.stations} stations</span>
            </div>
            {/* Air */}
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
              <span className="text-xs text-gray-500">🌬️ Air AQI</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${aqiColor(r.air_aqi)}`}>{Math.round(r.air_aqi)}</span>
                {trendIcon(r.air_trend)}
              </div>
            </div>
            {/* Water */}
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
              <span className="text-xs text-gray-500">💧 Water WQI</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${wqiColor(r.water_wqi)}`}>{Math.round(r.water_wqi)}</span>
                {trendIcon(r.water_trend)}
              </div>
            </div>
            {/* Noise */}
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
              <span className="text-xs text-gray-500">🔊 Noise</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${noiseColor(r.noise_db)}`}>{Math.round(r.noise_db)} dB</span>
                {trendIcon(r.noise_trend)}
              </div>
            </div>
            {/* Violations */}
            {r.violations > 0 && (
              <div className="mt-2 text-xs text-red-600 font-medium">
                ⚠ {r.violations} active violation{r.violations > 1 ? 's' : ''}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
