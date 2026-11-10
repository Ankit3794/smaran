// Tests for backup export/import: a zip of smaran.json plus thumbnails, merged back into a library without duplicates.
// Runs against real SQLite schemas; thumbnail file reads and writes are in-memory fakes.
import { strFromU8, unzipSync } from 'fflate';
import { exportBackup, importBackup } from '@/backup/backup';
import { migrate } from '@/db/migrate';
import { applyEnrichment, createOrBumpSave, listTimeline, updateNote } from '@/db/saves';
import { mergeTopics } from '@/db/topics';
import { openTestDb } from '../helpers/sqlite';
import type { Db } from '@/db/db';

async function freshDb() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

async function seededDb() {
  const db = await freshDb();
  const link = await createOrBumpSave(db, {
    inboxId: 1, url: 'https://example.com/a?utm=1', canonicalUrl: 'https://example.com/a', source: 'web', sourceApp: 'com.android.chrome',
    sharedText: 'https://example.com/a?utm=1', note: null, now: 1000,
  });
  await applyEnrichment(db, link.id, { summary: 'Options scanner', brief: 'Scans options flow.', topic: 'Trading', tags: ['options', 'tools'] }, 1000);
  await updateNote(db, link.id, 'try on Monday');
  await db.runAsync("UPDATE saves SET thumb_path = 'file:///thumbs/1.jpg' WHERE id = ?", link.id);

  const text = await createOrBumpSave(db, {
    inboxId: 2, url: null, canonicalUrl: null, source: 'text', sourceApp: null, sharedText: 'remember to read about TLS', note: null, now: 2000,
  });
  await applyEnrichment(db, text.id, { summary: 'Read about TLS', brief: 'A reminder.', topic: 'Security', tags: ['tls'] }, 2000);

  // A merged topic leaves an alias behind, which the backup keeps.
  await applyEnrichment(db, (await createOrBumpSave(db, {
    inboxId: 3, url: 'https://example.com/b', canonicalUrl: 'https://example.com/b', source: 'web', sourceApp: null, sharedText: 'b', note: null, now: 3000,
  })).id, { summary: 'Stocks', brief: 'b', topic: 'Stocks', tags: [] }, 3000);
  const ids = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM topics');
  await mergeTopics(db, ids.find((t) => t.name === 'Stocks')!.id, ids.find((t) => t.name === 'Trading')!.id);

  // Settings rows must never travel in a backup.
  await db.runAsync("INSERT INTO settings (key, value) VALUES ('credClaude', '{\"accessToken\":\"secret-a\",\"refreshToken\":\"secret-r\"}')");
  await db.runAsync("INSERT INTO settings (key, value) VALUES ('apiKey', 'secret-key')");
  return db;
}

const thumbFiles = new Map<string, Uint8Array>([['file:///thumbs/1.jpg', new Uint8Array([0xff, 0xd8, 1, 2, 3])]]);
const readThumb = async (path: string) => thumbFiles.get(path) ?? null;

// Comparable view of a library: everything a person sees, without row ids or file paths.
async function snapshot(db: Db) {
  const saves = await listTimeline(db, { limit: 100 });
  return saves
    .map(({ id, topicId, thumbPath, ...rest }) => ({ ...rest, tags: [...rest.tags].sort() }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

describe('exportBackup / importBackup', () => {
  it('recreates the same saves, topics, tags and aliases in an empty library', async () => {
    const source = await seededDb();
    const zip = await exportBackup(source, readThumb);

    const target = await freshDb();
    const written = new Map<number, Uint8Array>();
    const result = await importBackup(target, zip, async (saveId, bytes) => {
      written.set(saveId, bytes);
      return `file:///imported/${saveId}.jpg`;
    });

    expect(result).toEqual({ added: 3, skipped: 0 });
    expect(await snapshot(target)).toEqual(await snapshot(source));
    expect(await target.getAllAsync('SELECT name, color FROM topics ORDER BY name')).toEqual(
      await source.getAllAsync('SELECT name, color FROM topics ORDER BY name'),
    );
    expect(await target.getAllAsync('SELECT a.alias, t.name FROM topic_aliases a JOIN topics t ON t.id = a.topic_id')).toEqual([
      { alias: 'Stocks', name: 'Trading' },
    ]);
    // The one thumbnail came along and is linked to its save.
    expect([...written.values()]).toEqual([new Uint8Array([0xff, 0xd8, 1, 2, 3])]);
    const withThumb = await target.getAllAsync<{ summary: string; thumb_path: string }>('SELECT summary, thumb_path FROM saves WHERE thumb_path IS NOT NULL');
    expect(withThumb).toEqual([{ summary: 'Options scanner', thumb_path: `file:///imported/${[...written.keys()][0]}.jpg` }]);
    // Imported saves are found by search too (the FTS triggers ran).
    expect(await target.getAllAsync("SELECT rowid FROM saves_fts WHERE saves_fts MATCH 'options'")).toHaveLength(1);
  });

  it('skips everything when the same backup is imported twice', async () => {
    const zip = await exportBackup(await seededDb(), readThumb);
    const target = await freshDb();
    const writeThumb = async (saveId: number) => `file:///imported/${saveId}.jpg`;
    await importBackup(target, zip, writeThumb);
    expect(await importBackup(target, zip, writeThumb)).toEqual({ added: 0, skipped: 3 });
    expect(await target.getAllAsync('SELECT id FROM saves')).toHaveLength(3);
  });

  it('keeps no credentials or settings in the exported file', async () => {
    const zip = await exportBackup(await seededDb(), readThumb);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['smaran.json', expect.stringMatching(/^thumbs\/\d+\.jpg$/)]);
    const json = strFromU8(files['smaran.json']);
    for (const secret of ['accessToken', 'refreshToken', 'apiKey', 'secret-a', 'secret-key']) expect(json).not.toContain(secret);
    expect(JSON.parse(json)).toMatchObject({ version: 1 });
  });

  it('refuses a file that is not a Smaran backup', async () => {
    const target = await freshDb();
    await expect(importBackup(target, new Uint8Array([1, 2, 3]), async () => '')).rejects.toThrow('not a Smaran backup');
  });
});
