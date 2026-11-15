/* =====================================================================
   DOWNLOADING A BINDER OR A LIST AS A .CSV FILE (on the web)
   Saves one binder to the computer as a .csv file: its cards
   (one per line, with the page and pocket each is in) and its name,
   cover symbol, cover color and pages, the same as its Google Drive file
   (see binderCsv.ts). Used by the download button beside the binder's
   name at the top of a binder's page (and its D key), and the one at
   the top of a list's page (a list's file: see listCsv.ts).
   (Phones have their own version, binderDownload.ts, which opens the
   phone's Share menu instead.)
   Plain TypeScript with no React in it.
   ===================================================================== */

import { binderDetails, loadBinder } from './binderStorage';
import { binderToCsv } from './binderCsv';
import { findList } from './listStorage';
import { listToCsv } from './listCsv';
import { findDeck } from './deckStorage';
import { deckToCsv } from './deckCsv';
import { deckToText } from './deckImport';

// Save the binder as it is in this browser (its newest copy: every change
// is saved here first). The file is named like "Binder 1 2026-10-16.csv".
export async function downloadBinderCsv(id: string): Promise<void> {
  const details = binderDetails(id);
  saveCsv(details.name, binderToCsv(details, loadBinder(id)));
}

// The same for a list
export async function downloadListCsv(id: string): Promise<void> {
  const list = findList(id);
  if (list) saveCsv(list.name, listToCsv(list));
}

// The same for a deck
export async function downloadDeckCsv(id: string): Promise<void> {
  const deck = findDeck(id);
  if (deck) saveCsv(deck.name, deckToCsv(deck));
}

// A binder's cards in order (page by page, pocket by pocket) as a plain list
function binderText(id: string): string {
  const cards = Object.entries(loadBinder(id))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, card]) => card);
  return deckToText({ cards });
}

// Put a plain list on the clipboard (the browser may refuse)
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error('The browser wouldn\'t let the app use the clipboard. Download the .TXT file instead.');
  }
}

// A deck, a list or a binder as a .txt file (a plain list of cards, see
// deckToText), or its plain list on the clipboard
export async function downloadDeckText(id: string): Promise<void> {
  const deck = findDeck(id);
  if (deck) saveCsv(deck.name, deckToText(deck), 'txt', 'text/plain');
}
export async function copyDeckText(id: string): Promise<void> {
  const deck = findDeck(id);
  if (deck) await copyText(deckToText(deck));
}
export async function downloadListText(id: string): Promise<void> {
  const list = findList(id);
  if (list) saveCsv(list.name, deckToText(list), 'txt', 'text/plain');
}
export async function copyListText(id: string): Promise<void> {
  const list = findList(id);
  if (list) await copyText(deckToText(list));
}
export async function downloadBinderText(id: string): Promise<void> {
  saveCsv(binderDetails(id).name, binderText(id), 'txt', 'text/plain');
}
export async function copyBinderText(id: string): Promise<void> {
  await copyText(binderText(id));
}

// Have the browser save a file (a .csv unless told otherwise) with this name
// (before the date) and text
function saveCsv(name: string, text: string, extension = 'csv', type = 'text/csv') {
  const file = new Blob([text], { type });
  // The browser saves files from a link, so make an invisible link to the
  // file's contents, "click" it, then clean up.
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  // The name (characters not allowed in file names removed), and today's date
  link.download = `${name.replace(/[\\/:*?"<>|]/g, '')} ${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);   // free the memory the file was using
}
