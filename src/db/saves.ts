// Reads and writes of saved items: created by the share ingest, filled in by the fetch/AI pipeline,
// read by the timeline and detail screens. Also owns the retry queue (leases) the pipeline polls.
import type { Db } from './db';
import type { Enrichment, Extracted, Save, SaveStatus, Source, StatusReason } from '@/core/types';
import { resolveTopic } from './topics';

export interface SaveRow {
  id: number; url: string | null; canonical_url: string | null; source: Source; source_app: string | null;
  shared_text: string | null; title: string | null; author: string | null; extracted_text: string | null;
  image_url: string | null; thumb_path: string | null; summary: string | null; brief: string | null;
  topic_id: number | null; topic_name: string | null; topic_color: string | null; note: string | null;
  status: SaveStatus; status_reason: StatusReason; status_detail: string | null; attempts: number;
  next_retry_at: number | null; created_at: number; last_saved_at: number; opened_at: number | null; extra_json: string;
}

// A `partial` save that already has a summary was enriched from whatever text existed: nothing left to do.
const UNFINISHED = `(status IN ('fetching', 'waiting_ai') OR (status = 'partial' AND summary IS NULL))`;

// Whether "Retry AI" can do anything for this save: the same rule as UNFINISHED, minus saves still being fetched.
export function canRetryAi(save: Pick<Save, 'status' | 'summary'>): boolean {
  return save.status === 'waiting_ai' || (save.status === 'partial' && save.summary === null);
}

export const SELECT_SAVE = `SELECT s.*, t.name AS topic_name, t.color AS topic_color
  FROM saves s LEFT JOIN topics t ON t.id = s.topic_id`;

// A note can reach a save that already exists: the share card's "Add a note" stores it on the inbox row, which is
// then ingested again, and a note typed on an "Already saved" card belongs to the older save. The native side cannot
// write saves.note itself (Android's built-in SQLite lacks FTS5, which the saves triggers need), so it arrives here.
// Returns the note to store, or null when the save's note should stay as it is.
function mergeNote(existing: string | null, added: string | null): string | null {
  if (added === null || added.trim() === '') return null;
  if (existing === null || existing.trim() === '') return added;
  // Re-ingesting the same row brings the same note again; it must not be appended twice. Notes are joined by blank
  // lines, so compare whole paragraphs: "ok" is new even when the existing note says "book it".
  if (`\n\n${existing}\n\n`.includes(`\n\n${added}\n\n`)) return null;
  return `${existing}\n\n${added}`;
}

export async function createOrBumpSave(
  db: Db,
  input: { inboxId: number | null; url: string | null; canonicalUrl: string | null; source: Source; sourceApp: string | null; sharedText: string; note: string | null; now: number },
): Promise<{ id: number; duplicate: boolean }> {
  let outcome = { id: 0, duplicate: false };
  await db.withTransactionAsync(async () => {
    // The same share-inbox row can be ingested twice: the app was killed midway, or a note was added after ingestion.
    // It must not double-save; only a newly added note is copied over.
    if (input.inboxId !== null) {
      const sameInbox = await db.getFirstAsync<{ id: number; note: string | null }>('SELECT id, note FROM saves WHERE inbox_id = ?', input.inboxId);
      if (sameInbox) {
        const note = mergeNote(sameInbox.note, input.note);
        if (note !== null) await db.runAsync('UPDATE saves SET note = ? WHERE id = ?', note, sameInbox.id);
        outcome = { id: sameInbox.id, duplicate: true };
        return;
      }
    }
    // A re-shared link moves the existing save to today (and picks up a note typed on the "Already saved" card).
    // Ingesting that re-share again just sets last_saved_at to the later time; mergeNote keeps the note from repeating.
    if (input.canonicalUrl !== null) {
      const sameUrl = await db.getFirstAsync<{ id: number; note: string | null }>('SELECT id, note FROM saves WHERE canonical_url = ?', input.canonicalUrl);
      if (sameUrl) {
        const note = mergeNote(sameUrl.note, input.note);
        await db.runAsync('UPDATE saves SET last_saved_at = ?, note = COALESCE(?, note) WHERE id = ?', input.now, note, sameUrl.id);
        outcome = { id: sameUrl.id, duplicate: true };
        return;
      }
    }
    const result = await db.runAsync(
      `INSERT INTO saves (url, canonical_url, source, source_app, shared_text, note, status, attempts, inbox_id, created_at, last_saved_at)
       VALUES (?, ?, ?, ?, ?, ?, 'fetching', 0, ?, ?, ?)`,
      input.url, input.canonicalUrl, input.source, input.sourceApp, input.sharedText, input.note, input.inboxId, input.now, input.now,
    );
    outcome = { id: result.lastInsertRowId, duplicate: false };
  });
  return outcome;
}

