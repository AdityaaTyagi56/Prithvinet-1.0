import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { useAuthStore } from "../store/authStore";
import {
  LOCATIONS,
  getLocations,
  getPublicOverview,
  getComplianceMetrics,
  getForecastData,
  getLatestReadings,
  getCopilotResponse,
  getAlerts,
  getRegionalAnalytics,
  getIndustryTracker,
  getAqiLogsList,
  getAqiLogRows,
  getAqiLogAnalysis,
  getDemoUser,
  DEMO_TOKEN,
} from "./mockData";
import type { PollutionType, RegionalData } from "./mockData";
import { fetchLiveSnapshot, type LiveSnapshot } from "./liveData";

// ========= DEMO MODE – no backend needed =========
const DEMO_MODE = true;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const realApi = axios.create({
  baseURL: `${API_URL}/api/v1`,
});

realApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

realApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// ---- Mock response helper ----
function mockResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {} as any,
    config: {} as any,
  };
}

// Copilot history store (in-memory)
const copilotSessions: Record<string, { role: string; content: string }[]> = {};

// Track which demo account is logged in
let _loggedInEmail = 'admin@cecb.gov.in';

// Live data cache — loaded on first API call
let _liveSnapshotCache: LiveSnapshot | null = null;
let _liveLoaded = false;
let _regionalPrevAqiByRegion: Record<string, number> = {};

const REGIONAL_BASELINE: Record<string, Pick<RegionalData, "water_wqi" | "water_trend" | "noise_db" | "noise_trend">> = {
  Raipur: { water_wqi: 48, water_trend: "down", noise_db: 73, noise_trend: "stable" },
  Durg: { water_wqi: 44, water_trend: "stable", noise_db: 77, noise_trend: "up" },
  Korba: { water_wqi: 46, water_trend: "down", noise_db: 70, noise_trend: "stable" },
  Bilaspur: { water_wqi: 58, water_trend: "up", noise_db: 66, noise_trend: "down" },
  Rajnandgaon: { water_wqi: 63, water_trend: "stable", noise_db: 61, noise_trend: "stable" },
  Bastar: { water_wqi: 72, water_trend: "up", noise_db: 48, noise_trend: "down" },
  Surguja: { water_wqi: 68, water_trend: "stable", noise_db: 52, noise_trend: "stable" },
};

function _normalizeRegion(city: string | undefined): string {
  const c = (city || "").trim().toLowerCase();
  if (!c) return "";
  if (c.includes("bhilai") || c.includes("durg")) return "Durg";
  if (c.includes("raipur")) return "Raipur";
  if (c.includes("korba")) return "Korba";
  if (c.includes("bilaspur")) return "Bilaspur";
  if (c.includes("rajnandgaon")) return "Rajnandgaon";
  if (c.includes("bastar") || c.includes("jagdalpur")) return "Bastar";
  if (c.includes("surguja") || c.includes("ambikapur")) return "Surguja";
  return city || "";
}

function _mergeRegionalWithLive(base: RegionalData[], snapshot: LiveSnapshot | null): RegionalData[] {
  if (!snapshot?.stations?.length) return base;

  const byRegion = new Map<string, number[]>();

  for (const station of snapshot.stations) {
    const region = _normalizeRegion(station.city);
    if (!region) continue;

    const pm25 = parseFloat(station.pollutants?.["PM2.5"]?.avg || "0");
    const pm10 = parseFloat(station.pollutants?.["PM10"]?.avg || "0");
    const estAqi = pm25 > 0 ? pm25 : (pm10 > 0 ? pm10 * 0.6 : 0);
    if (!(estAqi > 0)) continue;

    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region)!.push(estAqi);
  }

  if (byRegion.size === 0) return base;

  return base.map((r) => {
    const vals = byRegion.get(r.region);
    if (!vals || vals.length === 0) return r;

    const liveAqi = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const delta = liveAqi - r.air_aqi;
    const airTrend: RegionalData["air_trend"] = delta >= 8 ? "up" : delta <= -8 ? "down" : "stable";

    return {
      ...r,
      air_aqi: liveAqi,
      air_trend: airTrend,
    };
  });
}

