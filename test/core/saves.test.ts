// Tests for the saves repository: dedupe on share, enrichment, the retry queue and the timeline.
// Runs against a real SQLite schema so the SQL itself is verified.
import { openTestDb } from '../helpers/sqlite';
import { migrate } from '@/db/migrate';
import {
  applyEnrichment, claimDue, createOrBumpSave, deleteSave, getSave, listTimeline,
  queueSummary, retrySave, setStatus, setTags, updateFetched,
} from '@/db/saves';

async function freshDb() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

const webInput = { inboxId: 1, url: 'https://Example.com/a?utm=1', canonicalUrl: 'https://example.com/a', source: 'web' as const, sourceApp: null, sharedText: 'https://Example.com/a?utm=1', note: null, now: 100 };

describe('createOrBumpSave', () => {
  it('stores a new save as fetching with the raw and canonical url', async () => {
    const db = await freshDb();
    const { id, duplicate } = await createOrBumpSave(db, webInput);
    expect(duplicate).toBe(false);
    const save = await getSave(db, id);
    expect(save).toMatchObject({ url: 'https://Example.com/a?utm=1', canonicalUrl: 'https://example.com/a', status: 'fetching', attempts: 0, createdAt: 100, lastSavedAt: 100 });
  });

  it('moves a re-shared canonical url to today without duplicating', async () => {
    const db = await freshDb();
    const first = await createOrBumpSave(db, webInput);
    const second = await createOrBumpSave(db, { ...webInput, inboxId: 2, now: 500 });
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect((await getSave(db, first.id))?.lastSavedAt).toBe(500);
    expect((await getSave(db, first.id))?.createdAt).toBe(100);
  });

  it('keeps one row when the same inbox row is ingested twice', async () => {
    const db = await freshDb();
    const first = await createOrBumpSave(db, { ...webInput, url: null, canonicalUrl: null });
    const second = await createOrBumpSave(db, { ...webInput, url: null, canonicalUrl: null, now: 900 });
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect((await getSave(db, first.id))?.lastSavedAt).toBe(100);
  });

  it('never dedupes text saves from different inbox rows', async () => {
    const db = await freshDb();
    const a = await createOrBumpSave(db, { ...webInput, inboxId: 1, url: null, canonicalUrl: null, source: 'text' });
    const b = await createOrBumpSave(db, { ...webInput, inboxId: 2, url: null, canonicalUrl: null, source: 'text' });
    expect(b.id).not.toBe(a.id);
  });
});

describe('enrichment', () => {
  it('stores fetched content, then topic, tags and done status', async () => {
    const db = await freshDb();
    const { id } = await createOrBumpSave(db, webInput);
    await updateFetched(db, id, { title: 'T', author: 'A', text: 'body', imageUrl: 'https://i/x.png', extra: { likes: 3 }, thumbPath: '/t.jpg' });
    await applyEnrichment(db, id, { summary: 's', brief: 'b', topic: 'Trading', tags: ['stocks', 'Risk'] }, 200);
    const save = await getSave(db, id);
    expect(save).toMatchObject({ title: 'T', author: 'A', extractedText: 'body', thumbPath: '/t.jpg', summary: 's', brief: 'b', topicName: 'Trading', topicColor: '#2F7D5B', status: 'done', statusReason: null, nextRetryAt: null, extra: { likes: 3 } });
    expect(save?.tags).toEqual(['risk', 'stocks']);
  });

  it('replaces tags with setTags', async () => {
    const db = await freshDb();
    const { id } = await createOrBumpSave(db, webInput);
    await setTags(db, id, ['a', 'b']);
    await setTags(db, id, ['b', 'c']);
    expect((await getSave(db, id))?.tags).toEqual(['b', 'c']);
  });
});

