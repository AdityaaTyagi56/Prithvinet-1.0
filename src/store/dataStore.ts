/**
 * Central Zustand store — single source of truth for all live sensor data.
 * Both the API layer and WebSocket feeds write here.
 * UI components only read from here, never from mockData directly.
 */

import { create } from 'zustand';
import type { PollutionType } from '../lib/mockData';

export type WsStatus = 'connecting' | 'live' | 'stale';

export interface StableReading {
  parameter: string;
  value: number;
  recorded_at: string;
}

interface DataStore {
  /**
   * Per-location stable readings for map popups and dashboard cards.
   * Values evolve via random walk — never re-randomized from scratch.
   * Shape: { [locationId]: { [param]: value } }
   */
  stableValues: Record<string, Record<string, number>>;

  /** WebSocket connection status per locationId */
  wsStatus: Record<string, WsStatus>;

  /** Whether each public overview type has been loaded at least once */
  overviewSeeded: Record<PollutionType, boolean>;

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Seed initial values for a location (called once per location on first load) */
  seedLocation: (locationId: string, values: Record<string, number>) => void;

  /**
   * Apply a random-walk step to an existing location value.
   * Each call moves the value ±0.8% from the previous — smooth, continuous.
   */
  walkLocation: (locationId: string, param: string, next: number) => void;

  setWsStatus: (locationId: string, status: WsStatus) => void;
  markOverviewSeeded: (type: PollutionType) => void;
}

export const useDataStore = create<DataStore>((set) => ({
  stableValues: {},
  wsStatus: {},
  overviewSeeded: { air: false, water: false, noise: false },

  seedLocation: (locationId, values) =>
    set((state) => {
      // Only seed if hasn't been seeded yet (prevents re-randomizing on re-renders)
      if (state.stableValues[locationId]) return state;
      return {
        stableValues: {
          ...state.stableValues,
          [locationId]: { ...values },
        },
      };
    }),

  walkLocation: (locationId, param, next) =>
    set((state) => ({
      stableValues: {
        ...state.stableValues,
        [locationId]: {
          ...(state.stableValues[locationId] || {}),
          [param]: next,
        },
      },
    })),

  setWsStatus: (locationId, status) =>
    set((state) => ({
      wsStatus: { ...state.wsStatus, [locationId]: status },
    })),

  markOverviewSeeded: (type) =>
    set((state) => ({
      overviewSeeded: { ...state.overviewSeeded, [type]: true },
    })),
}));
