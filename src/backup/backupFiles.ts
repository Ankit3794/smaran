// The phone side of backups, used by the Settings screen: saves the export zip into a folder the user picks (or
// hands it to the Android share sheet), and lets the user pick a zip to import. The zip format itself lives in backup.ts.
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

function backupFileName(): string {
  return `smaran-backup-${new Date().toISOString().slice(0, 10)}.zip`;
}

// A readable name for a folder the picker returned, e.g. ".../tree/primary%3ADocuments%2FSmaran" -> "Smaran".
export function folderLabel(folderUri: string): string {
  const path = decodeURIComponent(folderUri);
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf(':')) + 1) || 'the folder you chose';
}

// Opens Android's folder picker (starting at `startFolderUri`, the folder used last time) and writes the zip there.
// Returns the folder and file name, or null when the user closed the picker. Android may add " (1)" to the name if
// a backup from the same day is already in that folder.
export async function saveBackupToFolder(db: Db, startFolderUri?: string): Promise<{ folderUri: string; fileName: string } | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync(startFolderUri);
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_PICKER_CANCELLED') return null;
    throw error;
  }
  const zip = await exportBackup(db, readThumb);
  const fileName = backupFileName();
  const file = folder.createFile(fileName, 'application/zip');
  await file.write(zip);
  return { folderUri: folder.uri, fileName };
}

// Writes the zip to the cache and opens the share sheet, so it can go to Drive, email and so on.
// The app keeps no copy of its own.
export async function shareBackupFile(db: Db): Promise<void> {
  const zip = await exportBackup(db, readThumb);
  const file = new File(Paths.cache, backupFileName());
  file.create({ overwrite: true });
  await file.write(zip);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Send your Smaran backup' });
}

// null when the user closed the picker without choosing a file.
export async function importBackupFile(db: Db): Promise<{ added: number; skipped: number } | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/zip'] });
  if (picked.canceled) return null;
  return importBackup(db, await picked.result.bytes(), writeThumb);
}
