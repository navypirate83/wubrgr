/* =====================================================================
   IMPORTING A DECKLIST INTO A DECK
   The steps after a decklist has been given (see deckImport.ts for how
   the list itself is read):
     1. readImportSource: what was typed, pasted or chosen becomes a list
        of cards. (A link to a deck on Archidekt or Moxfield is fetched
        through our server first, since a browser isn't allowed to ask
        those sites itself.)
     2. cardsFor: each line is looked up on Scryfall (the exact printing
        if the list names one; otherwise the card's usual printing) and
        becomes a card as a deck keeps it, in the main deck, the sideboard
        or the command zone.
     3. importIntoDeck: the cards are added to the deck.
   A card Scryfall doesn't know is skipped and reported back by name.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { loadCardsAsked, type CardAsk } from './scryfall';
import { serverGet, serverUsable } from './cardLookup';
import { addCardsToDeck, findDeck, type DeckCard } from './deckStorage';
import { deckFormat } from './deckFormats';
import { deckCardFromPrint, secondSpotShows, zoneExtraOf } from './deckZones';
import { looksLikeDeckLink, parseDeckData, parseDeckSource, type ImportLine, type ImportedDeck } from './deckImport';

// What was typed, pasted or chosen, as a list of cards. Throws a plain
// message if nothing could be read. Links (to a deck on Archidekt or
// Moxfield) only work for decks: "allowLinks" is false for binders and lists.
export async function readImportSource(source: string, allowLinks = true): Promise<ImportedDeck> {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('Paste a list, or choose a file, first.');
  let deck: ImportedDeck | null;
  if (looksLikeDeckLink(trimmed)) {
    if (!allowLinks) {
      throw new Error('A link can only be imported into a deck. Here, paste a list of cards or choose a file.');
    }
    if (!serverUsable()) {
      throw new Error('Importing from a link needs you to be signed in. You can also copy the deck\'s text list from its site and paste that here.');
    }
    const reply = await serverGet<{ source: string; data: unknown }>(`/import/deck?url=${encodeURIComponent(trimmed)}`);
    deck = parseDeckData(reply.data);
  } else {
    deck = parseDeckSource(trimmed);
  }
  if (!deck || deck.lines.length === 0) throw new Error('No cards were found in that.');
  return deck;
}

// How to ask Scryfall for a line: the exact card if it's named by Scryfall ID,
// the exact printing if the set and number are given, else by name
function askFor(line: ImportLine): CardAsk {
  if (line.id) return { id: line.id };
  if (line.set && line.number) return { set: line.set, collector_number: line.number };
  if (line.set) return { name: line.name, set: line.set };
  return { name: line.name };
}

// The cards as the deck keeps them, and the names of any not found. "formatCode"
// is the deck's format: it decides which command zone spots exist.
export async function cardsFor(imported: ImportedDeck, formatCode: string): Promise<{ cards: DeckCard[]; notFound: string[] }> {
  const lines = imported.lines;
  // Ask for every line; a line whose printing wasn't found is asked again by name alone
  let prints = await loadCardsAsked(lines.map(askFor));
  const retry = lines.map((line, i) => (prints[i] === null && (line.id || line.set) ? i : -1)).filter((i) => i >= 0);
  if (retry.length > 0) {
    const again = await loadCardsAsked(retry.map((i) => ({ name: lines[i].name })));
    retry.forEach((i, n) => { prints[i] = again[n]; });
  }
  prints = [...prints];

  const format = deckFormat(formatCode);
  const cards: DeckCard[] = [];
  const notFound: string[] = [];
  // The command zone spots filled so far (the first card, to see what it allows)
  let first: DeckCard | undefined;
  let second = false;
  lines.forEach((line, i) => {
    const print = prints[i];
    if (!print) { notFound.push(line.name); return; }
    const base: DeckCard = { ...deckCardFromPrint(print), ...(line.foil ? { foil: true } : {}) };
    if (line.zone === 'command' && format.command) {
      const types = (base.typeLine ?? '').toLowerCase();
      let slot: 0 | 1 | null = null;
      if (format.command.kind === 'oathbreaker') {
        if (!first && types.includes('planeswalker')) slot = 0;
        else if (first && !second && /instant|sorcery/.test(types)) slot = 1;
      } else if (!first) {
        slot = 0;
      } else if (!second && secondSpotShows(format, first)) {
        slot = 1;
      }
      if (slot !== null) {
        const placed: DeckCard = { ...base, zone: 'command', slot, extra: { ...base.extra, ...zoneExtraOf(print) } };
        if (slot === 0) first = placed; else second = true;
        cards.push(placed);
        return;
      }
      // No room in the command zone: it goes in the main deck
    }
    const count = Math.max(1, line.count);
    cards.push({ ...(line.zone === 'side' ? { ...base, zone: 'side' as const } : base), ...(count > 1 ? { count } : {}) });
  });
  return { cards, notFound };
}

// What importing did: how many copies went in, and the names not found
export type ImportSummary = { copies: number; notFound: string[] };

// Look the list up and add it to the deck
export async function importIntoDeck(deckId: string, imported: ImportedDeck): Promise<ImportSummary> {
  const deck = findDeck(deckId);
  if (!deck) throw new Error('That deck isn\'t here any more.');
  // A command zone that's already filled keeps its cards: only the empty spots take new ones
  const { cards, notFound } = await cardsFor(imported, deck.format);
  addCardsToDeck(deckId, cards);
  return { copies: cards.reduce((sum, card) => sum + (card.count ?? 1), 0), notFound };
}

// The words for what importing did
export function summaryText(summary: ImportSummary): string {
  const added = `${summary.copies} ${summary.copies === 1 ? 'card' : 'cards'} added.`;
  if (summary.notFound.length === 0) return added;
  const shown = summary.notFound.slice(0, 15).join(', ');
  const more = summary.notFound.length > 15 ? `, and ${summary.notFound.length - 15} more` : '';
  return `${added} These weren't found, so they were skipped: ${shown}${more}.`;
}
