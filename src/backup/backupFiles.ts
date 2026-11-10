// The phone side of backups, used by the Settings screen: writes the export zip to the cache and opens the
// Android share sheet, and lets the user pick a zip to import. The zip format itself lives in backup.ts.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Db } from '@/db/db';
import { exportBackup, importBackup } from './backup';

// A thumbnail that has gone missing is left out of the backup rather than failing the export.
async function readThumb(path: string): Promise<Uint8Array | null> {
  const file = new File(path);
  return file.exists ? file.bytes() : null;
}

// Same folder and naming as the pipeline's thumbnail downloads (src/pipeline/thumbs.ts).
async function writeThumb(saveId: number, bytes: Uint8Array): Promise<string> {
  const thumbsDirectory = new Directory(Paths.document, 'thumbs');
  thumbsDirectory.create({ idempotent: true, intermediates: true });
  const file = new File(thumbsDirectory, `${saveId}.jpg`);
  file.create({ overwrite: true });
  await file.write(bytes);
  return file.uri;
}

export async function exportBackupFile(db: Db): Promise<void> {
  const zip = await exportBackup(db, readThumb);
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `smaran-backup-${date}.zip`);
  file.create({ overwrite: true });
  await file.write(zip);
  // The share sheet lets the user send it to Drive, email, Files and so on; the app keeps no copy of its own.
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Save your Smaran backup' });
}

// null when the user closed the picker without choosing a file.
export async function importBackupFile(db: Db): Promise<{ added: number; skipped: number } | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/zip'] });
  if (picked.canceled) return null;
  return importBackup(db, await picked.result.bytes(), writeThumb);
}
