// Tests for the processing pipeline: inbox ingest, fetch + AI per save, retry schedule and the queue loop.
// Uses a real SQLite schema with fake extractors, AI and thumbnails so only pipeline logic is under test.
import { openTestDb } from '../helpers/sqlite';
import { migrate } from '@/db/migrate';
import { getSave } from '@/db/saves';
import { ingestInbox } from '@/pipeline/ingest';
import { processSave, type PipelineDeps } from '@/pipeline/process';
import { runQueue } from '@/pipeline/queue';
import { nextRetryDelay } from '@/pipeline/retry';
import { ExtractError } from '@/extract/types';
import { AiError } from '@/ai/types';
import type { Extracted } from '@/core/types';

// Each test decides what the (mocked) web extractor does.
let mockExtract: () => Promise<Extracted>;
jest.mock('@/extract/index', () => ({
  extractorFor: (source: string) => (source === 'text' ? null : () => mockExtract()),
}));

const GOOD_REPLY = JSON.stringify({ summary: 'A post about trading', brief: 'Details.', topic: 'Trading', tags: ['stocks', 'risk'] });
const NOW = 1_000_000;

async function freshDb() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

async function addInbox(db: Awaited<ReturnType<typeof freshDb>>, sharedText: string, flags: { undone?: number; ingested?: number } = {}) {
  const result = await db.runAsync(
    'INSERT INTO share_inbox (shared_text, source_app, note, received_at, undone, ingested) VALUES (?, NULL, NULL, ?, ?, ?)',
    sharedText, NOW, flags.undone ?? 0, flags.ingested ?? 0,
  );
  return result.lastInsertRowId;
}

function makeDeps(db: Awaited<ReturnType<typeof freshDb>>, overrides: Partial<PipelineDeps> = {}) {
  const prompts: string[] = [];
  const deps: PipelineDeps = {
    db,
    http: (async () => new Response('')) as typeof fetch,
    ai: async () => ({
      provider: { id: 'claude-key', generateText: async (request) => { prompts.push(request.user); return GOOD_REPLY; } },
      model: 'm',
    }),
    thumbs: { download: async () => null },
    isOnline: async () => true,
    now: () => NOW,
    allowMirrors: true,
    ...overrides,
  };
  return { deps, prompts };
}

beforeEach(() => {
  mockExtract = async () => ({ title: 'Hello', text: 'Body text about stocks' });
});

describe('nextRetryDelay', () => {
  it('follows the schedule then stays at six hours', () => {
    expect([0, 1, 2, 3, 4, 5].map(nextRetryDelay)).toEqual([60e3, 300e3, 1800e3, 7200e3, 21600e3, 21600e3]);
  });
});

describe('ingestInbox', () => {
  it('creates a save with the raw url, canonical url and source', async () => {
    const db = await freshDb();
    await addInbox(db, 'look https://www.Example.com/a/?utm_x=1 nice');
    const { saveIds } = await ingestInbox(db, NOW);
    const save = await getSave(db, saveIds[0]);
    expect(save).toMatchObject({ url: 'https://www.Example.com/a/?utm_x=1', canonicalUrl: 'https://example.com/a', source: 'web', status: 'fetching' });
  });

  it('gives one save when the same inbox row is ingested twice', async () => {
    const db = await freshDb();
    const inboxId = await addInbox(db, 'https://example.com/a');
    await ingestInbox(db, NOW);
    await db.runAsync('UPDATE share_inbox SET ingested = 0 WHERE id = ?', inboxId); // as if the app died before marking it
    await ingestInbox(db, NOW);
    expect((await db.getAllAsync('SELECT id FROM saves')).length).toBe(1);
  });

  it('makes no save when the share was undone before ingestion', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a', { undone: 1 });
    await ingestInbox(db, NOW);
    expect((await db.getAllAsync('SELECT id FROM saves')).length).toBe(0);
    expect((await db.getAllAsync('SELECT id FROM share_inbox')).length).toBe(0);
  });

  it('deletes the save when the share is undone after ingestion', async () => {
    const db = await freshDb();
    const inboxId = await addInbox(db, 'https://example.com/a');
    await ingestInbox(db, NOW);
    await db.runAsync('UPDATE share_inbox SET undone = 1 WHERE id = ?', inboxId);
    await ingestInbox(db, NOW);
    expect((await db.getAllAsync('SELECT id FROM saves')).length).toBe(0);
  });

  it('stores shares without a url as text saves', async () => {
    const db = await freshDb();
    await addInbox(db, 'just a thought');
    const { saveIds } = await ingestInbox(db, NOW);
    expect(await getSave(db, saveIds[0])).toMatchObject({ url: null, canonicalUrl: null, source: 'text' });
  });
});

