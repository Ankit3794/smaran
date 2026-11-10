// Topic queries and edits: the Topics screen, and topic lookup when the AI names a topic.
// Merged topic names are kept as aliases so later AI suggestions still land in the right place.
import type { Db } from './db';

const TOPIC_PALETTE = ['#2F7D5B', '#B4443A', '#3C5FA8', '#B07A1F', '#7A4E9E', '#2B7A86', '#A0522D', '#5E6B2F', '#9C3D6E', '#4F5D75'];
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TopicSummary {
  id: number;
  name: string;
  color: string;
  count: number;
  newThisWeek: number;
  last7: number[];
}

// Returns the id of the topic called `name`: existing topic, then alias, else a new topic.
export async function resolveTopic(db: Db, name: string, now: number): Promise<number> {
  const trimmedName = name.trim();
  const byName = await db.getFirstAsync<{ id: number }>('SELECT id FROM topics WHERE name = ?', trimmedName);
  if (byName) return byName.id;
  const byAlias = await db.getFirstAsync<{ topic_id: number }>('SELECT topic_id FROM topic_aliases WHERE alias = ?', trimmedName);
  if (byAlias) return byAlias.topic_id;

  // Take the first palette colour no topic uses; once all ten are used, colours repeat.
  const usedColors = (await db.getAllAsync<{ color: string }>('SELECT color FROM topics')).map((row) => row.color);
  const color = TOPIC_PALETTE.find((candidate) => !usedColors.includes(candidate)) ?? TOPIC_PALETTE[usedColors.length % TOPIC_PALETTE.length];
  const result = await db.runAsync('INSERT INTO topics (name, color, created_at) VALUES (?, ?, ?)', trimmedName, color, now);
  return result.lastInsertRowId;
}

export async function listTopics(db: Db, now: number): Promise<TopicSummary[]> {
  const weekAgo = now - 7 * DAY_MS;
  const rows = await db.getAllAsync<{ id: number; name: string; color: string; count: number; new_this_week: number }>(
    `SELECT t.id, t.name, t.color, COUNT(s.id) AS count,
            COALESCE(SUM(s.created_at > ?), 0) AS new_this_week
     FROM topics t LEFT JOIN saves s ON s.topic_id = t.id
     GROUP BY t.id ORDER BY count DESC, t.name`,
    weekAgo,
  );

  // Seven local calendar days ending today; index 6 is today.
  const today = new Date(now);
  const dayStarts = [6, 5, 4, 3, 2, 1, 0].map((daysAgo) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo).getTime());
  const recent = await db.getAllAsync<{ topic_id: number; created_at: number }>(
    'SELECT topic_id, created_at FROM saves WHERE topic_id IS NOT NULL AND created_at >= ?',
    dayStarts[0],
  );

  return rows.map((row) => {
    const last7 = [0, 0, 0, 0, 0, 0, 0];
    for (const save of recent) {
      if (save.topic_id !== row.id) continue;
      // The latest day that started at or before the save is its bucket; future-dated saves count as today.
      const dayIndex = dayStarts.filter((start) => start <= save.created_at).length - 1;
      last7[dayIndex] += 1;
    }
    return { id: row.id, name: row.name, color: row.color, count: row.count, newThisWeek: row.new_this_week, last7 };
  });
}

export async function renameTopic(db: Db, id: number, name: string): Promise<void> {
  await db.runAsync('UPDATE topics SET name = ? WHERE id = ?', name.trim(), id);
}

export async function setTopicColor(db: Db, id: number, color: string): Promise<void> {
  await db.runAsync('UPDATE topics SET color = ? WHERE id = ?', color, id);
}

// Folds one topic into another; the old name stays as an alias for future AI suggestions.
export async function mergeTopics(db: Db, fromId: number, intoId: number): Promise<void> {
  if (fromId === intoId) return;
  await db.withTransactionAsync(async () => {
    const from = await db.getFirstAsync<{ name: string }>('SELECT name FROM topics WHERE id = ?', fromId);
    if (!from) return;
    await db.runAsync('UPDATE saves SET topic_id = ? WHERE topic_id = ?', intoId, fromId);
    await db.runAsync('UPDATE topic_aliases SET topic_id = ? WHERE topic_id = ?', intoId, fromId);
    await db.runAsync('INSERT OR REPLACE INTO topic_aliases (alias, topic_id) VALUES (?, ?)', from.name, intoId);
    await db.runAsync('DELETE FROM topics WHERE id = ?', fromId);
  });
}

// Most-used tag names within a topic, for the topic detail screen's filter chips.
export async function topTags(db: Db, topicId: number, limit: number): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT t.name FROM tags t
     JOIN save_tags st ON st.tag_id = t.id
     JOIN saves s ON s.id = st.save_id
     WHERE s.topic_id = ?
     GROUP BY t.id ORDER BY COUNT(*) DESC, t.name LIMIT ?`,
    topicId, limit,
  );
  return rows.map((row) => row.name);
}

// Most-used tag names across every topic, so the AI reuses existing tags instead of inventing near-duplicates.
export async function topTagsOverall(db: Db, limit: number): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT t.name FROM tags t JOIN save_tags st ON st.tag_id = t.id
     GROUP BY t.id ORDER BY COUNT(*) DESC, t.name LIMIT ?`,
    limit,
  );
  return rows.map((row) => row.name);
}
