/* =====================================================================
   MOVING A DECK TO ANOTHER SLOT (plain TypeScript, no saving here)
   A PRISM set keeps what is painted on the sleeves as deck ids, and each deck
   has a slot (its position and color along the sleeve's edge). Paint doesn't
   move, so when a deck whose marks are already painted is given another slot,
   its old marks are still on the sleeves in the OLD slot. The set remembers
   that in "scrape": for each card, for each physical copy, the slots whose
   marks are still on the sleeve but belong to no deck now. The Changes tab
   lists them (scrape the old slot, paint the new one).
   Two rules keep the notes honest:
     - a mark's color and place come from the SLOT alone, so when any deck takes
       a slot that has marks left in it (moving back to its old slot, or another
       deck moving in), those marks are exactly what that deck needs: they leave
       "scrape" and are noted as painted for it.
     - doing a card (prismStorage.setPainted) clears its "scrape" notes.
   These are plain functions of a set so they can be tested on their own; the
   saving is in prismStorage.ts.
   ===================================================================== */

import type { PrismSet } from './prismStorage';

// A deck is taking this slot. Marks left on sleeves in the slot become its painted marks.
export function takeSlot(s: PrismSet, deckId: string, slot: number): PrismSet {
  const scrape: Record<string, number[][]> = {};
  const painted: Record<string, string[][]> = { ...s.painted };
  for (const [key, copies] of Object.entries(s.scrape)) {
    const kept = copies.map((slots, copy) => {
      if (!slots.includes(slot)) return slots;
      const have = [...(painted[key] ?? [])];
      while (have.length <= copy) have.push([]);
      if (!have[copy].includes(deckId)) have[copy] = [...have[copy], deckId];
      painted[key] = have;
      return slots.filter((x) => x !== slot);
    });
    if (kept.some((slots) => slots.length > 0)) scrape[key] = kept;
  }
  return { ...s, painted, scrape };
}

// Give a deck another slot. The slot must be free (no other deck in it); otherwise the set is
// returned unchanged. Each copy that has the deck's marks painted notes the old slot in "scrape"
// and no longer counts the deck as painted on it.
export function moveSlot(s: PrismSet, deckId: string, slot: number): PrismSet {
  const mine = s.decks.find((d) => d.deckId === deckId);
  if (!mine || mine.slot === slot || s.decks.some((d) => d.slot === slot)) return s;
  const scrape: Record<string, number[][]> = Object.fromEntries(Object.entries(s.scrape).map(([key, copies]) => [key, copies.map((slots) => [...slots])]));
  const painted: Record<string, string[][]> = {};
  for (const [key, copies] of Object.entries(s.painted)) {
    painted[key] = copies.map((decks, copy) => {
      if (!decks.includes(deckId)) return decks;
      const have = scrape[key] ?? [];
      while (have.length <= copy) have.push([]);
      if (!have[copy].includes(mine.slot)) have[copy].push(mine.slot);
      scrape[key] = have;
      return decks.filter((id) => id !== deckId);
    });
  }
  return takeSlot({ ...s, decks: s.decks.map((d) => (d.deckId === deckId ? { ...d, slot } : d)), painted, scrape }, deckId, slot);
}

// One copy's painted note is replaced (the card was done): its "scrape" notes go
export function clearScrape(s: PrismSet, key: string, copy: number): Record<string, number[][]> {
  const scrape = { ...s.scrape };
  if (scrape[key]) {
    const left = scrape[key].map((slots, i) => (i === copy ? [] : slots));
    if (left.some((slots) => slots.length > 0)) scrape[key] = left; else delete scrape[key];
  }
  return scrape;
}
