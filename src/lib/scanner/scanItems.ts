/* =====================================================================
   SCANNED CARDS, AND ADDING THEM TO A BINDER (shared by Android and the website)
   A "scanned card" is one card (or several copies of it) the scanner has
   identified: the printing, the language and finish the person wants, how many,
   and whether it still needs a look ("pick" a printing, or "fix" a card that
   couldn't be read). The scanner keeps a list of them: in one-card mode the list
   has the one card on the confirm sheet; in stack mode it's the running list.
   addScansToBinder puts them in a binder the way the app always does:
   a printing already in the binder gets more copies, and the rest go into the first
   empty pockets, page by page, adding as many pages as it takes (see
   placeInBinder in collectionImport.ts).
   The card is saved with the same details the Card Finder saves (rarity, colours,
   type, mana value, release date...), from the catalogue, so it sorts correctly
   even if it's scanned with no internet.
   Plain TypeScript with no React in it.
   ===================================================================== */

import {
  binderPages, isLocalMode, loadBinderList, saveBinder, saveBinderList, type BinderCard,
} from '@/lib/binderStorage';
import { placeInBinder } from '@/lib/collectionImport';
import { isSignedIn, signInWithGoogle, syncBinder } from '@/lib/googleDrive';
import type { Finish } from '@/lib/cards';
import type { Printing } from './core/catalogueTypes';
import type { ScanReading } from './core/scannerTypes';

export type ScanItem = {
  id: string;
  printing: Printing;
  lang: string;                         // the language the person has (Scryfall's code)
  finish: Finish;
  count: number;
  flag: 'pick' | 'fix' | null;          // a printing still to choose ("pick"), or a card that couldn't be read ("fix")
  candidates: Printing[];               // the other printings it could be (for fixing it)
  matched?: number;                     // how many of the first candidates fit the clues (the rest are listed as "other printings")
  reading: ScanReading | null;
};

let counter = 0;
export const newScanId = (): string => `scan-${Date.now().toString(36)}-${(counter++).toString(36)}`;

// The finishes a printing comes in, as the app names them (not foil first)
export function finishesOf(printing: Printing): Finish[] {
  const order: Finish[] = ['nonfoil', 'foil', 'etched'];
  const made = order.filter((f) => printing.finishes.includes(f));
  return made.length ? made : ['nonfoil'];
}

// The next finish when the button is tapped: through the ones the printing comes in
export function nextFinishOf(printing: Printing, current: Finish): Finish {
  const made = finishesOf(printing);
  return made[(made.indexOf(current) + 1) % made.length];
}

// The finish to start with: not foil if the printing has it, otherwise what it does come in
export const startingFinish = (printing: Printing): Finish => finishesOf(printing)[0];

// The notes a card carries (the same as the Card Finder saves: see cardDetails.ts), from the catalogue's details
export function detailsFromPrinting(p: Printing): Record<string, string> {
  const details: Record<string, string> = { 'Set name': p.setName };
  if (p.rarity) details.Rarity = p.rarity;
  details.Colors = p.colors || 'C';
  const type = p.typeLine.split('//')[0].trim();
  if (type) details.Type = type.slice(0, 190);
  details['Mana value'] = String(p.cmc);
  if (p.released) details.Released = p.released;
  details['Mana cost'] = p.manaCost || 'none';
  return details;
}

// The card as a binder keeps it
export function binderCardFrom(item: ScanItem): BinderCard {
  const p = item.printing;
  const extra = detailsFromPrinting(p);
  if (item.finish === 'etched') extra.Foil = 'etched';
  return {
    name: p.name,
    set: p.setCode,
    number: p.collectorNumber,
    face: 0,
    image: p.image ?? '',
    // A language is only saved when it isn't the printing's own
    lang: item.lang && item.lang !== p.lang ? item.lang : undefined,
    count: item.count > 1 ? item.count : undefined,
    foil: item.finish !== 'nonfoil' ? true : undefined,
    added: new Date().toISOString(),
    extra,
  };
}

// Put the scanned cards in a binder. Gives back how many copies went in and how many pages were added.
export async function addScansToBinder(binderId: string, items: ScanItem[]): Promise<{ copies: number; pagesAdded: number }> {
  // Signed in to Google when that's how the binders are kept (the same as moving a card between binders)
  if (!isLocalMode() && !isSignedIn()) await signInWithGoogle();
  // The binder's latest cards (and send this device's changes to it first)
  const existing = await syncBinder(binderId);
  const pagesBefore = binderPages(binderId);
  const placed = placeInBinder(existing, pagesBefore, items.map(binderCardFrom));
  // A binder that needed more pages has them now
  if (placed.pages !== pagesBefore) {
    saveBinderList(loadBinderList().map((b) => (b.id === binderId ? { ...b, pages: placed.pages } : b)));
  }
  saveBinder(placed.cards, binderId);   // kept on this device (marked "needs saving")...
  await syncBinder(binderId);           // ...and saved to Drive
  return { copies: items.reduce((sum, item) => sum + item.count, 0), pagesAdded: placed.pages - pagesBefore };
}
