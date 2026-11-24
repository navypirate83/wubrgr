/* =====================================================================
   IS THIS DECK LEGAL? (the parts the app can tell)
   A deck is marked "Not legal" when
     - it holds more cards than its format allows at most (Commander, Duel
       Commander, PreDH and Pauper Commander: 100 including the command zone;
       Oathbreaker: 60; Tiny Leaders: 50), or its sideboard is over the format's
       limit (15 cards, or 10 for Tiny Leaders), or
     - it has a card that is banned in its format.
   Fewer cards than the format wants is not marked (the deck is just unfinished),
   and formats with no top limit (Modern's "60 or more") have no size mark.
   This only works out the reasons; the screens draw the mark.
   Plain TypeScript with no React in it.
   ===================================================================== */

import type { DeckFormat } from './deckFormats';
import type { Deck } from './deckStorage';

// One copy count: a card with no count is one copy
const copies = (card: { count?: number }) => (Number.isInteger(card.count) && card.count! >= 1 ? card.count! : 1);

// (Cards on the maybe board count towards nothing.)
// What is wrong with the deck's size, in plain words (empty: nothing). "format" is the deck's format (see deckFormat in deckFormats.ts).
export function sizeProblems(deck: Pick<Deck, 'cards'>, format: DeckFormat): string[] {
  const problems: string[] = [];
  const main = deck.cards.filter((c) => (c.zone ?? 'main') !== 'side' && c.zone !== 'maybe').reduce((sum, c) => sum + copies(c), 0);
  const side = deck.cards.filter((c) => (c.zone ?? 'main') === 'side').reduce((sum, c) => sum + copies(c), 0);
  if (format.deckSize !== undefined && main > format.deckSize) problems.push(`${main} cards, at most ${format.deckSize}`);
  if (format.sideboard > 0 && side > format.sideboard) problems.push(`sideboard ${side}, at most ${format.sideboard}`);
  return problems;
}

// Would putting this many more copies into the main deck go over the format's
// limit? Gives the new total and the limit if so, or null if it still fits (or
// the format has no top limit). The command zone counts, the maybe board and
// the sideboard don't.
export function overLimitIfAdded(deck: Pick<Deck, 'cards'>, format: DeckFormat, more: number): { total: number; limit: number } | null {
  if (format.deckSize === undefined) return null;
  const now = deck.cards.filter((c) => (c.zone ?? 'main') !== 'side' && c.zone !== 'maybe').reduce((sum, c) => sum + copies(c), 0);
  return now + more > format.deckSize ? { total: now + more, limit: format.deckSize } : null;
}

// Everything that makes the deck not legal ("isBanned" says whether a card name is banned in the deck's format)
export function deckProblems(deck: Pick<Deck, 'cards'>, format: DeckFormat, isBanned: (name: string) => boolean): string[] {
  const problems = sizeProblems(deck, format);
  const banned = deck.cards.filter((c) => c.zone !== 'maybe' && isBanned(c.name)).reduce((sum, c) => sum + copies(c), 0);
  if (banned > 0) problems.push(`${banned} banned ${banned === 1 ? 'card' : 'cards'}`);
  return problems;
}
