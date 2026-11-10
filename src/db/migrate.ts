// Applies schema migrations in order, remembering progress in `schema_version`.
// Runs every time the database is opened, so upgrades happen automatically.
import type { Db } from './db';
import { MIGRATION_1 } from './schema';

// Append new migrations here; never edit one that has shipped.
const migrations = [MIGRATION_1];

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = await db.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM schema_version');
  const currentVersion = row?.version ?? 0;

  for (let index = currentVersion; index < migrations.length; index++) {
    // One transaction per migration so a crash never leaves a half-built schema.
    await db.withTransactionAsync(async () => {
      await db.execAsync(migrations[index]);
      await db.runAsync('INSERT INTO schema_version (version) VALUES (?)', index + 1);
    });
  }
}