describe('processSave', () => {
  it('takes a shared link to done with a topic and tags', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    const { deps, prompts } = makeDeps(db);
    await processSave(saveIds[0], deps);
    const save = await getSave(db, saveIds[0]);
    expect(save).toMatchObject({ status: 'done', topicName: 'Trading', title: 'Hello', summary: 'A post about trading' });
    expect(save?.tags).toEqual(['risk', 'stocks']);
    expect(prompts[0]).toContain('Body text about stocks');
  });

  it('skips fetching for text saves and sends the shared text to the AI', async () => {
    const db = await freshDb();
    await addInbox(db, 'remember to read about index funds');
    const { saveIds } = await ingestInbox(db, NOW);
    mockExtract = async () => { throw new Error('must not fetch'); };
    const { deps, prompts } = makeDeps(db);
    await processSave(saveIds[0], deps);
    expect((await getSave(db, saveIds[0]))?.status).toBe('done');
    expect(prompts[0]).toContain('index funds');
  });

  it('retries a failed fetch on the schedule, then goes partial after three failures and still runs the AI', async () => {
    const db = await freshDb();
    await addInbox(db, 'cool article https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    mockExtract = async () => { throw new ExtractError('network', 'down'); };
    const { deps, prompts } = makeDeps(db);

    await processSave(saveIds[0], deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ status: 'fetching', statusReason: 'fetch_failed', attempts: 1, nextRetryAt: NOW + 60e3 });
    await processSave(saveIds[0], deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ attempts: 2, nextRetryAt: NOW + 300e3 });
    await processSave(saveIds[0], deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ status: 'partial', statusReason: 'fetch_failed', attempts: 3, topicName: 'Trading' });
    expect(prompts[0]).toContain('cool article');
  });

  it('goes partial immediately when the page is not found', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/gone');
    const { saveIds } = await ingestInbox(db, NOW);
    mockExtract = async () => { throw new ExtractError('not_found', '404'); };
    await processSave(saveIds[0], makeDeps(db).deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ status: 'partial', statusReason: 'fetch_failed', summary: 'A post about trading' });
  });

  it('treats a non-ExtractError thrown by the extractor as a retryable failure', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    mockExtract = async () => { throw new TypeError('boom'); };
    await processSave(saveIds[0], makeDeps(db).deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ status: 'fetching', attempts: 1, nextRetryAt: NOW + 60e3 });
  });

  it('keeps the thumbnail path when the download works', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    mockExtract = async () => ({ title: 'T', text: 'x', imageUrl: 'https://img/x.jpg' });
    const { deps } = makeDeps(db, { thumbs: { download: async (_url, id) => `/thumbs/${id}.jpg` } });
    await processSave(saveIds[0], deps);
    expect((await getSave(db, saveIds[0]))?.thumbPath).toBe(`/thumbs/${saveIds[0]}.jpg`);
  });

  it('uses resetAt as the retry time on quota_exceeded', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    const ai: PipelineDeps['ai'] = async () => ({
      provider: { id: 'claude-key', generateText: async () => { throw new AiError('quota_exceeded', 'limit', NOW + 999e3); } },
      model: 'm',
    });
    await processSave(saveIds[0], makeDeps(db, { ai }).deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ status: 'waiting_ai', statusReason: 'quota', nextRetryAt: NOW + 999e3 });
  });

  it('retries bad AI output and unknown errors as provider_error on the schedule', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    const ai: PipelineDeps['ai'] = async () => ({ provider: { id: 'claude-key', generateText: async () => 'not json' }, model: 'm' });
    await processSave(saveIds[0], makeDeps(db, { ai }).deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ status: 'waiting_ai', statusReason: 'provider_error', nextRetryAt: NOW + 60e3 });
  });

  it('waits with reason not_connected and no retry time when there is no provider', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    await processSave(saveIds[0], makeDeps(db, { ai: async () => null }).deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ status: 'waiting_ai', statusReason: 'not_connected', nextRetryAt: null, title: 'Hello' });
  });

  it('asks for a reconnect on auth_expired', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    const ai: PipelineDeps['ai'] = async () => ({ provider: { id: 'claude-key', generateText: async () => { throw new AiError('auth_expired', 'expired'); } }, model: 'm' });
    await processSave(saveIds[0], makeDeps(db, { ai }).deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ statusReason: 'auth_expired' });
  });

  it('waits one minute without counting an attempt when offline', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    await processSave(saveIds[0], makeDeps(db, { isOnline: async () => false }).deps);
    expect(await getSave(db, saveIds[0])).toMatchObject({ status: 'fetching', statusReason: 'offline', attempts: 0, nextRetryAt: NOW + 60e3 });
  });
});

describe('runQueue', () => {
  it('ingests, processes and finishes shares', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const result = await runQueue(makeDeps(db).deps, { maxMs: 10_000 });
    expect(result.processed).toBe(1);
    expect((await db.getAllAsync<{ status: string }>('SELECT status FROM saves'))[0].status).toBe('done');
  });

  it('picks up a fetching save whose lease expired', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const { saveIds } = await ingestInbox(db, NOW);
    await db.runAsync('UPDATE saves SET lease_until = ? WHERE id = ?', NOW - 1, saveIds[0]);
    await runQueue(makeDeps(db).deps, { maxMs: 10_000 });
    expect((await getSave(db, saveIds[0]))?.status).toBe('done');
  });

  it('does not loop forever on a save that stays waiting without a retry time', async () => {
    const db = await freshDb();
    await addInbox(db, 'https://example.com/a');
    const result = await runQueue(makeDeps(db, { ai: async () => null }).deps, { maxMs: 10_000 });
    expect(result.processed).toBe(1);
    const row = await db.getFirstAsync<{ lease_until: number | null }>('SELECT lease_until FROM saves');
    expect(row?.lease_until).toBeNull();
  });

  it('returns the same promise for concurrent calls', async () => {
    const db = await freshDb();
    const { deps } = makeDeps(db);
    const first = runQueue(deps, { maxMs: 1000 });
    const second = runQueue(deps, { maxMs: 1000 });
    expect(second).toBe(first);
    await first;
  });
});
