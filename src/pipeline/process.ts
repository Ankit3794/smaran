// Takes one save from "just shared" to "summarised and filed": fetch the page, download the thumbnail, ask the AI.
// Every failure is written to the save as a status plus a retry time, so nothing is ever dropped; runQueue calls this.
import { enrich } from '@/ai/enrichment';
import { AiError, type AiProvider } from '@/ai/types';
import type { Http, Save, SaveStatus, StatusReason } from '@/core/types';
import { detectSource, isShortLink, normalizeUrl } from '@/core/url';
import type { Db } from '@/db/db';
import { applyEnrichment, getSave, setStatus, updateFetched } from '@/db/saves';
import { listTopics, topTagsOverall } from '@/db/topics';
import { extractorFor } from '@/extract/index';
import { resolveShortLink } from '@/extract/http';
import { ExtractError } from '@/extract/types';
import { nextRetryDelay } from './retry';

export interface PipelineDeps {
  db: Db;
  http: Http;
  ai: () => Promise<{ provider: AiProvider; model: string } | null>;
  thumbs: { download(url: string, saveId: number): Promise<string | null> };
  isOnline: () => Promise<boolean>;
  now: () => number;
  allowMirrors: boolean;
}

const MAX_FETCH_ATTEMPTS = 3;
const OFFLINE_RETRY_MS = 60e3;
const MAX_TAGS_FOR_AI = 50;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function processSave(id: number, deps: PipelineDeps): Promise<void> {
  const save = await getSave(deps.db, id);
  if (save === null || save.status === 'done') return;
  if (save.status === 'partial' && save.summary !== null) return;

  // Without a network both steps would fail; waiting costs nothing and does not count as a failed attempt.
  if (!(await deps.isOnline())) {
    await setStatus(deps.db, id, save.status, 'offline', null, deps.now() + OFFLINE_RETRY_MS, 0);
    return;
  }

  let isPartial = save.status === 'partial';
  if (save.status === 'fetching') {
    const outcome = await fetchStep(save, deps);
    if (outcome === 'retry_later') return;
    isPartial = outcome === 'partial';
  }
  await aiStep(id, isPartial, deps);
}

// Fetches the page for a link save. 'ok' and 'partial' continue to the AI step; 'retry_later' stops here.
async function fetchStep(save: Save, deps: PipelineDeps): Promise<'ok' | 'partial' | 'retry_later'> {
  if (save.url === null) return 'ok'; // a text note has nothing to fetch

  try {
    let fetchUrl = save.url;
    if (isShortLink(save.url)) {
      fetchUrl = await resolveShortLink(deps.http, save.url);
      await adoptResolvedUrl(deps.db, save, fetchUrl);
    }
    const extractor = extractorFor(detectSource(fetchUrl));
    if (extractor === null) return 'ok';

    const extracted = await extractor(fetchUrl, { http: deps.http, allowMirrors: deps.allowMirrors });
    // A broken thumbnail must not fail the save, so any error here just means "no thumbnail".
    const thumbPath = extracted.imageUrl ? await deps.thumbs.download(extracted.imageUrl, save.id).catch(() => null) : null;
    await updateFetched(deps.db, save.id, { ...extracted, thumbPath });
    await setStatus(deps.db, save.id, 'waiting_ai', null, null, null, 0);
    return 'ok';
  } catch (error) {
    // A missing page will not come back, so retrying is pointless. Anything else (network, blocked, bugs) is retried.
    if (error instanceof ExtractError && error.kind === 'not_found') {
      await setStatus(deps.db, save.id, 'partial', 'fetch_failed', error.message, null, 1);
      return 'partial';
    }
    const failedAttempts = save.attempts + 1;
    if (failedAttempts >= MAX_FETCH_ATTEMPTS) {
      await setStatus(deps.db, save.id, 'partial', 'fetch_failed', describeError(error), null, 1);
      return 'partial';
    }
    // The delay is looked up with the attempts made before this failure, so the first retry waits one minute.
    await setStatus(deps.db, save.id, 'fetching', 'fetch_failed', describeError(error), deps.now() + nextRetryDelay(save.attempts), 1);
    return 'retry_later';
  }
}

// After a short link is expanded, the save is re-keyed to the real page's canonical URL and source,
// unless another save already owns that URL; saves are never merged here.
async function adoptResolvedUrl(db: Db, save: Save, resolvedUrl: string): Promise<void> {
  const canonicalUrl = normalizeUrl(resolvedUrl);
  if (canonicalUrl === save.canonicalUrl) return;
  const owner = await db.getFirstAsync<{ id: number }>('SELECT id FROM saves WHERE canonical_url = ? AND id != ?', canonicalUrl, save.id);
  if (owner !== null) return;
  await db.runAsync('UPDATE saves SET canonical_url = ?, source = ? WHERE id = ?', canonicalUrl, detectSource(resolvedUrl), save.id);
}

// Asks the AI for summary, topic and tags. `isPartial` saves keep their partial status (and fetch_failed reason) once enriched.
async function aiStep(id: number, isPartial: boolean, deps: PipelineDeps): Promise<void> {
  const save = await getSave(deps.db, id);
  if (save === null) return;
  const waitingStatus: SaveStatus = isPartial ? 'partial' : 'waiting_ai';
  const now = deps.now();
  const waitWith = (reason: StatusReason, detail: string | null, retryAt: number | null, attemptsDelta: number) =>
    setStatus(deps.db, id, waitingStatus, reason, detail, retryAt, attemptsDelta);

  try {
    const active = await deps.ai();
    if (active === null) {
      // No retry time: the save is picked up as soon as a provider is connected.
      await waitWith('not_connected', null, null, 0);
      return;
    }
    const topics = (await listTopics(deps.db, now)).map((topic) => ({ name: topic.name, count: topic.count }));
    const tags = await topTagsOverall(deps.db, MAX_TAGS_FOR_AI);
    const text = save.extractedText ?? [save.title, save.sharedText].filter((part) => part).join('\n');
    const enrichment = await enrich(active.provider, active.model, {
      source: save.source,
      author: save.author ?? undefined,
      title: save.title ?? undefined,
      text,
      note: save.note ?? undefined,
      topics,
      tags,
    });
    await applyEnrichment(deps.db, id, enrichment, now);
    if (isPartial) await setStatus(deps.db, id, 'partial', 'fetch_failed', null, null, 0);
  } catch (error) {
    const detail = describeError(error);
    const scheduledRetry = now + nextRetryDelay(save.attempts);
    if (error instanceof AiError && error.kind === 'not_connected') {
      await waitWith('not_connected', null, null, 0);
    } else if (error instanceof AiError && error.kind === 'auth_expired') {
      // Retrying cannot help until the user signs in again.
      await waitWith('auth_expired', detail, null, 0);
    } else if (error instanceof AiError && (error.kind === 'quota_exceeded' || error.kind === 'rate_limited')) {
      await waitWith('quota', detail, error.resetAt ?? scheduledRetry, error.resetAt === undefined ? 1 : 0);
    } else {
      // bad_output, network, provider_error and anything unexpected all follow the normal retry schedule.
      await waitWith('provider_error', detail, scheduledRetry, 1);
    }
  }
}
