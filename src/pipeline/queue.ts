// Runs the whole pipeline once: ingest new shares, then work through every save that is due.
// Called from the app foreground, the share activity and the background task; at most one run at a time.
import { claimDue } from '@/db/saves';
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

  // A save that ends a step with no retry time (e.g. not_connected) is immediately due again,
  // so remember what this run already handled or the loop would never end.
  const handled = new Set<number>();
  while (!outOfTime()) {
    const claimed = await claimDue(deps.db, deps.now(), LEASE_MS, BATCH_SIZE);
    const fresh = claimed.filter((id) => !handled.has(id));
    for (const id of claimed.filter((claimedId) => handled.has(claimedId))) {
      await deps.db.runAsync('UPDATE saves SET lease_until = NULL WHERE id = ?', id);
    }
    if (fresh.length === 0) break;
    for (const id of fresh) {
      if (outOfTime()) {
        await deps.db.runAsync('UPDATE saves SET lease_until = NULL WHERE id = ?', id);
        continue;
      }
      handled.add(id);
      try {
        await processSave(id, deps);
      } catch {
        // The lease expires on its own and the save is retried; one bad save must not stop the rest.
      }
    }
  }
  return { processed: handled.size };
}
