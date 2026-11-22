/* =====================================================================
   WHERE THE AI FILES ARE KEPT: ANDROID
   The four AI files are kept as ordinary files in a folder called "ai" in the app's own files (the same area the card catalogue's
   folder is in). The model file is opened by the phone's own code (the text-reader add-on, see ocr.native.ts / aiModel.native.ts), which
   is why path() gives a full address; the others are read into the app when the AI first runs (aiRun.ts).
   A file is written under a temporary name first and only then moved into place, so a download that stops half way never leaves a
   half-written file where a whole one is expected.
   Downloading is done by the phone's own code, straight onto the disk (download below): the files are 42 MB together, too much to
   pass through the app's memory, and that way the download also reports how far along it is.
   ===================================================================== */

import { Directory, File, Paths } from 'expo-file-system';
import type { AiFileName } from './aiConfig';
import type { AiStore } from './aiStore';

const FOLDER = new Directory(Paths.document, 'ai');

export const aiStore: AiStore = {
  available: true,
  async has(name: AiFileName) {
    return new File(FOLDER, name).exists;
  },
  async get(name: AiFileName) {
    const file = new File(FOLDER, name);
    if (!file.exists) return null;
    return new Uint8Array(await file.arrayBuffer());
  },
  async put(name: AiFileName, bytes: Uint8Array) {
    if (!FOLDER.exists) FOLDER.create({ intermediates: true, idempotent: true });
    const next = new File(FOLDER, `${name}.next`);
    if (next.exists) next.delete();
    next.create();
    next.write(bytes);
    const current = new File(FOLDER, name);
    if (current.exists) current.delete();
    next.move(current);
  },
  async delete(name: AiFileName) {
    const file = new File(FOLDER, name);
    if (file.exists) file.delete();
  },
  // Download one file straight onto the disk as "<name>.next", reporting the bytes as they arrive. Gives the size of what arrived.
  async download(name: AiFileName, url: string, headers: Record<string, string>, onBytes: (added: number) => void) {
    if (!FOLDER.exists) FOLDER.create({ intermediates: true, idempotent: true });
    const next = new File(FOLDER, `${name}.next`);
    if (next.exists) next.delete();
    // The phone reports the total written so far; the caller wants only what each report added
    let seen = 0;
    const task = File.createDownloadTask(url, next, {
      headers,
      onProgress: ({ bytesWritten }) => {
        if (bytesWritten > seen) { onBytes(bytesWritten - seen); seen = bytesWritten; }
      },
    });
    const file = await task.downloadAsync();
    if (!file) throw new Error('The download was paused. Please try again.');
    const size = new File(FOLDER, `${name}.next`).size ?? 0;
    // (the last piece may arrive without a progress report)
    if (size > seen) onBytes(size - seen);
    return size;
  },
  // Move a finished "<name>.next" into place
  async commit(name: AiFileName) {
    const next = new File(FOLDER, `${name}.next`);
    if (!next.exists) throw new Error(`The AI file ${name} was not downloaded`);
    const current = new File(FOLDER, name);
    if (current.exists) current.delete();
    next.move(current);
  },
  // Throw a "<name>.next" away
  async discard(name: AiFileName) {
    const next = new File(FOLDER, `${name}.next`);
    if (next.exists) next.delete();
  },
  // The full address, as the phone's own code wants it: no "file://" in front
  path(name: AiFileName) {
    return new File(FOLDER, name).uri.replace(/^file:\/\//, '');
  },
};
