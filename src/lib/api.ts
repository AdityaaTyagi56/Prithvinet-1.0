import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { useAuthStore } from '../store/authStore';
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
  DEMO_USER,
  DEMO_TOKEN,
} from './mockData';
import type { PollutionType } from './mockData';

// ========= DEMO MODE – no backend needed =========
const DEMO_MODE = true;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ---- Mock response helper ----
function mockResponse<T>(data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {} as any, config: {} as any };
}

// Copilot history store (in-memory)
const copilotSessions: Record<string, { role: string; content: string }[]> = {};

function mockGet(url: string, _config?: AxiosRequestConfig): AxiosResponse<any> {
  if (url.includes('/auth/me')) return mockResponse(DEMO_USER);

  // Locations – supports ?type=air|water|noise
  if (url.match(/\/locations(\?|$)/)) {
    const qIdx = url.indexOf('?');
    const params = qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const type = (params.get('type') || 'air') as PollutionType;
    return mockResponse(getLocations(type));
  }

  // Public overview – supports ?type=
  if (url.includes('/public/overview')) {
    const qIdx = url.indexOf('?');
    const params = qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const type = (params.get('type') || 'air') as PollutionType;
    return mockResponse(getPublicOverview(type));
  }

  // Compliance – supports ?type=
  if (url.includes('/compliance/metrics')) {
    const qIdx = url.indexOf('?');
    const params = qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const type = (params.get('type') || 'air') as PollutionType;
    return mockResponse(getComplianceMetrics(type));
  }

  // Forecast
  const forecastMatch = url.match(/\/forecast\/([^?]+)/);
  if (forecastMatch) {
    const qIdx = url.indexOf('?');
    const params = qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const parameter = params.get('parameter') || 'PM2.5';
    return mockResponse(getForecastData(parameter));
  }

  // Readings
  if (url.includes('/readings/latest/')) {
    const parts = url.split('/readings/latest/')[1].split('?');
    const locId = parts[0];
    const params = parts[1] ? new URLSearchParams(parts[1]) : new URLSearchParams();
    const type = params.get('type') as PollutionType | null;
    return mockResponse(getLatestReadings(locId, type || undefined));
  }

  // Alerts
  if (url.includes('/alerts')) return mockResponse(getAlerts());

  // Regional analytics
  if (url.includes('/regions/analytics')) return mockResponse(getRegionalAnalytics());

  // Industry tracker
  if (url.includes('/industries/tracker')) return mockResponse(getIndustryTracker());

  // Copilot history
  if (url.includes('/copilot/history/')) {
    const sessionId = url.split('/copilot/history/')[1];
    return mockResponse({ history: copilotSessions[sessionId] || [] });
  }

  return mockResponse({});
}

function mockPost(url: string, data?: any): AxiosResponse<any> {
  if (url.includes('/auth/login')) return mockResponse({ access_token: DEMO_TOKEN });
  if (url.includes('/copilot/query')) {
    const { session_id, query } = data || {};
    if (!copilotSessions[session_id]) copilotSessions[session_id] = [];
    copilotSessions[session_id].push({ role: 'user', content: query });
    const response = getCopilotResponse(query);
    copilotSessions[session_id].push({ role: 'assistant', content: response });
    return mockResponse({ content: response });
  }
  return mockResponse({});
}

interface Api {
  get: (url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<any>>;
  post: (url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<any>>;
  put: (url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<any>>;
  delete: (url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<any>>;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const demoApi: Api = {
  get: async (url, config?) => { await delay(150 + Math.random() * 250); return mockGet(url, config); },
  post: async (url, data?) => { await delay(250 + Math.random() * 350); return mockPost(url, data); },
  put: async () => { await delay(150); return mockResponse({ ok: true }); },
  delete: async () => { await delay(150); return mockResponse({ ok: true }); },
};

export const api: Api = DEMO_MODE ? demoApi : realApi;
