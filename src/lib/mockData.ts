// ============================================================
// PrithviNet Demo – Self-contained mock data for Air, Water & Noise
// ============================================================

export type PollutionType = 'air' | 'water' | 'noise';

// ─── Helper ──────────────────────────────────────────────────
function rand(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

// ─── Locations ───────────────────────────────────────────────
export const AIR_LOCATIONS = [
  { id: 'air-1', name: 'Bhilai Steel Plant Gate', latitude: 21.2094, longitude: 81.4285, region: 'Durg', type: 'air' as const },
  { id: 'air-2', name: 'Raipur Civic Centre', latitude: 21.2514, longitude: 81.6296, region: 'Raipur', type: 'air' as const },
  { id: 'air-3', name: 'Korba Thermal Power', latitude: 22.3595, longitude: 82.7501, region: 'Korba', type: 'air' as const },
  { id: 'air-4', name: 'Durg Industrial Area', latitude: 21.1904, longitude: 81.2849, region: 'Durg', type: 'air' as const },
  { id: 'air-5', name: 'Bilaspur Station Road', latitude: 22.0797, longitude: 82.1391, region: 'Bilaspur', type: 'air' as const },
  { id: 'air-6', name: 'Rajnandgaon Market', latitude: 21.0970, longitude: 81.0340, region: 'Rajnandgaon', type: 'air' as const },
  { id: 'air-7', name: 'Jagdalpur Forest Edge', latitude: 19.0839, longitude: 82.0210, region: 'Bastar', type: 'air' as const },
  { id: 'air-8', name: 'Ambikapur Residential', latitude: 23.1187, longitude: 83.1988, region: 'Surguja', type: 'air' as const },
];

export const WATER_LOCATIONS = [
  { id: 'wtr-1', name: 'Mahanadi — Rajim Ghat', latitude: 21.0933, longitude: 81.8806, region: 'Raipur', type: 'water' as const },
  { id: 'wtr-2', name: 'Sheonath River — Durg Bridge', latitude: 21.1850, longitude: 81.2700, region: 'Durg', type: 'water' as const },
  { id: 'wtr-3', name: 'Hasdeo River — Korba Intake', latitude: 22.3480, longitude: 82.6850, region: 'Korba', type: 'water' as const },
  { id: 'wtr-4', name: 'Arpa River — Bilaspur', latitude: 22.0750, longitude: 82.1500, region: 'Bilaspur', type: 'water' as const },
  { id: 'wtr-5', name: 'Kharoon Nallah — Raipur Outfall', latitude: 21.2400, longitude: 81.6100, region: 'Raipur', type: 'water' as const },
  { id: 'wtr-6', name: 'Indravati River — Jagdalpur', latitude: 19.0750, longitude: 82.0100, region: 'Bastar', type: 'water' as const },
];

export const NOISE_LOCATIONS = [
  { id: 'nse-1', name: 'Raipur — Telibandha Commercial', latitude: 21.2480, longitude: 81.6350, region: 'Raipur', type: 'noise' as const },
  { id: 'nse-2', name: 'Bhilai — Sector 6 Market', latitude: 21.2100, longitude: 81.4300, region: 'Durg', type: 'noise' as const },
  { id: 'nse-3', name: 'Korba — NTPC Colony Gate', latitude: 22.3550, longitude: 82.7400, region: 'Korba', type: 'noise' as const },
  { id: 'nse-4', name: 'Bilaspur — Bus Stand Zone', latitude: 22.0810, longitude: 82.1420, region: 'Bilaspur', type: 'noise' as const },
  { id: 'nse-5', name: 'Raipur — Pandri Industrial', latitude: 21.2350, longitude: 81.6450, region: 'Raipur', type: 'noise' as const },
  { id: 'nse-6', name: 'Rajnandgaon — Hospital Zone', latitude: 21.0990, longitude: 81.0300, region: 'Rajnandgaon', type: 'noise' as const },
];

export function getLocations(type: PollutionType) {
  if (type === 'water') return WATER_LOCATIONS;
  if (type === 'noise') return NOISE_LOCATIONS;
  return AIR_LOCATIONS;
}

// Legacy compat
export const LOCATIONS = AIR_LOCATIONS;

// ─── Parameters ──────────────────────────────────────────────
export const AIR_PARAMS  = ['PM2.5', 'PM10', 'SO2', 'NO2', 'CO', 'O3'];
export const WATER_PARAMS = ['pH', 'BOD', 'COD', 'TDS', 'DO', 'Turbidity'];
export const NOISE_PARAMS = ['Leq', 'Lmax', 'Lmin', 'L10', 'L90', 'Ln'];
export const PARAMETERS = AIR_PARAMS;

export const PARAMS_BY_TYPE: Record<PollutionType, string[]> = {
  air: AIR_PARAMS, water: WATER_PARAMS, noise: NOISE_PARAMS,
};

export const UNITS: Record<string, string> = {
  'PM2.5': 'µg/m³', PM10: 'µg/m³', SO2: 'µg/m³', NO2: 'µg/m³', CO: 'mg/m³', O3: 'µg/m³',
  pH: '', BOD: 'mg/L', COD: 'mg/L', TDS: 'mg/L', DO: 'mg/L', Turbidity: 'NTU',
  Leq: 'dB(A)', Lmax: 'dB(A)', Lmin: 'dB(A)', L10: 'dB(A)', L90: 'dB(A)', Ln: 'dB(A)',
};

export const LIMITS: Record<string, number> = {
  'PM2.5': 60, PM10: 100, SO2: 80, NO2: 80, CO: 2, O3: 100,
  pH: 8.5, BOD: 30, COD: 250, TDS: 2100, DO: 5, Turbidity: 10,
  Leq: 75, Lmax: 85, Lmin: 50, L10: 80, L90: 55, Ln: 70,
};

// ─── Base values ────────────────────────────────────────────
const AIR_BASE: Record<string, number> = { 'PM2.5': 82, PM10: 145, SO2: 38, NO2: 48, CO: 1.8, O3: 42 };
const WATER_BASE: Record<string, number> = { pH: 7.4, BOD: 22, COD: 180, TDS: 1450, DO: 5.8, Turbidity: 7.2 };
const NOISE_BASE: Record<string, number> = { Leq: 68, Lmax: 82, Lmin: 42, L10: 74, L90: 48, Ln: 62 };

function getBase(p: string): number {
  return AIR_BASE[p] ?? WATER_BASE[p] ?? NOISE_BASE[p] ?? 50;
}

// ─── Reading generator ──────────────────────────────────────
function reading(locationId: string, param: string, baseValue: number) {
  const jitter = rand(-baseValue * 0.15, baseValue * 0.15);
  let val = Math.round((baseValue + jitter) * 100) / 100;
  if (param === 'pH') val = Math.max(6, Math.min(9, val));
  else val = Math.max(0, val);
  return {
    location_id: locationId, parameter_id: param, parameter: param,
    value: val, recorded_at: new Date().toISOString(),
  };
}

export function getLatestReadings(locationId: string, type?: PollutionType) {
  const t = type || (locationId.startsWith('wtr') ? 'water' : locationId.startsWith('nse') ? 'noise' : 'air');
  return PARAMS_BY_TYPE[t].map(p => reading(locationId, p, getBase(p)));
}

// ─── Public overview ────────────────────────────────────────
export function getPublicOverview(type: PollutionType = 'air') {
  if (type === 'water') {
    return {
      current_aqi: rand(38, 72), current_category: rand(0, 1) > 0.5 ? 'Moderately Polluted' : 'Polluted',
      index_label: 'WQI',
      forecast: [{ label: 'Tomorrow', aqi: rand(35, 68) }, { label: 'Day After', aqi: rand(30, 60) }, { label: 'This Weekend', aqi: rand(40, 70) }],
      locations: WATER_LOCATIONS.map(l => ({ location_id: l.id, location_name: l.name, latitude: l.latitude, longitude: l.longitude, pm25: rand(15, 40), recorded_at: new Date().toISOString() })),
    };
  }
  if (type === 'noise') {
    return {
      current_aqi: rand(64, 82), current_category: rand(0, 1) > 0.5 ? 'Noisy Zone' : 'Moderate',
      index_label: 'Avg dB(A)',
      forecast: [{ label: 'Tomorrow', aqi: rand(60, 78) }, { label: 'Day After', aqi: rand(58, 76) }, { label: 'This Weekend', aqi: rand(55, 72) }],
      locations: NOISE_LOCATIONS.map(l => ({ location_id: l.id, location_name: l.name, latitude: l.latitude, longitude: l.longitude, pm25: rand(55, 85), recorded_at: new Date().toISOString() })),
    };
  }
  return {
    current_aqi: rand(110, 210), current_category: 'Unhealthy for Sensitive Groups',
    index_label: 'AQI',
    forecast: [{ label: 'Tomorrow', aqi: rand(100, 180) }, { label: 'Day After', aqi: rand(90, 160) }, { label: 'This Weekend', aqi: rand(80, 150) }],
    locations: AIR_LOCATIONS.map(l => ({ location_id: l.id, location_name: l.name, latitude: l.latitude, longitude: l.longitude, pm25: rand(35, 180), recorded_at: new Date().toISOString() })),
  };
}

// ─── Compliance metrics ─────────────────────────────────────
export function getComplianceMetrics(type: PollutionType = 'air') {
  if (type === 'water') {
    return {
      total_industries: 32, compliant_industries: 19, active_violations: 9, pending_escalations: 4, pollution_type: 'water',
      recent_violations: [
        { industry: 'CG Paper Mills', violation_type: 'BOD Exceedance', date: '2026-03-09', severity: 'critical', status: 'open' },
        { industry: 'Raipur Dyeing Cluster', violation_type: 'COD Continuous', date: '2026-03-08', severity: 'high', status: 'escalated' },
        { industry: 'Korba Sugar Factory', violation_type: 'TDS Above Limit', date: '2026-03-07', severity: 'medium', status: 'open' },
        { industry: 'Durg Distillery', violation_type: 'pH Out of Range', date: '2026-03-06', severity: 'high', status: 'open' },
        { industry: 'Bhilai Chemicals', violation_type: 'Low DO Discharge', date: '2026-03-05', severity: 'critical', status: 'escalated' },
      ],
    };
  }
  if (type === 'noise') {
    return {
      total_industries: 24, compliant_industries: 16, active_violations: 6, pending_escalations: 2, pollution_type: 'noise',
      recent_violations: [
        { industry: 'Raipur Cement Crusher', violation_type: 'Leq Night Exceeded', date: '2026-03-10', severity: 'high', status: 'open' },
        { industry: 'Bhilai Steel Plant', violation_type: 'Lmax > 85 dB(A)', date: '2026-03-09', severity: 'critical', status: 'escalated' },
        { industry: 'Korba Mining Zone', violation_type: 'Continuous Noise', date: '2026-03-08', severity: 'medium', status: 'open' },
        { industry: 'Bilaspur Stone Crusher', violation_type: 'Boundary Noise', date: '2026-03-07', severity: 'high', status: 'open' },
      ],
    };
  }
  return {
    total_industries: 47, compliant_industries: 31, active_violations: 12, pending_escalations: 5, pollution_type: 'air',
    recent_violations: [
      { industry: 'Bharat Steel Works', violation_type: 'SO2 Exceedance', date: '2026-03-08', severity: 'critical', status: 'open' },
      { industry: 'Chhattisgarh Power Ltd', violation_type: 'PM10 Continuous', date: '2026-03-07', severity: 'high', status: 'escalated' },
      { industry: 'Raipur Chemicals', violation_type: 'NO2 Spike', date: '2026-03-06', severity: 'medium', status: 'open' },
      { industry: 'Korba Cement Corp', violation_type: 'PM2.5 Threshold', date: '2026-03-05', severity: 'high', status: 'open' },
      { industry: 'Durg Alloys Pvt Ltd', violation_type: 'CO Night Emission', date: '2026-03-04', severity: 'low', status: 'resolved' },
    ],
  };
}

// ─── Forecast data (48h) ────────────────────────────────────
export function getForecastData(parameter: string, anchorValue?: number | null) {
  // Use the real current reading as base if provided, so forecast starts from actual measured values
  const base = (anchorValue != null && anchorValue > 0) ? anchorValue : getBase(parameter);
  const now = Date.now();
  const data = [];
  for (let i = 0; i < 48; i++) {
    const t = now + i * 3600000;
    const hourCycle = Math.sin((i / 24) * Math.PI * 2) * base * 0.2;
    const isPH = parameter === 'pH';
    const point = isPH
      ? Math.max(6, Math.min(9, base + hourCycle * 0.05 + rand(-0.3, 0.3)))
      : Math.max(1, base + hourCycle + rand(-base * 0.08, base * 0.08));
    const spread = isPH ? rand(0.2, 0.5) : rand(base * 0.06, base * 0.14);
    data.push({
      timestamp: new Date(t).toISOString(),
      point: Math.round(point * 100) / 100,
      lower: Math.round((point - spread) * 100) / 100,
      upper: Math.round((point + spread) * 100) / 100,
    });
  }
  return data;
}

// ─── Intelligent Alerts ─────────────────────────────────────
export interface AlertData {
  id: string;
  pollution_type: PollutionType;
  location: string;
  region: string;
  industry: string;
  parameter: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'acknowledged' | 'escalated' | 'auto-escalated' | 'resolved';
  triggered_at: string;
  auto_escalation_at: string | null;
  recommended_action: string;
}

export function getAlerts(): AlertData[] {
  const now = new Date();
  return [
    { id: 'alrt-1', pollution_type: 'air', location: 'Bhilai Steel Plant Gate', region: 'Durg', industry: 'Bharat Steel Works', parameter: 'SO2', value: 94.2, threshold: 80, severity: 'critical', status: 'active', triggered_at: new Date(now.getTime() - 25 * 60000).toISOString(), auto_escalation_at: new Date(now.getTime() + 35 * 60000).toISOString(), recommended_action: 'Activate scrubber system on BF#3; deploy mobile monitoring at downwind residential zone.' },
    { id: 'alrt-2', pollution_type: 'air', location: 'Korba Thermal Power', region: 'Korba', industry: 'Chhattisgarh Power Ltd', parameter: 'PM10', value: 148.6, threshold: 100, severity: 'high', status: 'escalated', triggered_at: new Date(now.getTime() - 120 * 60000).toISOString(), auto_escalation_at: null, recommended_action: 'Issue show-cause notice; verify ESP efficiency; schedule inspection within 48h.' },
    { id: 'alrt-3', pollution_type: 'air', location: 'Raipur Civic Centre', region: 'Raipur', industry: 'Raipur Chemicals', parameter: 'NO2', value: 88.1, threshold: 80, severity: 'medium', status: 'active', triggered_at: new Date(now.getTime() - 45 * 60000).toISOString(), auto_escalation_at: new Date(now.getTime() + 15 * 60000).toISOString(), recommended_action: 'Cross-check with CAAQMS data; issue advisory for nearby schools.' },
    { id: 'alrt-4', pollution_type: 'air', location: 'Durg Industrial Area', region: 'Durg', industry: 'Durg Alloys Pvt Ltd', parameter: 'PM2.5', value: 72.3, threshold: 60, severity: 'medium', status: 'acknowledged', triggered_at: new Date(now.getTime() - 180 * 60000).toISOString(), auto_escalation_at: null, recommended_action: 'Monitor trend; issue warning if sustained above 60 for 4+ hours.' },
    { id: 'alrt-5', pollution_type: 'water', location: 'Kharoon Nallah — Raipur Outfall', region: 'Raipur', industry: 'Raipur Dyeing Cluster', parameter: 'BOD', value: 48.5, threshold: 30, severity: 'critical', status: 'active', triggered_at: new Date(now.getTime() - 15 * 60000).toISOString(), auto_escalation_at: new Date(now.getTime() + 45 * 60000).toISOString(), recommended_action: 'Immediate sample collection; notify SPCB; inspect CETP operations.' },
    { id: 'alrt-6', pollution_type: 'water', location: 'Sheonath River — Durg Bridge', region: 'Durg', industry: 'Durg Distillery', parameter: 'pH', value: 5.2, threshold: 6.5, severity: 'high', status: 'active', triggered_at: new Date(now.getTime() - 60 * 60000).toISOString(), auto_escalation_at: new Date(now.getTime()).toISOString(), recommended_action: 'Acidic discharge detected; halt discharge immediately; collect upstream/downstream samples.' },
    { id: 'alrt-7', pollution_type: 'water', location: 'Hasdeo River — Korba Intake', region: 'Korba', industry: 'Korba Sugar Factory', parameter: 'COD', value: 310, threshold: 250, severity: 'medium', status: 'acknowledged', triggered_at: new Date(now.getTime() - 200 * 60000).toISOString(), auto_escalation_at: null, recommended_action: 'Verify treatment plant operations; schedule follow-up sampling in 24h.' },
    { id: 'alrt-8', pollution_type: 'noise', location: 'Raipur — Pandri Industrial', region: 'Raipur', industry: 'Raipur Cement Crusher', parameter: 'Leq', value: 82.4, threshold: 75, severity: 'high', status: 'active', triggered_at: new Date(now.getTime() - 30 * 60000).toISOString(), auto_escalation_at: new Date(now.getTime() + 30 * 60000).toISOString(), recommended_action: 'Verify noise barriers; issue direction under Noise Pollution Rules 2000.' },
    { id: 'alrt-9', pollution_type: 'noise', location: 'Bhilai — Sector 6 Market', region: 'Durg', industry: 'Bhilai Steel Plant', parameter: 'Lmax', value: 92.1, threshold: 85, severity: 'critical', status: 'escalated', triggered_at: new Date(now.getTime() - 90 * 60000).toISOString(), auto_escalation_at: null, recommended_action: 'Night-time operations exceeding limits; issue closure direction for non-compliant unit.' },
    { id: 'alrt-10', pollution_type: 'noise', location: 'Rajnandgaon — Hospital Zone', region: 'Rajnandgaon', industry: 'Construction Site', parameter: 'Leq', value: 71.8, threshold: 50, severity: 'high', status: 'active', triggered_at: new Date(now.getTime() - 40 * 60000).toISOString(), auto_escalation_at: new Date(now.getTime() + 20 * 60000).toISOString(), recommended_action: 'Silence zone violation; halt noisy construction; notify district administration.' },
  ];
}

// ─── Regional Analytics ─────────────────────────────────────
export interface RegionalData {
  region: string;
  air_aqi: number;  air_trend: 'up' | 'down' | 'stable';
  water_wqi: number; water_trend: 'up' | 'down' | 'stable';
  noise_db: number;  noise_trend: 'up' | 'down' | 'stable';
  stations: number;  violations: number;
}

export function getRegionalAnalytics(): RegionalData[] {
  return [
    { region: 'Raipur', air_aqi: rand(120, 180), air_trend: 'up', water_wqi: rand(40, 55), water_trend: 'down', noise_db: rand(68, 78), noise_trend: 'stable', stations: 12, violations: 5 },
    { region: 'Durg', air_aqi: rand(140, 200), air_trend: 'up', water_wqi: rand(35, 50), water_trend: 'stable', noise_db: rand(72, 82), noise_trend: 'up', stations: 8, violations: 7 },
    { region: 'Korba', air_aqi: rand(130, 190), air_trend: 'stable', water_wqi: rand(38, 52), water_trend: 'down', noise_db: rand(65, 75), noise_trend: 'stable', stations: 6, violations: 4 },
    { region: 'Bilaspur', air_aqi: rand(80, 130), air_trend: 'down', water_wqi: rand(50, 65), water_trend: 'up', noise_db: rand(60, 72), noise_trend: 'down', stations: 5, violations: 2 },
    { region: 'Rajnandgaon', air_aqi: rand(70, 110), air_trend: 'down', water_wqi: rand(55, 70), water_trend: 'stable', noise_db: rand(55, 68), noise_trend: 'stable', stations: 4, violations: 1 },
    { region: 'Bastar', air_aqi: rand(40, 70), air_trend: 'stable', water_wqi: rand(65, 80), water_trend: 'up', noise_db: rand(40, 55), noise_trend: 'down', stations: 3, violations: 0 },
    { region: 'Surguja', air_aqi: rand(50, 80), air_trend: 'stable', water_wqi: rand(60, 75), water_trend: 'stable', noise_db: rand(45, 58), noise_trend: 'stable', stations: 3, violations: 1 },
  ];
}

// ─── Industry Tracker ───────────────────────────────────────
export interface IndustryData {
  id: string; name: string; type: string; region: string;
  consent_valid_until: string;
  air_status: 'compliant' | 'non-compliant' | 'warning' | 'n/a';
  water_status: 'compliant' | 'non-compliant' | 'warning' | 'n/a';
  noise_status: 'compliant' | 'non-compliant' | 'warning' | 'n/a';
  last_inspection: string; total_violations_ytd: number; risk_score: number;
}

export function getIndustryTracker(): IndustryData[] {
  return [
    { id: 'ind-1', name: 'Bharat Steel Works', type: 'Iron & Steel', region: 'Durg', consent_valid_until: '2026-12-31', air_status: 'non-compliant', water_status: 'warning', noise_status: 'non-compliant', last_inspection: '2026-02-15', total_violations_ytd: 8, risk_score: 89 },
    { id: 'ind-2', name: 'Chhattisgarh Power Ltd', type: 'Thermal Power', region: 'Korba', consent_valid_until: '2027-03-31', air_status: 'non-compliant', water_status: 'compliant', noise_status: 'compliant', last_inspection: '2026-01-20', total_violations_ytd: 5, risk_score: 72 },
    { id: 'ind-3', name: 'Raipur Chemicals', type: 'Chemical Mfg', region: 'Raipur', consent_valid_until: '2026-09-30', air_status: 'warning', water_status: 'non-compliant', noise_status: 'compliant', last_inspection: '2026-02-28', total_violations_ytd: 4, risk_score: 65 },
    { id: 'ind-4', name: 'Korba Cement Corp', type: 'Cement', region: 'Korba', consent_valid_until: '2026-06-30', air_status: 'non-compliant', water_status: 'n/a', noise_status: 'warning', last_inspection: '2026-03-01', total_violations_ytd: 6, risk_score: 78 },
    { id: 'ind-5', name: 'Durg Alloys Pvt Ltd', type: 'Metallurgy', region: 'Durg', consent_valid_until: '2027-01-15', air_status: 'warning', water_status: 'compliant', noise_status: 'compliant', last_inspection: '2026-02-10', total_violations_ytd: 2, risk_score: 38 },
    { id: 'ind-6', name: 'CG Paper Mills', type: 'Pulp & Paper', region: 'Raipur', consent_valid_until: '2026-08-31', air_status: 'compliant', water_status: 'non-compliant', noise_status: 'n/a', last_inspection: '2026-01-05', total_violations_ytd: 5, risk_score: 71 },
    { id: 'ind-7', name: 'Raipur Dyeing Cluster', type: 'Textile/Dyeing', region: 'Raipur', consent_valid_until: '2026-07-31', air_status: 'n/a', water_status: 'non-compliant', noise_status: 'n/a', last_inspection: '2026-02-22', total_violations_ytd: 7, risk_score: 82 },
    { id: 'ind-8', name: 'Korba Sugar Factory', type: 'Sugar/Distillery', region: 'Korba', consent_valid_until: '2027-02-28', air_status: 'compliant', water_status: 'warning', noise_status: 'compliant', last_inspection: '2026-03-05', total_violations_ytd: 3, risk_score: 45 },
    { id: 'ind-9', name: 'Durg Distillery', type: 'Distillery', region: 'Durg', consent_valid_until: '2026-11-30', air_status: 'n/a', water_status: 'non-compliant', noise_status: 'compliant', last_inspection: '2026-02-18', total_violations_ytd: 4, risk_score: 68 },
    { id: 'ind-10', name: 'Bilaspur Stone Crusher', type: 'Mining/Crushing', region: 'Bilaspur', consent_valid_until: '2026-05-15', air_status: 'warning', water_status: 'n/a', noise_status: 'non-compliant', last_inspection: '2026-01-25', total_violations_ytd: 3, risk_score: 58 },
    { id: 'ind-11', name: 'Raipur Cement Crusher', type: 'Cement', region: 'Raipur', consent_valid_until: '2026-10-31', air_status: 'compliant', water_status: 'n/a', noise_status: 'non-compliant', last_inspection: '2026-03-08', total_violations_ytd: 2, risk_score: 52 },
    { id: 'ind-12', name: 'Bhilai Chemicals', type: 'Chemical Mfg', region: 'Durg', consent_valid_until: '2026-04-30', air_status: 'compliant', water_status: 'non-compliant', noise_status: 'warning', last_inspection: '2026-02-05', total_violations_ytd: 6, risk_score: 76 },
  ];
}

// ─── Copilot ────────────────────────────────────────────────
const COPILOT_RESPONSES: Record<string, string> = {
  default: `Based on PrithviNet multi-domain sensor network:\n\n🌬️ **Air Quality:**\n• PM2.5 at 89 µg/m³ (Unhealthy for Sensitive Groups)\n• SO2 trending upward +12% near Bhilai Steel Plant\n\n💧 **Water Quality:**\n• Kharoon Nallah BOD at 42 mg/L (limit: 30) — EXCEEDED\n• Sheonath River DO low at 4.1 mg/L\n\n🔊 **Noise Levels:**\n• Pandri Industrial zone at 78 dB(A) (limit: 75)\n• Hospital zone Rajnandgaon at 68 dB(A) — silence zone violation\n\n⚠️ **Active Alerts:** 10 across all domains (4 Air | 3 Water | 3 Noise)\n\n🔮 **Recommended Actions:**\n1. Issue advisory for sensitive populations in Raipur\n2. Inspect CETP at Raipur Dyeing Cluster\n3. Enforce noise barriers at Pandri crushers`,
  'bharat steel': `🏭 **Bharat Steel Works — Multi-Domain Analysis**\n\n**🌬️ Air:** SO2 94.2 µg/m³ (Limit 80) ⚠️ | PM10 142 µg/m³ (Limit 100) ⚠️\n**💧 Water:** Cooling discharge pH 6.8 (marginal) | TSS 95 mg/L\n**🔊 Noise:** Boundary 82 dB(A) (Limit 75) ⚠️\n\n📈 **Risk Score: 89/100** (Critical) — 8 violations YTD\n\n🔧 **Interventions:**\n1. Activate scrubber on BF#3 (40% SO2 cut)\n2. Reduce sintering throughput 15%\n3. Install acoustic enclosures on grinding units\n4. Deploy ambient monitors at downwind zone\n\n📋 2 more breaches → Show Cause Notice under Air Act §21 & Water Act §33`,
  'festival shutdown': `🎆 **Festival Shutdown Simulation (3-day)**\n\n📉 **Air Impact:**\n| Param | Now | Day1 | Day2 | Day3 |\n|-------|-----|------|------|------|\n| PM2.5 | 89  | 62   | 48   | 41   |\n| SO2   | 38  | 18   | 12   | 9    |\n\n📉 **Water Impact:**\n| Param | Now | Day1 | Day2 | Day3 |\n|-------|-----|------|------|------|\n| BOD   | 42  | 28   | 19   | 14   |\n| DO    | 4.1 | 5.2  | 6.1  | 6.8  |\n\n📉 **Noise:** Industrial zones drop from 78→52 dB(A)\n\n🌱 **Recommendation:** Rotating shutdown policy for top 5 emitters → 30% sustained reduction across all domains.`,
  'water': `💧 **Water Quality — Chhattisgarh Rivers**\n\n**Mahanadi (Rajim):** pH 7.3 ✅ | BOD 18 ✅ | DO 6.2 ✅ — Class B\n**Sheonath (Durg):** pH 6.8 ⚠️ | BOD 35 ❌ | DO 4.1 ❌ — Class D\n**Kharoon Nallah:** BOD 48 ❌ | COD 310 ❌ — Class E\n**Hasdeo (Korba):** pH 7.5 ✅ | TDS 1800 ⚠️ — Class C\n\n⚠️ 3 rivers below acceptable DO | Raipur outfall needs CETP upgrade`,
  'noise': `🔊 **Noise Analysis — Chhattisgarh**\n\n| Zone | Limit Day/Night | Current | Status |\n|------|----------------|---------|--------|\n| Industrial | 75/70 dB | 78 dB | ❌ |\n| Commercial | 65/55 dB | 72 dB | ❌ |\n| Residential | 55/45 dB | 58 dB | ❌ |\n| Silence | 50/40 dB | 68 dB | ❌ |\n\n62% locations exceed daytime limits | Night violations 40% higher\nTop sources: crushers (82-88 dB), steel plant (78-92 dB), construction (71 dB)\n\n🔧 Install barriers at Bhilai | Restrict crushers 8AM-6PM | Enforce Noise Rules 2000`,
};

export function getCopilotResponse(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('bharat') || q.includes('steel') || q.includes('so2')) return COPILOT_RESPONSES['bharat steel'];
  if (q.includes('festival') || q.includes('shutdown') || q.includes('diwali')) return COPILOT_RESPONSES['festival shutdown'];
  if (q.includes('water') || q.includes('river') || q.includes('bod') || q.includes('effluent')) return COPILOT_RESPONSES['water'];
  if (q.includes('noise') || q.includes('decibel') || q.includes('db') || q.includes('sound')) return COPILOT_RESPONSES['noise'];
  return COPILOT_RESPONSES['default'];
}

