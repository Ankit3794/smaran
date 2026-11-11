// The numbers behind the Insights screen: saves and storage per platform, saves per week, and a few totals.
// Plain read-only queries; "this week" means the last 7 days, so there are no calendar or time-zone rules.
import type { Source } from '@/core/types';
import type { Db } from './db';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Every text column we store for a save. Bytes, not characters: CAST AS BLOB measures the UTF-8 size.
const TEXT_COLUMNS = ['url', 'shared_text', 'title', 'author', 'extracted_text', 'summary', 'brief', 'note'];
const TEXT_BYTES = TEXT_COLUMNS.map((column) => `LENGTH(CAST(COALESCE(${column}, '') AS BLOB))`).join(' + ');

export interface SourceStats {
  source: Source;
  count: number;
  opened: number;
  textBytes: number;
  // Thumbnails are files named after the save id; the screen adds up their sizes.
  saveIds: number[];
}

export async function sourceBreakdown(db: Db): Promise<SourceStats[]> {
  const rows = await db.getAllAsync<{ source: Source; count: number; opened: number; textBytes: number; ids: string }>(
    `SELECT source, COUNT(*) AS count, COUNT(opened_at) AS opened, SUM(${TEXT_BYTES}) AS textBytes, GROUP_CONCAT(id) AS ids
     FROM saves GROUP BY source ORDER BY COUNT(*) DESC, source`,
  );
  return rows.map(({ ids, ...row }) => ({ ...row, saveIds: ids.split(',').map(Number) }));
}

// How many saves were made in each of the last `weeks` 7-day windows, oldest window first.
export async function weeklyCounts(db: Db, now: number, weeks: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ createdAt: number }>(
    'SELECT created_at AS createdAt FROM saves WHERE created_at > ? AND created_at <= ?',
    now - weeks * WEEK_MS, now,
  );
  const counts = new Array<number>(weeks).fill(0);
  for (const { createdAt } of rows) {
    const weeksAgo = Math.floor((now - createdAt) / WEEK_MS);
    counts[weeks - 1 - weeksAgo] += 1;
  }
  return counts;
}

export async function libraryTotals(db: Db, now: number): Promise<{ total: number; thisWeek: number; lastWeek: number; opened: number }> {
  const row = await db.getFirstAsync<{ total: number; thisWeek: number | null; lastWeek: number | null; opened: number }>(
    `SELECT COUNT(*) AS total,
            SUM(created_at > ?) AS thisWeek,
            SUM(created_at > ? AND created_at <= ?) AS lastWeek,
            COUNT(opened_at) AS opened
     FROM saves`,
    now - WEEK_MS, now - 2 * WEEK_MS, now - WEEK_MS,
  );
  // SUM over no rows is NULL.
  return { total: row?.total ?? 0, thisWeek: row?.thisWeek ?? 0, lastWeek: row?.lastWeek ?? 0, opened: row?.opened ?? 0 };
}
