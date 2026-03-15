import { create } from 'zustand';

export interface Alert {
  id: string;
  type: string;
  location_id: string;
  industry_id: string;
  parameter_id: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
}

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  addAlert: (alert: Alert) => void;
  clearAlerts: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  unreadCount: 0,
  addAlert: (alert) => set((state) => {
    if (state.alerts.some(a => a.id === alert.id)) return state;
    return {
      alerts: [alert, ...state.alerts].slice(0, 50),
      unreadCount: state.unreadCount + 1
    };
  }),
  clearAlerts: () => set({ alerts: [], unreadCount: 0 }),
}));
