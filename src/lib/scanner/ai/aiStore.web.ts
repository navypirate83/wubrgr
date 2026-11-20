/* =====================================================================
   WHERE THE AI FILES ARE KEPT: THE WEBSITE
   The website keeps the four AI files in the browser's own storage ("IndexedDB"), in a store of their own that is separate from the
   card catalogue's: one database with one "shelf" of files, each kept under its name. (This is the code that used to be inside
   aiFiles.ts; moved here so Android can keep the same files as ordinary files, see aiStore.native.ts.)
   ===================================================================== */

import type { AiFileName } from './aiConfig';
import type { AiStore } from './aiStore';

const DATABASE = 'wubrgr-ai';
const STORE = 'files';

// Whether this browser has storage at all
const haveStorage = (): boolean => typeof indexedDB !== 'undefined';

// Open the database (making the shelf the first time)
function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Read, write or delete one saved file by name
async function saved(action: 'get' | 'put' | 'delete', name: string, bytes?: Uint8Array): Promise<Uint8Array | null> {
  const idb = await openIndexedDb();
  try {
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = idb.transaction(STORE, action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore(STORE);
      const request = action === 'get' ? store.get(name) : action === 'put' ? store.put(bytes, name) : store.delete(name);
      request.onsuccess = () => resolve(action === 'get' ? (request.result as Uint8Array | undefined) ?? null : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    idb.close();
  }
}

export const aiStore: AiStore = {
  available: haveStorage(),
  has: async (name: AiFileName) => (haveStorage() ? (await saved('get', name)) !== null : false),
  get: (name: AiFileName) => (haveStorage() ? saved('get', name) : Promise.resolve(null)),
  put: async (name: AiFileName, bytes: Uint8Array) => { await saved('put', name, bytes); },
  delete: async (name: AiFileName) => { if (haveStorage()) await saved('delete', name); },
  path: () => null,
};
