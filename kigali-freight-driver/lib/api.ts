import Constants from 'expo-constants';
import { File, UploadType, type UploadResult } from 'expo-file-system';
import { refreshAccessToken } from './tokenStore';
import { isRetryableFailure } from './retryable';

/** An API failure that remembers what kind it was.
 *
 *  The app threw bare Errors, which meant nothing downstream could tell a
 *  dropped connection from a refusal. That was survivable until the server
 *  grew a state machine: a replayed status update now returns 409, the
 *  offline queue treated it like a network blip, and re-queued it for ever
 *  along with every item behind it — including the delivery photos. A 409
 *  never becomes a 200, so that queue never drained again.
 *
 *  `retryable` is the whole point of this class. 5xx and a lost connection
 *  are worth another attempt; a 4xx is the server telling us the request
 *  itself is wrong, and repeating it is how a queue jams silently. 408 and
 *  429 are the exceptions — both mean "not now" rather than "not ever". */
export class ApiError extends Error {
    status: number;
    code: string | null;
    constructor(message: string, status: number, code: string | null = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
    get retryable(): boolean {
        return isRetryableFailure(this);
    }
}




function resolveApiBase() {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  const apiBaseUrl = extra?.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL. Create a .env file from .env.example and set your backend URL.');
  }

  // __DEV__ is false in every release build (EAS preview/production, or a
  // local release build) — a plaintext http:// backend was previously
  // possible to ship by accident in exactly that case, silently sending
  // JWTs, PINs, and GPS coordinates unencrypted. A local dev backend
  // (Expo Go / dev-client, __DEV__ true) legitimately has no HTTPS setup
  // most of the time, so this only enforces the rule where it actually
  // matters: real builds a driver installs.
  if (!__DEV__ && !apiBaseUrl.startsWith('https://')) {
    throw new Error(
      `EXPO_PUBLIC_API_BASE_URL must be HTTPS in a release build (got "${apiBaseUrl}"). ` +
      'Set a real HTTPS backend URL via `eas env:create` for this build profile — see eas.json.'
    );
  }

  return apiBaseUrl;
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
  priority?: 'high' | 'normal' | 'low';
  updated_at?: string;
  // Customer-placed orders (source 'public') arrive with no hub and no
  // coordinates until a dispatcher places them on the map. On those, these
  // free-text fields are the only description of where the job goes, and
  // the customer is the person to ring — recipient_name/phone are only
  // filled in when a dispatcher typed them.
  source?: 'dispatch' | 'public';
  pickup_address_text?: string | null;
  delivery_address_text?: string | null;
  special_instructions?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  // What this job pays the driver, in RWF. Already net of the platform's
  // fee and already covering the fuel the run will burn, so it is the whole
  // of what lands with them -- which is what makes it the right number to
  // decide on. The customer's total and the platform's cut are deliberately
  // not on this endpoint.
  driver_net?: string | number | null;
  // True while the job was priced from weight alone, before a dispatcher
  // pinned it to the map. The pay is provisional until that happens and the
  // app has to say so rather than quote a figure that can still move.
  price_is_estimate?: boolean;
  // Already inside driver_net. Sent separately so the app can say why
  // that figure moved rather than leaving the driver to guess.
  detention_amount?: string | number | null;
  // Set while a job is offered rather than assigned. An offer is work the
  // driver has not agreed to yet, which is the difference between being an
  // employee and being an independent operator with their own truck.
  offer_expires_at?: string | null;
  // Set once the recipient has been texted their handover code. The app only
  // offers the code path when this is present -- suggesting a code that was
  // never sent would send a driver hunting for a number nobody has.
  delivery_code_sent_at?: string | null;
};

