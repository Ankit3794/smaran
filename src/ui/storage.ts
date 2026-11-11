// How much space the library takes on the phone, for Settings and the Insights screen.
// Thumbnails are files named <save id>.jpg in a "thumbs" folder next to the database (see pipeline/thumbs.ts).
import { Directory, File, Paths } from 'expo-file-system';

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The whole thumbnails folder; a folder that can't be read just doesn't count.
export function thumbnailFolderBytes(): number {
  try {
    return new Directory(Paths.document, 'thumbs').size ?? 0;
  } catch {
    return 0;
  }
}

// The thumbnails of the given saves; saves without one add nothing.
export function thumbnailBytesFor(saveIds: number[]): number {
  let total = 0;
  for (const id of saveIds) {
    try {
      const file = new File(Paths.document, 'thumbs', `${id}.jpg`);
      if (file.exists) total += file.size ?? 0;
    } catch {
      // An unreadable file counts as nothing.
    }
  }
  return total;
}
