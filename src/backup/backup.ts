// Backup export and import: the whole library as one .zip, holding smaran.json (topics, aliases, saves with their
// tags) and thumbs/<id>.jpg. Called from Settings; the screen supplies the file reads and writes for thumbnails.
// Settings and credentials are never read here, so a backup can be shared without leaking sign-ins or API keys.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Save } from '@/core/types';
import type { Db } from '@/db/db';
import { replaceTags, SELECT_SAVE, toSaves, type SaveRow } from '@/db/saves';

const BACKUP_VERSION = 1;

// A save as stored in the backup: row ids and file paths are local to one phone, so the topic travels by name
// and the thumbnail as a file in the zip.
type BackupSave = Omit<Save, 'thumbPath' | 'topicId' | 'topicName' | 'topicColor'> & { topic: string | null };

interface BackupFile {
  version: number;
  exportedAt: number;
  topics: Array<{ name: string; color: string }>;
  aliases: Array<{ alias: string; topic: string }>;
  saves: BackupSave[];
}

export async function exportBackup(db: Db, readThumb: (path: string) => Promise<Uint8Array | null>): Promise<Uint8Array> {
  const saves = await toSaves(db, await db.getAllAsync<SaveRow>(`${SELECT_SAVE} ORDER BY s.id`));
  const topics = await db.getAllAsync<{ name: string; color: string }>('SELECT name, color FROM topics ORDER BY id');
  const aliases = await db.getAllAsync<{ alias: string; topic: string }>(
    'SELECT a.alias, t.name AS topic FROM topic_aliases a JOIN topics t ON t.id = a.topic_id',
  );

  const files: Record<string, Uint8Array> = {};
  const backupSaves = [];
  for (const { thumbPath, topicId, topicName, topicColor, ...save } of saves) {
    backupSaves.push({ ...save, topic: topicName });
    // A thumbnail file that has gone missing is skipped; the save still has its image URL.
    const thumb = thumbPath === null ? null : await readThumb(thumbPath);
    if (thumb !== null) files[`thumbs/${save.id}.jpg`] = thumb;
  }

  const backup: BackupFile = { version: BACKUP_VERSION, exportedAt: Date.now(), topics, aliases, saves: backupSaves };
  files['smaran.json'] = strToU8(JSON.stringify(backup));
  return zipSync(files);
}

function readBackupFile(zip: Uint8Array): { backup: BackupFile; files: Record<string, Uint8Array> } {
  try {
    const files = unzipSync(zip);
    const backup = JSON.parse(strFromU8(files['smaran.json'])) as BackupFile;
    if (backup.version === BACKUP_VERSION && Array.isArray(backup.saves)) return { backup, files };
  } catch {
    // Falls through to the error below: a broken zip and a zip of something else get the same message.
  }
  throw new Error('This file is not a Smaran backup.');
}

// The same save already in the library: links match by canonical URL, text saves by their text and creation time.
async function alreadyHave(db: Db, save: BackupSave): Promise<boolean> {
  const existing =
    save.canonicalUrl !== null
      ? await db.getFirstAsync('SELECT id FROM saves WHERE canonical_url = ?', save.canonicalUrl)
      : await db.getFirstAsync('SELECT id FROM saves WHERE canonical_url IS NULL AND shared_text = ? AND created_at = ?', save.sharedText, save.createdAt);
  return existing !== null;
}

// Merges a backup into the library: existing saves are kept as they are, new ones are added with their tags and
// thumbnails. Topics are matched by name, so an existing topic keeps its colour.
export async function importBackup(
  db: Db,
  zip: Uint8Array,
  writeThumb: (saveId: number, bytes: Uint8Array) => Promise<string>,
): Promise<{ added: number; skipped: number }> {
  const { backup, files } = readBackupFile(zip);
  // New save id -> its thumbnail in the zip; files are written after the transaction, which must stay short.
  const thumbsToWrite: Array<{ saveId: number; bytes: Uint8Array }> = [];
  let skipped = 0;

  await db.withTransactionAsync(async () => {
    for (const topic of backup.topics) {
      await db.runAsync('INSERT OR IGNORE INTO topics (name, color, created_at) VALUES (?, ?, ?)', topic.name, topic.color, Date.now());
    }
    for (const { alias, topic } of backup.aliases) {
      await db.runAsync('INSERT OR IGNORE INTO topic_aliases (alias, topic_id) SELECT ?, id FROM topics WHERE name = ?', alias, topic);
    }

    for (const save of backup.saves) {
      if (await alreadyHave(db, save)) {
        skipped += 1;
        continue;
      }
      // inbox_id and lease_until stay empty: they belong to the phone's share inbox and pipeline run, not to the save.
      const result = await db.runAsync(
        `INSERT INTO saves (url, canonical_url, source, source_app, shared_text, title, author, extracted_text, image_url,
           summary, brief, topic_id, note, status, status_reason, status_detail, attempts, next_retry_at,
           created_at, last_saved_at, opened_at, extra_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM topics WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        save.url, save.canonicalUrl, save.source, save.sourceApp, save.sharedText, save.title, save.author, save.extractedText,
        save.imageUrl, save.summary, save.brief, save.topic, save.note, save.status, save.statusReason, save.statusDetail,
        save.attempts, save.nextRetryAt, save.createdAt, save.lastSavedAt, save.openedAt, JSON.stringify(save.extra),
      );
      await replaceTags(db, result.lastInsertRowId, save.tags);
      const thumb = files[`thumbs/${save.id}.jpg`];
      if (thumb !== undefined) thumbsToWrite.push({ saveId: result.lastInsertRowId, bytes: thumb });
    }
  });

  for (const { saveId, bytes } of thumbsToWrite) {
    const path = await writeThumb(saveId, bytes);
    await db.runAsync('UPDATE saves SET thumb_path = ? WHERE id = ?', path, saveId);
  }
  return { added: backup.saves.length - skipped, skipped };
}
