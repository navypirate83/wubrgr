/* =====================================================================
   HOW MUCH A CARD'S PRICE HAS MOVED SINCE IT WAS ADDED
   The List view shows three lines of price beside each card: today's
   price, the percent it has changed, and the price the card had on the
   day it was added (see addedPrice.ts for how that first price is saved,
   in the card's notes as "Purchase price").
   This file only does the sums and the wording, so it has no screen code
   in it and can be tested on its own.
   ===================================================================== */

// What the List view needs to draw the three price lines
export type PriceChange = {
  added: number;                      // the price on the day the card was added
  addedCurrency: 'USD' | 'EUR';       // the money that price was in
  // How much the price has moved, in percent (50 means up by half). Null when it can't be worked out:
  // no price today, the added price is zero, or the two prices are in different money.
  percent: number | null;
};

// The added price written in a card's notes (text like "1.25"), with its money (no note means dollars).
// Gives null when the card has no usable added price.
export function priceChangeOf(
  notes: Record<string, string> | undefined,
  today: number | null | undefined,
  todayCurrency: 'USD' | 'EUR',
): PriceChange | null {
  const text = notes?.['Purchase price'];
  if (!text) return null;
  const added = Number(text);
  if (!Number.isFinite(added) || added < 0) return null;
  const addedCurrency = notes?.['Purchase price currency'] === 'EUR' ? 'EUR' : 'USD';
  // Dollars can't be compared with euros, and a price of zero has nothing to compare against
  const comparable = typeof today === 'number' && added > 0 && addedCurrency === todayCurrency;
  return { added, addedCurrency, percent: comparable ? ((today - added) / added) * 100 : null };
}

// The percent as words: "+50.00%" going up, "-25.00%" going down, "0.00%" when it hasn't moved.
// Two digits after the point. A change too small to show ("+0.00%") counts as no change.
export function percentText(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  if (rounded === 0) return '0.00%';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(2)}%`;
}

// Which way the change went: 'up' (green), 'down' (red) or 'same' (plain grey)
export function directionOf(percent: number): 'up' | 'down' | 'same' {
  const rounded = Math.round(percent * 100) / 100;
  return rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'same';
}
