/* =====================================================================
   WHERE THE AI FILES ARE KEPT: ANDROID
   The four AI files are kept as ordinary files in a folder called "ai" in the app's own files (the same area the card catalogue's
   folder is in). The model file is opened by the phone's own code (the text-reader add-on, see ocr.native.ts / aiModel.native.ts), which
   is why path() gives a full address; the others are read into the app when the AI first runs (aiRun.ts).
   A file is written under a temporary name first and only then moved into place, so a download that stops half way never leaves a
   half-written file where a whole one is expected.
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
  // The full address, as the phone's own code wants it: no "file://" in front
  path(name: AiFileName) {
    return new File(FOLDER, name).uri.replace(/^file:\/\//, '');
  },
};
