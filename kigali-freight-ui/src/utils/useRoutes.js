// src/utils/useRoutes.js
import { useState, useEffect, useCallback } from 'react';
import { fetchRoutes, commitOptimizedRoute } from './api';

export function useRoutes(jwtToken) {
    const [routes, setRoutes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadRoutes = useCallback(async () => {
        if (!jwtToken) return;
        setLoading(true);
        try {
            const data = await fetchRoutes(jwtToken);
            if (Array.isArray(data)) {
                setRoutes(data);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        // Load routes asynchronously to avoid synchronous setState inside effect
        setTimeout(() => {
            loadRoutes();
        }, 0);
    }, [loadRoutes]);

    const commitRoute = async (payload) => {
        setLoading(true);
        setError(null);
        try {
            const newRoute = await commitOptimizedRoute(payload, jwtToken);
            setRoutes((prev) => [newRoute, ...prev]);
            return { success: true, route: newRoute };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
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