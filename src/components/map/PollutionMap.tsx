import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet.heat';
import {
  Wind, Droplets, Volume2, Factory, Layers, Eye, EyeOff, MapPin,
} from 'lucide-react';
import {
  AIR_LOCATIONS, WATER_LOCATIONS, NOISE_LOCATIONS,
  getIndustryTracker, getLatestReadings,
  UNITS, LIMITS, PARAMS_BY_TYPE,
} from '../../lib/mockData';
import type { PollutionType, IndustryData } from '../../lib/mockData';

// ── Fix Leaflet default icon ──
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// ── Custom marker icons ──
function createIcon(color: string, size: number = 12) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const ICONS = {
  air: createIcon('#3b82f6', 14),
  water: createIcon('#06b6d4', 14),
  noise: createIcon('#f59e0b', 14),
  industry: createIcon('#ef4444', 16),
};

// ── AQI color helper ──
function aqiColor(val: number): string {
  if (val <= 50) return '#009966';
  if (val <= 100) return '#58bc2d';
  if (val <= 200) return '#CABC0B';
  if (val <= 300) return '#FF9933';
  if (val <= 400) return '#CC0033';
  return '#660000';
}

// ── Heatmap Layer ──
function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!map || points.length === 0) return;
    layerRef.current = (L as any).heatLayer(points, {
      radius: 30,
      blur: 20,
      maxZoom: 12,
      gradient: { 0.2: '#009966', 0.4: '#58bc2d', 0.6: '#CABC0B', 0.8: '#FF9933', 1.0: '#CC0033' },
    }).addTo(map);
    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [map, points]);

  return null;
}

// ── Chhattisgarh District Boundaries (simplified GeoJSON) ──
const CG_DISTRICTS_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Raipur', stations: 3 }, geometry: { type: 'Polygon', coordinates: [[[81.45, 21.15], [81.80, 21.15], [81.80, 21.35], [81.45, 21.35], [81.45, 21.15]]] } },
    { type: 'Feature', properties: { name: 'Durg', stations: 2 }, geometry: { type: 'Polygon', coordinates: [[[81.10, 21.10], [81.45, 21.10], [81.45, 21.30], [81.10, 21.30], [81.10, 21.10]]] } },
    { type: 'Feature', properties: { name: 'Korba', stations: 2 }, geometry: { type: 'Polygon', coordinates: [[[82.55, 22.20], [82.90, 22.20], [82.90, 22.50], [82.55, 22.50], [82.55, 22.20]]] } },
    { type: 'Feature', properties: { name: 'Bilaspur', stations: 2 }, geometry: { type: 'Polygon', coordinates: [[[81.95, 21.95], [82.30, 21.95], [82.30, 22.20], [81.95, 22.20], [81.95, 21.95]]] } },
    { type: 'Feature', properties: { name: 'Rajnandgaon', stations: 1 }, geometry: { type: 'Polygon', coordinates: [[[80.85, 21.00], [81.15, 21.00], [81.15, 21.20], [80.85, 21.20], [80.85, 21.00]]] } },
    { type: 'Feature', properties: { name: 'Bastar (Jagdalpur)', stations: 1 }, geometry: { type: 'Polygon', coordinates: [[[81.85, 18.95], [82.15, 18.95], [82.15, 19.20], [81.85, 19.20], [81.85, 18.95]]] } },
    { type: 'Feature', properties: { name: 'Surguja (Ambikapur)', stations: 1 }, geometry: { type: 'Polygon', coordinates: [[[83.00, 23.00], [83.35, 23.00], [83.35, 23.25], [83.00, 23.25], [83.00, 23.00]]] } },
  ],
};

function districtStyle() {
  return {
    color: '#14532d',
    weight: 2,
    fillColor: '#dcfce7',
    fillOpacity: 0.12,
    dashArray: '6 3',
  };
}

function onEachDistrict(feature: GeoJSON.Feature, layer: L.Layer) {
  if (feature.properties?.name) {
    layer.bindTooltip(
      `<strong>${feature.properties.name}</strong><br/>${feature.properties.stations || 0} monitoring station(s)`,
      { sticky: true, className: 'district-tooltip' }
    );
  }
}

