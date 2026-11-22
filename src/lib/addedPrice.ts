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
   Which price: the store chosen in Settings. Cardmarket gives a price in
   euros; TCGplayer and Card Kingdom both record TCGplayer's price in
   dollars (Card Kingdom's price list is a separate big download, too slow
   to wait for every time a card is added).
   CARDS FROM BEFORE: a card that has no price (it was added before prices
   were recorded, or with no internet) gets TODAY'S price the next time its
   binder or list is opened, so its price tracking starts from that day.
   THE RULE: a price that is already there is never changed. A card that
   came in from a file with its own Purchase price keeps it, a card moved
   between binders keeps it, and a second copy of a printing you already
   have keeps the first copy's price.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { currentSettings } from './settings';
import { loadPrintings, type ScryfallCard } from './scryfall';
import { finishOf } from './cardDetails';
import { copyPrice, currencyOf } from './prices';
import type { BinderCard, BinderCards } from './binderStorage';
import type { Finish } from './cards';

// The two names the price is kept under in a card's notes (ManaBox's column names)
export const PRICE_NOTE = 'Purchase price';
export const CURRENCY_NOTE = 'Purchase price currency';

// The notes to add to a card being added now: this printing's price today for this finish (regular, foil
// or etched). Empty when the store has no price for it, so nothing wrong is ever written.
export function addedPriceNotes(print: ScryfallCard, finish: Finish): Record<string, string> {
  const store = currentSettings().priceStore === 'cardmarket' ? 'cardmarket' : 'tcgplayer';
  const price = copyPrice(store, print, finish);
  if (price === null) return {};
  const currency = currencyOf(store);
  return { [PRICE_NOTE]: price.toFixed(2), ...(currency !== 'USD' ? { [CURRENCY_NOTE]: currency } : {}) };
}

// Does this card already have its price written down?
const hasPrice = (card: BinderCard) => Boolean(card.extra?.[PRICE_NOTE]);

// One card with today's price written on it, if it has none yet and its printing is known and has a price.
// Otherwise the very same card comes back (so the caller can tell nothing changed).
export function withAddedPrice<T extends BinderCard>(card: T, print: ScryfallCard | undefined): T {
  if (hasPrice(card) || !print) return card;
  const notes = addedPriceNotes(print, finishOf(card));
  return Object.keys(notes).length > 0 ? { ...card, extra: { ...card.extra, ...notes } } : card;
}

// A binder's cards with today's price written on every card that has none (the cards from before prices
// were recorded), from their printings (looked up by "set/number" in lowercase). Returns the new set of
// cards, or null if nothing changed.
export function fillMissingPrices(cards: BinderCards, printings: Map<string, ScryfallCard>): BinderCards | null {
  let changed = false;
  const next: BinderCards = {};
  for (const [key, card] of Object.entries(cards)) {
    next[key] = withAddedPrice(card, printings.get(`${card.set}/${card.number}`.toLowerCase()));
    if (next[key] !== card) changed = true;
  }
  return changed ? next : null;
}

// For cards made WITHOUT their Scryfall details at hand (scanned cards, imported decklists, a deck's card
// being put in a binder): look their printings up, and write today's price on each one that has none yet.
// Gives back the cards in the same order. It never fails: if the prices can't be looked up (no internet,
// say) the cards come back as they were, just without a price, so adding a card always still works.
export async function fillAddedPrices<T extends BinderCard>(cards: T[]): Promise<T[]> {
  const need = cards.filter((card) => !hasPrice(card) && card.set && card.number);
  if (need.length === 0) return cards;
  try {
    const prints = await loadPrintings(need.map((card) => ({ set: card.set, number: card.number })));
    return cards.map((card) => withAddedPrice(card, prints.get(`${card.set}/${card.number}`.toLowerCase())));
  } catch {
    return cards;
  }
}
