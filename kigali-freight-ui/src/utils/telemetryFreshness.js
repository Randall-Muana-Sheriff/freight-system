import { useEffect, useState } from 'react';

// A driver's last known position is cached in Redis/Postgres/React state
// indefinitely — that's correct for "last known position," but nothing
// previously checked whether it was still current before treating it as
// live. These thresholds turn a bare `lastSeen` timestamp into an actual
// freshness state.
export const STALE_AFTER_MS = 2 * 60 * 1000; // background pings every ~15-25s; 2min is a generous buffer past a couple missed pings
export const VANISH_AFTER_MS = 30 * 60 * 1000; // beyond this it's not "recently idle," it's just old data

export function classifyFreshness(lastSeen, now) {
    if (!lastSeen) return 'unknown';
    const age = now - new Date(lastSeen).getTime();
    if (age > VANISH_AFTER_MS) return 'offline';
    if (age > STALE_AFTER_MS) return 'stale';
    return 'live';
}

export function formatLastSeen(lastSeen, now) {
    if (!lastSeen) return 'unknown';
    const ageMs = now - new Date(lastSeen).getTime();
    const mins = Math.floor(ageMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
}

// Staleness is a function of elapsed time, not of when the last socket
// event arrived — without this, a driver would visually stay "live"
// forever once events stop, since nothing would ever trigger a re-render
// to re-evaluate their age.
export function useNow(intervalMs = 15000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
