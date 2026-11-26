/* =====================================================================
   HOW MUCH A CARD'S PRICE HAS MOVED SINCE IT WAS ADDED
   The List view shows three lines of price beside each card: today's
   price, the percent it has changed, and the price the card had on the
   day it was added (see addedPrice.ts for how that first price is saved,
   in the card's notes as "Purchase price").
   Cards also keep all NINE prices from that day (see lib/prices.ts) in one
   note, "Added prices", like "1.00|1.80|1.15|1.99|0.70|1.25|0.80|1.28|4.00".
   So whichever price is picked in Settings is compared with the same price
   from back then. A card owned before they were all saved has the others
   filled in later: then the note ends with that day, and with which of the
   nine is the card's original one, like "...|4.00;2026-11-26;0".
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
  // Set when the added price isn't from the day the card was added but from this later day
  since?: string;
};

// "since Nov 26" for a day written like "2026-11-26"
export function sinceText(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `since ${new Date(year, month - 1, date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// The name of the note holding all the prices
export const ADDED_NOTE = 'Added prices';

// The longest the note may be (the server turns away a longer one)
const MAX_NOTE = 100;

// The prices (null = none) written as the note's text. If silly-high prices would make it too long,
// the biggest are left out until it fits.
export function writeAdded(values: (number | null)[], since?: string, original?: number): string {
  const kept = [...values];
  const end = since ? `;${since}${original === undefined ? '' : `;${original}`}` : '';
  const write = () => kept.map((v) => (v === null ? '' : v.toFixed(2))).join('|') + end;
  while (write().length > MAX_NOTE) kept[kept.indexOf(Math.max(...kept.map((v) => v ?? 0)))] = null;
  return write();
}

// The note's text read back (null if there's no note)
export function readAdded(text: string | undefined): { values: (number | null)[]; since?: string; original?: number } | null {
  if (!text) return null;
  const [list, since, original] = text.split(';');
  const values = list.split('|').map((v) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
  return { values, since: since || undefined, original: original ? Number(original) : undefined };
}

// The added price written in a card's notes, with its money. "slot" says which of the prices is
// being looked at (see PRICE_SLOTS in prices.ts); without it, the card's one "Purchase price" is used.
// Gives null when the card has no usable added price.
export function priceChangeOf(
  notes: Record<string, string> | undefined,
  today: number | null | undefined,
  todayCurrency: 'USD' | 'EUR',
  slot?: number,
): PriceChange | null {
  let added: number;
  let addedCurrency: 'USD' | 'EUR' = notes?.['Purchase price currency'] === 'EUR' ? 'EUR' : 'USD';
  let since: string | undefined;
  const all = slot === undefined ? null : readAdded(notes?.[ADDED_NOTE]);
  if (all && slot !== undefined) {
    const value = all.values[slot];
    if (value === null || value === undefined) return null;
    added = value;
    // Places 5, 6 and 7 are Cardmarket's, in euros
    addedCurrency = slot >= 5 && slot <= 7 ? 'EUR' : 'USD';
    if (all.since && all.original !== slot) since = all.since;
  } else {
    const text = notes?.['Purchase price'];
    if (!text) return null;
    // The one saved price is TCGplayer's Market (dollars) or Cardmarket's Trend (euros):
    // it can't stand in for any of the others
    if (slot !== undefined && slot !== (addedCurrency === 'EUR' ? 5 : 0)) return null;
    added = Number(text);
  }
  if (!Number.isFinite(added) || added < 0) return null;
  // Dollars can't be compared with euros, and a price of zero has nothing to compare against
  const comparable = typeof today === 'number' && added > 0 && addedCurrency === todayCurrency;
  return { added, addedCurrency, percent: comparable ? ((today - added) / added) * 100 : null, ...(since ? { since } : {}) };
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
