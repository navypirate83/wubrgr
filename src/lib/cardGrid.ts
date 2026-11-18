/* =====================================================================
   THE CARD FINDER'S PICTURE GRID: WHICH CARDS TO SHOW
   As you type, the Card Finder shows card pictures, A to Z. This file works
   out which cards: first Scryfall's search for names with a word starting
   with what was typed (a page at a time, so it can keep going as you scroll).
   If that finds nothing (a typo, say), it falls back to the forgiving name
   search used everywhere else in the app and shows the cards for the
   closest names instead.
   Plain TypeScript with no React in it.
   ===================================================================== */

import {
  autocomplete, loadCardsAsked, searchCardsPage, type ScryfallCard,
} from './scryfall';
import { fuzzySearch, scryfallWordQuery, type NameEntry } from './nameSearch';

// How many of the closest names to show when nothing matched exactly
const CLOSEST_COUNT = 40;

// One page of the grid. "closest" is true when these are the closest names
// rather than exact matches.
export type GridPage = { cards: ScryfallCard[]; hasMore: boolean; closest: boolean };

// Load one page of cards for what's typed. "names" is the full list of card
// names (missing until it has downloaded, then Scryfall's own suggestions
// are used for the "closest" fallback).
export async function loadGridPage(text: string, page: number, names: NameEntry[] | undefined): Promise<GridPage> {
  const found = await searchCardsPage(scryfallWordQuery(text), page);
  if (found.cards.length > 0 || page > 1) return { ...found, closest: false };

  // Nothing matched: the cards for the closest names, closest first
  const closeNames = names ? fuzzySearch(names, text) : await autocomplete(text);
  const cards = (await loadCardsAsked(closeNames.slice(0, CLOSEST_COUNT).map((name) => ({ name }))))
    .filter((card): card is ScryfallCard => card !== null);
  return { cards, hasMore: false, closest: cards.length > 0 };
}
