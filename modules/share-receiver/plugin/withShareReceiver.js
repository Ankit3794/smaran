// Expo config plugin: adds the native share receiver to AndroidManifest.xml during `npx expo prebuild`.
// android/ is generated (and gitignored), so every manifest change must come from a plugin like this one.
// The classes it names live in modules/share-receiver/android (ShareActivity.kt, ProcessTaskService.kt).
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SHARE_ACTIVITY = 'app.smaran.share.ShareActivity';
const PROCESS_SERVICE = 'app.smaran.share.ProcessTaskService';
const WAKE_LOCK = 'android.permission.WAKE_LOCK';

const shareActivity = {
  $: {
    'android:name': SHARE_ACTIVITY,
    // Other apps' share sheets must be able to open it.
    'android:exported': 'true',
    // See-through window, so the app the user shared from stays visible behind the card.
    'android:theme': '@style/Theme.SmaranShare',
    // An empty task affinity keeps the card out of Smaran's own task, so sharing never brings the
    // main app to the front; excludeFromRecents keeps the brief card out of the recent-apps list.
    // The default launch mode gives every share a fresh card instead of reusing an open one.
    'android:taskAffinity': '',
    'android:excludeFromRecents': 'true',
    // Handle rotation and similar changes in place: recreating the activity would save the share twice.
    'android:configChanges': 'orientation|screenSize|screenLayout|smallestScreenSize|keyboard|keyboardHidden|uiMode|density',
    'android:windowSoftInputMode': 'adjustResize',
    // Its own process, so this screen's SQLite (Android's built-in copy) never shares a process with expo-sqlite's
    // bundled copy, which the app and its background task keep open on the same smaran.db. SQLite's file locks are
    // POSIX locks owned by the whole process: when one library closes the file, the kernel drops the other library's
    // locks too, which SQLite documents as a way to corrupt a database ("How To Corrupt An SQLite Database File",
    // section 2.2.1). Across processes those locks work as designed. ProcessTaskService stays in the main process.
    'android:process': ':share',
  },
  'intent-filter': [
    {
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      // Images are accepted only to explain that v1 saves links and text; ShareActivity inserts nothing for them.
      data: [{ $: { 'android:mimeType': 'text/plain' } }, { $: { 'android:mimeType': 'image/*' } }],
    },
  ],
};

// Started by ShareActivity; runs the "SmaranProcess" Headless JS task. Not exported: only this app may start it.
// No android:process, so it runs in the main app process with the JS runtime; ShareActivity starts it from the
// ":share" process with an explicit Intent, which Android delivers across processes of the same app.
const processService = { $: { 'android:name': PROCESS_SERVICE, 'android:exported': 'false' } };

function withShareReceiver(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    // Replace rather than append, so running prebuild twice never declares the activity twice.
    application.activity = (application.activity ?? []).filter((activity) => activity.$['android:name'] !== SHARE_ACTIVITY);
    application.activity.push(shareActivity);
    application.service = (application.service ?? []).filter((service) => service.$['android:name'] !== PROCESS_SERVICE);
    application.service.push(processService);

    // HeadlessJsTaskService holds a wake lock so the phone does not sleep in the middle of processing a share.
    AndroidConfig.Permissions.ensurePermissions(manifest, [WAKE_LOCK]);
    return config;
  });
}

module.exports = withShareReceiver;
