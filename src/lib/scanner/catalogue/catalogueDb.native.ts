/* =====================================================================
   THE DEVICE'S COPY OF THE CATALOGUE: ANDROID (and iPhone)
   The catalogue is a SQLite file kept in the app's own "SQLite" folder, and
   opened with expo-sqlite (a native module, so it needs the development or
   release build, not Expo Go). Installing a new one writes it beside the old
   one first and only then swaps them, so a download that stops half way never
   leaves the scanner without a catalogue.
   No browser-only package is used here (nothing from the web side is
   imported); the web's version is catalogueDb.web.ts.
   ===================================================================== */

import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import type { CatalogueStore } from '../core/catalogueTypes';

const NAME = 'catalogue.db';
const NEXT_NAME = 'catalogue.next.db';

// expo-sqlite looks for databases in a folder called "SQLite" in the app's files
const FOLDER = new Directory(Paths.document, 'SQLite');

let db: SQLite.SQLiteDatabase | null = null;

async function open(): Promise<boolean> {
  if (db) return true;
  if (!new File(FOLDER, NAME).exists) return false;
  db = await SQLite.openDatabaseAsync(NAME);
  return true;
}

async function close(): Promise<void> {
  const open = db;
  db = null;
  if (open) await open.closeAsync();
}

async function install(bytes: Uint8Array): Promise<void> {
  await close();
  if (!FOLDER.exists) FOLDER.create({ intermediates: true, idempotent: true });
  // Write the new file under another name, then put it in place of the old one
  const next = new File(FOLDER, NEXT_NAME);
  if (next.exists) next.delete();
  next.create();
  next.write(bytes);
  const current = new File(FOLDER, NAME);
  if (current.exists) current.delete();
  next.move(current);
  if (!(await open())) throw new Error('The catalogue was saved but could not be opened');
}

async function all(sql: string, params: (string | number)[] = []): Promise<Record<string, unknown>[]> {
  if (!db && !(await open())) throw new Error('There is no catalogue on this device yet');
  return (db as SQLite.SQLiteDatabase).getAllAsync<Record<string, unknown>>(sql, params);
}

async function remove(): Promise<void> {
  await close();
  const file = new File(FOLDER, NAME);
  if (file.exists) file.delete();
}

export const catalogueDb: CatalogueStore = { open, install, all, close, remove };
