// Moves rows the native share activity wrote into `share_inbox` into the `saves` table.
// First step of the data flow: share_inbox -> saves (status 'fetching') -> processSave.
import { detectSource, extractFirstUrl, normalizeUrl } from '@/core/url';
import type { Db } from '@/db/db';
import { createOrBumpSave } from '@/db/saves';

interface InboxRow {
  id: number;
  shared_text: string;
  source_app: string | null;
  note: string | null;
  received_at: number;
  undone: number;
  ingested: number;
}

// A shared link that is not a valid URL (e.g. "http://") is kept as a plain text save rather than lost.
function parseSharedLink(sharedText: string): { url: string; canonicalUrl: string } | null {
  const url = extractFirstUrl(sharedText);
  if (url === null) return null;
  try {
    return { url, canonicalUrl: normalizeUrl(url) };
  } catch {
    return null;
  }
}

export async function ingestInbox(db: Db, now: number): Promise<{ saveIds: number[] }> {
  const saveIds: number[] = [];

  // Undo after ingestion: the user tapped Undo once the save already existed, so remove it.
  const undoneAfterIngest = await db.getAllAsync<InboxRow>('SELECT * FROM share_inbox WHERE undone = 1 AND ingested = 1');
  for (const row of undoneAfterIngest) {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM saves WHERE inbox_id = ?', row.id);
      await db.runAsync('DELETE FROM share_inbox WHERE id = ?', row.id);
    });
  }

  const pending = await db.getAllAsync<InboxRow>('SELECT * FROM share_inbox WHERE ingested = 0 ORDER BY id');
  for (const row of pending) {
    if (row.undone === 1) {
      await db.runAsync('DELETE FROM share_inbox WHERE id = ?', row.id);
      continue;
    }
    // createOrBumpSave opens its own transaction (they do not nest), and it is safe to repeat for the same inbox id,
    // so if the app dies before the row is marked ingested, the next run finds the existing save instead of duplicating it.
    const link = parseSharedLink(row.shared_text);
    const { id } = await createOrBumpSave(db, {
      inboxId: row.id,
      url: link?.url ?? null,
      canonicalUrl: link?.canonicalUrl ?? null,
      source: detectSource(link?.url ?? null),
      sourceApp: row.source_app,
      sharedText: row.shared_text,
      note: row.note,
      now,
    });
    await db.runAsync('UPDATE share_inbox SET ingested = 1 WHERE id = ?', row.id);
    saveIds.push(id);
  }
  return { saveIds };
}
