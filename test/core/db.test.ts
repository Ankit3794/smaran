// Tests how the app's single SQLite connection handles transactions started at the same time (queue and screens).
// expo-sqlite's withTransactionAsync is a plain BEGIN…COMMIT, so the test helper reproduces the same collision.
import { migrate } from '@/db/migrate';
import { openTestDb } from '../helpers/sqlite';

describe('transactions on one connection', () => {
  it('runs two transactions started together one after the other, so neither rolls back the other', async () => {
    const db = openTestDb();
    await migrate(db);
    const insertTwoTopics = (prefix: string) =>
      db.withTransactionAsync(async () => {
        await db.runAsync("INSERT INTO topics (name, color, created_at) VALUES (?, '#000', 0)", `${prefix}-1`);
        // Let the other caller run in between, as a real await on the native module does.
        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.runAsync("INSERT INTO topics (name, color, created_at) VALUES (?, '#000', 0)", `${prefix}-2`);
      });
    await Promise.all([insertTwoTopics('import'), insertTwoTopics('queue')]);
    expect(await db.getAllAsync('SELECT name FROM topics ORDER BY name')).toEqual([
      { name: 'import-1' }, { name: 'import-2' }, { name: 'queue-1' }, { name: 'queue-2' },
    ]);
  });

  it('still rolls back a transaction whose work fails, and keeps running later ones', async () => {
    const db = openTestDb();
    await migrate(db);
    const failing = db.withTransactionAsync(async () => {
      await db.runAsync("INSERT INTO topics (name, color, created_at) VALUES ('lost', '#000', 0)");
      throw new Error('boom');
    });
    const later = db.withTransactionAsync(async () => {
      await db.runAsync("INSERT INTO topics (name, color, created_at) VALUES ('kept', '#000', 0)");
    });
    await expect(failing).rejects.toThrow('boom');
    await later;
    expect(await db.getAllAsync('SELECT name FROM topics')).toEqual([{ name: 'kept' }]);
  });
});
