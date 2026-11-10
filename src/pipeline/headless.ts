// Background triggers for the save queue, registered at app start by index.ts (before the router loads).
// The native share activity starts the "SmaranProcess" Headless JS task right after it writes to share_inbox;
// a 15-minute periodic task catches anything left over (offline shares, retries) while the app is closed.
import { AppRegistry } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { openDb, type Db } from '@/db/db';
import { runQueueNow } from './runNow';

// Must match the name ProcessTaskService.kt returns from getTaskConfig.
const HEADLESS_TASK_NAME = 'SmaranProcess';
const PERIODIC_TASK_NAME = 'smaran-periodic-queue';

// One connection for every background run in this JS runtime, instead of a new one per share.
let backgroundDb: Promise<Db> | null = null;

async function processQueue(): Promise<void> {
  // A failed open is forgotten so the next background run tries again.
  backgroundDb ??= openDb().catch((error: unknown) => {
    backgroundDb = null;
    throw error;
  });
  await runQueueNow(await backgroundDb);
}

// Headless JS: Android runs this JS function without showing any screen, even if the app was closed.
AppRegistry.registerHeadlessTask(HEADLESS_TASK_NAME, () => processQueue);

// defineTask must run at the top level of a file loaded at startup, so the OS can find the task when it wakes the app.
TaskManager.defineTask(PERIODIC_TASK_NAME, async () => {
  try {
    await processQueue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Registering again on every start is harmless; 15 minutes is the shortest interval Android allows.
BackgroundTask.registerTaskAsync(PERIODIC_TASK_NAME, { minimumInterval: 15 }).catch(() => {
  // Background work can be restricted by the OS; the app still processes the queue whenever it is opened.
});
