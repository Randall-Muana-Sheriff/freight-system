import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Kigali Freight Driver',
  slug: 'kigali-freight-driver',
  scheme: 'kigali-freight-driver',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    backgroundColor: '#07111f',
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
      backgroundColor: '#07111f',
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
      'expo-image-picker',
      {
        photosPermission: 'Kigali Freight Driver needs access to your photos to attach a proof-of-delivery image.',
        cameraPermission: 'Kigali Freight Driver needs camera access to take a proof-of-delivery photo.',
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