// ── Industry locations (derived from existing mock data) ──
const INDUSTRY_LOCATIONS: { id: string; name: string; lat: number; lng: number; type: string; risk: number; region: string }[] = [
  { id: 'ind-1', name: 'Bharat Steel Works', lat: 21.2094, lng: 81.4285, type: 'Iron & Steel', risk: 89, region: 'Durg' },
  { id: 'ind-2', name: 'Chhattisgarh Power Ltd', lat: 22.3595, lng: 82.7501, type: 'Thermal Power', risk: 72, region: 'Korba' },
  { id: 'ind-3', name: 'Raipur Chemicals', lat: 21.2514, lng: 81.6296, type: 'Chemical Mfg', risk: 65, region: 'Raipur' },
  { id: 'ind-4', name: 'Korba Cement Corp', lat: 22.35, lng: 82.74, type: 'Cement', risk: 78, region: 'Korba' },
  { id: 'ind-5', name: 'Durg Alloys Pvt Ltd', lat: 21.19, lng: 81.29, type: 'Metallurgy', risk: 38, region: 'Durg' },
  { id: 'ind-6', name: 'CG Paper Mills', lat: 21.24, lng: 81.62, type: 'Pulp & Paper', risk: 71, region: 'Raipur' },
  { id: 'ind-7', name: 'Raipur Dyeing Cluster', lat: 21.235, lng: 81.645, type: 'Textile/Dyeing', risk: 82, region: 'Raipur' },
  { id: 'ind-8', name: 'Korba Sugar Factory', lat: 22.348, lng: 82.685, type: 'Sugar/Distillery', risk: 45, region: 'Korba' },
  { id: 'ind-9', name: 'Durg Distillery', lat: 21.185, lng: 81.27, type: 'Distillery', risk: 68, region: 'Durg' },
  { id: 'ind-10', name: 'Bilaspur Stone Crusher', lat: 22.081, lng: 82.142, type: 'Mining/Crushing', risk: 58, region: 'Bilaspur' },
  { id: 'ind-11', name: 'Raipur Cement Crusher', lat: 21.248, lng: 81.635, type: 'Cement', risk: 52, region: 'Raipur' },
  { id: 'ind-12', name: 'Bhilai Chemicals', lat: 21.21, lng: 81.43, type: 'Chemical Mfg', risk: 76, region: 'Durg' },
];

