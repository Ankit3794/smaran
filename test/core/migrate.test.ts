// Checks that migration 1 builds the whole schema, is safe to re-run, and that the FTS triggers index saves.
// Uses an in-memory database, so it exercises the same SQL the app runs on the device.
import { migrate } from '@/db/migrate';
import { openTestDb } from '../helpers/sqlite';

const expectedTables = [
  'saves', 'topics', 'topic_aliases', 'tags', 'save_tags',
  'share_inbox', 'settings', 'schema_version', 'saves_fts',
];

async function insertSave(db: ReturnType<typeof openTestDb>, summary: string) {
  const result = await db.runAsync(
    `INSERT INTO saves (source, summary, created_at, last_saved_at) VALUES ('web', ?, 1, 1)`,
    summary,
  );
  return result.lastInsertRowId;
}

test('migrate creates every table and is a no-op the second time', async () => {
  const db = openTestDb();
  await migrate(db);
  await migrate(db);
  const rows = await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`);
  const names = rows.map((row) => row.name);
  for (const table of expectedTables) expect(names).toContain(table);
  const versions = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_version');
  expect(versions).toEqual([{ version: 1 }]);
});

test('inserting a save makes its summary searchable', async () => {
  const db = openTestDb();
  await migrate(db);
  const id = await insertSave(db, 'Options scanner');
  const hits = await db.getAllAsync<{ rowid: number }>(`SELECT rowid FROM saves_fts WHERE saves_fts MATCH 'scan*'`);
  expect(hits).toEqual([{ rowid: id }]);
});

test('tags are indexed, and updates and deletes keep the index in sync', async () => {
  const db = openTestDb();
  await migrate(db);
  const id = await insertSave(db, 'Something');
  await db.runAsync(`INSERT INTO tags (name) VALUES ('options')`);
  await db.runAsync(`INSERT INTO save_tags (save_id, tag_id) VALUES (?, 1)`, id);
  const search = (term: string) =>
    db.getAllAsync(`SELECT rowid FROM saves_fts WHERE saves_fts MATCH ?`, term);
  expect(await search('options')).toHaveLength(1);

  await db.runAsync(`UPDATE saves SET summary = 'Renamed' WHERE id = ?`, id);
  expect(await search('renamed')).toHaveLength(1);
  expect(await search('something')).toHaveLength(0);

  await db.runAsync('DELETE FROM save_tags WHERE save_id = ?', id);
  expect(await search('options')).toHaveLength(0);

  await db.runAsync('DELETE FROM saves WHERE id = ?', id);
  expect(await search('renamed')).toHaveLength(0);
});

test('share_inbox ids are never reused after a delete', async () => {
  const db = openTestDb();
  await migrate(db);
  const insertInbox = () =>
    db.runAsync(`INSERT INTO share_inbox (shared_text, received_at) VALUES ('x', 1)`);
  const first = await insertInbox();
  await db.runAsync('DELETE FROM share_inbox WHERE id = ?', first.lastInsertRowId);
  const second = await insertInbox();
  expect(second.lastInsertRowId).toBeGreaterThan(first.lastInsertRowId);
});
