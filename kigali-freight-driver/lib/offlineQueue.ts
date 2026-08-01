import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import { reportIncident, updateOrderStatus, confirmDelivery } from './api';

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
      payload: { orderId?: number; title: string; description: string };
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
export function persistDeliveryPhotoForQueue(sourceUri: string, fileName: string): string {
  const targetDir = new Directory(Paths.document, 'pending-delivery-photos');
  if (!targetDir.exists) targetDir.create({ intermediates: true });

  const source = new File(sourceUri);
  const destination = new File(targetDir, `${Date.now()}-${fileName}`);
  source.copy(destination);
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

export async function flushOfflineQueue(token: string) {
  if (isFlushing) return { flushed: 0, remaining: await getOfflineQueueCount() };
  isFlushing = true;

  try {
    const queue = await readQueue();
    if (queue.length === 0) return { flushed: 0, remaining: 0 };

    const remaining: PendingDriverAction[] = [];
    let flushed = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        if (item.type === 'status-update') {
          await updateOrderStatus(token, item.orderId, item.status);
        } else if (item.type === 'incident-report') {
          await reportIncident(token, item.payload);
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
      } catch {
        remaining.push(item);
        remaining.push(...queue.slice(index + 1));
        break;
      }
    }

    await writeQueue(remaining);
    return { flushed, remaining: remaining.length };
  } finally {
    isFlushing = false;
  }
}
