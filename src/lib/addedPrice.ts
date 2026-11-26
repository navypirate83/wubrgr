/* =====================================================================
   THE PRICE OF A CARD ON THE DAY IT WAS ADDED
   When a card is added to a binder or a list, its price at that moment is
   written in the card's notes ("extra"), under the same two names ManaBox
   uses in its files:
     - "Purchase price":          the price as text, like "1.25"
     - "Purchase price currency": only written when it is EUR (USD is the
                                  usual value, so it is left out to keep
                                  the card small)
   Both are columns of the binder's and the list's .csv file (see
   binderCsv.ts and listCsv.ts), so the price travels with the card and can
   be compared with today's price later.
   ALL EIGHT PRICES: as well as that one, a third note, "Added prices",
   keeps every price the app shows (see lib/prices.ts and priceChange.ts).
   "Purchase price" itself is TCGplayer's Market price in dollars, or
   Cardmarket's Trend price in euros when Cardmarket is the price store.
   CARDS FROM BEFORE: a card without them (added before they were recorded,
   or with no internet) gets TODAY'S prices the next time its binder or list
   is opened, so their tracking starts from that day (which is written down).
   A price it already had stays as it is.
   THE RULE: a price that is already there is never changed. A card that
   came in from a file with its own Purchase price keeps it, a card moved
   between binders keeps it, and a second copy of a printing you already
   have keeps the first copy's price.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { currentSettings } from './settings';
import { loadPrintings, type ScryfallCard } from './scryfall';
import { finishOf } from './cardDetails';
import { loadPriceBook, priceValues, pricesSoFar, type PriceBook } from './prices';
import { ADDED_NOTE, writeAdded } from './priceChange';
import type { BinderCard, BinderCards } from './binderStorage';
import type { Finish } from './cards';

// The two names the price is kept under in a card's notes (ManaBox's column names)
export const PRICE_NOTE = 'Purchase price';
export const CURRENCY_NOTE = 'Purchase price currency';
export { ADDED_NOTE };

// Which of the eight is the "Purchase price": Cardmarket Trend (5) or TCGplayer Market (0)
const mainSlot = () => (currentSettings().priceStore === 'cardmarket' ? 5 : 0);

// Today, like "2026-11-26" (by this device's clock)
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The "Purchase price" notes for a price (nothing when there is none)
function mainNotes(price: number | null, slot: number): Record<string, string> {
  if (price === null) return {};
  return { [PRICE_NOTE]: price.toFixed(2), ...(slot === 5 ? { [CURRENCY_NOTE]: 'EUR' } : {}) };
}

// The notes to add to a card being added now: this printing's prices today for this finish (regular, foil
// or etched). Empty when there are no prices, so nothing wrong is ever written. All eight are written only
// when this set's price file has already arrived (otherwise they're filled in later: see above).
export function addedPriceNotes(print: ScryfallCard, finish: Finish, book: PriceBook = pricesSoFar()): Record<string, string> {
  const values = priceValues(print, finish, book);
  const slot = mainSlot();
  const all = book.has(print.id) && values.some((v) => v !== null);
  return { ...mainNotes(values[slot], slot), ...(all ? { [ADDED_NOTE]: writeAdded(values) } : {}) };
}

// One card with the prices it is missing written on it. "fresh" = the card is being added right now (so
// its prices are from the day it was added). Otherwise the day is written down with them. Gives back the
// very same card when nothing changes (so the caller can tell).
export function withAddedPrice<T extends BinderCard>(card: T, print: ScryfallCard | undefined, book?: PriceBook, fresh = false): T {
  if (card.extra?.[ADDED_NOTE] || !print) return card;
  const had = card.extra?.[PRICE_NOTE];
  const finish = finishOf(card);
  // No price file for it: only the one main price can be written (if there's none yet)
  if (!book?.has(print.id)) {
    if (had) return card;
    const notes = addedPriceNotes(print, finish, new Map());
    return Object.keys(notes).length > 0 ? { ...card, extra: { ...card.extra, ...notes } } : card;
  }
  const values = priceValues(print, finish, book);
  if (had) {
    // The price it already has takes its own place among the eight, unchanged
    const original = card.extra?.[CURRENCY_NOTE] === 'EUR' ? 5 : 0;
    if (Number.isFinite(Number(had))) values[original] = Number(had);
    return { ...card, extra: { ...card.extra, [ADDED_NOTE]: writeAdded(values, today(), original) } };
  }
  if (!values.some((v) => v !== null)) return card;
  const slot = mainSlot();
  return {
    ...card,
    extra: { ...card.extra, ...mainNotes(values[slot], slot), [ADDED_NOTE]: writeAdded(values, fresh ? undefined : today()) },
  };
}

// RESET VALUE: one card with today's prices written as the ones it was added at, replacing any it had.
// Gives back the very same card when the printing is unknown or has no price (the old ones are kept
// rather than blanked), so the caller can count how many were skipped.
export function withResetPrice<T extends BinderCard>(card: T, print: ScryfallCard | undefined, book?: PriceBook): T {
  if (!print) return card;
  const notes = addedPriceNotes(print, finishOf(card), book ?? new Map());
  if (Object.keys(notes).length === 0) return card;
  // (A price in euros adds a currency note; one in dollars must not keep an old euro note)
  const { [CURRENCY_NOTE]: _oldCurrency, [ADDED_NOTE]: _oldAll, ...rest } = card.extra ?? {};
  return { ...card, extra: { ...rest, ...notes } };
}

// The printings of these cards and their sets' price files
async function lookUp(cards: BinderCard[]) {
  const [prints, book] = await Promise.all([
    loadPrintings(cards.map((card) => ({ set: card.set, number: card.number }))),
    loadPriceBook(cards.map((card) => card.set)),
  ]);
  return { prints, book };
}
// How a card's printing is looked up: "set/number" in lowercase
const printKey = (card: BinderCard) => `${card.set}/${card.number}`.toLowerCase();

// Reset the value of every card in this set of cards (a binder's or a list's, as a list of cards): each one's
// added prices become today's. Gives back the new cards and how many were reset and skipped. Looks the
// printings up (and so can fail without internet: then it throws, and nothing is changed).
export async function resetPrices<T extends BinderCard>(cards: T[]): Promise<{ cards: T[]; reset: number; skipped: number }> {
  const known = cards.filter((card) => card.set && card.number);
  const { prints, book } = known.length > 0 ? await lookUp(known) : { prints: new Map<string, ScryfallCard>(), book: new Map() as PriceBook };
  let reset = 0;
  const next = cards.map((card) => {
    const changed = withResetPrice(card, prints.get(printKey(card)), book);
    if (changed !== card) reset++;
    return changed;
  });
  return { cards: next, reset, skipped: cards.length - reset };
}

// A binder's cards with the missing prices written on every card, from their printings (looked up by
// "set/number" in lowercase) and price files. Returns the new set of cards, or null if nothing changed.
export function fillMissingPrices(cards: BinderCards, printings: Map<string, ScryfallCard>, book?: PriceBook): BinderCards | null {
  let changed = false;
  const next: BinderCards = {};
  for (const [key, card] of Object.entries(cards)) {
    next[key] = withAddedPrice(card, printings.get(printKey(card)), book);
    if (next[key] !== card) changed = true;
  }
  return changed ? next : null;
}

// For cards made WITHOUT their Scryfall details at hand (scanned cards, imported decklists, a deck's card
// being put in a binder): look their printings up, and write today's prices on each one that is missing them.
// Gives back the cards in the same order. It never fails: if the prices can't be looked up (no internet,
// say) the cards come back as they were, just without them, so adding a card always still works.
export async function fillAddedPrices<T extends BinderCard>(cards: T[]): Promise<T[]> {
  const need = cards.filter((card) => !card.extra?.[ADDED_NOTE] && card.set && card.number);
  if (need.length === 0) return cards;
  try {
    const { prints, book } = await lookUp(need);
    // A card with no price at all is being added now; one that has a price was added earlier
    return cards.map((card) => withAddedPrice(card, prints.get(printKey(card)), book, !card.extra?.[PRICE_NOTE]));
  } catch {
    return cards;
  }
}
