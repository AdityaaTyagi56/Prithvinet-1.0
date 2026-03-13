import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(url: string, onMessage: (data: any) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>(1000);

  const connect = useCallback(() => {
    if (!url) {
      setIsConnected(false);
      return;
    }

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
    const ws = new WebSocket(`${wsUrl}${url}`);

    ws.onopen = () => {
      setIsConnected(true);
      reconnectTimeoutRef.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(() => {
        reconnectTimeoutRef.current = Math.min(reconnectTimeoutRef.current * 2, 30000);
        connect();
      }, reconnectTimeoutRef.current);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };

    wsRef.current = ws;
  }, [url, onMessage]);

  useEffect(() => {
    if (!url) {
      return;
    }

    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected };
}
