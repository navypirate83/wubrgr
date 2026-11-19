/* =====================================================================
   THE DEVICE'S COPY OF THE CATALOGUE: ANDROID (and iPhone)
   The catalogue is a SQLite file kept in the app's own "SQLite" folder. It is opened and asked
   questions by OUR OWN add-on (modules/card-text-reader: catalogueOpen / catalogueQuery /
   catalogueClose, which use the phone's built-in database code). The "expo-sqlite" package is no
   longer used: it could not be found on the user's phone and closed the whole app.
   Installing a new catalogue writes it beside the old one first and only then swaps them, so a
   download that stops half way never leaves the scanner without a catalogue.
   If the add-on is missing from this version of the app (an older build), or the catalogue can't be
   opened, every function here throws a plain Error with a readable message: the Scan screen shows
   it and still opens.
   No browser-only package is used here; the web's version is catalogueDb.web.ts.
   ===================================================================== */

import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import type { CatalogueStore } from '../core/catalogueTypes';
import { parseCatalogueRows } from '../core/catalogueRows';

// The file's name, and the name it is first written under while a new one is installed
const NAME = 'catalogue.db';
const NEXT_NAME = 'catalogue.next.db';

// The catalogue lives in a folder called "SQLite" in the app's files (the same place as before, so a catalogue
// that was already downloaded is found and does not need downloading again)
const FOLDER = new Directory(Paths.document, 'SQLite');

// What the add-on offers for the catalogue (see CardTextReaderModule.kt and CatalogueReader.kt)
type CatalogueAddOn = {
  catalogueOpen(path: string): Promise<boolean>;
  catalogueClose(): Promise<void>;
  // The values for the question's "?" places are sent as JSON text so each keeps its kind (number or text)
  catalogueQuery(sql: string, paramsJson: string): Promise<string>;
};

// The add-on, found the first time it is needed (never when the Scan screen opens)
let addOn: CatalogueAddOn | null = null;
function reader(): CatalogueAddOn {
  if (!addOn) {
    let found: Partial<CatalogueAddOn> | null = null;
    try { found = requireOptionalNativeModule<Partial<CatalogueAddOn>>('CardTextReader'); } catch { found = null; }
    if (!found || typeof found.catalogueOpen !== 'function' || typeof found.catalogueQuery !== 'function' || typeof found.catalogueClose !== 'function') {
      throw new Error("The phone's card reader add-on is missing from this version of the app, so the card catalogue can't be opened. Install the newest Android build.");
    }
    addOn = found as CatalogueAddOn;
  }
  return addOn;
}

// Is the catalogue open right now?
let isOpen = false;

// The file's full path as the phone's own code wants it: no "file://" in front
function filePath(name: string): string {
  return new File(FOLDER, name).uri.replace(/^file:\/\//, '');
}

// An opening that is under way (so two questions asked at the same moment open the file only once)
let opening: Promise<boolean> | null = null;

// Open the saved catalogue. False if there isn't one yet.
async function open(): Promise<boolean> {
  if (isOpen) return true;
  if (!new File(FOLDER, NAME).exists) return false;
  if (!opening) {
    opening = reader().catalogueOpen(decodeURI(filePath(NAME))).then(() => { isOpen = true; return true; }).finally(() => { opening = null; });
  }
  return opening;
}

// Close it (the saved file stays)
async function close(): Promise<void> {
  const wasOpen = isOpen;
  isOpen = false;
  if (wasOpen) await reader().catalogueClose();
}

// Replace the saved catalogue with this one (write beside the old, then swap), and open it
async function install(bytes: Uint8Array): Promise<void> {
  await close();
  if (!FOLDER.exists) FOLDER.create({ intermediates: true, idempotent: true });
  const next = new File(FOLDER, NEXT_NAME);
  if (next.exists) next.delete();
  next.create();
  next.write(bytes);
  const current = new File(FOLDER, NAME);
  if (current.exists) current.delete();
  next.move(current);
  if (!(await open())) throw new Error('The catalogue was saved but could not be opened');
}

// Run a SELECT and give back its rows as objects keyed by column name
async function all(sql: string, params: (string | number)[] = []): Promise<Record<string, unknown>[]> {
  if (!isOpen && !(await open())) throw new Error('There is no catalogue on this device yet');
  return parseCatalogueRows(await reader().catalogueQuery(sql, JSON.stringify(params)));
}

// Delete the saved catalogue
async function remove(): Promise<void> {
  await close();
  const file = new File(FOLDER, NAME);
  if (file.exists) file.delete();
}

export const catalogueDb: CatalogueStore = { open, install, all, close, remove };