// The rate-limit middleware already computes the exact remaining wait as
// Retry-After (seconds); this just turns that into a phrase a driver can
// actually act on ("in 4 minutes") instead of guessing how long "later" is.
function formatRetryAfter(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    const secs = Math.max(seconds, 1);
    return `${secs} second${secs === 1 ? '' : 's'}`;
  }
  if (seconds === 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'} and ${seconds} second${seconds === 1 ? '' : 's'}`;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  const acceptedResponse = response.status === 202;

  if (!response.ok && !acceptedResponse) {
    if (response.status === 429) {
      const retryAfterSeconds = parseInt(response.headers.get('Retry-After') || '', 10);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        throw new Error(`Too many attempts. Try again in ${formatRetryAfter(retryAfterSeconds)}.`);
      }
    }
    const message = payload?.error?.message || payload?.error || payload?.message || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload?.error?.code ?? payload?.code ?? null);
  }

  if (acceptedResponse && payload == null) {
    return { accepted: true };
  }

  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    return payload.data;
  }

  return payload;
}

// Same response-shape handling as parseResponse, but for expo-file-system's
// File.upload() result — a plain {body, status, headers} object rather than
// a fetch Response. Multipart uploads use this native upload API instead of
// fetch+FormData: Expo's own global fetch replacement (see runtime.native.ts
// in the expo package) only accepts real Blob/File parts, not the classic
// React Native {uri, name, type} idiom, and doesn't reliably fall back to
// React Native's own fetch either — File.upload() constructs the multipart
// body in native code, sidestepping both JS fetch implementations entirely.
function parseUploadResult(result: UploadResult) {
  const contentType = result.headers?.['content-type'] || result.headers?.['Content-Type'] || '';
  const payload = contentType.includes('application/json') && result.body ? JSON.parse(result.body) : null;
  const acceptedResponse = result.status === 202;

  if (result.status < 200 || (result.status >= 300 && !acceptedResponse)) {
    const message = payload?.error?.message || payload?.error || payload?.message || `Request failed with status ${result.status}`;
    throw new ApiError(message, result.status, payload?.error?.code ?? payload?.code ?? null);
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
      throw new ApiError('Network request failed (request timed out)', 408);
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
// 401 only, and the distinction is load-bearing. The backend used to answer
// 403 AUTH_INVALID_TOKEN for an expired JWT and 403 AUTH_FORBIDDEN for a
// genuine role refusal — the same status for "who are you" and "you may
// not" — so this had to refresh on both. That made every real refusal burn
// a single-use refresh-token rotation before failing again identically.
//
// The router now separates them: 401 for an invalid or expired token, 403
// for a refusal. So a 403 is never worth a refresh, and it must not get one:
// a refusal that is retried looks transient, and the offline queue reads a
// retried-then-failed 403 as a permanent rejection of the driver's work.
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

// smsSent is false when Africa's Talking is unconfigured, out of credit, or
// rejects the number. The code is still issued and still valid -- a dispatcher
// can read it out over the phone -- so this is not an error, but the screen
// must not tell the driver to check their messages when nothing was sent.
export async function requestDriverOtp(phoneNumber: string) {
  return (await apiFetch('/api/auth/driver/otp/request', { method: 'POST', body: { phoneNumber } })) as {
    accepted: boolean;
    smsSent: boolean;
  };
}

// No /api prefix — this is served by systemRoutes.js, the router's one
// fully public/unauthenticated routes file, not the usual /api surface.
// Needed pre-login (the PIN screens shown before a real session exists),
// which is exactly why it has to be unauthenticated in the first place.
export async function fetchDispatchContact() {
  return (await apiFetch('/dispatch-contact', { method: 'GET' })) as { phoneNumber: string | null };
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
  // null (not just absent) means no fresh GPS fix to compute these from —
  // see computeRouteProgress in orderController.js. Distinguishing "no
  // signal yet" from "0% progress" matters for what the trip screen shows.
  progressPercent?: number | null;
  distanceRemainingKm?: number | null;
  etaMinutes?: number | null;
  // What the customer owes and whether it has arrived. The app had driver_net
  // — the driver's own cut — and nothing about what to actually ask for, so
  // the trip screen could not tell whether a job needed collecting at all.
  //
  // Numeric columns arrive as strings over JSON, hence the union.
  //
  // currency is genuinely nullable: orders exist that carry a price and no
  // unit. Never render it beside the amount without checking — see
  // formatAmount in lib/paymentPolicy.ts.
  price_total?: number | string | null;
  currency?: string | null;
  price_is_estimate?: boolean | null;
  payment_status?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  // Deliberately absent from the server's response and so from here:
  // platform_fee. What the platform keeps is a term between this business and
  // its drivers, not a number to hand somebody mid-negotiation at a gate.
};

export type MomoRequestResult = {
  reference: string;
  reused: boolean;
  amount: number;
  currency?: string;
  msisdn?: string;
  network?: string;
  message: string;
};

export type PaymentAttempt = {
  reference: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'MISMATCH' | string;
  amount: number;
  currency: string | null;
  payer: string | null;
  failureReason: string | null;
  requestedAt: string;
};

export type PaymentStatusResult = {
  paymentStatus: string | null;
  attempt: PaymentAttempt | null;
};

export type CashResult = {
  orderId: number;
  amount: number;
  currency: string | null;
  // The commission the driver now owes back. Null when the split was never
  // computed. Shown only after collection — it is a debt to hand in, not a
  // number to be holding while asking a customer for money.
  platformFeeOwed: number | null;
  method: 'CASH';
  message: string;
};

// Asks the customer's handset for the money. payFrom covers the case the
// server named: they booked on Airtel and offer an MTN number at the gate.
export async function requestMomoPayment(token: string, orderId: number, payFrom?: string) {
  return (await apiFetch(`/api/payments/orders/${orderId}/request`, {
    token, method: 'POST', body: payFrom ? { payFrom } : {},
  })) as MomoRequestResult;
}

// Polled while the customer holds their phone. Reconciles rather than merely
// reading, so the answer is never staler than the call — the webhook may not
// have arrived, and may never.
export async function fetchPaymentStatus(token: string, orderId: number) {
  return (await apiFetch(`/api/payments/orders/${orderId}`, { token })) as PaymentStatusResult;
}

// Whether a prompt can reach this number at all, asked before the driver taps
// rather than after a minute of waiting on a number that was never MTN.
export async function checkCanCharge(token: string, phone: string) {
  return (await apiFetch(`/api/payments/can-charge?phone=${encodeURIComponent(phone)}`, { token })) as {
    phone: string;
    network: string;
    canCharge: boolean;
    reason: string | null;
  };
}

export async function recordCashPayment(token: string, orderId: number, note?: string) {
  return (await apiFetch(`/api/payments/orders/${orderId}/cash`, {
    token, method: 'POST', body: note ? { note } : {},
  })) as CashResult;
}

export async function fetchDriverEarnings(token: string) {
  return (await apiFetch('/api/payments/driver/earnings', { token })) as {
    paidOut: number;
    onTheWay: number;
    payouts: {
      id: number; order_id: number; amount: number; currency: string | null;
      status: string; release_at: string | null; sent_at: string | null;
      created_at: string; failure_reason: string | null;
    }[];
  };
}

export async function acceptJobOffer(token: string, orderId: number) {
  return apiFetch(`/api/orders/${orderId}/accept`, { token, method: 'POST', body: {} });
}

// The reason is optional and free text. "Too far for the rate" and "already
// loaded" are different problems, and only one of them is about pricing --
// dispatch can only learn that if the driver can say which it was.
export async function declineJobOffer(token: string, orderId: number, reason?: string) {
  return apiFetch(`/api/orders/${orderId}/decline`, { token, method: 'POST', body: { reason } });
}

export async function fetchOrderById(token: string, orderId: number) {
  return (await apiFetch(`/api/orders/${orderId}`, { token })) as OrderDetail;
}

// Separate from apiFetch deliberately: a multipart upload needs to build the
// multipart body itself rather than JSON.stringify'ing it. Uses
// expo-file-system's native File.upload() instead of fetch+FormData — see
// the comment on parseUploadResult for why.
// Closing a delivery on the recipient's code alone, with no photograph.
//
// A separate call rather than a parameter on the one above, because that one
// is built around File.upload() and there is no file here. This is the path a
// driver takes when their phone has no usable camera -- and the proof is
// arguably the better of the two: a photo shows a parcel somewhere, a code
// shows it reached the person it was addressed to.
export async function confirmDeliveryByCode(
  token: string,
  orderId: number,
  deliveryCode: string,
  notes?: string
) {
  return apiFetch(`/api/orders/${orderId}/confirm-delivery`, {
    token,
    method: 'POST',
    body: { deliveryCode, ...(notes ? { notes } : {}) },
  });
}

export async function confirmDelivery(
  token: string,
  orderId: number,
  photo: { uri: string; fileName?: string; mimeType?: string },
  notes?: string,
  deliveryCode?: string
) {
  const file = new File(photo.uri);
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Network request failed (upload timed out)')), 30000);
  });

  try {
    const result = await Promise.race([
      file.upload(`${API_BASE}/api/orders/${orderId}/confirm-delivery`, {
        uploadType: UploadType.MULTIPART,
        fieldName: 'photo',
        mimeType: photo.mimeType || 'image/jpeg',
        headers: { Authorization: `Bearer ${token}` },
        parameters: {
          ...(notes ? { notes } : {}),
          ...(deliveryCode ? { deliveryCode } : {}),
        },
      }),
      timeout,
    ]);
    return parseUploadResult(result);
  } finally {
    clearTimeout(timeoutId!);
  }
}

