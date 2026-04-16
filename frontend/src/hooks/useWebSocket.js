import { useState, useEffect, useRef } from 'react';

export function useWebSocket(url) {
  const [data, setData] = useState(null);
  const ws = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const connect = () => {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('WS connected to', url);
        heartbeatRef.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send('ping');
          }
        }, 25000);
      };

      ws.current.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
        } catch (e) {
          console.warn('WS parse failed', e);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WS error', error);
      };

      ws.current.onclose = () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        if (!isMounted) return;
        console.log('WS closed, retrying...');
        reconnectRef.current = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (ws.current) ws.current.close();
    };
  }, [url]);

  return data;
}
