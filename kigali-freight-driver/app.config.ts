import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Kigali Freight Driver',
  slug: 'kigali-freight-driver',
  scheme: 'kigali-freight-driver',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  // EAS Update: ships JS-only changes to an already-installed build over
  // the air, no new native build/reinstall needed. "fingerprint" (not the
  // more common "appVersion") computes runtime compatibility from the
  // actual native code automatically — this project has already added
  // two native modules (Sentry, NetInfo) without anyone thinking about a
  // version bump each time, and appVersion's safety depends entirely on
  // remembering to do that by hand. fingerprint can't be forgotten.
  runtimeVersion: {
    policy: 'fingerprint',
  },
  updates: {
    url: 'https://u.expo.dev/2047b750-f546-42e2-8e5e-ea92fddf6296',
  },
  splash: {
    backgroundColor: '#050C18',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.muana.kigalifreightdriver',
  },
  android: {
    package: 'com.muana.kigalifreightdriver',
    edgeToEdgeEnabled: true,
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