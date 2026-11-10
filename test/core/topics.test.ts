// Tests for the topics repository: case-insensitive resolving, aliases after a merge,
// palette order and the per-day counts shown on the Topics screen.
import { openTestDb } from '../helpers/sqlite';
import { migrate } from '@/db/migrate';
import { listTopics, mergeTopics, resolveTopic, topTags, unsortedSummary } from '@/db/topics';
import { createOrBumpSave, setTags } from '@/db/saves';
import { getSetting, setSetting } from '@/db/settings';

async function freshDb() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

describe('topics', () => {
  it('resolves names case-insensitively to the same topic', async () => {
    const db = await freshDb();
    const first = await resolveTopic(db, 'Trading', 1);
    expect(await resolveTopic(db, 'trading', 2)).toBe(first);
  });

  it('assigns palette colours in creation order', async () => {
    const db = await freshDb();
    await resolveTopic(db, 'Trading', 1);
    await resolveTopic(db, 'Markets', 2);
    const topics = await listTopics(db, 3);
    expect(topics.map((topic) => topic.color).sort()).toEqual(['#2F7D5B', '#B4443A'].sort());
    expect(topics.find((topic) => topic.name === 'Trading')?.color).toBe('#2F7D5B');
    expect(topics.find((topic) => topic.name === 'Markets')?.color).toBe('#B4443A');
  });

  it('keeps resolving a merged topic name to the surviving topic', async () => {
    const db = await freshDb();
    const trading = await resolveTopic(db, 'Trading', 1);
    const markets = await resolveTopic(db, 'Markets', 2);
    await mergeTopics(db, markets, trading);
    expect(await resolveTopic(db, 'markets', 3)).toBe(trading);
    expect((await listTopics(db, 3)).map((topic) => topic.name)).toEqual(['Trading']);
  });

  it('moves saves into the surviving topic on merge', async () => {
    const db = await freshDb();
    const trading = await resolveTopic(db, 'Trading', 1);
    const markets = await resolveTopic(db, 'Markets', 2);
    const { id } = await createOrBumpSave(db, { inboxId: 1, url: null, canonicalUrl: null, source: 'text', sourceApp: null, sharedText: 'x', note: null, now: 5 });
    await db.runAsync('UPDATE saves SET topic_id = ? WHERE id = ?', markets, id);
    await mergeTopics(db, markets, trading);
    const [topic] = await listTopics(db, 6);
    expect(topic.count).toBe(1);
  });

  it('gives last7 as seven counts, oldest to newest, with today last', async () => {
    const db = await freshDb();
    const day = 24 * 60 * 60 * 1000;
    const now = new Date(2026, 5, 15, 12, 0, 0).getTime();
    const topicId = await resolveTopic(db, 'Trading', now);
    const timestamps = [now, now - 2 * day, now - 2 * day, now - 20 * day];
    for (const [index, createdAt] of timestamps.entries()) {
      await createOrBumpSave(db, { inboxId: index + 1, url: null, canonicalUrl: null, source: 'text', sourceApp: null, sharedText: 'x', note: null, now: createdAt });
    }
    await db.runAsync('UPDATE saves SET topic_id = ?', topicId);
    const [topic] = await listTopics(db, now);
    expect(topic.last7).toEqual([0, 0, 0, 0, 2, 0, 1]);
    expect(topic.count).toBe(4);
    expect(topic.newThisWeek).toBe(3);
  });
});

describe('topic detail data', () => {
  const input = { inboxId: 1, url: null, canonicalUrl: null, source: 'text' as const, sourceApp: null, sharedText: 'x', note: null };

  it('reports the time of the latest save in each topic', async () => {
    const db = await freshDb();
    const topicId = await resolveTopic(db, 'Trading', 1);
    await resolveTopic(db, 'Empty', 1);
    for (const [index, now] of [100, 300, 200].entries()) {
      const { id } = await createOrBumpSave(db, { ...input, inboxId: index + 1, now });
      await db.runAsync('UPDATE saves SET topic_id = ? WHERE id = ?', topicId, id);
    }
    const topics = await listTopics(db, 400);
    expect(topics.find((topic) => topic.name === 'Trading')?.lastSavedAt).toBe(300);
    expect(topics.find((topic) => topic.name === 'Empty')?.lastSavedAt).toBeNull();
  });

  it('counts saves without a topic and finds the latest one', async () => {
    const db = await freshDb();
    expect(await unsortedSummary(db)).toEqual({ count: 0, lastSavedAt: null });
    await createOrBumpSave(db, { ...input, inboxId: 1, now: 100 });
    await createOrBumpSave(db, { ...input, inboxId: 2, now: 200 });
    expect(await unsortedSummary(db)).toEqual({ count: 2, lastSavedAt: 200 });
  });

  it('returns the most used tags of a topic with their counts', async () => {
    const db = await freshDb();
    const topicId = await resolveTopic(db, 'Trading', 1);
    const tagSets = [['options', 'risk'], ['options'], ['crypto', 'options']];
    for (const [index, tags] of tagSets.entries()) {
      const { id } = await createOrBumpSave(db, { ...input, inboxId: index + 1, now: index + 1 });
      await db.runAsync('UPDATE saves SET topic_id = ? WHERE id = ?', topicId, id);
      await setTags(db, id, tags);
    }
    expect(await topTags(db, topicId, 2)).toEqual([{ name: 'options', count: 3 }, { name: 'crypto', count: 1 }]);
  });
});

describe('settings', () => {
  it('returns the fallback until a value is set', async () => {
    const db = await freshDb();
    expect(await getSetting(db, 'allowMirrors', 'true')).toBe('true');
    await setSetting(db, 'allowMirrors', 'false');
    await setSetting(db, 'allowMirrors', 'false');
    expect(await getSetting(db, 'allowMirrors', 'true')).toBe('false');
  });
});
