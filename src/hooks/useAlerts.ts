import { useWebSocket } from './useWebSocket';
import { useAlertStore } from '../store/alertStore';

export function useAlerts(regionId?: string) {
  const addAlert = useAlertStore((state) => state.addAlert);
  const url = regionId ? `/ws/alerts?region_id=${regionId}` : '/ws/alerts';
  
  const { isConnected } = useWebSocket(url, (data) => {
    addAlert(data);
  });

  return { isConnected };
}
