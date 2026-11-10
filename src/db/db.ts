// Opens the app's single SQLite database and brings its schema up to date.
// Everything that reads or writes saved data receives the `Db` this file produces.
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { migrate } from './migrate';
import { queueTransactions } from './transactions';

// Only the expo-sqlite methods the app uses, so tests can supply a small fake.
export type Db = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'withTransactionAsync'>;

export async function openDb(): Promise<Db> {
  // The change listener lets screens refresh when the share activity writes a save.
  const db = queueTransactions(await openDatabaseAsync('smaran.db', { enableChangeListener: true }));
  // WAL and a busy timeout let the share activity and the app write without "database is locked".
  await db.execAsync('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  await migrate(db);
  return db;
}
