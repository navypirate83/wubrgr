/* =====================================================================
   WHERE THE AI FILES ARE KEPT: THE SHAPE, AND THE "NOWHERE" ANSWER
   The four AI files (see aiConfig.ts) are kept differently on each kind of device: in the browser's own storage on the website
   (aiStore.web.ts) and as ordinary files in the app's folder on Android (aiStore.native.ts). The app picks the right one when it is
   built. This file says what they all offer, and is the answer anywhere that has no way to keep files.
   - available: can this device keep the files at all?
   - has: is this file saved? (without reading it: the model file is 24 MB)
   - get / put / delete: read, save or remove one file by its name
   - path: the file's full address on the phone (no "file://" in front), for the phone's own code to open; null where files are not
     ordinary files (the website)
   - download / commit / discard (Android only): download a file straight onto the phone's disk under a temporary name, then move it
     into place, or throw the temporary file away. 42 MB is too much to hold in the app's memory on a phone, and the app's ordinary
     way of asking the server gives up after a minute. The website leaves these out and downloads in pieces instead (aiFiles.ts).
   ===================================================================== */

import type { AiFileName } from './aiConfig';

export type AiStore = {
  available: boolean;
  has(name: AiFileName): Promise<boolean>;
  get(name: AiFileName): Promise<Uint8Array | null>;
  put(name: AiFileName, bytes: Uint8Array): Promise<void>;
  delete(name: AiFileName): Promise<void>;
  path(name: AiFileName): string | null;
  // Download "url" to a temporary file, telling "onBytes" how many bytes each step added; gives the finished file's size in bytes
  download?(name: AiFileName, url: string, headers: Record<string, string>, onBytes: (added: number) => void): Promise<number>;
  // Move a finished temporary file into place (replacing an older copy)
  commit?(name: AiFileName): Promise<void>;
  // Throw a temporary file away (a download that failed or came through incomplete)
  discard?(name: AiFileName): Promise<void>;
};

export const aiStore: AiStore = {
  available: false,
  has: async () => false,
  get: async () => null,
  put: async () => { throw new Error('This device cannot keep the AI files'); },
  delete: async () => undefined,
  path: () => null,
};
