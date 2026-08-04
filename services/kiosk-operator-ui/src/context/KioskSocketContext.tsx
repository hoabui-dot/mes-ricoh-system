import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { websocketUrl } from '../lib/runtimeConfig';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface KioskEvent {
  type: string;
  event_type?: string;
  event_id?: string;
  message_id?: string;
  data?: unknown;
}

interface KioskSocketContextType {
  connectionStatus: ConnectionStatus;
  lastEvent: KioskEvent | null;
  refreshVersion: number;
  connectSocket: (terminalId: string, token: string) => void;
  disconnectSocket: () => void;
}

const KioskSocketContext = createContext<KioskSocketContextType>({
  connectionStatus: 'disconnected',
  lastEvent: null,
  refreshVersion: 0,
  connectSocket: () => undefined,
  disconnectSocket: () => undefined,
});

export const useKioskSocket = () => useContext(KioskSocketContext);

export const KioskSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<KioskEvent | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const generationRef = useRef(0);
  const authRef = useRef<{ terminalId: string; token: string } | null>(null);
  const seenEventIdsRef = useRef(new Set<string>());

  const clearTimers = useCallback(() => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    heartbeatTimerRef.current = null;
    reconnectTimerRef.current = null;
  }, []);

  const openSocket = useCallback((generation: number) => {
    const auth = authRef.current;
    if (!auth || generation !== generationRef.current) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(websocketUrl(auth.terminalId));
    } catch (error) {
      console.error('[WebSocket] Runtime configuration error:', error);
      setConnectionStatus('disconnected');
      return;
    }
    wsRef.current = socket;
    setConnectionStatus('connecting');

    socket.onopen = () => {
      if (generation !== generationRef.current) return;
      socket.send(JSON.stringify({ type: 'auth', token: auth.token }));
    };

    socket.onmessage = (message) => {
      if (generation !== generationRef.current) return;
      try {
        const frame = JSON.parse(message.data) as KioskEvent;
        if (frame.type === 'auth_ack') {
          reconnectAttemptRef.current = 0;
          setConnectionStatus('connected');
          setRefreshVersion((value) => value + 1);
          if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' }));
          }, 30000);
          return;
        }
        if (frame.type === 'auth_error') {
          authRef.current = null;
          setConnectionStatus('disconnected');
          socket.close();
          return;
        }
        if (frame.type === 'heartbeat_ack') return;
        if (frame.type !== 'event') return;

        const eventId = frame.event_id;
        const duplicate = Boolean(eventId && seenEventIdsRef.current.has(eventId));
        if (eventId && !duplicate) {
          seenEventIdsRef.current.add(eventId);
          if (seenEventIdsRef.current.size > 500) {
            const oldest = seenEventIdsRef.current.values().next().value;
            if (oldest) seenEventIdsRef.current.delete(oldest);
          }
        }
        if (frame.message_id && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'event_ack', message_id: frame.message_id }));
        }
        if (!duplicate) {
          setLastEvent(frame);
          setRefreshVersion((value) => value + 1);
        }
      } catch (error) {
        console.error('[WebSocket] Parse error:', error);
      }
    };

    socket.onerror = () => {
      if (generation === generationRef.current) setConnectionStatus('disconnected');
    };

    socket.onclose = () => {
      if (generation !== generationRef.current) return;
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
      wsRef.current = null;
      setConnectionStatus('disconnected');
      if (!authRef.current) return;
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 15000);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => openSocket(generation), delay);
    };
  }, []);

  const connectSocket = useCallback((terminalId: string, token: string) => {
    clearTimers();
    generationRef.current += 1;
    reconnectAttemptRef.current = 0;
    authRef.current = { terminalId, token };
    seenEventIdsRef.current.clear();
    if (wsRef.current) wsRef.current.close();
    openSocket(generationRef.current);
  }, [clearTimers, openSocket]);

  const disconnectSocket = useCallback(() => {
    generationRef.current += 1;
    authRef.current = null;
    clearTimers();
    if (wsRef.current) wsRef.current.close();
    wsRef.current = null;
    setConnectionStatus('disconnected');
  }, [clearTimers]);

  useEffect(() => {
    const terminalId = localStorage.getItem('kiosk_terminal_id');
    const token = localStorage.getItem('kiosk_access_token');
    if (terminalId && token) connectSocket(terminalId, token);
    return disconnectSocket;
  }, [connectSocket, disconnectSocket]);

  return (
    <KioskSocketContext.Provider value={{ connectionStatus, lastEvent, refreshVersion, connectSocket, disconnectSocket }}>
      {children}
    </KioskSocketContext.Provider>
  );
};