function _buildRegionalFromLive(snapshot: LiveSnapshot | null): RegionalData[] | null {
  if (!snapshot?.stations?.length) return null;

  const grouped = new Map<string, { aqiVals: number[]; stations: number; violations: number }>();

  for (const station of snapshot.stations) {
    const region = _normalizeRegion(station.city);
    if (!region) continue;

    const pm25 = parseFloat(station.pollutants?.["PM2.5"]?.avg || "0");
    const pm10 = parseFloat(station.pollutants?.["PM10"]?.avg || "0");
    const aqi = pm25 > 0 ? pm25 : (pm10 > 0 ? pm10 * 0.6 : 0);
    if (!(aqi > 0)) continue;

    if (!grouped.has(region)) {
      grouped.set(region, { aqiVals: [], stations: 0, violations: 0 });
    }
    const g = grouped.get(region)!;
    g.aqiVals.push(aqi);
    g.stations += 1;
    if (aqi > 100) g.violations += 1;
  }

  if (grouped.size === 0) return null;

  const rows: RegionalData[] = [];
  const nextPrev: Record<string, number> = {};

  for (const [region, g] of grouped.entries()) {
    const liveAqi = Math.round(g.aqiVals.reduce((a, b) => a + b, 0) / g.aqiVals.length);
    const prev = _regionalPrevAqiByRegion[region];
    const delta = typeof prev === "number" ? liveAqi - prev : 0;
    const airTrend: RegionalData["air_trend"] = delta >= 8 ? "up" : delta <= -8 ? "down" : "stable";
    nextPrev[region] = liveAqi;

    const baseline = REGIONAL_BASELINE[region] || {
      water_wqi: 60,
      water_trend: "stable" as RegionalData["water_trend"],
      noise_db: 60,
      noise_trend: "stable" as RegionalData["noise_trend"],
    };

    rows.push({
      region,
      air_aqi: liveAqi,
      air_trend: airTrend,
      water_wqi: baseline.water_wqi,
      water_trend: baseline.water_trend,
      noise_db: baseline.noise_db,
      noise_trend: baseline.noise_trend,
      stations: g.stations,
      violations: g.violations,
    });
  }

  _regionalPrevAqiByRegion = nextPrev;
  rows.sort((a, b) => b.air_aqi - a.air_aqi);
  return rows;
}

async function _ensureLiveData(): Promise<void> {
  if (_liveLoaded) return;
  _liveLoaded = true;
  try {
    _liveSnapshotCache = await fetchLiveSnapshot();
  } catch {
    // no live data available — fall back to mock
  }
}

