// Tests for keyword search: query sanitising, prefix matching, filters and grouping by topic.
// Runs against a real SQLite schema with FTS5, so the MATCH behaviour itself is verified.
import { openTestDb } from '../helpers/sqlite';
import { migrate } from '@/db/migrate';
import { applyEnrichment, createOrBumpSave, updateFetched } from '@/db/saves';
import { searchSaves, toFtsQuery } from '@/db/search';

async function freshDb() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

let nextInbox = 1;
async function addSave(db: Awaited<ReturnType<typeof freshDb>>, now: number, source: 'web' | 'x' = 'web') {
  const { id } = await createOrBumpSave(db, { inboxId: nextInbox++, url: null, canonicalUrl: null, source, sourceApp: null, sharedText: 'x', note: null, now });
  return id;
}

describe('toFtsQuery', () => {
  it('quotes each token and makes it a prefix match', () => {
    expect(toFtsQuery('open-source scan')).toBe('"open-source"* "scan"*');
  });
  it('doubles inner quotes', () => {
    expect(toFtsQuery('a"b')).toBe('"a""b"*');
  });
  it('returns null for blank input', () => {
    expect(toFtsQuery('  ')).toBeNull();
    expect(toFtsQuery('')).toBeNull();
  });
  it('drops tokens made only of punctuation', () => {
    expect(toFtsQuery('* scan')).toBe('"scan"*');
    expect(toFtsQuery('( :')).toBeNull();
  });
});

describe('searchSaves', () => {
  it.each(['"', '*', 'a:b', 'NEAR', 'AND', '('])('does not throw for %s', async (input) => {
    const db = await freshDb();
    await expect(searchSaves(db, input, {})).resolves.toBeDefined();
  });

  it('matches a prefix of a summary word and of a tag', async () => {
    const db = await freshDb();
    const bySummary = await addSave(db, 100);
    await applyEnrichment(db, bySummary, { summary: 'A port scanner in Rust', brief: 'b', topic: 'Security', tags: [] }, 100);
    const byTag = await addSave(db, 100);
    await applyEnrichment(db, byTag, { summary: 'Nothing relevant', brief: 'b', topic: 'Security', tags: ['scanner'] }, 100);
    const other = await addSave(db, 100);
    await applyEnrichment(db, other, { summary: 'Cooking pasta', brief: 'b', topic: 'Food', tags: [] }, 100);

    const groups = await searchSaves(db, 'scan', {});
    expect(groups).toHaveLength(1);
    expect(groups[0].topicName).toBe('Security');
    expect(groups[0].saves.map((save) => save.id).sort()).toEqual([bySummary, byTag].sort());
  });

  it('excludes saves older than since', async () => {
    const db = await freshDb();
    const old = await addSave(db, 100);
    const recent = await addSave(db, 500);
    for (const id of [old, recent]) await updateFetched(db, id, { title: 'scanner notes' });
    const groups = await searchSaves(db, 'scanner', { since: 300 });
    expect(groups.flatMap((group) => group.saves.map((save) => save.id))).toEqual([recent]);
  });

  it('filters by source and topic, and groups topicless saves as Unsorted', async () => {
    const db = await freshDb();
    const web = await addSave(db, 100, 'web');
    const tweet = await addSave(db, 100, 'x');
    for (const id of [web, tweet]) await updateFetched(db, id, { title: 'scanner notes' });

    const onlyX = await searchSaves(db, 'scanner', { source: 'x' });
    expect(onlyX).toEqual([expect.objectContaining({ topicId: null, topicName: 'Unsorted' })]);
    expect(onlyX[0].saves.map((save) => save.id)).toEqual([tweet]);

    await applyEnrichment(db, web, { summary: 's', brief: 'b', topic: 'Security', tags: [] }, 100);
    const topicId = (await searchSaves(db, 'scanner', {})).find((group) => group.topicName === 'Security')?.topicId;
    expect(topicId).toEqual(expect.any(Number));
    const filtered = await searchSaves(db, 'scanner', { topicId: topicId as number });
    expect(filtered.flatMap((group) => group.saves.map((save) => save.id))).toEqual([web]);
  });

  it('orders groups by their best-ranked save', async () => {
    const db = await freshDb();
    const weak = await addSave(db, 100);
    await applyEnrichment(db, weak, { summary: 'scanner ' + 'filler '.repeat(50), brief: 'b', topic: 'Weak', tags: [] }, 100);
    const strong = await addSave(db, 100);
    await applyEnrichment(db, strong, { summary: 'scanner', brief: 'b', topic: 'Strong', tags: [] }, 100);
    const groups = await searchSaves(db, 'scanner', {});
    expect(groups.map((group) => group.topicName)).toEqual(['Strong', 'Weak']);
  });
});
