/* =====================================================================
   CARD PRICES
   Eight prices are kept for every printing and finish (regular, foil and
   etched foil), from three stores:
   - TCGplayer (US dollars): Market, Mid and Low
   - Card Kingdom (US dollars): Retail (what they sell it for) and Buy
     (what they pay you for it)
   - Cardmarket (euros): Trend, Low and the 30-day average
   They come from the daily price files published with the website, one
   per set (made by scripts/prices/build-prices.mjs). If a set's file
   can't be had, TCGplayer's Market price and Cardmarket's Trend price
   still come from Scryfall's card details.
   In Settings a person picks a "price store" and which of its prices to
   see: that one is shown under their cards and added up in totals.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { SITE_URL } from './site';
import type { ScryfallCard } from './scryfall';
import type { Finish } from './cards';

// The three stores, as they're named in Settings. Each has its currency.
export type PriceStore = 'tcgplayer' | 'cardkingdom' | 'cardmarket';
export const PRICE_STORES: { value: PriceStore; name: string; currency: 'USD' | 'EUR' }[] = [
  { value: 'tcgplayer', name: 'TCGplayer', currency: 'USD' },
  { value: 'cardkingdom', name: 'Card Kingdom', currency: 'USD' },
  { value: 'cardmarket', name: 'Cardmarket', currency: 'EUR' },
];
export const DEFAULT_PRICE_STORE: PriceStore = 'tcgplayer';

// Keep only a real store name (anything else becomes the default)
export function cleanPriceStore(value: unknown): PriceStore {
  return PRICE_STORES.some((store) => store.value === value) ? (value as PriceStore) : DEFAULT_PRICE_STORE;
}

// A store's currency
export function currencyOf(store: PriceStore): 'USD' | 'EUR' {
  return PRICE_STORES.find((s) => s.value === store)?.currency ?? 'USD';
}

// The prices kept from each store. "id" is what's saved as the person's choice.
export const PRICE_KINDS: Record<PriceStore, { id: string; label: string; hint: string }[]> = {
  tcgplayer: [
    { id: 'market', label: 'Market', hint: 'Based on recent sales' },
    { id: 'mid', label: 'Mid', hint: 'The middle listing' },
    { id: 'low', label: 'Low', hint: 'About the cheapest listing' },
  ],
  cardkingdom: [
    { id: 'retail', label: 'Retail', hint: 'What they sell it for' },
    { id: 'buy', label: 'Buy', hint: 'What they pay you for it' },
  ],
  cardmarket: [
    { id: 'trend', label: 'Trend', hint: 'The going price' },
    { id: 'low', label: 'Low', hint: 'The cheapest listing' },
    { id: 'avg30', label: '30-day average', hint: 'Average over 30 days' },
  ],
};

// All eight prices, in the order they're written in the price files and saved with cards.
// NEVER reorder these (saved cards depend on it); the same order is in build-prices.mjs.
export const PRICE_SLOTS = [
  'tcgplayer.market', 'tcgplayer.mid', 'tcgplayer.low', 'cardkingdom.retail', 'cardkingdom.buy',
  'cardmarket.trend', 'cardmarket.low', 'cardmarket.avg30',
] as const;
const slotNames: readonly string[] = PRICE_SLOTS;

// Where one store's price is in that list of eight (its first price if the name isn't one of its own)
export function slotOf(store: PriceStore, kind: string): number {
  const found = slotNames.indexOf(`${store}.${kind}`);
  return found >= 0 ? found : slotNames.indexOf(`${store}.${PRICE_KINDS[store][0].id}`);
}

// Keep only a real price name for a store (anything else becomes its first one)
export function cleanPriceKind(store: PriceStore, value: unknown): string {
  return PRICE_KINDS[store].some((k) => k.id === value) ? (value as string) : PRICE_KINDS[store][0].id;
}

// The setting that remembers each store's picked price
export const KIND_SETTING = {
  tcgplayer: 'tcgplayerPrice', cardkingdom: 'cardkingdomPrice', cardmarket: 'cardmarketPrice',
} as const;

// Everything about the price picked in Settings: the store, which of its prices, where that
// is in the list of eight, its money and its name
export function pickedPrice(settings: { priceStore: PriceStore; tcgplayerPrice: string; cardkingdomPrice: string; cardmarketPrice: string }) {
  const store = settings.priceStore;
  const kind = cleanPriceKind(store, settings[KIND_SETTING[store]]);
  return {
    store, kind, slot: slotOf(store, kind), currency: currencyOf(store),
    label: PRICE_KINDS[store].find((k) => k.id === kind)!.label,
  };
}

// Show a price with its currency, like "$0.31" or "€3.57" (or "—")
export function formatPrice(price: number | null, currency: 'USD' | 'EUR'): string {
  if (price === null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price);
}

/* ---------------------------------------------------------------------
   THE DAILY PRICE FILES
   --------------------------------------------------------------------- */

