import { useState, useEffect, useCallback } from 'react';
import { fetchRoutes } from './api';
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


    return {
        routes,
        loading,
        error,
        refreshRoutes: loadRoutes,
    };
}