function mockGet(
  url: string,
  _config?: AxiosRequestConfig,
): AxiosResponse<any> {
  if (url.includes("/auth/me")) return mockResponse(getDemoUser(_loggedInEmail));

  // Locations – supports ?type=air|water|noise
  if (url.match(/\/locations(\?|$)/)) {
    const qIdx = url.indexOf("?");
    const params =
      qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const type = (params.get("type") || "air") as PollutionType;
    const locs = getLocations(type);

    // Inject live CPCB stations for air type
    if (type === "air" && _liveSnapshotCache?.stations?.length) {
      const liveLocs = _liveSnapshotCache.stations.map((s, i) => ({
        id: `live-${i}`,
        name: s.name,
        latitude: parseFloat(s.lat) || 21.25,
        longitude: parseFloat(s.lon) || 81.63,
        region: s.city,
        type: 'air' as const,
      }));
      return mockResponse([...liveLocs, ...locs]);
    }
    return mockResponse(locs);
  }

  // Public overview – supports ?type=
  if (url.includes("/public/overview")) {
    const qIdx = url.indexOf("?");
    const params =
      qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const type = (params.get("type") || "air") as PollutionType;
    const overview = getPublicOverview(type);

    // Inject real station data from live snapshot for air type
    if (type === "air" && _liveSnapshotCache?.stations?.length) {
      const liveLocations = _liveSnapshotCache.stations.map((s, i) => {
        const pm25Val = parseFloat(s.pollutants?.["PM2.5"]?.avg || "0");
        const pm10Val = parseFloat(s.pollutants?.["PM10"]?.avg || "0");
        // Estimate PM2.5 from PM10 if not available (ratio ~0.6)
        const pm25 = pm25Val > 0 ? pm25Val : (pm10Val > 0 ? pm10Val * 0.6 : 0);
        return {
          location_id: `live-${i}`,
          location_name: `${s.name} (CPCB Live)`,
          latitude: parseFloat(s.lat) || 21.25,
          longitude: parseFloat(s.lon) || 81.63,
          pm25: pm25 || undefined,
          recorded_at: s.last_update,
          pollutants: s.pollutants,
        };
      });
      // Use only live stations for air view to avoid mixing mock with real CPCB data
      overview.locations = liveLocations;
      // Update headline AQI from live PM values
      const liveVals = liveLocations.map(l => l.pm25).filter((v): v is number => !!v && v > 0);
      if (liveVals.length > 0) {
        overview.current_aqi = Math.round(liveVals.reduce((a, b) => a + b, 0) / liveVals.length);
      }
    }

    return mockResponse(overview);
  }

  // Compliance – supports ?type=
  if (url.includes("/compliance/metrics")) {
    const qIdx = url.indexOf("?");
    const params =
      qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const type = (params.get("type") || "air") as PollutionType;
    return mockResponse(getComplianceMetrics(type));
  }

  // Forecast
  const forecastMatch = url.match(/\/forecast\/([^?]+)/);
  if (forecastMatch) {
    const qIdx = url.indexOf("?");
    const params =
      qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const parameter = params.get("parameter") || "PM2.5";
    return mockResponse(getForecastData(parameter));
  }

  // Readings
  if (url.includes("/readings/latest/")) {
    const parts = url.split("/readings/latest/")[1].split("?");
    const locId = parts[0];
    const params = parts[1]
      ? new URLSearchParams(parts[1])
      : new URLSearchParams();
    const type = params.get("type") as PollutionType | null;

    // For live CPCB stations inject real pollutant values from the snapshot
    if (locId.startsWith("live-") && _liveSnapshotCache?.stations?.length) {
      const idx = parseInt(locId.replace("live-", ""), 10);
      const station = _liveSnapshotCache.stations[idx];
      if (station?.pollutants) {
        const pidAlias: Record<string, string> = {
          "PM2.5": "PM2.5", "PM10": "PM10", "SO2": "SO2",
          "NO2": "NO2", "CO": "CO", "OZONE": "O3", "NH3": "NH3",
        };
        const readings = Object.entries(station.pollutants)
          .map(([pid, vals]: [string, any]) => {
            const param = pidAlias[pid] || pid;
            const val = parseFloat(vals?.avg || "0");
            return val > 0 ? {
              location_id: locId, parameter_id: param, parameter: param,
              value: val, recorded_at: station.last_update,
            } : null;
          })
          .filter(Boolean);
        if (readings.length > 0) return mockResponse({ readings });
      }
    }

    return mockResponse(getLatestReadings(locId, type || undefined));
  }

  // Alerts
  if (url.includes("/alerts")) return mockResponse(getAlerts());

  // Regional analytics
  if (url.includes("/regions/analytics")) {
    const liveRegional = _buildRegionalFromLive(_liveSnapshotCache);
    if (liveRegional) return mockResponse(liveRegional);
    return mockResponse(_mergeRegionalWithLive(getRegionalAnalytics(), _liveSnapshotCache));
  }

  // Industry tracker
  if (url.includes("/industries/tracker")) {
    const live = _liveSnapshotCache;
    const baseIndustries = getIndustryTracker();

    if (live && live.stations) {
      const liveIndustries = baseIndustries.map(ind => {
        const copy = { ...ind, live_emissions: { ...ind.live_emissions } };
        const matchingStation = live.stations.find((s: any) => 
          s.city.toLowerCase() === ind.region.toLowerCase() ||
          (ind.region === 'Durg' && s.city.toLowerCase() === 'bhilai')
        );
        if (matchingStation && matchingStation.pollutants) {
          if (matchingStation.pollutants['PM2.5']?.avg) copy.live_emissions['PM2.5'] = parseFloat(matchingStation.pollutants['PM2.5'].avg);
          if (matchingStation.pollutants['PM10']?.avg) copy.live_emissions['PM10'] = parseFloat(matchingStation.pollutants['PM10'].avg);
          if (matchingStation.pollutants['SO2']?.avg) copy.live_emissions['SO2'] = parseFloat(matchingStation.pollutants['SO2'].avg);
          if (matchingStation.pollutants['NO2']?.avg) copy.live_emissions['NO2'] = parseFloat(matchingStation.pollutants['NO2'].avg);
        }
        return copy;
      });
      return mockResponse(liveIndustries);
    }

    return mockResponse(baseIndustries);
  }

  // Copilot history
  if (url.includes("/copilot/history/")) {
    const sessionId = url.split("/copilot/history/")[1];
    return mockResponse({ history: copilotSessions[sessionId] || [] });
  }

  // AQI Logs – list (prefer live data)
  if (url.match(/\/aqi-logs\/?$/) || (url.includes("/aqi-logs") && !url.match(/\/aqi-logs\/\d{4}/))) {
    const live = _liveSnapshotCache;
    if (live) {
      return mockResponse({ logs: live.logs, count: live.logs.length });
    }
    return mockResponse({ logs: getAqiLogsList(), count: 7 });
  }

  // AQI Logs – analysis for a date
  const analysisMatch = url.match(/\/aqi-logs\/(\d{4}-\d{2}-\d{2})\/analysis/);
  if (analysisMatch) {
    return mockResponse(getAqiLogAnalysis(analysisMatch[1]));
  }

  // AQI Logs – rows for a date (prefer live data)
  const logDateMatch = url.match(/\/aqi-logs\/(\d{4}-\d{2}-\d{2})/);
  if (logDateMatch) {
    const live = _liveSnapshotCache;
    if (live && live.today.date === logDateMatch[1]) {
      return mockResponse({ date: logDateMatch[1], rows: live.today.rows, row_count: live.today.row_count });
    }
    const rows = getAqiLogRows(logDateMatch[1]);
    return mockResponse({ date: logDateMatch[1], rows, row_count: rows.length });
  }

  return mockResponse({});
}

