import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import { reportIncident, updateOrderStatus, confirmDelivery } from './api';
import { isRetryableFailure } from './retryable';

const OFFLINE_QUEUE_KEY = 'kigali_freight_driver_offline_queue';

export type PendingDriverAction =
  | {
      type: 'status-update';
      orderId: number;
      status: string;
      createdAt: string;
    }
  | {
      type: 'incident-report';
      payload: { orderId?: number; title?: string; description?: string; lat?: number; lng?: number };
      // Same reasoning as delivery-photo's localFileUri below — only set
      // when the report had a photo attached, pointing into this app's
      // own persistent storage rather than expo-image-picker's ephemeral
      // cache location.
      localPhotoUri?: string;
      photoFileName?: string;
      photoMimeType?: string;
      createdAt: string;
    }
  | {
      type: 'delivery-photo';
      orderId: number;
      // Points into the app's own persistent document directory (see
      // persistDeliveryPhotoForQueue below), NOT wherever expo-image-picker
      // originally wrote the file — that location is ephemeral/cache-like
      // and isn't guaranteed to still exist by the time this gets flushed,
      // which could be hours or days later if the driver is in a
      // signal-dead zone.
      localFileUri: string;
      fileName: string;
      mimeType: string;
      notes?: string;
      createdAt: string;
    };

// An action the server refused outright, rather than one still waiting for a
// signal. Kept apart from `remaining` because the two demand opposite
// handling: `remaining` is retried, `rejected` never will be, so it is the
// only part of a flush a driver may need to be told about.
export type RejectedDriverAction = {
  item: PendingDriverAction;
  reason: string;
  message: string;
};

export type FlushResult = {
  flushed: number;
  remaining: number;
  // Always present, never optional. Every early return sets it to []. A
  // caller that has to ask whether a rejection list exists before reading it
  // is a caller that will quietly skip the one case worth reporting.
  rejected: RejectedDriverAction[];
};

async function readQueue(): Promise<PendingDriverAction[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingDriverAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingDriverAction[]) {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

// Copies a picked photo out of expo-image-picker's cache location into
// this app's own document directory, which the OS won't clear under
// storage pressure the way it can with cache directories — the whole
// point of queueing a delivery photo for later is that "later" might be
// a while, in a rural signal-dead zone.
export async function persistDeliveryPhotoForQueue(sourceUri: string, fileName: string): Promise<string> {
  const targetDir = new Directory(Paths.document, 'pending-delivery-photos');
  if (!targetDir.exists) targetDir.create({ intermediates: true });

  const source = new File(sourceUri);
  const destination = new File(targetDir, `${Date.now()}-${fileName}`);
  // Awaited, not fired. File.copy returns a Promise<void>, and this used to
  // return destination.uri the instant the copy was *started* — handing back
  // a path to a file that might not exist yet, then queueing an upload
  // against it. On a fast copy nobody noticed; on a large photo or a slow
  // device the queued action referenced an incomplete file, which is the one
  // case this whole queue exists for.
  await source.copy(destination);
  return destination.uri;
}

// Same purpose as persistDeliveryPhotoForQueue above, separate directory
// so the two queues' leftover files are easy to tell apart on disk.
export async function persistIncidentPhotoForQueue(sourceUri: string, fileName: string): Promise<string> {
  const targetDir = new Directory(Paths.document, 'pending-incident-photos');
  if (!targetDir.exists) targetDir.create({ intermediates: true });

  const source = new File(sourceUri);
  const destination = new File(targetDir, `${Date.now()}-${fileName}`);
  // Awaited, not fired. File.copy returns a Promise<void>, and this used to
  // return destination.uri the instant the copy was *started* — handing back
  // a path to a file that might not exist yet, then queueing an upload
  // against it. On a fast copy nobody noticed; on a large photo or a slow
  // device the queued action referenced an incomplete file, which is the one
  // case this whole queue exists for.
  await source.copy(destination);
  return destination.uri;
}

export async function enqueueOfflineAction(action: PendingDriverAction) {
  const queue = await readQueue();
  queue.push(action);
  await writeQueue(queue);
  return queue.length;
}

export async function getOfflineQueueCount() {
  const queue = await readQueue();
  return queue.length;
}

export async function clearOfflineQueue() {
  await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
}

let isFlushing = false;

export async function flushOfflineQueue(token: string): Promise<FlushResult> {
  if (isFlushing) return { flushed: 0, remaining: await getOfflineQueueCount(), rejected: [] };
  isFlushing = true;

  try {
    const queue = await readQueue();
    if (queue.length === 0) return { flushed: 0, remaining: 0, rejected: [] };

    const remaining: PendingDriverAction[] = [];
    const rejected: RejectedDriverAction[] = [];
    let flushed = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        if (item.type === 'status-update') {
          await updateOrderStatus(token, item.orderId, item.status);
        } else if (item.type === 'incident-report') {
          await reportIncident(token, {
            ...item.payload,
            photo: item.localPhotoUri
              ? { uri: item.localPhotoUri, fileName: item.photoFileName, mimeType: item.photoMimeType }
              : undefined,
          });
          if (item.localPhotoUri) new File(item.localPhotoUri).delete();
        } else if (item.type === 'delivery-photo') {
          await confirmDelivery(
            token,
            item.orderId,
            { uri: item.localFileUri, fileName: item.fileName, mimeType: item.mimeType },
            item.notes
          );
          // Only clean up the persisted copy once it's actually been
          // uploaded — if this throws below (caught by the outer catch),
          // the file must still be here for the next flush attempt.
          new File(item.localFileUri).delete();
        }
        flushed += 1;
      } catch (error) {
        // A refusal and a dropped connection are not the same thing, and this
        // used to treat them identically: re-queue the item, re-queue
        // everything behind it, break. That is correct for a network blip and
        // catastrophic for a 4xx, because a 4xx never becomes a 200 — the
        // queue head-of-line blocks for ever, in front of the delivery
        // photos, and the driver is told nothing.
        //
        // It became reachable when the server grew a state machine. This
        // queue manufactures duplicate status updates routinely — the trip
        // screen does not advance local state after queuing, and the request
        // timeout misfires on a slow connection — and a replayed status now
        // returns 409 ORDERS_STATUS_OUT_OF_SEQUENCE.
        if (!isRetryableFailure(error)) {
          // Dropped, not retried. For a status update this is right and not
          // a loss: the server refusing the transition means it already
          // holds that state or a later one, so the item is redundant. Kept
          // as a count so the caller can say something rather than the work
          // vanishing in silence.
          const status = (error as { status?: number } | null)?.status;
          const code = (error as { code?: string } | null)?.code;
          rejected.push({
            item,
            reason: code ?? `HTTP ${status ?? 'unknown'}`,
            message: error instanceof Error ? error.message : String(error),
          });
          if (item.type === 'incident-report' && item.localPhotoUri) {
            new File(item.localPhotoUri).delete();
          } else if (item.type === 'delivery-photo') {
            new File(item.localFileUri).delete();
          }
          continue;
        }
        remaining.push(item);
        remaining.push(...queue.slice(index + 1));
        break;
      }
    }

    await writeQueue(remaining);
    return { flushed, remaining: remaining.length, rejected };
  } finally {
    isFlushing = false;
  }
}
