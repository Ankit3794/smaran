// Tests for the release-signing config plugin (plugins/withReleaseSigning.js) against Expo's build.gradle template.
// The plugin edits generated Gradle text, so these pin the exact edit and the loud failure when the template changes.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addReleaseSigning } = require('../../plugins/withReleaseSigning') as { addReleaseSigning: (gradle: string) => string };

// The signing part of android/app/build.gradle as `npx expo prebuild` generates it (Expo SDK 58).
const TEMPLATE = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }`;

describe('addReleaseSigning', () => {
  it('adds a release signing config read from gradle properties and uses it for release builds when set', () => {
    const result = addReleaseSigning(TEMPLATE);
    expect(result).toContain("if (project.hasProperty('SMARAN_UPLOAD_STORE_FILE')) {\n                storeFile file(SMARAN_UPLOAD_STORE_FILE)");
    expect(result).toContain("signingConfig project.hasProperty('SMARAN_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug");
    // Debug builds keep the debug key.
    expect(result).toContain('        debug {\n            signingConfig signingConfigs.debug\n        }');
  });

  it('is safe to run twice (prebuild without --clean)', () => {
    const once = addReleaseSigning(TEMPLATE);
    expect(addReleaseSigning(once)).toBe(once);
  });

  it('refuses a template it does not recognise instead of shipping debug-signed releases', () => {
    expect(() => addReleaseSigning(TEMPLATE.replace('signingConfig signingConfigs.debug\n            minify', 'signingConfig x\n            minify'))).toThrow(
      'no longer matches the expected template',
    );
  });
});
