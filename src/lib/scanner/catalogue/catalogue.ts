/* =====================================================================
   THE CARD CATALOGUE: USING IT (shared by Android and the website)
   The one place the scanner goes to for the catalogue (a database of every
   paper printing, its art fingerprint and its set symbol; see
   scripts/catalogue/build-catalogue.mjs). It works with no internet once the
   catalogue is on the device:
   - openCatalogue(): opens the device's copy (null if none yet)
   - checkRemote(): asks the download address whether there's a newer one
     (null if that can't be reached, so offline is never an error)
   - downloadCatalogue(): downloads, unzips and installs the newest one, with
     progress. The old one stays in use until the new one is fully saved.
   - the lookups (findPrintings, searchNames, setSymbol, artHash...): the same
     questions on both platforms (see core/catalogueQueries.ts)
   The platform's own part (where the file is kept, how it's opened) is
   catalogueDb.native.ts or catalogueDb.web.ts, picked when the app is built.
   This file imports nothing that belongs to only one platform.
   ===================================================================== */

import { gunzipSync } from 'fflate';
import { SQL, rowToPrinting, rowsToInfo } from '../core/catalogueQueries';
import { lookFromRow } from '../core/looks';
import { buildNameIndex, type NameIndex } from '../core/nameIndex';
import { SUPPORTED_SCHEMA, type CatalogueInfo, type Printing, type RemoteCatalogue, type SetInfo } from '../core/catalogueTypes';
import { normalizeName } from '../core/text';
import { CATALOGUE_URL, REFRESH_AFTER_DAYS } from './catalogueConfig';
import { catalogueDb } from './catalogueDb';

/* ---------- opening it ---------- */

// What the catalogue on this device is (null: there isn't one). Throws if there
// is one this version of the app can't read (a newer database design).
export async function openCatalogue(): Promise<CatalogueInfo | null> {
  if (!(await catalogueDb.open())) return null;
  const info = rowsToInfo(await catalogueDb.all(SQL.meta));
  if (info.schemaVersion !== SUPPORTED_SCHEMA) {
    throw new Error(`The catalogue on this device is version ${info.schemaVersion}, and this app reads version ${SUPPORTED_SCHEMA}. Download the catalogue again.`);
  }
  return info;
}

export const removeCatalogue = (): Promise<void> => catalogueDb.remove();

