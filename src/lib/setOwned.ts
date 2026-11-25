/* =====================================================================
   WHAT YOU OWN, FOR A SET'S PAGE (the Card Finder's Sets tab)
   The set page can sort by "Owned first" and has a grid view that grays out
   the cards you don't have. A card counts as owned when it is in one of your
   BINDERS (cards on lists and in decks don't count: those are plans, not cards
   you have). It has to be the very same printing (set and collector number), and
   a foil copy counts the same as a non-foil one. How many copies is added up
   over every binder.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { cardCount, loadBinder, loadBinderList } from './binderStorage';

// The key a printing is looked up by: its set and collector number, in lowercase ("trk/553")
export const ownedKeyOf = (card: { set: string; number: string }): string => `${card.set}/${card.number}`.toLowerCase();

// How many copies of each printing are in your binders (a printing with none isn't in the map)
export function ownedCopies(): Map<string, number> {
  const owned = new Map<string, number>();
  for (const binder of loadBinderList()) {
    for (const card of Object.values(loadBinder(binder.id))) {
      const key = ownedKeyOf(card);
      owned.set(key, (owned.get(key) ?? 0) + cardCount(card));
    }
  }
  return owned;
}
