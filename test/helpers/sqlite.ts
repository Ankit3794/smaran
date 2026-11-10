// Test-only stand-in for expo-sqlite, built on Node's bundled SQLite (includes FTS5).
// Mirrors the real method names and return shapes so app code runs unchanged in tests.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db } from '@/db/db';
import { queueTransactions } from '@/db/transactions';

// expo-sqlite accepts either `(sql, a, b)` or `(sql, [a, b])`.
function flattenParams(params: unknown[]): SQLInputValue[] {
  return (Array.isArray(params[0]) ? params[0] : params) as SQLInputValue[];
}

export function openTestDb(): Db {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');

  // Same transaction queueing as the app's openDb, so tests see production behaviour.
  return queueTransactions({
    execAsync: async (sql) => {
      database.exec(sql);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      const result = database.prepare(sql).run(...flattenParams(params));
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      database.prepare(sql).all(...flattenParams(params)) as never[],
    // Like expo-sqlite, resolves null (not undefined) when there is no row.
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      (database.prepare(sql).get(...flattenParams(params)) ?? null) as never,
    withTransactionAsync: async (task) => {
      database.exec('BEGIN');
      try {
        await task();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  });
}
