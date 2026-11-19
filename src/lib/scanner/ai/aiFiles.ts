/* =====================================================================
   THE AI FILES ON THIS DEVICE: CHECKING, DOWNLOADING, KEEPING
   The website keeps the four AI files (see aiConfig.ts) in the browser's own
   storage ("IndexedDB"), in a store of their own that is separate from the
   card catalogue's. This file:
   - aiReady(): are all four files saved here? (false in the Android app, which
     has no browser storage and, for now, no AI)
   - checkAiRemote(): reads the download folder's ai.json (null if it can't be reached)
   - downloadAiFiles(): downloads every file, with progress, checks each one's
     size (and its checksum when the browser can work one out) and saves it
   - readAiFile(): gives back a saved file's bytes
   - removeAiFiles(): deletes them
   Everything that can go wrong ends up as a thrown message or a "no", and the
   scanner then just works the way it did before the AI existed.
   ===================================================================== */

import { AI_FILE_NAMES, AI_URL, SUPPORTED_AI_VERSION, type AiFileName, type AiManifest } from './aiConfig';

// The browser's saved-file store: one database with one "shelf" of files, each kept under its name
const DATABASE = 'wubrgr-ai';
const STORE = 'files';

// Whether this device has browser storage at all (the Android app does not)
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

// What we already worked out about whether the files are there (so asking again is quick).
// Forgotten whenever something is downloaded or removed.
let readyKnown: boolean | null = null;

// Are all four files saved on this device?
export async function aiReady(): Promise<boolean> {
  if (!haveStorage()) return false;
  if (readyKnown !== null) return readyKnown;
  try {
    for (const name of AI_FILE_NAMES) if (!(await saved('get', name))) return (readyKnown = false);
    return (readyKnown = true);
  } catch {
    return false;
  }
}

// The bytes of one saved file (null if it isn't there)
export async function readAiFile(name: AiFileName): Promise<Uint8Array | null> {
  if (!haveStorage()) return null;
  return saved('get', name);
}

// What the download folder says the files are (null: no address, can't be reached, or a design this app doesn't know)
export async function checkAiRemote(): Promise<AiManifest | null> {
  try {
    const response = await fetch(`${AI_URL}/ai.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = (await response.json()) as AiManifest;
    if (!manifest || typeof manifest !== 'object' || manifest.version > SUPPORTED_AI_VERSION || !manifest.files) return null;
    return manifest;
  } catch {
    return null;
  }
}

// The checksum ("sha256": a long code that changes if even one byte changes) of some bytes, in lowercase
// letters and digits, or null if this browser can't work it out (it needs a secure page)
async function checksum(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Download one file, reading it in pieces so progress can be reported. "onBytes" hears how many bytes each new piece added.
async function fetchFile(name: AiFileName, onBytes: (added: number) => void): Promise<Uint8Array> {
  const response = await fetch(`${AI_URL}/${name}`);
  if (!response.ok) throw new Error(`The AI file ${name} could not be downloaded (${response.status})`);
  const reader = response.body?.getReader?.();
  if (!reader) {
    const whole = new Uint8Array(await response.arrayBuffer());
    onBytes(whole.length);
    return whole;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(value.length);
  }
  const whole = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) { whole.set(chunk, at); at += chunk.length; }
  return whole;
}

// Download all four files and save them. "onProgress" hears how far along the whole download is (0 to 1).
// Nothing is saved until every file has arrived whole, so a broken download leaves the old files as they were.
export async function downloadAiFiles(onProgress?: (fraction: number) => void): Promise<void> {
  if (!haveStorage()) throw new Error('This device cannot keep the AI files');
  const manifest = await checkAiRemote();
  if (!manifest) throw new Error('The AI files could not be reached. Check your connection and try again.');
  const total = AI_FILE_NAMES.reduce((sum, name) => sum + (manifest.files[name]?.bytes ?? 0), 0);
  let received = 0;
  const arrived: { name: AiFileName; bytes: Uint8Array }[] = [];
  for (const name of AI_FILE_NAMES) {
    const listed = manifest.files[name];
    if (!listed) throw new Error(`The AI file list has no ${name}`);
    const bytes = await fetchFile(name, (added) => { received += added; onProgress?.(total ? Math.min(1, received / total) : 0); });
    // Check it is the whole file, and the same file that was listed
    if (bytes.length !== listed.bytes) throw new Error(`The AI file ${name} came through incomplete. Please try again.`);
    if (listed.sha256) {
      const sum = await checksum(bytes);
      if (sum && sum !== listed.sha256.toLowerCase()) throw new Error(`The AI file ${name} did not match its checksum. Please try again.`);
    }
    arrived.push({ name, bytes });
  }
  // Ask the browser to keep the files (it may say no; they still work until it clears them)
  try { await navigator.storage?.persist?.(); } catch { /* not allowed here */ }
  readyKnown = null;
  for (const { name, bytes } of arrived) await saved('put', name, bytes);
  readyKnown = null;
}

// Delete the saved AI files
export async function removeAiFiles(): Promise<void> {
  if (!haveStorage()) return;
  for (const name of AI_FILE_NAMES) await saved('delete', name);
  readyKnown = null;
}
