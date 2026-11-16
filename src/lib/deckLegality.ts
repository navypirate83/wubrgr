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

// What is wrong with the deck's size, in plain words (empty: nothing). "format" is the deck's format (see deckFormat in deckFormats.ts).
export function sizeProblems(deck: Pick<Deck, 'cards'>, format: DeckFormat): string[] {
  const problems: string[] = [];
  const main = deck.cards.filter((c) => (c.zone ?? 'main') !== 'side').reduce((sum, c) => sum + copies(c), 0);
  const side = deck.cards.filter((c) => (c.zone ?? 'main') === 'side').reduce((sum, c) => sum + copies(c), 0);
  if (format.deckSize !== undefined && main > format.deckSize) problems.push(`${main} cards, at most ${format.deckSize}`);
  if (format.sideboard > 0 && side > format.sideboard) problems.push(`sideboard ${side}, at most ${format.sideboard}`);
  return problems;
}

// Everything that makes the deck not legal ("isBanned" says whether a card name is banned in the deck's format)
export function deckProblems(deck: Pick<Deck, 'cards'>, format: DeckFormat, isBanned: (name: string) => boolean): string[] {
  const problems = sizeProblems(deck, format);
  const banned = deck.cards.filter((c) => isBanned(c.name)).reduce((sum, c) => sum + copies(c), 0);
  if (banned > 0) problems.push(`${banned} banned ${banned === 1 ? 'card' : 'cards'}`);
  return problems;
}
