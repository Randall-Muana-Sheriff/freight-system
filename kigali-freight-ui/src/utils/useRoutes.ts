import { useState, useEffect, useCallback } from 'react';
import { fetchRoutes, commitOptimizedRoute } from './api';
import type { SavedRoute } from '../types';

export function useRoutes(jwtToken: string | null | undefined) {
    const [routes, setRoutes] = useState<SavedRoute[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadRoutes = useCallback(async () => {
        if (!jwtToken) return;
        setLoading(true);
        try {
            const data = await fetchRoutes(jwtToken);
            if (Array.isArray(data)) {
                setRoutes(data as SavedRoute[]);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        // Load routes asynchronously to avoid synchronous setState inside effect
        setTimeout(() => {
            void loadRoutes();
        }, 0);
    }, [loadRoutes]);

    const commitRoute = async (payload: unknown) => {
        setLoading(true);
        setError(null);
        try {
            const newRoute = await commitOptimizedRoute(payload, jwtToken as string) as SavedRoute;
            setRoutes((prev) => [newRoute, ...prev]);
            return { success: true, route: newRoute };
        } catch (err) {
            const message = (err as Error).message;
            setError(message);
            return { success: false, error: message };
        } finally {
            setLoading(false);
        }
    };

    return {
        routes,
        loading,
        error,
        refreshRoutes: loadRoutes,
        commitRoute,
    };
}
