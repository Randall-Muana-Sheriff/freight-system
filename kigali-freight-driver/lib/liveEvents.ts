import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';
import { DriverNotification } from './notifications';
import { useAuth } from './auth';

function toTime(timestamp?: string) {
  if (!timestamp) return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function buildNotification(title: string, body: string, tone: DriverNotification['tone'], timestamp?: string): DriverNotification {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    tone,
    timestamp: toTime(timestamp),
  };
}

export function useLiveDriverEvents() {
  const { token, username } = useAuth();
  const [events, setEvents] = useState<DriverNotification[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token || !username) return;

    const socket: Socket = io(API_BASE, {
      transports: ['websocket'],
      auth: { token, username },
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // The raw socket stream is a system-wide broadcast shared with the
    // dispatcher dashboard (every order, every driver's GPS ping, every
    // driver's geofence breach). The backend now includes assignedTo on
    // this event specifically so this filter is exact — no local cache of
    // "known order IDs" to keep in sync, which would otherwise miss a job
    // assigned moments ago and not yet refreshed.
    socket.on('order:status-updated', (payload) => {
      if (payload.assignedTo !== username) return;
      const cargo = payload.cargo_description || 'Your shipment';
      const status = String(payload.status || '').toLowerCase();
      setEvents((current) => [
        buildNotification(
          status === 'delivered' ? 'Delivery confirmed' : 'Trip status updated',
          `${cargo} is now ${status}.`,
          'success',
          payload.timestamp
        ),
        ...current,
      ].slice(0, 20));
    });

    socket.on('geofence:violation', (payload) => {
      if (payload.driverName !== username) return;
      const message = payload.type === 'SPEED_VIOLATION'
        ? `You exceeded the speed limit in ${payload.zoneName}.`
        : `You entered a restricted zone: ${payload.zoneName}.`;
      setEvents((current) => [
        buildNotification('Safety alert', message, 'warning', payload.enteredAt),
        ...current,
      ].slice(0, 20));
    });

    socket.on('geofence:exit', (payload) => {
      if (payload.driverName !== username) return;
      setEvents((current) => [
        buildNotification('Geofence cleared', `You left ${payload.zoneName}.`, 'success', payload.exitedAt),
        ...current,
      ].slice(0, 20));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, username]);

  const clearEvents = () => setEvents([]);

  return { events, connected, clearEvents };
}
