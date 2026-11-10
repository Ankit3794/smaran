// Downloads a save's preview image into app storage so the timeline can show it offline.
// Called by process.ts after a successful fetch; a failed download never fails the save.
import { Directory, File, Paths } from 'expo-file-system';

export async function downloadThumb(imageUrl: string, saveId: number): Promise<string | null> {
  try {
    const thumbsDirectory = new Directory(Paths.document, 'thumbs');
    thumbsDirectory.create({ idempotent: true, intermediates: true });
    const file = await File.downloadFileAsync(imageUrl, new File(thumbsDirectory, `${saveId}.jpg`), { idempotent: true });
    return file.uri;
  } catch {
    return null;
  }
}
