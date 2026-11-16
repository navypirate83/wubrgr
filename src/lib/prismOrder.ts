/* =====================================================================
   THE "MOST SHARED, THEN BY DECK" ORDER FOR PRISM'S CARDS TAB
   Puts the cards used by the most decks first and counts down: cards in 5
   decks, then 4, then 3, then 2. After them come the cards only ONE deck
   uses, deck by deck in slot order (slot 1's deck first): all of that deck's own
   cards, then the next deck's. Inside each group the cards are A to Z.
   (A card pinned to one deck counts as only that deck's card.)
   Each card belongs to a group, and the groups are what the header bars name
   ("In 3 decks", "Only in <deck>").
   Plain TypeScript with no React in it.
   ===================================================================== */

// What the order needs to know about a card
export type OrderCard = { key: string; name: string; deckNeeds: { deckId: string }[] };

// The group a card falls under: shared by "count" decks (2 or more), or only in one deck
export type DeckGroup = { id: string; count: number; deckId: string | null };

export function deckGroupOf(card: OrderCard): DeckGroup {
  const count = card.deckNeeds.length;
  return count >= 2
    ? { id: `decks-${count}`, count, deckId: null }
    : { id: `only-${card.deckNeeds[0]?.deckId ?? 'none'}`, count: 1, deckId: card.deckNeeds[0]?.deckId ?? null };
}

// The cards in this order. "slotOf" gives a deck's slot (a deck that isn't in the set goes last).
export function orderByDecks<T extends OrderCard>(cards: T[], slotOf: (deckId: string) => number | undefined): T[] {
  const slot = (card: T) => slotOf(card.deckNeeds[0]?.deckId ?? '') ?? 99;
  return [...cards].sort((a, b) => {
    const countA = a.deckNeeds.length;
    const countB = b.deckNeeds.length;
    // Shared cards first, the most decks first
    if (countA >= 2 || countB >= 2) {
      if (countA !== countB) return (countB >= 2 ? countB : 1) - (countA >= 2 ? countA : 1);
    } else if (slot(a) !== slot(b)) {
      // Cards of one deck only: deck by deck, in slot order
      return slot(a) - slot(b);
    }
    return a.name.localeCompare(b.name);
  });
}
