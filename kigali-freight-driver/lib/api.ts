import Constants from 'expo-constants';
import { refreshAccessToken } from './tokenStore';

function resolveApiBase() {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  if (!extra?.apiBaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL. Create a .env file from .env.example and set your backend URL.');
  }

  // __DEV__ is false in every release build (EAS preview/production, or a
  // local release build) — a plaintext http:// backend was previously
  // possible to ship by accident in exactly that case, silently sending
  // JWTs, PINs, and GPS coordinates unencrypted. A local dev backend
  // (Expo Go / dev-client, __DEV__ true) legitimately has no HTTPS setup
  // most of the time, so this only enforces the rule where it actually
  // matters: real builds a driver installs.
  if (!__DEV__ && !extra.apiBaseUrl.startsWith('https://')) {
    throw new Error(
      `EXPO_PUBLIC_API_BASE_URL must be HTTPS in a release build (got "${extra.apiBaseUrl}"). ` +
      'Set a real HTTPS backend URL via `eas env:create` for this build profile — see eas.json.'
    );
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
//
// The backend's authMiddleware actually returns 403 "AUTH_INVALID_TOKEN"
// for an expired/invalid JWT, not 401 — this only checked 401 before, so
// the refresh-and-retry here never actually fired on real expiry. It was
// masked because every cold app launch proactively refreshes regardless
// (see auth.tsx's hydrate()), which is exactly what every reload during
// active development does — the bug only shows up once the app has been
// left running past the token's lifetime without a restart. A genuine
// role-mismatch 403 (AUTH_FORBIDDEN) just fails again identically after
// the wasted refresh attempt, so treating both the same here is safe.
export async function apiFetch(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  let response = await doFetch(path, options);

  if ((response.status === 401 || response.status === 403) && options.token) {
    const newToken = await refreshAccessToken(API_BASE);
    if (newToken) {
      response = await doFetch(path, { ...options, token: newToken });
    } else {
      throw new Error('Session expired. Please sign in again.');
    }
  }

  return await parseResponse(response);
}

// Driver auth: phone + SMS OTP + (new drivers only) dispatcher invite code +
// 4-digit PIN. These five calls map directly onto the AuthFlow state
// machine's steps in components/auth/AuthFlow.tsx.
export type DriverOtpVerifyResult = {
  returning: boolean;
  needsPinReset: boolean;
  otpSessionToken: string;
};

export type DriverInviteResult = {
  otpSessionToken: string;
  staffId: string;
  fullName: string;
  role: string;
  fleet: string;
  vehicle: { plateNumber: string; vehicleType: string; maxWeightKg: number | null; maxRangeKm: number | null } | null;
};

export type DriverAuthTokens = { token: string; refreshToken: string; role: string };

export async function requestDriverOtp(phoneNumber: string) {
  return (await apiFetch('/api/auth/driver/otp/request', { method: 'POST', body: { phoneNumber } })) as { accepted: boolean };
}

export async function verifyDriverOtp(phoneNumber: string, code: string) {
  return (await apiFetch('/api/auth/driver/otp/verify', { method: 'POST', body: { phoneNumber, code } })) as DriverOtpVerifyResult;
}

export async function verifyDriverInvite(otpSessionToken: string, inviteCode: string) {
  return (await apiFetch('/api/auth/driver/invite/verify', { method: 'POST', body: { otpSessionToken, inviteCode } })) as DriverInviteResult;
}

// Called once, after the app has already had the driver type the PIN twice
// and compared the two entries itself — see AuthFlow's pin-set/pin-confirm
// steps. Returns the final session tokens, same shape as loginDriverPin.
export async function setDriverPin(otpSessionToken: string, pin: string) {
  return (await apiFetch('/api/auth/driver/pin/set', { method: 'POST', body: { otpSessionToken, pin } })) as DriverAuthTokens;
}

export async function loginDriverPin(otpSessionToken: string, pin: string) {
  return (await apiFetch('/api/auth/driver/pin/login', { method: 'POST', body: { otpSessionToken, pin } })) as DriverAuthTokens;
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

export type MyProfile = {
  username: string;
  role: string;
  phoneNumber: string | null;
  staffId: string | null;
  fullName: string | null;
};

export async function fetchMyProfile(token: string) {
  return (await apiFetch('/api/auth/me', { token })) as MyProfile;
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

export type MyIncident = {
  id: number;
  order_id: number | null;
  description: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  resolved_at: string | null;
  created_at: string;
};

// A driver could previously submit a report and never find out whether
// dispatch saw it or did anything about it — this is their own view of
// what they've sent and where each one stands.
export async function fetchMyIncidents(token: string) {
  return (await apiFetch('/api/incidents/mine', { token })) as MyIncident[];
}

export async function registerPushToken(token: string, pushToken: string, platform: string) {
  return apiFetch('/api/notifications/register-token', {
    method: 'POST',
    token,
    body: { token: pushToken, platform },
  });
}

// Signing in only requires an approved account — it doesn't mean the
// driver is cleared to carry cargo yet. The backend separately blocks
// dispatch (assignOrderBundle/reassignOrder) until every one of these 5
// documents is admin-approved.
export type DocumentType = 'national_id' | 'drivers_license' | 'vehicle_registration' | 'insurance_certificate' | 'roadworthiness_certificate';

export type DriverDocumentStatus = {
  documentType: DocumentType;
  label: string;
  status: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  fileUrl: string | null;
  rejectionReason: string | null;
  uploadedAt: string | null;
  reviewedAt: string | null;
};

export async function fetchMyDocuments(token: string) {
  return (await apiFetch('/api/driver-documents/mine', { token })) as { checklist: DriverDocumentStatus[]; verified: boolean };
}

// Separate from apiFetch deliberately, same as confirmDelivery — a
// multipart upload needs the runtime to set Content-Type (with the
// multipart boundary) automatically and must send a raw FormData body.
export async function uploadDriverDocument(
  token: string,
  documentType: DocumentType,
  file: { uri: string; fileName?: string; mimeType?: string }
) {
  const formData = new FormData();
  formData.append('documentType', documentType);
  formData.append('document', {
    uri: file.uri,
    name: file.fileName || `${documentType}.jpg`,
    type: file.mimeType || 'image/jpeg',
  } as unknown as Blob);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${API_BASE}/api/driver-documents`, {
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