export async function updateOrderStatus(token: string, orderId: number, status: string) {
  return apiFetch(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
}

export type IncidentReportResult = {
  id: number;
  description: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity: 'low' | 'medium' | 'high' | null;
  nearestHub: { name: string; distanceKm: number } | null;
};

// Photo-first: a driver who just had something go wrong can attach a
// photo and skip typing entirely — the backend drafts the report from
// the image. When a photo is present this goes out as multipart via
// expo-file-system's native File.upload() (see confirmDelivery above for
// why, not fetch+FormData); a plain text-only report is simpler as a
// normal JSON POST, so it stays on apiFetch instead of paying for
// multipart overhead it doesn't need.
export async function reportIncident(
  token: string,
  payload: {
    orderId?: number;
    title?: string;
    description?: string;
    lat?: number;
    lng?: number;
    photo?: { uri: string; fileName?: string; mimeType?: string };
  }
): Promise<IncidentReportResult> {
  if (payload.photo) {
    const file = new File(payload.photo.uri);
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Network request failed (upload timed out)')), 30000);
    });

    const parameters: Record<string, string> = {};
    if (payload.orderId != null) parameters.orderId = String(payload.orderId);
    if (payload.title) parameters.title = payload.title;
    if (payload.description) parameters.description = payload.description;
    if (payload.lat != null) parameters.lat = String(payload.lat);
    if (payload.lng != null) parameters.lng = String(payload.lng);

    try {
      const result = await Promise.race([
        file.upload(`${API_BASE}/api/incidents`, {
          uploadType: UploadType.MULTIPART,
          fieldName: 'photo',
          mimeType: payload.photo.mimeType || 'image/jpeg',
          headers: { Authorization: `Bearer ${token}` },
          parameters,
        }),
        timeout,
      ]);
      return parseUploadResult(result) as IncidentReportResult;
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  return apiFetch('/api/incidents', {
    method: 'POST',
    token,
    body: {
      orderId: payload.orderId,
      title: payload.title,
      description: payload.description,
      lat: payload.lat,
      lng: payload.lng,
    },
  }) as Promise<IncidentReportResult>;
}

export type MyIncident = {
  id: number;
  order_id: number | null;
  description: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity?: 'low' | 'medium' | 'high' | null;
  photo_url?: string | null;
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

export type SafetyChecklistItems = Record<string, boolean>;

// Three states, because two could not describe a fault. 'unchecked' is not
// "fine", it is "nobody has looked yet" — the distinction the boolean could
// not carry, and the reason a driver who found a bad tyre previously had to
// either lie or stay silent.
export type SafetyCheckResult = 'pass' | 'fail' | 'unchecked';
export type SafetyChecklistResults = Record<string, SafetyCheckResult>;

// The server returns both shapes on purpose: `items` is the old boolean map
// an installed build still reads, `results` is the tri-state. See
// safetyChecklistController.js.
export type SafetyChecklistResponse = {
  items: SafetyChecklistItems;
  results: SafetyChecklistResults;
  defectId?: number | null;
};

export type VehicleDefect = {
  id: number;
  description: string;
  created_at: string;
  driver_name: string;
};

export async function fetchTodaySafetyChecklist(token: string) {
  return (await apiFetch('/api/driver-safety-checklist/today', { token })) as SafetyChecklistResponse;
}

export async function updateSafetyChecklistItem(
  token: string,
  itemKey: string,
  result: SafetyCheckResult,
  note?: string,
) {
  return (await apiFetch('/api/driver-safety-checklist/today', {
    method: 'PATCH',
    token,
    body: { itemKey, result, ...(note ? { note } : {}) },
  })) as SafetyChecklistResponse;
}

// What is already wrong with the truck this driver is about to take. The
// whole reason a defect attaches to a vehicle rather than to the driver who
// found it: the next person to walk up to it needs to know.
export async function fetchOpenVehicleDefects(token: string) {
  return (await apiFetch('/api/driver-safety-checklist/vehicle-defects', { token })) as { defects: VehicleDefect[] };
}

// Separate from apiFetch deliberately, same as confirmDelivery — a
// multipart upload needs to build the multipart body itself, via
// expo-file-system's native File.upload() (see parseUploadResult).
export async function uploadDriverDocument(
  token: string,
  documentType: DocumentType,
  fileAsset: { uri: string; fileName?: string; mimeType?: string }
) {
  const file = new File(fileAsset.uri);
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Network request failed (upload timed out)')), 30000);
  });

  try {
    const result = await Promise.race([
      file.upload(`${API_BASE}/api/driver-documents`, {
        uploadType: UploadType.MULTIPART,
        fieldName: 'document',
        mimeType: fileAsset.mimeType || 'image/jpeg',
        headers: { Authorization: `Bearer ${token}` },
        parameters: { documentType },
      }),
      timeout,
    ]);
    return parseUploadResult(result);
  } finally {
    clearTimeout(timeoutId!);
  }
}

