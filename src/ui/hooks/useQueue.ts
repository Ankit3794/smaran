// State for the Timeline's queue banner: how many saves are waiting and why, plus the "Retry now" action.
// Also kicks off a queue run when the Timeline opens and whenever the app returns to the foreground,
// so shares made while the app was closed get processed.
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { StatusReason } from '@/core/types';
import { useDb } from '@/db/DbProvider';
import { queueSummary, retryNow } from '@/db/saves';
import { getSetting } from '@/db/settings';
import { runQueueNow } from '@/pipeline/runNow';
import { useReloadOnChange } from './useReloadOnChange';

export interface QueueState {
  waiting: number;
  reason: StatusReason;
  nextRetryAt: number | null;
  providerId: string;
}

export function useQueue() {
  const db = useDb();
  const [queue, setQueue] = useState<QueueState>({ waiting: 0, reason: null, nextRetryAt: null, providerId: '' });

  const reload = useCallback(() => {
    Promise.all([queueSummary(db), getSetting(db, 'activeProvider', '')]).then(
      ([summary, providerId]) => setQueue({ ...summary, providerId }),
      () => {},
    );
  }, [db]);

  useEffect(reload, [reload]);
  useReloadOnChange(reload, ['saves']);

  useEffect(() => {
    // Fire and forget: the run records every failure on the save itself, and the banner shows it.
    const startRun = () => void runQueueNow(db).catch(() => {});
    startRun();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') startRun();
    });
    return () => subscription.remove();
  }, [db]);

  const retry = useCallback(async () => {
    await retryNow(db);
    await runQueueNow(db).catch(() => {});
    reload();
  }, [db, reload]);

  return { queue, retry };
}
