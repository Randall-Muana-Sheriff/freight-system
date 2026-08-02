import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateOrderStatus, reportIncident, confirmDelivery } from './api';
import {
    enqueueOfflineAction,
    getOfflineQueueCount,
    clearOfflineQueue,
    flushOfflineQueue,
    persistDeliveryPhotoForQueue,
} from './offlineQueue';

// A minimal stand-in for expo-file-system's class-based API (File/
// Directory/Paths) — enough to exercise persistDeliveryPhotoForQueue's
// actual logic (join a path under the document directory, copy the
// source into it, later delete it) without a real native filesystem.
const deletedUris: string[] = [];
jest.mock('expo-file-system', () => {
    function joinUri(parts: unknown[]): string {
        return parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    class MockFile {
        uri: string;
        constructor(...parts: unknown[]) {
            this.uri = joinUri(parts);
        }
        copy(_destination: MockFile) {
            // no-op: nothing reads real file bytes in this test
        }
        delete() {
            deletedUris.push(this.uri);
        }
    }
    class MockDirectory {
        uri: string;
        exists = true;
        constructor(...parts: unknown[]) {
            this.uri = joinUri(parts);
        }
        create() {}
    }
    return {
        File: MockFile,
        Directory: MockDirectory,
        Paths: { document: new MockDirectory('file:///document') },
    };
});

// This installed version of @react-native-async-storage/async-storage
// ships no jest mock of its own (older versions did, under a `/jest`
// subpath) — a minimal in-memory implementation of just the methods
// offlineQueue.ts actually calls (getItem/setItem/removeItem) is enough;
// a real native module can't run inside a plain Jest/Node environment
// regardless.
jest.mock('@react-native-async-storage/async-storage', () => {
    let store = new Map<string, string>();
    return {
        __esModule: true,
        default: {
            getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
            setItem: jest.fn((key: string, value: string) => {
                store.set(key, value);
                return Promise.resolve();
            }),
            removeItem: jest.fn((key: string) => {
                store.delete(key);
                return Promise.resolve();
            }),
            clear: jest.fn(() => {
                store = new Map<string, string>();
                return Promise.resolve();
            }),
        },
    };
});

jest.mock('./api', () => ({
    updateOrderStatus: jest.fn(),
    reportIncident: jest.fn(),
    confirmDelivery: jest.fn(),
}));

const mockUpdateOrderStatus = jest.mocked(updateOrderStatus);
const mockReportIncident = jest.mocked(reportIncident);
const mockConfirmDelivery = jest.mocked(confirmDelivery);

describe('offlineQueue', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        mockUpdateOrderStatus.mockReset();
        mockReportIncident.mockReset();
        mockConfirmDelivery.mockReset();
        deletedUris.length = 0;
    });

    it('starts empty', async () => {
        expect(await getOfflineQueueCount()).toBe(0);
    });

    it('enqueues an action and persists it across reads (survives an app restart / force-quit)', async () => {
        await enqueueOfflineAction({ type: 'status-update', orderId: 12, status: 'PICKED_UP', createdAt: '2026-01-01T00:00:00Z' });
        expect(await getOfflineQueueCount()).toBe(1);

        // A second "read" simulates the app cold-starting again — nothing
        // here should depend on in-memory state, only on what's on disk.
        expect(await getOfflineQueueCount()).toBe(1);
    });

    it('clearOfflineQueue empties it', async () => {
        await enqueueOfflineAction({ type: 'incident-report', payload: { title: 'Flat tire', description: '' }, createdAt: '2026-01-01T00:00:00Z' });
        await clearOfflineQueue();
        expect(await getOfflineQueueCount()).toBe(0);
    });

    it('flushOfflineQueue sends every queued action and empties the queue on full success', async () => {
        mockUpdateOrderStatus.mockResolvedValue(undefined);
        mockReportIncident.mockResolvedValue(undefined);

        await enqueueOfflineAction({ type: 'status-update', orderId: 1, status: 'PICKED_UP', createdAt: '2026-01-01T00:00:00Z' });
        await enqueueOfflineAction({ type: 'incident-report', payload: { title: 'Delay', description: 'Traffic' }, createdAt: '2026-01-01T00:00:01Z' });

        const result = await flushOfflineQueue('token-123');

        expect(result).toEqual({ flushed: 2, remaining: 0 });
        expect(mockUpdateOrderStatus).toHaveBeenCalledWith('token-123', 1, 'PICKED_UP');
        expect(mockReportIncident).toHaveBeenCalledWith('token-123', { title: 'Delay', description: 'Traffic' });
        expect(await getOfflineQueueCount()).toBe(0);
    });

    it('stops at the first failure and keeps the failed item plus everything after it queued, in order', async () => {
        mockUpdateOrderStatus
            .mockResolvedValueOnce(undefined) // action 1 succeeds
            .mockRejectedValueOnce(new Error('Network request failed')); // action 2 fails

        await enqueueOfflineAction({ type: 'status-update', orderId: 1, status: 'PICKED_UP', createdAt: '2026-01-01T00:00:00Z' });
        await enqueueOfflineAction({ type: 'status-update', orderId: 2, status: 'DELIVERED', createdAt: '2026-01-01T00:00:01Z' });
        await enqueueOfflineAction({ type: 'status-update', orderId: 3, status: 'DELIVERED', createdAt: '2026-01-01T00:00:02Z' });

        const result = await flushOfflineQueue('token-123');

        // Action 1 flushed; actions 2 and 3 remain queued (in original
        // order) for the next flush attempt — nothing is silently dropped.
        expect(result).toEqual({ flushed: 1, remaining: 2 });
        expect(await getOfflineQueueCount()).toBe(2);
    });

    it('does not run two flushes concurrently — a second call while one is in flight is a no-op', async () => {
        let resolveFirst: () => void = () => {};
        mockUpdateOrderStatus.mockImplementation(
            () => new Promise<void>((resolve) => { resolveFirst = resolve; })
        );

        await enqueueOfflineAction({ type: 'status-update', orderId: 1, status: 'PICKED_UP', createdAt: '2026-01-01T00:00:00Z' });

        const firstFlush = flushOfflineQueue('token-123');
        const secondFlush = flushOfflineQueue('token-123'); // fires while the first is still awaiting the mocked API call

        // The first flush has a few real microtask hops to make (readQueue's
        // own AsyncStorage read, then the for-loop) before it actually
        // reaches calling updateOrderStatus — resolving synchronously here
        // would resolve nothing (resolveFirst is still its unset default).
        while (mockUpdateOrderStatus.mock.calls.length === 0) {
            await Promise.resolve();
        }
        resolveFirst();
        const [firstResult, secondResult] = await Promise.all([firstFlush, secondFlush]);

        expect(firstResult.flushed).toBe(1);
        expect(secondResult.flushed).toBe(0); // the concurrent call did nothing
        expect(mockUpdateOrderStatus).toHaveBeenCalledTimes(1);
    });

    describe('delivery-photo queueing (proof-of-delivery, previously had no offline path at all)', () => {
        it('persistDeliveryPhotoForQueue copies the photo into a path distinct from the original picker location', () => {
            const persistedUri = persistDeliveryPhotoForQueue('file:///cache/ImagePicker/abc123.jpg', 'photo.jpg');
            expect(persistedUri).not.toBe('file:///cache/ImagePicker/abc123.jpg');
            expect(persistedUri).toContain('pending-delivery-photos');
        });

        it('flushOfflineQueue uploads a queued delivery photo via confirmDelivery', async () => {
            mockConfirmDelivery.mockResolvedValue(undefined);
            const persistedUri = persistDeliveryPhotoForQueue('file:///cache/photo.jpg', 'photo.jpg');

            await enqueueOfflineAction({
                type: 'delivery-photo',
                orderId: 42,
                localFileUri: persistedUri,
                fileName: 'photo.jpg',
                mimeType: 'image/jpeg',
                createdAt: '2026-01-01T00:00:00Z',
            });

            const result = await flushOfflineQueue('token-123');

            expect(result).toEqual({ flushed: 1, remaining: 0 });
            expect(mockConfirmDelivery).toHaveBeenCalledWith(
                'token-123',
                42,
                { uri: persistedUri, fileName: 'photo.jpg', mimeType: 'image/jpeg' },
                undefined
            );
        });

        it('deletes the persisted photo file only after a successful upload', async () => {
            mockConfirmDelivery.mockResolvedValue(undefined);
            const persistedUri = persistDeliveryPhotoForQueue('file:///cache/photo.jpg', 'photo.jpg');
            await enqueueOfflineAction({
                type: 'delivery-photo', orderId: 1, localFileUri: persistedUri,
                fileName: 'photo.jpg', mimeType: 'image/jpeg', createdAt: '2026-01-01T00:00:00Z',
            });

            await flushOfflineQueue('token-123');

            expect(deletedUris).toContain(persistedUri);
        });

        it('keeps the persisted photo file queued (not deleted) when the upload fails', async () => {
            mockConfirmDelivery.mockRejectedValue(new Error('Network request failed'));
            const persistedUri = persistDeliveryPhotoForQueue('file:///cache/photo.jpg', 'photo.jpg');
            await enqueueOfflineAction({
                type: 'delivery-photo', orderId: 1, localFileUri: persistedUri,
                fileName: 'photo.jpg', mimeType: 'image/jpeg', createdAt: '2026-01-01T00:00:00Z',
            });

            const result = await flushOfflineQueue('token-123');

            expect(result).toEqual({ flushed: 0, remaining: 1 });
            expect(deletedUris).not.toContain(persistedUri);
            expect(await getOfflineQueueCount()).toBe(1);
        });
    });
});
