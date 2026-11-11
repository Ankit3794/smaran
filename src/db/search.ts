// Keyword search over saves using the FTS5 index (saves_fts), which the triggers keep in sync, plus the pieces of the
// Search tab's browse view (recent searches, popular tags). Called by the search screen; results come grouped by topic.
import type { Db } from './db';
import { getSetting, setSetting } from './settings';
import type { Save, Source } from '@/core/types';
import { SELECT_SAVE, toSaves, type SaveRow } from './saves';

// Turns what the user typed into a safe FTS5 query. Every word becomes a quoted phrase (so operators like
// AND, NEAR, : and ( are plain text) with a trailing * so partial words match ("scan" finds "scanner").
// Returns null when nothing searchable is left.
export function toFtsQuery(input: string): string | null {
  const phrases = input
    .split(/\s+/)
    // A token with no letters or digits (e.g. "*" or "(") tokenizes to nothing, which FTS5 can reject.
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .map((token) => `"${token.replaceAll('"', '""')}"*`);
  return phrases.length > 0 ? phrases.join(' ') : null;
}

export interface SearchGroup {
  topicId: number | null;
  topicName: string;
  saves: Save[];
}

// Browsing by filter alone (a source tile, "7 days") lists at most this many saves, newest first.
const BROWSE_LIMIT = 200;

export async function searchSaves(
  db: Db,
  q: string,
  filter: { since?: number; source?: Source; topicId?: number },
): Promise<SearchGroup[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (filter.since !== undefined) {
    conditions.push('s.last_saved_at >= ?');
    params.push(filter.since);
  }
  if (filter.source !== undefined) {
    conditions.push('s.source = ?');
    params.push(filter.source);
  }
  if (filter.topicId !== undefined) {
    conditions.push('s.topic_id = ?');
    params.push(filter.topicId);
  }

  const ftsQuery = toFtsQuery(q);
  let rows: SaveRow[];
  if (ftsQuery !== null) {
    // bm25() is lower for better matches, so ascending order puts the best match first.
    rows = await db.getAllAsync<SaveRow>(
      `${SELECT_SAVE} JOIN saves_fts ON saves_fts.rowid = s.id
       WHERE ${['saves_fts MATCH ?', ...conditions].join(' AND ')} ORDER BY bm25(saves_fts), s.id`,
      [ftsQuery, ...params],
    );
  } else if (conditions.length > 0) {
    rows = await db.getAllAsync<SaveRow>(
      `${SELECT_SAVE} WHERE ${conditions.join(' AND ')} ORDER BY s.last_saved_at DESC, s.id DESC LIMIT ${BROWSE_LIMIT}`,
      params,
    );
  } else {
    // Nothing typed and nothing picked: the screen shows its browse view instead.
    return [];
  }
  const saves = await toSaves(db, rows);

  // Rows arrive best-first (or newest-first), so a group is created at its first save: insertion order is the ranking.
  const groups = new Map<number | null, SearchGroup>();
  for (const save of saves) {
    let group = groups.get(save.topicId);
    if (!group) {
      group = { topicId: save.topicId, topicName: save.topicName ?? 'Unsorted', saves: [] };
      groups.set(save.topicId, group);
    }
    group.saves.push(save);
  }
  return [...groups.values()];
}

// Tags used most across the whole library, with counts, for the browse view's tag chips.
export async function popularTags(db: Db, limit: number): Promise<Array<{ name: string; count: number }>> {
  return db.getAllAsync<{ name: string; count: number }>(
    `SELECT t.name, COUNT(*) AS count FROM tags t JOIN save_tags st ON st.tag_id = t.id
     GROUP BY t.id ORDER BY COUNT(*) DESC, t.name LIMIT ?`,
    limit,
  );
}

// Recent searches live in the settings table as a JSON list, newest first.
const RECENT_SEARCHES_KEY = 'recentSearches';
const RECENT_SEARCHES_MAX = 8;

export async function recentSearches(db: Db): Promise<string[]> {
  try {
    const list = JSON.parse(await getSetting(db, RECENT_SEARCHES_KEY, '[]'));
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function rememberSearch(db: Db, query: string): Promise<void> {
  const trimmed = query.trim();
  if (trimmed === '') return;
  const others = (await recentSearches(db)).filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
  await setSetting(db, RECENT_SEARCHES_KEY, JSON.stringify([trimmed, ...others].slice(0, RECENT_SEARCHES_MAX)));
}

export async function clearRecentSearches(db: Db): Promise<void> {
  await setSetting(db, RECENT_SEARCHES_KEY, '[]');
}
