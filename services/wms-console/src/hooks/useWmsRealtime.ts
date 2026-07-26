import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

export type WmsRealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export function useWmsRealtime(): WmsRealtimeStatus {
  const { authenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WmsRealtimeStatus>('disconnected');
  const seenEventIds = useRef(new Set<string>());

  useEffect(() => {
    if (!authenticated || !user?.token) {
      setStatus('disconnected');
      return undefined;
    }
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let attempt = 0;
    const connect = () => {
      if (!active) return;
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/wms/outbound/realtime/ws`);
      socket.onopen = () => {
        attempt = 0;
        setStatus('connected');
        socket?.send(JSON.stringify({ type: 'auth', token: user.token }));
        void queryClient.invalidateQueries({ queryKey: ['outbound', 'material-requests'] });
        heartbeatTimer = window.setInterval(() => socket?.send(JSON.stringify({ type: 'heartbeat' })), 25000);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { event_id?: string; event_type?: string; message_type?: string; payload?: { request_id?: string } };
          if (message.event_id && seenEventIds.current.has(message.event_id)) return;
          if (message.event_id) {
            seenEventIds.current.add(message.event_id);
            if (seenEventIds.current.size > 500) {
              const first = seenEventIds.current.values().next().value as string | undefined;
              if (first) seenEventIds.current.delete(first);
            }
          }
          if (message.event_type?.startsWith('WMS.Outbound.Material') || message.message_type === 'wms.material_request.updated') {
            void queryClient.invalidateQueries({ queryKey: ['outbound', 'material-requests'] });
            if (message.payload?.request_id) void queryClient.invalidateQueries({ queryKey: ['wms', 'request', message.payload.request_id] });
          }
        } catch {
          // REST remains the source of truth when a notification frame is malformed.
        }
      };
      socket.onclose = () => {
        if (heartbeatTimer) window.clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
        if (!active) return;
        setStatus('reconnecting');
        attempt += 1;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)) + Math.floor(Math.random() * 500);
        reconnectTimer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      active = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      socket?.close();
    };
  }, [authenticated, queryClient, user?.token]);
  return status;
}
