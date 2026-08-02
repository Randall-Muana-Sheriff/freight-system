import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAsyncAction, useKeyedAsyncAction } from './useAsyncAction.js';

describe('useAsyncAction', () => {
    it('tracks busy true only while the wrapped function is in flight', async () => {
        const { result } = renderHook(() => useAsyncAction());
        expect(result.current.busy).toBe(false);

        let resolveFn;
        const pending = new Promise((resolve) => {
            resolveFn = resolve;
        });

        let runPromise;
        act(() => {
            runPromise = result.current.run(() => pending);
        });
        expect(result.current.busy).toBe(true);

        await act(async () => {
            resolveFn('done');
            await runPromise;
        });
        expect(result.current.busy).toBe(false);
    });

    it('clears any previous error at the start of a new run', async () => {
        const { result } = renderHook(() => useAsyncAction());
        await act(async () => {
            await result.current.run(() => {
                throw new Error('first failure');
            });
        });
        expect(result.current.error).toBe('first failure');

        await act(async () => {
            await result.current.run(() => Promise.resolve('ok'));
        });
        expect(result.current.error).toBe(null);
    });

    it('sets error from the thrown Error message and returns undefined instead of re-throwing', async () => {
        const { result } = renderHook(() => useAsyncAction());
        let returned;
        await act(async () => {
            returned = await result.current.run(() => {
                throw new Error('save failed');
            });
        });
        expect(result.current.error).toBe('save failed');
        expect(returned).toBeUndefined();
        expect(result.current.busy).toBe(false);
    });

    it('falls back to a generic message when the thrown value has no message', async () => {
        const { result } = renderHook(() => useAsyncAction());
        await act(async () => {
            await result.current.run(() => {
                throw new Error();
            });
        });
        expect(result.current.error).toBe('Something went wrong.');
    });

    it('returns the wrapped function\'s resolved value on success', async () => {
        const { result } = renderHook(() => useAsyncAction());
        let returned;
        await act(async () => {
            returned = await result.current.run(() => Promise.resolve({ id: 42 }));
        });
        expect(returned).toEqual({ id: 42 });
    });

    it('run is referentially stable across re-renders (safe to use in a useEffect dep array)', () => {
        const { result, rerender } = renderHook(() => useAsyncAction());
        const firstRun = result.current.run;
        rerender();
        expect(result.current.run).toBe(firstRun);
    });
});

describe('useKeyedAsyncAction', () => {
    it('tracks busyKey as the key passed to run, and clears it on completion', async () => {
        const { result } = renderHook(() => useKeyedAsyncAction());
        expect(result.current.busyKey).toBe(null);

        let resolveFn;
        const pending = new Promise((resolve) => {
            resolveFn = resolve;
        });

        let runPromise;
        act(() => {
            runPromise = result.current.run('row-7', () => pending);
        });
        expect(result.current.busyKey).toBe('row-7');

        await act(async () => {
            resolveFn();
            await runPromise;
        });
        expect(result.current.busyKey).toBe(null);
    });

    it('a second call with a different key while the first is still busy only tracks the newest key', async () => {
        const { result } = renderHook(() => useKeyedAsyncAction());
        const never = () => new Promise(() => {});

        act(() => {
            result.current.run('a', never);
        });
        expect(result.current.busyKey).toBe('a');

        act(() => {
            result.current.run('b', never);
        });
        expect(result.current.busyKey).toBe('b');
    });

    it('sets error on failure without throwing to the caller', async () => {
        const { result } = renderHook(() => useKeyedAsyncAction());
        const onCatch = vi.fn();
        await act(async () => {
            await result.current
                .run('x', () => {
                    throw new Error('delete failed');
                })
                .catch(onCatch);
        });
        expect(result.current.error).toBe('delete failed');
        expect(onCatch).not.toHaveBeenCalled();
    });
});