// Attaches tag names to rows with one extra query, so list screens do not query per row.
export async function toSaves(db: Db, rows: SaveRow[]): Promise<Save[]> {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(', ');
  const tagRows = await db.getAllAsync<{ save_id: number; name: string }>(
    `SELECT st.save_id, t.name FROM save_tags st JOIN tags t ON t.id = st.tag_id
     WHERE st.save_id IN (${placeholders}) ORDER BY t.name`,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonical_url,
    source: row.source,
    sourceApp: row.source_app,
    sharedText: row.shared_text ?? '',
    title: row.title,
    author: row.author,
    extractedText: row.extracted_text,
    imageUrl: row.image_url,
    thumbPath: row.thumb_path,
    summary: row.summary,
    brief: row.brief,
    topicId: row.topic_id,
    topicName: row.topic_name,
    topicColor: row.topic_color,
    tags: tagRows.filter((tag) => tag.save_id === row.id).map((tag) => tag.name),
    note: row.note,
    status: row.status,
    statusReason: row.status_reason,
    statusDetail: row.status_detail,
    attempts: row.attempts,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    lastSavedAt: row.last_saved_at,
    openedAt: row.opened_at,
    extra: JSON.parse(row.extra_json) as Record<string, unknown>,
  }));
}

export async function getSave(db: Db, id: number): Promise<Save | null> {
  const rows = await db.getAllAsync<SaveRow>(`${SELECT_SAVE} WHERE s.id = ?`, id);
  return (await toSaves(db, rows))[0] ?? null;
}

export async function listTimeline(db: Db, filter: { topicId?: number | null; tag?: string; limit: number; before?: number }): Promise<Save[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  // null means "no topic yet" (the Unsorted list); undefined means no topic filter at all.
  if (filter.topicId === null) {
    conditions.push('s.topic_id IS NULL');
  } else if (filter.topicId !== undefined) {
    conditions.push('s.topic_id = ?');
    params.push(filter.topicId);
  }
  if (filter.tag !== undefined) {
    conditions.push('EXISTS (SELECT 1 FROM save_tags st JOIN tags t ON t.id = st.tag_id WHERE st.save_id = s.id AND t.name = ?)');
    params.push(filter.tag);
  }
  if (filter.before !== undefined) {
    conditions.push('s.last_saved_at < ?');
    params.push(filter.before);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.getAllAsync<SaveRow>(`${SELECT_SAVE} ${where} ORDER BY s.last_saved_at DESC, s.id DESC LIMIT ?`, [...params, filter.limit]);
  return toSaves(db, rows);
}

export async function updateFetched(db: Db, id: number, fetched: Extracted & { thumbPath?: string | null }): Promise<void> {
  // COALESCE keeps what the share already knew when the fetcher found nothing for a field.
  await db.runAsync(
    `UPDATE saves SET title = COALESCE(?, title), author = COALESCE(?, author), extracted_text = COALESCE(?, extracted_text),
       image_url = COALESCE(?, image_url), thumb_path = COALESCE(?, thumb_path), extra_json = ? WHERE id = ?`,
    fetched.title ?? null, fetched.author ?? null, fetched.text ?? null, fetched.imageUrl ?? null,
    fetched.thumbPath ?? null, JSON.stringify(fetched.extra ?? {}), id,
  );
}

// Replaces a save's tag links. Must run inside a transaction when called with other writes (also used by backup import).
export async function replaceTags(db: Db, saveId: number, tags: string[]): Promise<void> {
  await db.runAsync('DELETE FROM save_tags WHERE save_id = ?', saveId);
  for (const name of new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag !== ''))) {
    await db.runAsync('INSERT OR IGNORE INTO tags (name) VALUES (?)', name);
    await db.runAsync('INSERT INTO save_tags (save_id, tag_id) SELECT ?, id FROM tags WHERE name = ?', saveId, name);
  }
}

