import { useCallback, useState } from 'react';

// Every CRUD panel in this app (HubsPanel, GeofenceDrawer,
// AdminUserGovernance, VehicleAssignmentPanel) hand-rolled the same
// setBusy(true)/setError(null)/try/catch/finally shape around its submit
// handler. This is that shape, extracted once. `run` returns whatever the
// wrapped function returns, or undefined if it threw — callers that need
// to know success/failure should have their action function return a
// value (or check `error` afterward), not rely on `run`'s return alone.
export function useAsyncAction() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const run = useCallback(async (fn) => {
        setBusy(true);
        setError(null);
        try {
            return await fn();
        } catch (err) {
            setError(err.message || 'Something went wrong.');
            return undefined;
        } finally {
            setBusy(false);
        }
    }, []);

    return { busy, error, setError, run };
}

// Same shape, but for row-level actions in a list (delete-by-id) where
// only one row can be "busy" at a time — matches every existing panel's
// single `deletingId`/`busyId` state var exactly, just shared instead of
// redeclared per component.
export function useKeyedAsyncAction() {
    const [busyKey, setBusyKey] = useState(null);
    const [error, setError] = useState(null);

    const run = useCallback(async (key, fn) => {
        setBusyKey(key);
        setError(null);
        try {
            return await fn();
        } catch (err) {
            setError(err.message || 'Something went wrong.');
            return undefined;
        } finally {
            setBusyKey(null);
        }
    }, []);

    return { busyKey, error, setError, run };
}
