// Runs the whole pipeline once: ingest new shares, then work through every save that is due.
// Called from the app foreground, the share activity and the background task; at most one run at a time.
import { claimDue, rearmWaitingAi } from '@/db/saves';
import { ingestInbox } from './ingest';
import { processSave, type PipelineDeps } from './process';

const LEASE_MS = 2 * 60 * 1000;
const BATCH_SIZE = 5;

// Module-level on purpose: two callers in the same JS runtime share one run instead of racing.
let activeRun: Promise<{ processed: number }> | null = null;

export function runQueue(deps: PipelineDeps, options: { maxMs: number }): Promise<{ processed: number }> {
  if (activeRun !== null) return activeRun;
  activeRun = runOnce(deps, options.maxMs).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function runOnce(deps: PipelineDeps, maxMs: number): Promise<{ processed: number }> {
  const startedAt = deps.now();
  const outOfTime = () => deps.now() - startedAt >= maxMs;
  await ingestInbox(deps.db, startedAt);

  // Saves waiting on "not connected" are skipped by claimDue; once a provider exists they may run again.
  if ((await deps.ai()) !== null) await rearmWaitingAi(deps.db, ['not_connected']);

  let processed = 0;
  while (!outOfTime()) {
    const claimed = await claimDue(deps.db, deps.now(), LEASE_MS, BATCH_SIZE);
    if (claimed.length === 0) break;
    for (const id of claimed) {
      if (outOfTime()) {
        await deps.db.runAsync('UPDATE saves SET lease_until = NULL WHERE id = ?', id);
        continue;
      }
      processed += 1;
      try {
        await processSave(id, deps);
      } catch {
        // The lease expires on its own and the save is retried; one bad save must not stop the rest.
      }
    }
    // A share, note or undo that arrived during this batch started a run that joined this one (see runQueue),
    // so pick it up now instead of leaving it for the next run.
    await ingestInbox(deps.db, deps.now());
  }
  return { processed };
}
