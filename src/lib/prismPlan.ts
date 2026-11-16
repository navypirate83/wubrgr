/* =====================================================================
   THE PRISM MATH
   Works out, for a PRISM set, which physical cards are needed and which
   marks each one carries. No screens and no looking anything up: it only
   reads the decks and the set (see prismStorage.ts).
   For every card NAME in the set's decks (the printing doesn't matter: the
   sleeve belongs to the physical card you pick):
     - each deck needs some copies of it (its main deck and command zone;
       the sideboard isn't played from, so it's left out)
     - you need as many physical copies as the deck that needs the most
     - copy 1 carries the marks of every deck that needs at least 1, copy 2
       the marks of the decks that need at least 2, and so on
     - a card used by two or more decks is POOL, a card used by one is CORE
   Plain TypeScript with no React in it.
   ===================================================================== */

import { zoneOf, type Deck, type DeckCard } from './deckStorage';
import type { PrismSet } from './prismStorage';

// One card of the plan
export type PlanCard = {
  key: string;               // the lowercase name
  name: string;              // the name as shown
  sample: DeckCard;          // one copy of it, for its picture and details
  copies: number;            // physical copies needed
  separate: number;          // copies needed without PRISM (every deck on its own)
  deckNeeds: { deckId: string; need: number }[];   // each deck that uses it, in the set's order
  required: string[][];      // per physical copy: the decks whose marks it carries
  pool: boolean;             // used by two or more decks
};

export const nameKey = (name: string): string => name.trim().toLowerCase();

// The cards of a deck that count (the sideboard doesn't)
function playedCards(deck: Deck): DeckCard[] {
  return deck.cards.filter((card) => zoneOf(card) !== 'side');
}

// The plan for a set: its decks, found among all your decks (a deck that no
// longer exists is left out)
export function planFor(set: PrismSet, decks: Deck[]): PlanCard[] {
  const byName = new Map<string, PlanCard>();
  for (const member of set.decks) {
    const deck = decks.find((d) => d.id === member.deckId);
    if (!deck) continue;
    const counts = new Map<string, { card: DeckCard; need: number }>();
    for (const card of playedCards(deck)) {
      const key = nameKey(card.name);
      const have = counts.get(key);
      counts.set(key, { card: have?.card ?? card, need: (have?.need ?? 0) + (card.count ?? 1) });
    }
    for (const [key, { card, need }] of counts) {
      const plan = byName.get(key) ?? { key, name: card.name, sample: card, copies: 0, separate: 0, deckNeeds: [], required: [], pool: false };
      plan.deckNeeds.push({ deckId: deck.id, need });
      plan.separate += need;
      byName.set(key, plan);
    }
  }
  const cards = [...byName.values()];
  for (const plan of cards) {
    plan.copies = Math.max(...plan.deckNeeds.map((d) => d.need));
    plan.required = Array.from({ length: plan.copies }, (_, copy) =>
      plan.deckNeeds.filter((d) => d.need >= copy + 1).map((d) => d.deckId));
    plan.pool = plan.deckNeeds.length >= 2;
  }
  return cards.sort((a, b) => Number(b.pool) - Number(a.pool) || a.name.localeCompare(b.name));
}

// The totals line: physical copies needed, how many carry marks for two or
// more decks, and how many copies PRISM saves
export function totalsOf(plan: PlanCard[]): { needed: number; shared: number; saved: number } {
  let needed = 0;
  let shared = 0;
  let separate = 0;
  for (const card of plan) {
    needed += card.copies;
    separate += card.separate;
    shared += card.required.filter((decks) => decks.length >= 2).length;
  }
  return { needed, shared, saved: separate - needed };
}

/* ---------------------------------------------------------------------
   PAINT: what's done, what's left, what changed
   --------------------------------------------------------------------- */

const sameDecks = (a: string[], b: string[]): boolean => a.length === b.length && a.every((id) => b.includes(id));

// What's painted on this copy of this card (none: nothing yet)
export const paintedOn = (set: PrismSet, key: string, copy: number): string[] => set.painted[key]?.[copy] ?? [];

// Is this copy painted exactly as it should be?
export function copyIsDone(set: PrismSet, card: PlanCard, copy: number): boolean {
  return sameDecks(paintedOn(set, card.key, copy), card.required[copy] ?? []);
}

// One copy that still needs painting
export type Undone = { card: PlanCard; copy: number };

// Every copy not painted as it should be: shared cards first, then A to Z
export function undoneCopies(set: PrismSet, plan: PlanCard[]): Undone[] {
  const out: Undone[] = [];
  for (const card of plan) {
    for (let copy = 0; copy < card.copies; copy++) {
      if (!copyIsDone(set, card, copy)) out.push({ card, copy });
    }
  }
  return out;
}

// One thing to do to a sleeve after a deck changed
export type Change = {
  kind: 'add' | 'clear';
  key: string;
  name: string;
  copy: number;
  deckId: string;              // whose mark
  sleeveTip?: string;          // a card whose sleeve already carries exactly the marks needed
};

// What changed since things were painted. Only cards that have been painted at
// least once are looked at (a card never marked is simply still to do on the
// Mark page). A mark that should be there but isn't: "add". One that's painted
// but no longer needed (the card left the deck, or the deck left the set): "clear".
export function changesFor(set: PrismSet, plan: PlanCard[]): Change[] {
  const byKey = new Map(plan.map((c) => [c.key, c]));
  const changes: Change[] = [];
  for (const [key, copies] of Object.entries(set.painted)) {
    const card = byKey.get(key);
    const shownName = card?.name ?? set.names[key] ?? key;
    const total = Math.max(copies.length, card?.copies ?? 0);
    for (let copy = 0; copy < total; copy++) {
      const painted = copies[copy] ?? [];
      const wanted = card?.required[copy] ?? [];
      for (const deckId of wanted) if (!painted.includes(deckId)) changes.push({ kind: 'add', key, name: shownName, copy, deckId });
      for (const deckId of painted) if (!wanted.includes(deckId)) changes.push({ kind: 'clear', key, name: shownName, copy, deckId });
    }
  }
  for (const add of changes.filter((c) => c.kind === 'add')) {
    add.sleeveTip = sleeveTipFor(set, plan, changes, add.key, add.copy) ?? undefined;
  }
  return changes;
}

// A tip for a card that still needs marks: when another card is leaving a deck
// (it has marks to clear) and its sleeve already carries EXACTLY the marks this
// copy needs, this card can just move into that sleeve and nothing needs
// painting. (Null: no such sleeve.)
export function sleeveTipFor(set: PrismSet, plan: PlanCard[], changes: Change[], key: string, copy: number): string | null {
  const card = plan.find((c) => c.key === key);
  if (!card) return null;
  const needs = card.required[copy] ?? [];
  const donor = changes.find((c) => c.kind === 'clear' && c.key !== key && sameDecks(paintedOn(set, c.key, c.copy), needs));
  return donor ? `${donor.name}'s sleeve is leaving a deck and already has exactly the marks ${card.name} needs. Move ${card.name} into that sleeve and nothing needs painting.` : null;
}

// The undone list as plain text, for taking to the table
export function undoneText(undone: Undone[], slotOf: (deckId: string) => number | null): string {
  return undone
    .map(({ card, copy }) => {
      const slots = (card.required[copy] ?? []).map((id) => slotOf(id)).filter((s): s is number => s !== null).sort((a, b) => a - b);
      return `${card.name}${card.copies > 1 ? ` (copy ${copy + 1} of ${card.copies})` : ''}: slots ${slots.join(', ')}`;
    })
    .join('\n');
}