// `finalStatus` is 'partial' for saves whose page could not be fetched: they keep that status and its fetch_failed
// reason (set in the same statement, so there is no moment where they look fully done).
export async function applyEnrichment(
  db: Db, id: number, enrichment: Enrichment, now: number, finalStatus: 'done' | 'partial' = 'done',
): Promise<void> {
  // Resolved before the transaction opens: the transaction API does not nest.
  const topicId = await resolveTopic(db, enrichment.topic, now);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE saves SET summary = ?, brief = ?, topic_id = ?, status = ?,
         status_reason = CASE WHEN ? = 'partial' THEN 'fetch_failed' ELSE NULL END,
         status_detail = CASE WHEN ? = 'partial' THEN status_detail ELSE NULL END,
         next_retry_at = NULL, lease_until = NULL WHERE id = ?`,
      enrichment.summary, enrichment.brief, topicId, finalStatus, finalStatus, finalStatus, id,
    );
    await replaceTags(db, id, enrichment.tags);
  });
}

// Records the outcome of one pipeline attempt and releases the lease so the retry time alone decides when it runs next.
export async function setStatus(
  db: Db, id: number, status: SaveStatus, reason: StatusReason, detail: string | null, nextRetryAt: number | null, attemptsDelta: number,
): Promise<void> {
  await db.runAsync(
    `UPDATE saves SET status = ?, status_reason = ?, status_detail = ?, next_retry_at = ?, attempts = attempts + ?, lease_until = NULL WHERE id = ?`,
    status, reason, detail, nextRetryAt, attemptsDelta, id,
  );
}

export async function markOpened(db: Db, id: number, now: number): Promise<void> {
  await db.runAsync('UPDATE saves SET opened_at = ? WHERE id = ?', now, id);
}

export async function deleteSave(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM saves WHERE id = ?', id);
}

export async function updateNote(db: Db, id: number, note: string | null): Promise<void> {
  await db.runAsync('UPDATE saves SET note = ? WHERE id = ?', note, id);
}

export async function setTopic(db: Db, id: number, topicId: number | null): Promise<void> {
  await db.runAsync('UPDATE saves SET topic_id = ? WHERE id = ?', topicId, id);
}

export async function setTags(db: Db, id: number, tags: string[]): Promise<void> {
  await db.withTransactionAsync(() => replaceTags(db, id, tags));
}

// Picks saves the pipeline should work on now and leases them, so two workers (or two app wake-ups) never take the same one.
// One UPDATE ... RETURNING statement, because expo-sqlite transactions do not isolate the connection:
// a separate SELECT then UPDATE could interleave with another caller and hand out the same save twice.
export async function claimDue(db: Db, now: number, leaseMs: number, limit: number): Promise<number[]> {
  const claimed = await db.getAllAsync<{ id: number; last_saved_at: number }>(
    `UPDATE saves SET lease_until = ?
     WHERE id IN (
       SELECT id FROM saves
       WHERE ${UNFINISHED}
         AND (status_reason IS NULL OR status_reason NOT IN ('not_connected', 'auth_expired'))
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
         AND (lease_until IS NULL OR lease_until <= ?)
       ORDER BY last_saved_at, id LIMIT ?)
     RETURNING id, last_saved_at`,
    now + leaseMs, now, now, limit,
  );
  // RETURNING does not promise row order, so restore the oldest-first order here.
  return claimed.sort((a, b) => a.last_saved_at - b.last_saved_at || a.id - b.id).map((row) => row.id);
}

// not_connected / auth_expired saves are skipped by claimDue until something fixes the cause (a provider was connected
// or the user signed in again); clearing their reason makes them due again. Without this they would be re-claimed every run.
export async function rearmWaitingAi(db: Db, reasons: Array<'not_connected' | 'auth_expired'>): Promise<void> {
  const placeholders = reasons.map(() => '?').join(', ');
  await db.runAsync(`UPDATE saves SET status_reason = NULL WHERE status_reason IN (${placeholders}) AND status != 'done'`, reasons);
}

export async function queueSummary(db: Db): Promise<{ waiting: number; reason: StatusReason; nextRetryAt: number | null }> {
  const totals = await db.getFirstAsync<{ waiting: number; next_retry_at: number | null }>(
    `SELECT COUNT(*) AS waiting, MIN(next_retry_at) AS next_retry_at FROM saves WHERE ${UNFINISHED}`,
  );
  const commonReason = await db.getFirstAsync<{ status_reason: StatusReason }>(
    `SELECT status_reason FROM saves WHERE ${UNFINISHED} AND status_reason IS NOT NULL
     GROUP BY status_reason ORDER BY COUNT(*) DESC, status_reason LIMIT 1`,
  );
  return { waiting: totals?.waiting ?? 0, reason: commonReason?.status_reason ?? null, nextRetryAt: totals?.next_retry_at ?? null };
}

// "Retry now": makes every unfinished save due immediately instead of waiting for its scheduled retry time.
// How many saves there are and how big the database file is, for the Settings "Saves on this phone" row.
export async function libraryStats(db: Db): Promise<{ count: number; databaseBytes: number }> {
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM saves');
  const pages = await db.getFirstAsync<{ bytes: number }>(
    'SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()',
  );
  return { count: count?.count ?? 0, databaseBytes: pages?.bytes ?? 0 };
}

export async function retryNow(db: Db): Promise<void> {
  await db.runAsync(`UPDATE saves SET next_retry_at = NULL WHERE ${UNFINISHED}`);
}

// "Retry AI" on one save's detail sheet: forgets the backoff so the next queue run picks this save up straight away.
export async function retrySave(db: Db, id: number): Promise<void> {
  await db.runAsync('UPDATE saves SET next_retry_at = NULL, attempts = 0 WHERE id = ?', id);
}
