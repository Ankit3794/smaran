// Makes transactions on the app's one SQLite connection run one at a time (see queueTransactions).
// Applied by openDb in db.ts, and by the test database helper so tests see the same behaviour.
import type { Db } from './db';

// expo-sqlite hands every caller in the app the same native connection, and withTransactionAsync is a plain
// BEGIN…COMMIT on it. So when the queue and a screen (say, a backup import) start transactions at the same time,
// the second BEGIN fails and its ROLLBACK undoes the first caller's work. Chaining them makes each transaction
// wait for the previous one. Module-level on purpose: every Db opened in this JS runtime shares the connection.
// One rule follows: never start a transaction from inside another one; it would wait for itself forever.
let lastTransaction: Promise<unknown> = Promise.resolve();

export function queueTransactions<T extends Db>(db: T): T {
  const runTransaction = db.withTransactionAsync.bind(db);
  db.withTransactionAsync = (task) => {
    const run = lastTransaction.then(() => runTransaction(task));
    // The next transaction waits for this one to settle, whether it committed or rolled back.
    lastTransaction = run.catch(() => {});
    return run;
  };
  return db;
}
