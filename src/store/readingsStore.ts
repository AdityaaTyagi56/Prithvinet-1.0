import { create } from 'zustand';

export interface Reading {
  location_id: string;
  parameter_id: string;
  parameter: string;
  value: number;
  recorded_at: string;
}

interface ReadingsState {
  latestReadings: Record<string, Record<string, Reading>>;
  addReading: (reading: Reading) => void;
}

export const useReadingsStore = create<ReadingsState>((set) => ({
  latestReadings: {},
  addReading: (reading) => set((state) => {
    const locReadings = state.latestReadings[reading.location_id] || {};
    return {
      latestReadings: {
        ...state.latestReadings,
        [reading.location_id]: {
          ...locReadings,
          [reading.parameter]: reading
        }
      }
    };
  }),
}));
