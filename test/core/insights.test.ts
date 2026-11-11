// Tests the numbers behind the Insights screen (per-platform counts and storage, weekly saves, totals),
// against a real SQLite schema.
import { openTestDb } from '../helpers/sqlite';
import type { Source } from '@/core/types';
import { libraryTotals, sourceBreakdown, weeklyCounts } from '@/db/insights';
import { migrate } from '@/db/migrate';
import { createOrBumpSave, markOpened } from '@/db/saves';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY_MS;

async function freshDb() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

let nextInbox = 1;
async function addSave(db: Awaited<ReturnType<typeof freshDb>>, source: Source, createdAt: number, sharedText = 'x') {
  const { id } = await createOrBumpSave(db, { inboxId: nextInbox++, url: null, canonicalUrl: null, source, sourceApp: null, sharedText, note: null, now: createdAt });
  return id;
}

describe('sourceBreakdown', () => {
  it('counts saves and opened saves per platform, biggest first', async () => {
    const db = await freshDb();
    const opened = await addSave(db, 'youtube', NOW);
    await addSave(db, 'youtube', NOW);
    await addSave(db, 'x', NOW);
    await addSave(db, 'youtube', NOW);
    await markOpened(db, opened, NOW);
    const rows = await sourceBreakdown(db);
    expect(rows.map(({ source, count, opened }) => ({ source, count, opened }))).toEqual([
      { source: 'youtube', count: 3, opened: 1 },
      { source: 'x', count: 1, opened: 0 },
    ]);
  });

  it('measures stored text in bytes, not characters', async () => {
    const db = await freshDb();
    await addSave(db, 'web', NOW, 'héllo'); // "é" is two bytes in UTF-8
    const [row] = await sourceBreakdown(db);
    expect(row.textBytes).toBe(6);
  });

  it('lists each platform\'s save ids, so the screen can add up thumbnail files', async () => {
    const db = await freshDb();
    const a = await addSave(db, 'x', NOW);
    const b = await addSave(db, 'x', NOW);
    const [row] = await sourceBreakdown(db);
    expect(row.saveIds.sort()).toEqual([a, b].sort());
  });
});

describe('weeklyCounts', () => {
  it('counts saves in 7-day windows ending now, oldest window first; older saves are left out', async () => {
    const db = await freshDb();
    await addSave(db, 'x', NOW - 1000); // this week
    await addSave(db, 'x', NOW - 6 * DAY_MS); // this week
    await addSave(db, 'x', NOW - 8 * DAY_MS); // last week
    await addSave(db, 'x', NOW - 22 * DAY_MS); // 4 weeks ago
    await addSave(db, 'x', NOW - 40 * DAY_MS); // outside 4 weeks
    expect(await weeklyCounts(db, NOW, 4)).toEqual([1, 0, 1, 2]);
  });
});

describe('libraryTotals', () => {
  it('gives the total, this week vs the week before, and how many were opened', async () => {
    const db = await freshDb();
    const opened = await addSave(db, 'x', NOW - 1000);
    await addSave(db, 'x', NOW - 2 * DAY_MS);
    await addSave(db, 'x', NOW - 9 * DAY_MS);
    await addSave(db, 'x', NOW - 30 * DAY_MS);
    await markOpened(db, opened, NOW);
    expect(await libraryTotals(db, NOW)).toEqual({ total: 4, thisWeek: 2, lastWeek: 1, opened: 1 });
  });
});
