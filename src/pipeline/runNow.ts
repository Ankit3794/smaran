// Runs the save queue once with the real network, AI provider and file storage.
// The Timeline calls this on open and on "Retry now"; the background task reuses it.
import { getNetworkStateAsync } from 'expo-network';
import { getActiveProvider } from '@/ai/registry';
import type { Db } from '@/db/db';
import { getSetting } from '@/db/settings';
import { downloadThumb } from './thumbs';
import { runQueue } from './queue';

// Stay well inside Android's time limits for background work.
const MAX_RUN_MS = 25_000;

async function isOnline(): Promise<boolean> {
  const state = await getNetworkStateAsync();
  // isInternetReachable can be undefined right after launch; fall back to "is there a connection at all".
  return state.isInternetReachable ?? state.isConnected ?? false;
}

export async function runQueueNow(db: Db): Promise<{ processed: number }> {
  // Stored as '1' / '0'; on by default so X posts work out of the box.
  const allowMirrors = (await getSetting(db, 'allowMirrors', '1')) !== '0';
  return runQueue(
    {
      db,
      http: fetch,
      ai: () => getActiveProvider(db, fetch),
      thumbs: { download: downloadThumb },
      isOnline,
      now: Date.now,
      allowMirrors,
    },
    { maxMs: MAX_RUN_MS },
  );
}