describe('claimDue', () => {
  it('never returns a save whose lease is in the future', async () => {
    const db = await freshDb();
    const { id } = await createOrBumpSave(db, webInput);
    expect(await claimDue(db, 1000, 60_000, 10)).toEqual([id]);
    expect(await claimDue(db, 2000, 60_000, 10)).toEqual([]);
    expect(await claimDue(db, 61_001, 60_000, 10)).toEqual([id]);
  });

  it('skips saves waiting for a retry time, done saves and enriched partial saves', async () => {
    const db = await freshDb();
    const waiting = await createOrBumpSave(db, { ...webInput, inboxId: 1, canonicalUrl: 'u1' });
    const done = await createOrBumpSave(db, { ...webInput, inboxId: 2, canonicalUrl: 'u2' });
    const partialEnriched = await createOrBumpSave(db, { ...webInput, inboxId: 3, canonicalUrl: 'u3' });
    const partialBare = await createOrBumpSave(db, { ...webInput, inboxId: 4, canonicalUrl: 'u4' });
    await setStatus(db, waiting.id, 'waiting_ai', 'offline', null, 5000, 1);
    await applyEnrichment(db, done.id, { summary: 's', brief: 'b', topic: 'X', tags: [] }, 1);
    await db.runAsync("UPDATE saves SET status = 'partial', summary = 's' WHERE id = ?", partialEnriched.id);
    await setStatus(db, partialBare.id, 'partial', 'fetch_failed', null, null, 0);
    expect(await claimDue(db, 1000, 10, 10)).toEqual([partialBare.id]);
    expect(await claimDue(db, 6000, 10, 10)).toEqual([waiting.id, partialBare.id]);
  });

  it('hands each save to only one of two overlapping callers', async () => {
    const db = await freshDb();
    for (const inboxId of [1, 2, 3]) await createOrBumpSave(db, { ...webInput, inboxId, canonicalUrl: `u${inboxId}`, now: inboxId });
    const [first, second] = await Promise.all([claimDue(db, 1000, 60_000, 10), claimDue(db, 1000, 60_000, 10)]);
    const all = [...first, ...second];
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual([1, 2, 3]);
  });

  it('respects the limit and orders by last saved', async () => {
    const db = await freshDb();
    const older = await createOrBumpSave(db, { ...webInput, inboxId: 1, canonicalUrl: 'u1', now: 10 });
    await createOrBumpSave(db, { ...webInput, inboxId: 2, canonicalUrl: 'u2', now: 20 });
    expect(await claimDue(db, 1000, 10, 1)).toEqual([older.id]);
  });
});

describe('queueSummary', () => {
  it('counts unfinished saves with the most common reason and earliest retry', async () => {
    const db = await freshDb();
    const a = await createOrBumpSave(db, { ...webInput, inboxId: 1, canonicalUrl: 'u1' });
    const b = await createOrBumpSave(db, { ...webInput, inboxId: 2, canonicalUrl: 'u2' });
    const c = await createOrBumpSave(db, { ...webInput, inboxId: 3, canonicalUrl: 'u3' });
    await createOrBumpSave(db, { ...webInput, inboxId: 4, canonicalUrl: 'u4' });
    await setStatus(db, a.id, 'waiting_ai', 'quota', null, 9000, 1);
    await setStatus(db, b.id, 'waiting_ai', 'quota', null, 7000, 1);
    await setStatus(db, c.id, 'waiting_ai', 'offline', null, 8000, 1);
    expect(await queueSummary(db)).toEqual({ waiting: 4, reason: 'quota', nextRetryAt: 7000 });
  });

  it('reports an empty queue', async () => {
    const db = await freshDb();
    expect(await queueSummary(db)).toEqual({ waiting: 0, reason: null, nextRetryAt: null });
  });
});

describe('timeline and deletion', () => {
  it('lists newest first, filters by tag and pages with before', async () => {
    const db = await freshDb();
    const a = await createOrBumpSave(db, { ...webInput, inboxId: 1, canonicalUrl: 'u1', now: 10 });
    const b = await createOrBumpSave(db, { ...webInput, inboxId: 2, canonicalUrl: 'u2', now: 20 });
    await createOrBumpSave(db, { ...webInput, inboxId: 3, canonicalUrl: 'u3', now: 30 });
    await setTags(db, a.id, ['keep']);
    await setTags(db, b.id, ['keep']);
    expect((await listTimeline(db, { limit: 10 })).map((save) => save.lastSavedAt)).toEqual([30, 20, 10]);
    expect((await listTimeline(db, { limit: 10, tag: 'keep' })).map((save) => save.id)).toEqual([b.id, a.id]);
    expect((await listTimeline(db, { limit: 1, before: 20 })).map((save) => save.id)).toEqual([a.id]);
  });

  it('deletes a save and its tag links', async () => {
    const db = await freshDb();
    const { id } = await createOrBumpSave(db, webInput);
    await setTags(db, id, ['a']);
    await deleteSave(db, id);
    expect(await getSave(db, id)).toBeNull();
    expect(await db.getAllAsync('SELECT * FROM save_tags')).toEqual([]);
  });
});

describe('retrySave', () => {
  it('makes one save due now and resets its attempts, leaving others alone', async () => {
    const db = await freshDb();
    const a = await createOrBumpSave(db, { ...webInput, inboxId: 1, canonicalUrl: 'u1' });
    const b = await createOrBumpSave(db, { ...webInput, inboxId: 2, canonicalUrl: 'u2' });
    await setStatus(db, a.id, 'waiting_ai', 'quota', null, 9_999, 3);
    await setStatus(db, b.id, 'waiting_ai', 'quota', null, 9_999, 2);
    await retrySave(db, a.id);
    expect(await getSave(db, a.id)).toMatchObject({ nextRetryAt: null, attempts: 0 });
    expect(await getSave(db, b.id)).toMatchObject({ nextRetryAt: 9_999, attempts: 2 });
  });
});