// ── Station popup with pollutant values ──
function StationPopupContent({ readings, name, type }: {
  readings: ReturnType<typeof getLatestReadings>;
  name: string;
  type: PollutionType;
}) {
  const params = PARAMS_BY_TYPE[type];

  return (
    <div style={{ minWidth: 220, fontSize: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: '#14532d' }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, fontSize: 11, color: '#666' }}>
        <span style={{
          display: 'inline-block',
          width: 8, height: 8,
          borderRadius: '50%',
          background: type === 'air' ? '#3b82f6' : type === 'water' ? '#06b6d4' : '#f59e0b',
        }} />
        {type === 'air' ? 'Air Quality' : type === 'water' ? 'Water Quality' : 'Noise Level'} Station
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #86efac' }}>
            <th style={{ textAlign: 'left', padding: '3px 6px', color: '#14532d', fontWeight: 600 }}>Parameter</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', color: '#14532d', fontWeight: 600 }}>Value</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', color: '#14532d', fontWeight: 600 }}>Limit</th>
          </tr>
        </thead>
        <tbody>
          {readings.map(r => {
            const limit = LIMITS[r.parameter_id];
            const exceeded = limit != null && (
              r.parameter_id === 'DO' ? r.value < limit :
              r.parameter_id === 'pH' ? (r.value < 6.5 || r.value > 8.5) :
              r.value > limit
            );
            return (
              <tr key={r.parameter_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '3px 6px', fontWeight: 500 }}>{r.parameter_id}</td>
                <td style={{
                  padding: '3px 6px', textAlign: 'right', fontWeight: 700,
                  color: exceeded ? '#dc2626' : '#16a34a',
                }}>
                  {r.value.toFixed(1)} <span style={{ fontWeight: 400, color: '#999' }}>{UNITS[r.parameter_id]}</span>
                </td>
                <td style={{ padding: '3px 6px', textAlign: 'right', color: '#888' }}>
                  {limit ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Industry popup ──
function IndustryPopupContent({ ind }: { ind: typeof INDUSTRY_LOCATIONS[0] }) {
  const riskColor = ind.risk >= 80 ? '#dc2626' : ind.risk >= 60 ? '#ea580c' : ind.risk >= 40 ? '#ca8a04' : '#16a34a';
  return (
    <div style={{ minWidth: 200, fontSize: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#991b1b' }}>{ind.name}</div>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>{ind.type} — {ind.region}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>Risk Score:</span>
        <div style={{ flex: 1, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${ind.risk}%`, height: '100%', background: riskColor, borderRadius: 4 }} />
        </div>
        <span style={{ fontWeight: 700, color: riskColor }}>{ind.risk}</span>
      </div>
    </div>
  );
}

// ── Props (backward-compatible) ──
interface MapLocation {
  location_id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  pm25: number;
  recorded_at: string;
}

interface PollutionMapProps {
  locations?: MapLocation[];
  pollutionType?: PollutionType;
}

// ═══════════════════════════════════════════════════════════════
// Main map component
// ═══════════════════════════════════════════════════════════════
export function PollutionMap({ locations = [], pollutionType = 'air' }: PollutionMapProps) {
  const [layers, setLayers] = useState({
    air: true,
    water: true,
    noise: true,
    industries: true,
    heatmap: true,
    districts: true,
  });
  const [panelOpen, setPanelOpen] = useState(true);

  /**
   * Pre-generate all station readings ONCE per map mount.
   * Empty deps ensures getLatestReadings() is never called again (no re-randomizing).
   * Popup content receives these stable values regardless of how many times they're opened.
   */
  const stableReadings = useMemo(() => {
    const map: Record<string, ReturnType<typeof getLatestReadings>> = {};
    [...AIR_LOCATIONS, ...WATER_LOCATIONS, ...NOISE_LOCATIONS].forEach(loc => {
      map[loc.id] = getLatestReadings(loc.id, loc.type);
    });
    return map;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: keyof typeof layers) =>
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  const center: [number, number] = [21.6, 81.85]; // Center of Chhattisgarh

  // Build heatmap points from primary locations passed in
  const heatPoints: [number, number, number][] = useMemo(() => {
    if (!layers.heatmap) return [];
    return locations.map(loc => [
      loc.latitude,
      loc.longitude,
      Math.min(Math.max(loc.pm25 / 200, 0.1), 1),
    ]);
  }, [locations, layers.heatmap]);

  const layerControls: { key: keyof typeof layers; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'air', label: 'Air Stations', icon: <Wind className="h-3.5 w-3.5" />, color: '#3b82f6' },
    { key: 'water', label: 'Water Stations', icon: <Droplets className="h-3.5 w-3.5" />, color: '#06b6d4' },
    { key: 'noise', label: 'Noise Stations', icon: <Volume2 className="h-3.5 w-3.5" />, color: '#f59e0b' },
    { key: 'industries', label: 'Industries', icon: <Factory className="h-3.5 w-3.5" />, color: '#ef4444' },
    { key: 'heatmap', label: 'AQI Heatmap', icon: <MapPin className="h-3.5 w-3.5" />, color: '#a855f7' },
    { key: 'districts', label: 'District Boundaries', icon: <Layers className="h-3.5 w-3.5" />, color: '#14532d' },
  ];

  return (
    <div className="relative h-[520px] w-full rounded-lg overflow-hidden border border-gray-200">
      <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }} zoomControl={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* District boundary overlays */}
        {layers.districts && (
          <GeoJSON
            data={CG_DISTRICTS_GEOJSON}
            style={districtStyle}
            onEachFeature={onEachDistrict}
          />
        )}

        {/* AQI Heatmap */}
        {layers.heatmap && heatPoints.length > 0 && <HeatmapLayer points={heatPoints} />}

        {/* Air station markers */}
        {layers.air && AIR_LOCATIONS.map(loc => (
          <Marker key={loc.id} position={[loc.latitude, loc.longitude]} icon={ICONS.air}>
            <Popup maxWidth={280}>
              <StationPopupContent
                readings={stableReadings[loc.id] || []}
                name={loc.name}
                type="air"
              />
            </Popup>
          </Marker>
        ))}

        {/* Water station markers */}
        {layers.water && WATER_LOCATIONS.map(loc => (
          <Marker key={loc.id} position={[loc.latitude, loc.longitude]} icon={ICONS.water}>
            <Popup maxWidth={280}>
              <StationPopupContent
                readings={stableReadings[loc.id] || []}
                name={loc.name}
                type="water"
              />
            </Popup>
          </Marker>
        ))}

        {/* Noise station markers */}
        {layers.noise && NOISE_LOCATIONS.map(loc => (
          <Marker key={loc.id} position={[loc.latitude, loc.longitude]} icon={ICONS.noise}>
            <Popup maxWidth={280}>
              <StationPopupContent
                readings={stableReadings[loc.id] || []}
                name={loc.name}
                type="noise"
              />
            </Popup>
          </Marker>
        ))}

        {/* Industry markers */}
        {layers.industries && INDUSTRY_LOCATIONS.map(ind => (
          <Marker key={ind.id} position={[ind.lat, ind.lng]} icon={ICONS.industry}>
            <Popup maxWidth={260}>
              <IndustryPopupContent ind={ind} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ── Layer control panel ── */}
      <div className="absolute top-3 right-3 z-[1000]">
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex items-center gap-1.5 text-xs font-semibold text-[#14532d] hover:bg-green-50 transition-colors"
          title="Toggle layer panel"
        >
          <Layers className="h-4 w-4" />
          {panelOpen ? 'Layers' : 'Layers'}
        </button>

        {panelOpen && (
          <div className="mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-52">
            <div className="text-xs font-bold text-[#14532d] mb-2 pb-1.5 border-b border-green-200 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Map Layers
            </div>
            <div className="space-y-1">
              {layerControls.map(lc => (
                <button
                  key={lc.key}
                  onClick={() => toggle(lc.key)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                    layers[lc.key]
                      ? 'bg-green-50 text-[#14532d] border border-green-200'
                      : 'bg-gray-50 text-gray-400 border border-gray-100'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center"
                    style={{
                      backgroundColor: layers[lc.key] ? lc.color : 'transparent',
                      borderColor: lc.color,
                    }}
                  >
                    {layers[lc.key] && (
                      <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" /></svg>
                    )}
                  </span>
                  {lc.icon}
                  {lc.label}
                  <span className="ml-auto">
                    {layers[lc.key] ? <Eye className="h-3 w-3 text-green-600" /> : <EyeOff className="h-3 w-3 text-gray-300" />}
                  </span>
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-3 pt-2 border-t border-green-100">
              <div className="text-[10px] font-semibold text-gray-500 mb-1.5">AQI LEGEND</div>
              <div className="flex gap-0.5">
                {[
                  { color: '#009966', label: 'Good' },
                  { color: '#58bc2d', label: 'OK' },
                  { color: '#CABC0B', label: 'Mod' },
                  { color: '#FF9933', label: 'Poor' },
                  { color: '#CC0033', label: 'Bad' },
                  { color: '#660000', label: 'Sev' },
                ].map(item => (
                  <div key={item.color} className="flex-1 text-center">
                    <div className="h-2 rounded-sm" style={{ backgroundColor: item.color }} />
                    <div className="text-[8px] text-gray-400 mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Station count badge ── */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 rounded-lg shadow border border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-600 flex items-center gap-3">
        {layers.air && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />{AIR_LOCATIONS.length} Air</span>}
        {layers.water && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />{WATER_LOCATIONS.length} Water</span>}
        {layers.noise && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />{NOISE_LOCATIONS.length} Noise</span>}
        {layers.industries && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />{INDUSTRY_LOCATIONS.length} Industries</span>}
      </div>
    </div>
  );
}
