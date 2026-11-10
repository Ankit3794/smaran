# Releasing Smaran

How to build a signed release APK and publish it. Debug builds (`npx expo run:android`) need none of this.

## 1. Create your upload key (once)

The key signs every release. **Android only installs an update if it is signed with the same key.** Keep the file
and its passwords safe, and back them up outside your laptop. If you lose the key, people have to uninstall and
reinstall to get new versions.

Create it outside the repo:

```bash
mkdir -p ~/keys
keytool -genkeypair -v -storetype PKCS12 \
  -keystore ~/keys/smaran-upload.keystore \
  -alias smaran-upload -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` comes with the JDK (use JDK 17). It asks for a password and your name or organisation.

## 2. Tell Gradle where it is

Add these four lines to `~/.gradle/gradle.properties`. This is your user-level Gradle file, not the repo's:

```properties
SMARAN_UPLOAD_STORE_FILE=/home/you/keys/smaran-upload.keystore
SMARAN_UPLOAD_STORE_PASSWORD=your-store-password
SMARAN_UPLOAD_KEY_ALIAS=smaran-upload
SMARAN_UPLOAD_KEY_PASSWORD=your-key-password
```

The config plugin [`plugins/withReleaseSigning.js`](../plugins/withReleaseSigning.js) writes a release signing config
into the generated `android/app/build.gradle` that reads these properties. If they're missing, release builds fall
back to Expo's debug key. That's fine for trying a release build locally, but such an APK must not be published.

## 3. Bump the version

In `app.json`:

- `expo.version` is what people see, for example `0.1.0` → `0.2.0`.
- `expo.android.versionCode` is a whole number that **must go up by at least 1 for every APK you publish**.

Keep `package.json`'s `version` in step with `expo.version`.

## 4. Build

```bash
npx jest && npm run typecheck
npx expo prebuild --clean          # regenerates android/ with the signing config
cd android && ./gradlew assembleRelease
```

The APK is at `android/app/build/outputs/apk/release/app-release.apk`. Check that it's signed with your key, not the
debug one:

```bash
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
```

The certificate's DN should show your name, not `CN=Android Debug`.

## 5. Check it on a phone

Install it with `adb install -r android/app/build/outputs/apk/release/app-release.apk`, then:

1. Share a link from X, Reddit, Instagram, GitHub and a browser. Each shows the "Saved" card and gets a summary.
2. Share one of them again: the card says "Already saved". Add a note: it appears on the existing save.
3. Share a new link and tap **Undo**: it never appears.
4. Airplane mode → share → back online → it finishes on its own (or tap **Retry now**).
5. Find "the trading thing from two nights ago" in 3 taps or fewer: Timeline → Trading chip → that day.
6. Search for a word from a post. The match is highlighted.
7. **Settings → Export backup**, then **Import backup** of that file on the same phone: "Added 0 saves. N were already here."
8. Sign in with each provider you support (subscription and API key), and disconnect.
9. While doing all of this, `adb logcat | grep -iE "FATAL|fts5"` stays empty.

## 6. Tag and publish

```bash
git tag v0.1.0
git push origin v0.1.0
```

On GitHub, create a release from the tag, attach `app-release.apk`, and paste the "what leaves your phone" and
subscription sign-in sections of the README into the notes. Once the repo is public, set `expo.extra.sourceUrl` in
`app.json` to the repository URL so **Settings → About** links to it.
