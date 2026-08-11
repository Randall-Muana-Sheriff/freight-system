const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withAndroidManifest,
  withMainApplication,
  AndroidConfig,
} = require('expo/config-plugins');

// Injects the native Android foreground-location service at prebuild time.
//
// This has to be a config plugin rather than files committed under
// android/: `expo prebuild` regenerates that whole directory from
// app.config.ts, so hand-added Kotlin sources and manifest edits are
// silently wiped on the next build. (That is exactly what happened to an
// earlier hand-written version of this service — it vanished and the app
// quietly fell back to the unreliable JS background task.)
//
// What it does:
//   1. copies the three .kt templates into the app's package directory,
//      substituting the real applicationId (which differs between the dev
//      and production variants — see app.config.ts)
//   2. declares the service in AndroidManifest.xml with
//      foregroundServiceType="location"
//   3. registers LocationServicePackage() with the React host

const TEMPLATES = [
  'LocationForegroundService.kt',
  'LocationServiceModule.kt',
  'LocationServicePackage.kt',
];

function withNativeSources(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const packageName = AndroidConfig.Package.getPackage(cfg);
      if (!packageName) {
        throw new Error('withNativeLocationService: android.package is not set in app config.');
      }

      const destDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...packageName.split('.')
      );
      fs.mkdirSync(destDir, { recursive: true });

      for (const file of TEMPLATES) {
        const source = fs.readFileSync(
          path.join(cfg.modRequest.projectRoot, 'plugins/native-location', `${file}.template`),
          'utf8'
        );
        fs.writeFileSync(path.join(destDir, file), source.replace(/__PACKAGE__/g, packageName));
      }

      return cfg;
    },
  ]);
}

function withServiceInManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service ?? [];

    const name = '.LocationForegroundService';
    // Idempotent: prebuild can run repeatedly against an existing manifest.
    if (!app.service.some((s) => s.$?.['android:name'] === name)) {
      app.service.push({
        $: {
          'android:name': name,
          'android:exported': 'false',
          'android:foregroundServiceType': 'location',
        },
      });
    }
    return cfg;
  });
}

function withPackageRegistered(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes('LocationServicePackage()')) return cfg;

    // The generated MainApplication builds its package list inside an
    // `.apply { }` block on PackageList(this).packages. Append there.
    const anchor = 'PackageList(this).packages.apply {';
    if (!contents.includes(anchor)) {
      throw new Error(
        'withNativeLocationService: could not find the package list in MainApplication — ' +
          'the Expo template changed and this plugin needs updating.'
      );
    }
    contents = contents.replace(anchor, `${anchor}\n          add(LocationServicePackage())`);

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withNativeLocationService(config) {
  return withPackageRegistered(withServiceInManifest(withNativeSources(config)));
};
