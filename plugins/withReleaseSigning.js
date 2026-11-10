// Expo config plugin: signs release builds with your own upload key during `npx expo prebuild`.
// android/ is generated (and gitignored), so the signing setup has to be written into build.gradle by a plugin.
// The key's path and passwords never live in this repo: they are read from ~/.gradle/gradle.properties
// (SMARAN_UPLOAD_STORE_FILE, SMARAN_UPLOAD_STORE_PASSWORD, SMARAN_UPLOAD_KEY_ALIAS, SMARAN_UPLOAD_KEY_PASSWORD).
// Without them, release builds keep Expo's default debug signing, so a fresh clone still builds. See docs/release.md.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING_CONFIG = `
        release {
            if (project.hasProperty('SMARAN_UPLOAD_STORE_FILE')) {
                storeFile file(SMARAN_UPLOAD_STORE_FILE)
                storePassword SMARAN_UPLOAD_STORE_PASSWORD
                keyAlias SMARAN_UPLOAD_KEY_ALIAS
                keyPassword SMARAN_UPLOAD_KEY_PASSWORD
            }
        }`;

const DEFAULT_RELEASE_SIGNING = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const SMARAN_RELEASE_SIGNING = `            // see https://reactnative.dev/docs/signed-apk-android.
            // Smaran: use the upload key from ~/.gradle/gradle.properties when it is set up (docs/release.md).
            signingConfig project.hasProperty('SMARAN_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`;

function addReleaseSigning(buildGradle) {
  if (buildGradle.includes('SMARAN_UPLOAD_STORE_FILE')) return buildGradle;
  // Fail loudly if Expo's template changes shape, rather than silently shipping debug-signed releases.
  if (!buildGradle.includes("keyPassword 'android'\n        }") || !buildGradle.includes(DEFAULT_RELEASE_SIGNING)) {
    throw new Error('withReleaseSigning: android/app/build.gradle no longer matches the expected template; update the plugin.');
  }
  return buildGradle
    .replace("keyPassword 'android'\n        }", `keyPassword 'android'\n        }${RELEASE_SIGNING_CONFIG}`)
    .replace(DEFAULT_RELEASE_SIGNING, SMARAN_RELEASE_SIGNING);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = addReleaseSigning(gradleConfig.modResults.contents);
    return gradleConfig;
  });
};

// Exported for the plugin's test.
module.exports.addReleaseSigning = addReleaseSigning;