// ── Multi-stop runs ──────────────────────────────────────────────────
// A run is the whole sequence a driver works through: one vehicle, stops
// in order, several orders. Completing a stop is what moves its order — see
// the router's tripController. The driver app never sets order status
// directly while on a run.

export type TripStopStatus = 'PENDING' | 'ARRIVED' | 'DONE' | 'FAILED' | 'SKIPPED';

export type TripStop = {
  id: number;
  order_id: number;
  kind: 'PICKUP' | 'DROP';
  sequence: number;
  lat: number | null;
  lng: number | null;
  address_text: string | null;
  status: TripStopStatus;
  failure_reason: string | null;
  cargo_description: string | null;
  weight_kg: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  special_instructions: string | null;
  priority: 'high' | 'normal' | 'low';
};

export type Trip = {
  id: number;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  planned_distance_m: number | null;
  started_at: string | null;
  stops: TripStop[];
  stopCount: number;
  completedStopCount: number;
  currentStop: TripStop | null;
};

// Resolves to null when the driver has no run — an ordinary state, not an
// error, so it must not be surfaced as one.
export async function fetchMyTrip(token: string): Promise<Trip | null> {
  try {
    return (await apiFetch('/api/trips/mine', { token })) as Trip | null;
  } catch (error) {
    if (error instanceof Error && error.message.includes('status 404')) return null;
    throw error;
  }
}

export async function updateTripStop(
  stopId: number,
  input: { status: Exclude<TripStopStatus, 'PENDING'>; failureReason?: string },
  token: string
): Promise<Trip> {
  return (await apiFetch(`/api/trips/stops/${stopId}`, {
    method: 'PATCH',
    token,
    body: input,
  })) as Trip;
}
