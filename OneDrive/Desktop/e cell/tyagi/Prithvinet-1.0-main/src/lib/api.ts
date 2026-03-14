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
  DEMO_USER,
  DEMO_TOKEN,
} from "./mockData";
import type { PollutionType } from "./mockData";
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

// Live data cache — loaded on first API call
let _liveSnapshotCache: LiveSnapshot | null = null;
let _liveLoaded = false;

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
  if (url.includes("/auth/me")) return mockResponse(DEMO_USER);

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
      // Live stations first, then mock stations
      overview.locations = [...liveLocations, ...overview.locations];
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
    return mockResponse(getLatestReadings(locId, type || undefined));
  }

  // Alerts
  if (url.includes("/alerts")) return mockResponse(getAlerts());

  // Regional analytics
  if (url.includes("/regions/analytics"))
    return mockResponse(getRegionalAnalytics());

  // Industry tracker
  if (url.includes("/industries/tracker"))
    return mockResponse(getIndustryTracker());

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
  if (url.includes("/auth/login"))
    return mockResponse({ access_token: DEMO_TOKEN });
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
