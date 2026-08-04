import type { ExpoConfig } from 'expo/config';

// Set by eas.json's "development" build profile only. Gives the dev
// client its own app identifier and name so it installs as a separate
// icon alongside the real preview/production build on the same physical
// device, instead of silently replacing it — both can then sit on the
// phone at once: one for actively developing against local Metro (Fast
// Refresh, instant JS changes), one for testing what a real driver
// actually gets.
const IS_DEV_CLIENT = process.env.APP_VARIANT === 'development';

const config: ExpoConfig = {
  name: IS_DEV_CLIENT ? 'Kigali Freight Driver (Dev)' : 'Kigali Freight Driver',
  slug: 'kigali-freight-driver',
  scheme: 'kigali-freight-driver',
  // Bumped for the Expo SDK 54→57 upgrade (React Native 0.81→0.86 and
  // every native module along with it) — required so this build gets a
  // genuinely different runtimeVersion (policy: 'appVersion', see below)
  // than the old SDK-54 build. Sharing a runtimeVersion across two
  // natively-incompatible builds would let EAS Update think a JS-only
  // update from one is safe to serve to the other.
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  // EAS Update: ships JS-only changes to an already-installed build over
  // the air, no new native build/reinstall needed.
  //
  // Originally set to "fingerprint" for exactly the reason described
  // below — but real testing (not just reasoning about it) found that
  // policy actively broken for this project's actual workflow: EAS
  // builds run on Expo's cloud servers with a fresh dependency install,
  // while `eas update` bundles JS using whatever's resolved locally —
  // and fingerprint hashing is sensitive enough that these two
  // environments computed different values with zero real native change
  // between them, silently breaking update delivery (the app only
  // accepts an update whose runtime version matches its own exactly).
  // "appVersion" is less automatic (it depends on remembering to bump
  // `version` below whenever a native module changes) but it's
  // deterministic and doesn't depend on two separate environments
  // agreeing on a native-dependency hash — bump `version` by hand after
  // adding/upgrading any native module, exactly as this app's own
  // history (Sentry, NetInfo) shows is a real, recurring event.
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/2047b750-f546-42e2-8e5e-ea92fddf6296',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: IS_DEV_CLIENT ? 'com.muana.kigalifreightdriver.dev' : 'com.muana.kigalifreightdriver',
  },
  android: {
    package: IS_DEV_CLIENT ? 'com.muana.kigalifreightdriver.dev' : 'com.muana.kigalifreightdriver',
    // Edge-to-edge is mandatory (no opt-out) as of Android 16 / this SDK —
    // the old edgeToEdgeEnabled toggle was removed since there's nothing
    // left to toggle.
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#050C18',
    },
    // EAS Build injects GOOGLE_SERVICES_JSON as a path to the securely
    // uploaded file (set via `eas env:create`) since the real file is
    // gitignored and never part of the uploaded project archive. Falls
    // back to the local file for everyday local dev builds.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  plugins: [
    'expo-secure-store',
    'expo-router',
    'expo-asset',
    'expo-notifications',
    'expo-font',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Kigali Freight Driver uses Face ID to quickly and securely unlock the app with your existing PIN-based session.',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#050C18',
        image: './assets/icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Kigali Freight Driver needs access to your photos to attach a proof-of-delivery image.',
        cameraPermission: 'Kigali Freight Driver needs camera access to take a proof-of-delivery photo.',
        // The app only ever picks still photos, never records video — the
        // plugin requests microphone access by default (for video capture)
        // regardless, which was previously an unnecessary permission with
        // no feature behind it.
        microphonePermission: false,
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Kigali Freight Driver needs your location to keep dispatchers updated on your position, even while the app is in the background during an active shift.',
        locationWhenInUsePermission:
          'Kigali Freight Driver needs your location to keep dispatchers updated on your position during deliveries.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    // Uploads source maps for release builds so Sentry can de-minify stack
    // traces. organization/project are not sensitive (they're the same
    // slugs visible in the Sentry project URL) — the actual credential is
    // SENTRY_AUTH_TOKEN, read at build time from .env.sentry-build-plugin
    // (local builds, gitignored) or the EAS secret of the same name
    // (cloud builds via `eas build`). Without that token present, this
    // plugin just skips the upload step rather than failing the build.
    [
      '@sentry/react-native/expo',
      {
        organization: 'unilak',
        project: 'kigali-freight-driver',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    eas: {
      projectId: '2047b750-f546-42e2-8e5e-ea92fddf6296',
    },
  },
};

export default config;