import Constants from 'expo-constants';
import { refreshAccessToken } from './tokenStore';

function resolveApiBase() {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  if (!extra?.apiBaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL. Create a .env file from .env.example and set your backend URL.');
  }

  return extra.apiBaseUrl;
}

export const API_BASE = resolveApiBase();

export function isNetworkFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('fetch failed')
  );
}

export type DriverAssignment = {
  id: number;
  cargo_description?: string;
  status?: string;
  origin_hub_name?: string;
  delivery_lng?: number;
  delivery_lat?: number;
  updated_at?: string;
};

async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  const acceptedResponse = response.status === 202;

  if (!response.ok && !acceptedResponse) {
    const message = payload?.error?.message || payload?.error || payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (acceptedResponse && payload == null) {
    return { accepted: true };
  }

  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    return payload.data;
  }

  return payload;
}

async function doFetch(path: string, options: { method?: string; token?: string; body?: unknown }) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    return await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Network request failed (request timed out)');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// A 15-minute access token expiring mid-request is expected, routine
// behavior, not an error condition - this transparently exchanges it for a
// fresh one via the refresh token and retries once, so callers never see
// the expiry at all. Only surfaces a real error if the refresh token
// itself has also expired/been revoked (session genuinely needs a real
// login again), or if the retry fails for an unrelated reason.
export async function apiFetch(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  let response = await doFetch(path, options);

  if (response.status === 401 && options.token) {
    const newToken = await refreshAccessToken(API_BASE);
    if (newToken) {
      response = await doFetch(path, { ...options, token: newToken });
    } else {
      throw new Error('Session expired. Please sign in again.');
    }
  }

  return await parseResponse(response);
}

export async function loginDriver(username: string, password: string) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

// The backend always creates 'driver' accounts from this endpoint regardless
// of what's sent — there's no role field here on purpose.
export async function registerDriver(username: string, password: string) {
  return apiFetch('/api/auth/signup', {
    method: 'POST',
    body: { username, password },
  });
}

// Revokes every refresh token for the account server-side (including this
// session's own), so the caller must sign the driver out right after a
// successful change — the access token still works until it expires, but
// silently fails to refresh after that otherwise.
export async function changePassword(token: string, currentPassword: string, newPassword: string) {
  return apiFetch('/api/auth/password', {
    method: 'PATCH',
    token,
    body: { currentPassword, newPassword },
  });
}

export async function logoutDriver(refreshToken: string | null) {
  if (!refreshToken) return;
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Best-effort: if this fails (offline, etc.), the refresh token will
    // simply expire naturally after 30 days rather than being revoked
    // immediately. Not worth blocking or failing the local sign-out over.
  }
}

export type MyVehicle = {
  id: number;
  plateNumber: string;
  vehicleType: string;
  status: string;
  maxWeightKg: number | null;
  maxRangeKm: number | null;
};

export async function fetchMyVehicle(token: string) {
  return (await apiFetch('/api/vehicles/mine', { token })) as MyVehicle | null;
}

export type CompletedDelivery = {
  id: number;
  cargo_description?: string;
  weight_kg?: number;
  origin_hub_name?: string;
  photo_url?: string | null;
  confirmed_at?: string | null;
};

export async function fetchMyCompletedDeliveries(token: string) {
  return (await apiFetch('/api/orders/driver/completed', { token })) as CompletedDelivery[];
}

export async function fetchDriverAssignments(token: string) {
  try {
    return (await apiFetch('/api/orders/driver/assignments', { token })) as DriverAssignment[];
  } catch (error) {
    if (error instanceof Error && error.message.includes('status 404')) {
      return [];
    }

    throw error;
  }
}

export type OrderDetail = DriverAssignment & {
  weight_kg?: number;
  assigned_to?: string;
  pickup_lng?: number;
  pickup_lat?: number;
  recipient_name?: string;
  recipient_phone?: string;
};

export async function fetchOrderById(token: string, orderId: number) {
  return (await apiFetch(`/api/orders/${orderId}`, { token })) as OrderDetail;
}

// Separate from apiFetch deliberately: multipart/form-data uploads need the
// runtime to set Content-Type (with the multipart boundary) automatically
// and must send a raw FormData body, not JSON.stringify'd — overloading
// the JSON-only apiFetch helper for this one case would risk breaking it
// for every other caller.
export async function confirmDelivery(
  token: string,
  orderId: number,
  photo: { uri: string; fileName?: string; mimeType?: string },
  notes?: string
) {
  const formData = new FormData();
  formData.append('photo', {
    uri: photo.uri,
    name: photo.fileName || 'delivery-confirmation.jpg',
    type: photo.mimeType || 'image/jpeg',
  } as unknown as Blob);
  if (notes) formData.append('notes', notes);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${API_BASE}/api/orders/${orderId}/confirm-delivery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
    return await parseResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Network request failed (upload timed out)');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchTripHistory(token: string, orderId: number) {
  return apiFetch(`/api/orders/${orderId}/history`, { token });
}

export async function updateOrderStatus(token: string, orderId: number, status: string) {
  return apiFetch(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
}

export async function reportIncident(token: string, payload: { orderId?: number; title: string; description: string }) {
  return apiFetch('/api/incidents', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function registerPushToken(token: string, pushToken: string, platform: string) {
  return apiFetch('/api/notifications/register-token', {
    method: 'POST',
    token,
    body: { token: pushToken, platform },
  });
}
