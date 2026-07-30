# Kigali Freight Driver App

Driver-focused mobile client for the Kigali Freight system. Built with Expo, TypeScript, and expo-router.

## What it does

- Secure driver sign-in.
- Live assignment dashboard.
- Trip detail and status workflow.
- Incident reporting.
- Push notifications for new assignments (Firebase Cloud Messaging).
- Lightweight profile and sign-out flow.
- Ready for offline-first expansion.

## Tech Stack

- Expo + React Native
- expo-router
- TypeScript
- SecureStore for auth token storage
- REST API integration with the Kigali Freight backend

## Prerequisites

- Node.js 18+
- Expo CLI or `npx expo`
- Android Studio, Xcode, or Expo Go for local testing
- The Kigali Freight backend running and reachable from the device/emulator

## Setup

```bash
npm install
```

Create a `.env` file from [`.env.example`](.env.example):

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:5000
```

The backend URL is required. Use your computer LAN IP on a physical device or emulator.

## Run

```bash
npm start
```

Open on Android, iOS, or web from the Expo prompt.

## Scripts

- `npm start` - start Expo
- `npm run android` - open Android
- `npm run ios` - open iOS
- `npm run web` - open web preview
- `npm run lint` - lint source
- `npm run typecheck` - TypeScript check

## App Structure

- `app/(auth)/login.tsx` - driver login screen.
- `app/(app)/index.tsx` - dashboard with metrics and assignments.
- `app/(app)/assignments.tsx` - active jobs list.
- `app/(app)/trip/[id].tsx` - trip status view.
- `app/(app)/incidents.tsx` - incident reporting.
- `app/(app)/profile.tsx` - profile and sign-out.
- `components/` - shared UI primitives.
- `lib/api.ts` - backend API helpers.
- `lib/auth.tsx` - auth state and token persistence.
- `lib/theme.ts` - visual system tokens.

## Design Notes

The app uses a dark teal-and-amber control-room theme with gradients, cards, and strong typography so drivers get a focused, legible interface in bright outdoor conditions.

## Backend Expectations

The driver app expects the backend to provide:

- `POST /api/auth/login`
- `GET /api/orders/active`
- `GET /api/orders/:id/history`
- `PATCH /api/orders/:id/status`
- `POST /api/incidents` for incident reporting if enabled later
- `POST /api/notifications/register-token` for push notification registration

## Push Notifications

The app registers the device's native FCM push token with the backend on login
(and on every app launch while already signed in), so drivers get notified of
new assignments even when the app isn't in the foreground. The backend sends
directly via Firebase Cloud Messaging (Firebase Admin SDK) — there's no Expo
push service involved.

To build and run this with push notifications actually working, you need:

1. **`google-services.json`** at the project root (referenced in
   `app.config.ts`). Download it from Firebase Console > Project Settings >
   General > Your apps > Android app. This is a public client config file
   (not a secret) — safe to commit.
2. A **custom dev client or EAS build** — push notifications require native
   code (`expo-notifications`), so they won't work in Expo Go. Run
   `eas build --profile development` (or `npx expo run:android`) after
   adding `google-services.json`.
3. The backend needs `FIREBASE_SERVICE_ACCOUNT_PATH` configured (see the
   router's README) pointing at the same Firebase project.

Without `google-services.json`, the app still builds and runs fine —
`getDevicePushToken()` just fails gracefully (logged, not fatal) and the rest
of the app is unaffected.

## Next Steps

The next production phase should add:

- live telemetry background tracking,
- offline sync queue,
- photo proof-of-delivery,
- route navigation handoff,
- device permission management.
