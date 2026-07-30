import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportIncident, updateOrderStatus } from './api';

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