// ─── Demo users (role-based) ────────────────────────────────
export const DEMO_USERS: Record<string, { id: string; email: string; name: string; role: string; designation: string; region_office_id?: string }> = {
  'admin@cecb.gov.in': {
    id: 'usr-001', email: 'admin@cecb.gov.in', name: 'Admin',
    role: 'admin', designation: 'System Administrator',
    region_office_id: 'ro-hq',
  },
  'member-secretary@cecb.gov.in': {
    id: 'usr-002', email: 'member-secretary@cecb.gov.in', name: 'Dr. R. K. Sharma',
    role: 'member_secretary', designation: 'Member Secretary, CECB',
    region_office_id: 'ro-hq',
  },
  'ro.raipur@cecb.gov.in': {
    id: 'usr-003', email: 'ro.raipur@cecb.gov.in', name: 'Sh. Anil Verma',
    role: 'regional_officer', designation: 'Regional Officer, Raipur',
    region_office_id: 'ro-raipur',
  },
  'ro.bhilai@cecb.gov.in': {
    id: 'usr-004', email: 'ro.bhilai@cecb.gov.in', name: 'Sh. Pradeep Mishra',
    role: 'regional_officer', designation: 'Regional Officer, Bhilai',
    region_office_id: 'ro-bhilai',
  },
};

