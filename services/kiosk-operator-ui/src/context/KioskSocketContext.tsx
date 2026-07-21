import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface KioskSocketContextType {
  connectionStatus: ConnectionStatus;
  lastEvent: any;
  connectSocket: (terminalId: string, token: string) => void;
  disconnectSocket: () => void;
}

const KioskSocketContext = createContext<KioskSocketContextType>({
  connectionStatus: 'disconnected',
  lastEvent: null,
  connectSocket: () => {},
  disconnectSocket: () => {},
});

export const useKioskSocket = () => useContext(KioskSocketContext);

export const KioskSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<any>(null);
  const authRef = useRef<{ terminalId: string; token: string } | null>(null);

  const connectSocket = (terminalId: string, token: string) => {
    authRef.current = { terminalId, token };

    if (wsRef.current) {
      wsRef.current.close();
    }

    const host = window.location.hostname;
    const wsUrl = `ws://${host}:18000/api/mes/kiosk-gateway/ws?terminal_id=${terminalId}`;

    setConnectionStatus('connecting');
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      // Send auth frame
      socket.send(JSON.stringify({ type: 'auth', token }));
      setConnectionStatus('connected');

      // Start 30s heartbeat interval
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 30000);
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type !== 'heartbeat_ack') {
          setLastEvent(parsed);
        }
      } catch (err) {
        console.error('[WebSocket] Parse error:', err);
      }
    };

    socket.onclose = () => {
      setConnectionStatus('disconnected');
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };

    socket.onerror = (err) => {
      console.warn('[WebSocket] Error:', err);
      setConnectionStatus('disconnected');
    };
  };

  const disconnectSocket = () => {
    authRef.current = null;
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  };

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <KioskSocketContext.Provider value={{ connectionStatus, lastEvent, connectSocket, disconnectSocket }}>
      {children}
    </KioskSocketContext.Provider>
  );
};
