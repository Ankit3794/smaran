// Keyword search over saves using the FTS5 index (saves_fts), which the triggers keep in sync.
// Called by the search screen; returns saves already grouped by topic for display.
import type { Db } from './db';
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

export async function searchSaves(
  db: Db,
  q: string,
  filter: { since?: number; source?: Source; topicId?: number },
): Promise<SearchGroup[]> {
  const ftsQuery = toFtsQuery(q);
  if (ftsQuery === null) return [];

  const conditions = ['saves_fts MATCH ?'];
  const params: (string | number)[] = [ftsQuery];
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

  // bm25() is lower for better matches, so ascending order puts the best match first.
  const rows = await db.getAllAsync<SaveRow>(
    `${SELECT_SAVE} JOIN saves_fts ON saves_fts.rowid = s.id
     WHERE ${conditions.join(' AND ')} ORDER BY bm25(saves_fts), s.id`,
    params,
  );
  const saves = await toSaves(db, rows);

  // Rows arrive best-first, so a group is created at its best save: insertion order is the group ranking.
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