// One printing's entry: eight prices each for regular (n), foil (f) and etched (e),
// and the end of its Card Kingdom address (k)
export type PriceEntry = { n?: (number | null)[]; f?: (number | null)[]; e?: (number | null)[]; k?: string };
// The entries for some sets, by Scryfall's ID for the printing
export type PriceBook = Map<string, PriceEntry>;

// Where the files are. While developing in a browser they're this computer's own
// copy (public/prices); otherwise the ones on the website (the phone app too).
const PRICE_FILES = typeof __DEV__ !== 'undefined' && __DEV__ && typeof document !== 'undefined'
  ? '/prices/' : `${SITE_URL}prices/`;

// A set's file is asked for again after this long (they change once a day)
const KEEP_MS = 60 * 60 * 1000;
// The sets already fetched (or being fetched), and when
const files = new Map<string, { at: number; entries: Promise<Record<string, PriceEntry> | null> }>();
// The entries that have arrived, for code that can't wait (adding a card: see addedPrice.ts)
const arrived: PriceBook = new Map();

// One set's file. null = it couldn't be had (it is then asked for again next time).
function loadSetFile(set: string): Promise<Record<string, PriceEntry> | null> {
  const known = files.get(set);
  if (known && Date.now() - known.at < KEEP_MS) return known.entries;
  const entries = fetch(`${PRICE_FILES}set-${encodeURIComponent(set)}.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Prices for ${set}: ${response.status}`);
      const found: Record<string, PriceEntry> = await response.json();
      for (const [id, entry] of Object.entries(found)) arrived.set(id, entry);
      return found;
    })
    .catch(() => { files.delete(set); return null; });
  files.set(set, { at: Date.now(), entries });
  return entries;
}

// The prices for these sets, all in one book. Never fails: a set that can't be had is just left out.
export async function loadPriceBook(sets: string[]): Promise<PriceBook> {
  const wanted = [...new Set(sets.map((s) => s.toLowerCase()).filter(Boolean))];
  const book: PriceBook = new Map();
  // A few at a time, so a binder with many sets doesn't ask for them all at once
  for (let at = 0; at < wanted.length; at += 8) {
    const found = await Promise.all(wanted.slice(at, at + 8).map(loadSetFile));
    for (const entries of found) for (const [id, entry] of Object.entries(entries ?? {})) book.set(id, entry);
  }
  return book;
}

// Whatever prices have already arrived (without fetching anything)
export function pricesSoFar(): PriceBook {
  return arrived;
}

/* ---------------------------------------------------------------------
   ONE PRINTING'S PRICES
   --------------------------------------------------------------------- */

// A price as text from Scryfall ("0.31") as a number, or null if there isn't one
function priceNumber(text: string | null | undefined): number | null {
  const number = Number(text);
  return text && Number.isFinite(number) && number > 0 ? number : null;
}

// The eight prices for one copy of a printing, as the copy is (its finish). An etched
// copy uses the etched prices, or the foil ones when there are none. Without a price
// file entry, only Scryfall's two (TCGplayer Market, Cardmarket Trend) are filled in.
export function priceValues(print: ScryfallCard, finish: Finish, book?: PriceBook): (number | null)[] {
  const entry = book?.get(print.id);
  if (entry) {
    const found = finish === 'etched' ? entry.e ?? entry.f : finish === 'foil' ? entry.f : entry.n;
    return PRICE_SLOTS.map((_, i) => found?.[i] ?? null);
  }
  const p = print.prices ?? {};
  const usd = finish === 'etched' ? p.usd_etched ?? p.usd_foil : finish === 'foil' ? p.usd_foil : p.usd;
  const eur = finish === 'etched' ? p.eur_etched ?? p.eur_foil : finish === 'foil' ? p.eur_foil : p.eur;
  return PRICE_SLOTS.map((slot) => (slot === 'tcgplayer.market' ? priceNumber(usd)
    : slot === 'cardmarket.trend' ? priceNumber(eur) : null));
}

// The price of ONE copy of a printing at the chosen store and price, or null if there is none
export function copyPrice(store: PriceStore, kind: string, print: ScryfallCard, finish: Finish, book?: PriceBook): number | null {
  return priceValues(print, finish, book)[slotOf(store, kind)];
}

// A link to the card at a store (its own page, or a search for its name)
export function storeLink(store: PriceStore, print: ScryfallCard, book?: PriceBook): string {
  const q = encodeURIComponent(print.name);
  if (store === 'tcgplayer') return print.purchase_uris?.tcgplayer ?? `https://www.tcgplayer.com/search/magic/product?q=${q}`;
  if (store === 'cardmarket') return print.purchase_uris?.cardmarket ?? `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${q}`;
  const page = book?.get(print.id)?.k;
  return page ? `https://www.cardkingdom.com/${page}` : `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${q}`;
}