// Is it time to suggest a refresh? (No catalogue counts as yes.)
export function isStale(info: CatalogueInfo | null, now: number = Date.now()): boolean {
  if (!info) return true;
  const built = Date.parse(info.builtAt);
  return !Number.isFinite(built) || now - built > REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/* ---------- downloading it ---------- */

export const catalogueConfigured = (): boolean => CATALOGUE_URL !== '';

// What the newest catalogue is, from the download address. Null if there's no
// address set or it can't be reached (offline is normal, not a problem).
export async function checkRemote(): Promise<RemoteCatalogue | null> {
  if (!CATALOGUE_URL) return null;
  try {
    const response = await fetch(`${CATALOGUE_URL}/catalogue.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as RemoteCatalogue;
  } catch {
    return null;
  }
}

// Is the newest one at the download address newer than this device's?
export const isNewer = (remote: RemoteCatalogue, local: CatalogueInfo | null): boolean =>
  !local || Date.parse(remote.builtAt) > Date.parse(local.builtAt);

export type DownloadStage = 'downloading' | 'unpacking' | 'saving';

// Download the newest catalogue and install it. "onProgress" hears the stage and,
// while downloading, how far along it is (0 to 1; null when the size isn't known).
export async function downloadCatalogue(onProgress?: (stage: DownloadStage, fraction: number | null) => void): Promise<CatalogueInfo> {
  if (!CATALOGUE_URL) throw new Error('No download address is set for the catalogue (EXPO_PUBLIC_CATALOGUE_URL)');
  const remote = await checkRemote();
  if (!remote) throw new Error('The catalogue could not be reached. Check your connection and try again.');
  if (remote.schemaVersion !== SUPPORTED_SCHEMA) {
    throw new Error(`The newest catalogue is a newer design (version ${remote.schemaVersion}) than this app reads (${SUPPORTED_SCHEMA}). Update the app first.`);
  }

  // 1. the download, read in pieces so progress can be shown where the platform allows it
  onProgress?.('downloading', 0);
  const response = await fetch(`${CATALOGUE_URL}/catalogue.db.gz`);
  if (!response.ok) throw new Error(`The catalogue download failed (${response.status})`);
  const total = Number(response.headers.get('content-length')) || remote.gzipBytes || 0;
  let zipped: Uint8Array;
  const reader = response.body?.getReader?.();
  if (reader) {
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.('downloading', total ? Math.min(1, received / total) : null);
    }
    zipped = new Uint8Array(received);
    let at = 0;
    for (const chunk of chunks) { zipped.set(chunk, at); at += chunk.length; }
  } else {
    zipped = new Uint8Array(await response.arrayBuffer());
  }

  // 2. unzip it, and make sure it's the whole file
  onProgress?.('unpacking', null);
  const bytes = gunzipSync(zipped);
  if (remote.bytes && bytes.length !== remote.bytes) {
    throw new Error('The catalogue download was incomplete. Please try again.');
  }

  // 3. keep it
  onProgress?.('saving', null);
  await catalogueDb.install(bytes);
  const info = await openCatalogue();
  if (!info) throw new Error('The catalogue was saved but could not be read');
  return info;
}

/* ---------- looking things up ---------- */

// Add each printing's look (full art, showcase...) from the catalogue's "looks" table. A catalogue
// built before that table existed has none, so every printing then just gets a plain look
// (nothing is an error). Asked in batches, since a database only takes so many "?" at once.
async function withLooks(printings: Printing[]): Promise<Printing[]> {
  const found = new Map<string, Record<string, unknown>>();
  for (let start = 0; start < printings.length; start += 400) {
    const ids = printings.slice(start, start + 400).map((p) => p.id);
    try {
      const rows = await catalogueDb.all(`${SQL.looksStart}(${ids.map(() => '?').join(',')})`, ids);
      for (const row of rows) found.set(String(row.id), row);
    } catch {
      return printings.map((p) => ({ ...p, look: lookFromRow(undefined, p.border) }));
    }
  }
  return printings.map((p) => ({ ...p, look: lookFromRow(found.get(p.id), p.border) }));
}

// The printings with this set code and collector number (the English one first)
export async function findPrintings(setCode: string, collectorNumber: string, lang?: string): Promise<Printing[]> {
  const rows = await catalogueDb.all(SQL.bySetAndNumber, [setCode.toLowerCase(), collectorNumber]);
  const printings = await withLooks(rows.map(rowToPrinting));
  return lang ? [...printings.filter((p) => p.lang === lang.toLowerCase()), ...printings.filter((p) => p.lang !== lang.toLowerCase())] : printings;
}

// Every printing of a card by its (front) name, spelled any way (case, accents and punctuation don't matter)
export async function printingsNamed(name: string): Promise<Printing[]> {
  const plain = normalizeName(name.split(' // ')[0]);
  const rows = await catalogueDb.all(SQL.byFrontName, [plain]);
  if (rows.length > 0) return withLooks(rows.map(rowToPrinting));
  // Not a card's real name: maybe a flavor name printed on it (like Croft Manor on a Command Tower).
  // That gives just the printing(s) wearing that name. An older catalogue has no such table.
  try {
    return withLooks((await catalogueDb.all(SQL.byFlavorName, [plain])).map(rowToPrinting));
  } catch {
    return [];
  }
}

// Every printing wearing one artwork (the AI's guess at a card from its picture alone gives artwork ids, not names)
export async function printingsWithArt(illustrationId: string): Promise<Printing[]> {
  return withLooks((await catalogueDb.all(SQL.byIllustration, [illustrationId, illustrationId])).map(rowToPrinting));
}

// Printings whose front name starts with this (for typing a name in)
export async function searchNames(start: string, limit = 25): Promise<Printing[]> {
  const normal = normalizeName(start);
  if (!normal) return [];
  return withLooks((await catalogueDb.all(SQL.byFrontNameStart, [`${normal.replace(/[%_]/g, '')}%`, limit])).map(rowToPrinting));
}

// Every set code in the catalogue (lowercase)
export async function setCodes(): Promise<string[]> {
  return (await catalogueDb.all(SQL.setCodes)).map((r) => String(r.code));
}

// Every set, newest first, for the scanner's "lock to a set" choice
export async function allSets(): Promise<SetInfo[]> {
  return (await catalogueDb.all(SQL.allSets)).map((r) => ({
    code: String(r.code),
    name: String(r.name ?? r.code),
    released: typeof r.released === 'string' ? r.released : '',
    icon: typeof r.icon_url === 'string' && r.icon_url !== '' ? r.icon_url : null,
  }));
}

// Every card's front name in the plain form for matching (about 30,000), kept after
// the first time it's asked for, for the scanner's fuzzy name matching
let frontNames: string[] | null = null;
export async function allFrontNames(): Promise<string[]> {
  if (!frontNames) {
    const names = (await catalogueDb.all(SQL.frontNames)).map((r) => String(r.front_norm));
    // plus the flavor names printed on some cards (an older catalogue has none)
    try {
      const flavor = (await catalogueDb.all(SQL.flavorNames)).map((r) => String(r.flavor_norm));
      frontNames = [...new Set([...names, ...flavor])];
    } catch {
      frontNames = names;
    }
  }
  return frontNames;
}

// A quick-lookup index over the same names (see core/nameIndex.ts), built from the list once and kept, so a read
// name is only carefully compared with the few names that could be close. If anything goes wrong building it,
// the caller falls back to comparing against the plain list.
let frontNameIndex: NameIndex | null = null;
export async function allFrontNameIndex(): Promise<NameIndex> {
  if (!frontNameIndex) frontNameIndex = buildNameIndex(await allFrontNames());
  return frontNameIndex;
}

// A set's symbol as a 64 x 64 black-and-white bitmap (1 bit a pixel, 1 = dark,
// row by row, 8 pixels to a byte, the first pixel in the top bit), or null
export async function setSymbol(code: string): Promise<Uint8Array | null> {
  const [row] = await catalogueDb.all(SQL.setSymbol, [code.toLowerCase()]);
  const symbol = row?.symbol;
  return symbol instanceof Uint8Array ? symbol : symbol ? new Uint8Array(symbol as ArrayLike<number>) : null;
}

// An artwork's 256-bit fingerprint (see core/phash.ts), or null if it has none
export async function artHashFor(illustrationId: string): Promise<Uint8Array | null> {
  const [row] = await catalogueDb.all(SQL.artHash, [illustrationId]);
  const hash = row?.hash;
  return hash instanceof Uint8Array ? hash : hash ? new Uint8Array(hash as ArrayLike<number>) : null;
}
