import { useEffect, useRef, useState, useCallback } from 'react';

export type WsStatus = 'connecting' | 'live' | 'stale';

/**
 * WebSocket hook with three-state status.
 *
 * Critical: on disconnect the hook sets status = 'stale' but never resets
 * any sensor values — callers keep showing their last known reading with a
 * yellow indicator while the connection is re-established.
 */
export function useWebSocket(url: string, onMessage: (data: any) => void) {
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef<number>(1000);

  const connect = useCallback(() => {
    if (!url) {
      setWsStatus('stale');
      return;
    }

    setWsStatus('connecting');
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
    const ws = new WebSocket(`${wsUrl}${url}`);

    ws.onopen = () => {
      setWsStatus('live');
      reconnectDelayRef.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = () => {
      // Mark stale but DO NOT reset displayed data — keep showing last known values
      setWsStatus('stale');
      setTimeout(() => {
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30_000);
        connect();
      }, reconnectDelayRef.current);
    };

    ws.onerror = () => ws.close();

    wsRef.current = ws;
  }, [url, onMessage]);

  useEffect(() => {
    if (!url) return;
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  return {
    wsStatus,
    isConnected: wsStatus === 'live', // legacy compat for useLiveReadings
  };
}