export function getDemoUser(email?: string) {
  if (email && DEMO_USERS[email]) return DEMO_USERS[email];
  return DEMO_USERS['admin@cecb.gov.in'];
}

// Keep backward-compat
export const DEMO_USER = DEMO_USERS['admin@cecb.gov.in'];

export const DEMO_TOKEN = 'demo-jwt-token-prithvinet-2026';

// ─── AQI Logs (daily spreadsheet mock data) ─────────────────
export function getAqiLogsList() {
  const logs = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    logs.push({
      date: dateStr,
      row_count: Math.floor(Math.random() * 30) + 10,
      file_size_bytes: Math.floor(Math.random() * 50000) + 5000,
      has_analysis: i < 3,
    });
  }
  return logs;
}

export function getAqiLogRows(dateStr: string) {
  const stations = [
    { name: 'AIIMS, Raipur - CECB', district: 'Raipur' },
    { name: 'Bhilai Steel Plant Gate', district: 'Durg' },
    { name: 'Korba Thermal Power', district: 'Korba' },
    { name: 'Bilaspur Station Road', district: 'Bilaspur' },
    { name: 'Rajnandgaon Market', district: 'Rajnandgaon' },
    { name: 'Durg Industrial Area', district: 'Durg' },
  ];
  const rows = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const stn of stations) {
      rows.push({
        timestamp: `${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`,
        station_name: stn.name,
        district: stn.district,
        PM10: String(rand(60, 200)),
        'PM2.5': String(rand(30, 130)),
        SO2: String(rand(10, 65)),
        NO2: String(rand(18, 75)),
        source: 'govapi',
      });
    }
  }
  return rows;
}

