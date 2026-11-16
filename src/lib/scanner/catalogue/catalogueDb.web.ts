/* =====================================================================
   THE DEVICE'S COPY OF THE CATALOGUE: THE WEBSITE
   Evaluated against expo-sqlite's web support: expo-sqlite on the web needs the
   page to be served with two special headers (Cross-Origin-Opener-Policy and
   Cross-Origin-Embedder-Policy, for SharedArrayBuffer), and GitHub Pages, where
   the site lives, can't send headers. So the website uses sql.js (SQLite
   compiled to WebAssembly), which needs none, and keeps the database file in
   the browser's IndexedDB so it's there offline. The catalogue is only ever
   read, so sql.js holding the whole file in memory (about 50 MB) is fine.
   sql.js is loaded only when the scanner (or its catalogue page) needs it: a
   script tag is added then, from the files in public/sqljs/ (copies of sql.js's
   own, committed so they match the version in package.json), so nothing from
   it ends up in the app's main download. Nothing native is imported here; the
   Android version is catalogueDb.native.ts.
   The browser may delete saved files when the device is short of space, so
   when the catalogue is saved it asks the browser to keep it
   (navigator.storage.persist).
   ===================================================================== */

import type { Database, SqlJsStatic } from 'sql.js';
import type { CatalogueStore } from '../core/catalogueTypes';

const DATABASE = 'wubrgr-catalogue';
const STORE = 'files';
const KEY = 'catalogue.db';

/* ---------- the browser's saved file (IndexedDB) ---------- */

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savedFile(action: 'get' | 'put' | 'delete', bytes?: Uint8Array): Promise<Uint8Array | null> {
  const idb = await openIndexedDb();
  try {
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = idb.transaction(STORE, action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore(STORE);
      const request = action === 'get' ? store.get(KEY) : action === 'put' ? store.put(bytes, KEY) : store.delete(KEY);
      request.onsuccess = () => resolve(action === 'get' ? (request.result as Uint8Array | undefined) ?? null : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    idb.close();
  }
}

/* ---------- sql.js, loaded the first time it's needed ---------- */

// sql.js's own script puts "initSqlJs" on the page
const pageInit = (): ((config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>) | undefined =>
  (globalThis as unknown as { initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic> }).initSqlJs;

let sqlJs: Promise<SqlJsStatic> | null = null;

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(script);
  });
}

// The folder sql.js's files are in. The site lives in a folder of its own on
// GitHub Pages (/wubrgr/) but at the top while developing, so try both.
function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJs) {
    sqlJs = (async () => {
      const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');
      let folder = '';
      for (const candidate of [`${base}/sqljs`, '/sqljs']) {
        try { await addScript(`${candidate}/sql-wasm.js`); folder = candidate; break; } catch { /* try the next */ }
      }
      const init = pageInit();
      if (!folder || !init) throw new Error('The database library (sql.js) could not be loaded');
      return init({ locateFile: (file) => `${folder}/${file}` });
    })();
    sqlJs.catch(() => { sqlJs = null; });
  }
  return sqlJs;
}

/* ---------- the store ---------- */

let db: Database | null = null;

async function openWith(bytes: Uint8Array): Promise<void> {
  const SQL = await loadSqlJs();
  db?.close();
  db = new SQL.Database(bytes);
}

async function open(): Promise<boolean> {
  if (db) return true;
  const bytes = await savedFile('get');
  if (!bytes) return false;
  await openWith(bytes);
  return true;
}

async function install(bytes: Uint8Array): Promise<void> {
  // Ask the browser to keep the file (it may say no; the catalogue still works)
  try { await navigator.storage?.persist?.(); } catch { /* not allowed here */ }
  await savedFile('put', bytes);
  await openWith(bytes);
}

async function all(sql: string, params: (string | number)[] = []): Promise<Record<string, unknown>[]> {
  if (!db && !(await open())) throw new Error('There is no catalogue in this browser yet');
  const statement = (db as Database).prepare(sql);
  try {
    statement.bind(params);
    const rows: Record<string, unknown>[] = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

async function close(): Promise<void> {
  db?.close();
  db = null;
}

async function remove(): Promise<void> {
  await close();
  await savedFile('delete');
}

export const catalogueDb: CatalogueStore = { open, install, all, close, remove };
