import { useWebSocket } from './useWebSocket';
import { useReadingsStore } from '../store/readingsStore';

export function useLiveReadings(locationId: string) {
  const addReading = useReadingsStore((state) => state.addReading);
  
  const { isConnected } = useWebSocket(`/ws/readings/${locationId}`, (data) => {
    addReading(data);
  });

  return { isConnected };
}
