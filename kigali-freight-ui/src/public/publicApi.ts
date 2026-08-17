// Talks to /api/public — the unauthenticated surface. Deliberately does
// not import from utils/api.ts: that module throws at import time when no
// API base is configured, which is right for a dispatcher tool nobody can
// use without a backend, but wrong for a marketing site whose hero,
// services and contact details are worth rendering regardless.
import { getApiBase } from '../utils/runtimeConfig';

export interface TrackedShipment {
    trackingToken: string;
    cargo: string;
    status: string;
    pickup: string | null;
    delivery: string | null;
    driverFirstName: string | null;
    placedAt: string;
    updatedAt: string;
    timeline: { status: string; at: string }[];
}

export interface OrderDraft {
    pickupAddress: string;
    deliveryAddress: string;
    cargoType: string;
    weightKg: number;
    specialInstructions?: string;
    /** When the customer needs it, in their terms. Informs the
     *  dispatcher's priority call; it does not set priority itself. */
    neededBy?: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
}

function base() {
    const configured = getApiBase();
    if (!configured) throw new Error('This site is not fully configured yet. Please call us instead.');
    return `${configured}/api/public`;
}

// The API's own message is surfaced rather than a generic one: the server
// already distinguishes "that phone number does not look right" from
// "weight must be a positive number", and a customer can act on those.
async function parse<T>(response: Response): Promise<T> {
    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        throw new Error('The server sent a response we could not read. Please try again.');
    }
    const payload = body as { success?: boolean; data?: T; error?: { message?: string } };
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Something went wrong. Please try again.');
    }
    return payload.data as T;
}

export async function fetchCargoTypes(): Promise<string[]> {
    const response = await fetch(`${base()}/cargo-types`);
    const data = await parse<{ cargoTypes: string[] }>(response);
    return data.cargoTypes;
}

export async function submitOrder(draft: OrderDraft): Promise<string> {
    const response = await fetch(`${base()}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
    });
    const data = await parse<{ trackingToken: string }>(response);
    return data.trackingToken;
}

export async function trackShipment(token: string): Promise<TrackedShipment> {
    const response = await fetch(`${base()}/track/${encodeURIComponent(token.trim())}`);
    return parse<TrackedShipment>(response);
}

export async function sendContactMessage(input: {
    name: string; phone: string; email?: string; message: string;
}): Promise<void> {
    const response = await fetch(`${base()}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    await parse<{ received: boolean }>(response);
}