export function getAqiLogAnalysis(dateStr: string) {
  return {
    date: dateStr,
    generated_at: new Date().toISOString(),
    aggregates: {
      pollutant_stats: {
        PM10: { count: 144, avg: 131.4, min: 58.0, max: 198.0 },
        'PM2.5': { count: 144, avg: 79.6, min: 28.0, max: 142.0 },
        SO2: { count: 144, avg: 36.8, min: 11.0, max: 62.0 },
        NO2: { count: 144, avg: 46.2, min: 19.0, max: 74.0 },
      },
      worst_station: 'Korba Thermal Power',
      worst_value: 142.0,
      total_readings: 144,
      unique_stations: 6,
      unique_districts: 5,
    },
    ai_insight: {
      trend: 'PM2.5 levels show a clear diurnal pattern with peaks during morning (6-9 AM) and evening (6-10 PM) rush hours. Korba thermal station consistently reports the highest values, 40% above the district average. SO2 levels remain within CPCB limits but show an upward trend near industrial zones.',
      risk_level: 'medium',
      risk_areas: [
        'Korba district shows sustained PM2.5 above 100 \u00b5g/m\u00b3 during peak hours — exceeds NAAQS 24-hour standard',
        'Evening peaks across Raipur and Durg coincide with vehicular + industrial emissions',
        'SO2 near Bhilai Steel Plant trending upward — approaching 80% of prescribed limit',
      ],
      recommendations: [
        'Increase monitoring frequency at Korba Thermal Power during 6-10 PM window',
        'Issue public advisory for sensitive groups (children, elderly) in Raipur during evening hours',
        'Coordinate with NTPC Korba for emission audit of Unit 4 and 5 ESPs',
        'Deploy mobile monitoring van at Durg Industrial Area for 48-hour continuous sampling',
      ],
      forecast_context: 'Elevated PM2.5 near thermal power and steel plants suggests industrial emission patterns should be weighted higher in 48h forecasts. Evening inversion trapping is a likely cause of nighttime concentration buildup.',
    },
  };
}