function mockPost(url: string, data?: any): AxiosResponse<any> {
  if (url.includes("/auth/login")) {
    _loggedInEmail = data?.email || 'admin@cecb.gov.in';
    return mockResponse({ access_token: DEMO_TOKEN });
  }
  if (url.includes("/copilot/query")) {
    const { session_id, query } = data || {};
    if (!copilotSessions[session_id]) copilotSessions[session_id] = [];
    copilotSessions[session_id].push({ role: "user", content: query });
    const response = getCopilotResponse(query);
    copilotSessions[session_id].push({ role: "assistant", content: response });
    return mockResponse({ content: response });
  }
  return mockResponse({});
}

interface Api {
  get: (
    url: string,
    config?: AxiosRequestConfig,
  ) => Promise<AxiosResponse<any>>;
  post: (
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ) => Promise<AxiosResponse<any>>;
  put: (
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ) => Promise<AxiosResponse<any>>;
  delete: (
    url: string,
    config?: AxiosRequestConfig,
  ) => Promise<AxiosResponse<any>>;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const demoApi: Api = {
  get: async (url, config?) => {
    await _ensureLiveData();
    await delay(150 + Math.random() * 250);
    return mockGet(url, config);
  },
  post: async (url, data?) => {
    await delay(250 + Math.random() * 350);
    return mockPost(url, data);
  },
  put: async () => {
    await delay(150);
    return mockResponse({ ok: true });
  },
  delete: async () => {
    await delay(150);
    return mockResponse({ ok: true });
  },
};

export const api: Api = DEMO_MODE ? demoApi : realApi;
