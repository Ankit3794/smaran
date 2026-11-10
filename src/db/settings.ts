// Small key/value store for non-secret app settings (credentials live in expo-secure-store instead).
// Read by the pipeline and the Settings screen.
import type { Db } from './db';

export async function getSetting(db: Db, key: string, fallback: string): Promise<string> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? fallback;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
