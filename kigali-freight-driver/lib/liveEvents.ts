import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './api';
import { DriverNotification } from './notifications';
import { useAuth } from './auth';

// Scoped per-driver (not a single shared key) so switching accounts on the
// same device never shows one driver's alerts to another.
function storageKeyFor(username: string) {
  return `kigali_freight_driver_alerts_${username}`;
}

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

  // This list previously lived only in React state, which is wiped every
  // time the authenticated part of the app remounts — including a normal
  // sign-out/sign-in cycle, not just an app restart. Restoring from
  // AsyncStorage on mount (keyed per-driver) means alerts survive that.
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKeyFor(username))
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setEvents(parsed);
      })
      .catch(() => {
        // Corrupt or missing cache — just start from an empty list.
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Persist on every change so a sign-out/sign-in or app restart in the
  // middle of a shift doesn't lose whatever's already been captured.
  useEffect(() => {
    if (!username) return;
    AsyncStorage.setItem(storageKeyFor(username), JSON.stringify(events)).catch(() => {
      // Best-effort cache — not worth surfacing a failure to the driver.
    });
  }, [events, username]);

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
    // initiatedByDriver skips the case where this driver is the one who
    // just tapped the status button themselves — the trip screen already
    // reflects that immediately, so a notification about your own action
    // is noise, not news. Only a dispatcher/admin changing something on
    // this driver's behalf (initiatedByDriver: false) is genuinely new
    // information they wouldn't otherwise know.
    socket.on('order:status-updated', (payload) => {
      if (payload.assignedTo !== username || payload.initiatedByDriver) return;
      const cargo = payload.cargo_description || 'Your shipment';
      const status = String(payload.status || '').toLowerCase();
      setEvents((current) => [
        buildNotification(
          'Dispatch updated your trip',
          `${cargo} was set to ${status} by dispatch.`,
          'info',
          payload.timestamp
        ),
        ...current,
      ].slice(0, 20));
    });

    socket.on('document:status-updated', (payload) => {
      if (payload.username !== username) return;
      const approved = payload.status === 'approved';
      setEvents((current) => [
        buildNotification(
          approved ? 'Document approved' : 'Document needs attention',
          approved
            ? `Your ${payload.label} was approved.`
            : `Your ${payload.label} was rejected${payload.rejectionReason ? `: ${payload.rejectionReason}` : '.'}`,
          approved ? 'success' : 'warning'
        ),
        ...current,
      ].slice(0, 20));
    });

    socket.on('incident:status-updated', (payload) => {
      if (payload.driver_name !== username) return;
      const [reportTitle] = String(payload.description || '').split('\n\n');
      const status = String(payload.status || '').toUpperCase();
      if (status !== 'ACKNOWLEDGED' && status !== 'RESOLVED') return;
      setEvents((current) => [
        buildNotification(
          status === 'RESOLVED' ? 'Report resolved' : 'Report seen by dispatch',
          status === 'RESOLVED'
            ? `Your report "${reportTitle}" has been marked resolved.`
            : `Dispatch is looking into "${reportTitle}".`,
          status === 'RESOLVED' ? 'success' : 'info'
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

  const clearEvents = () => {
    setEvents([]);
    if (username) AsyncStorage.removeItem(storageKeyFor(username)).catch(() => {});
  };

  const dismissEvent = (id: string) => {
    setEvents((current) => current.filter((event) => event.id !== id));
  };

  return { events, connected, clearEvents, dismissEvent };
}
