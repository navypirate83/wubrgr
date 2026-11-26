/* =====================================================================
   THE PRICES OF A BINDER'S CARDS
   Looks up what each card in a binder costs at the store chosen in
   Settings (the "price store" and which of its prices), and adds them up.
   - The cards' details come from Scryfall in big batches, one lookup per
     set of cards, and are kept for a while so reopening a binder is quick.
   - The prices come from the daily price files, one per set (lib/prices.ts).
   - Each card has two prices: the price of ONE copy (the foil price for a
     foil copy), which the list shows and "Price" sorting uses, and that
     times how many copies you have, which is what the total adds up. A card
     the store has no price for counts as nothing in the total (and shows a
     dash).
   Gives back: each card's prices by its pocket key, the total, which
   currency it's in, and whether prices are still loading. It also gives
   back the cards' details themselves (colors, type, rarity...), because
   sorting a binder by those needs the same lookup (see lib/binderSort.ts).
   ===================================================================== */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@/hooks/useSettings';
import { cardCount } from '@/lib/binderStorage';
import { finishOf } from '@/lib/cardDetails';
import { copyPrice, loadPriceBook, pickedPrice, type PriceBook } from '@/lib/prices';
import { loadPrintings } from '@/lib/scryfall';
import type { ScryfallCard } from '@/lib/scryfall';
import type { CardEntry } from '@/components/binder/CardList';

export type BinderPrices = {
  // Each card's price for all its copies, by pocket key (null = no price)
  byKey: Map<string, number | null>;
  // Each card's price for ONE copy (the foil price for a foil), by pocket key (null = no price).
  // The list shows this, and "Price" sorting goes by it, so a card you own three of isn't ranked
  // as if it were three times as expensive.
  eachByKey: Map<string, number | null>;
  // Everything added up (null until the prices have loaded)
  total: number | null;
  currency: 'USD' | 'EUR';
  // Which of the saved prices is showing, and the price files looked at
  slot: number;
  book: PriceBook | undefined;
  // Still waiting for the prices?
  loading: boolean;
  // Couldn't get the prices?
  failed: boolean;
  // The cards' details by "set/number" in lowercase (undefined until they arrive)
  printings: Map<string, ScryfallCard> | undefined;
};

// How long the looked-up card details are kept before asking again
const KEEP_MS = 60 * 60 * 1000;

export function useBinderPrices(entries: CardEntry[]): BinderPrices {
  const settings = useSettings();
  const { store, kind, slot, currency } = pickedPrice(settings);

  // The printings to look up: each set and number once, in a steady order
  // (so the same cards give the same lookup, and it's kept)
  const wanted = useMemo(() => {
    const seen = new Set<string>();
    for (const { card } of entries) seen.add(`${card.set.toLowerCase()}/${card.number}`);
    return [...seen].sort().map((id) => {
      const slash = id.indexOf('/');
      return { set: id.slice(0, slash), number: id.slice(slash + 1) };
    });
  }, [entries]);
  const signature = wanted.map((w) => `${w.set}/${w.number}`).join('|');

  // The cards' details (with their prices at TCGplayer and Cardmarket)
  const printings = useQuery({
    queryKey: ['binder-printings', signature],
    queryFn: () => loadPrintings(wanted),
    enabled: wanted.length > 0,
    staleTime: KEEP_MS,
  });

  // The price files for the sets these cards are from
  const sets = useMemo(() => [...new Set(wanted.map((w) => w.set))].sort(), [wanted]);
  const files = useQuery({
    queryKey: ['price-files', sets.join('|')],
    queryFn: () => loadPriceBook(sets),
    enabled: sets.length > 0,
    staleTime: KEEP_MS,
  });

  const loading = wanted.length > 0 && (printings.isLoading || files.isLoading);
  const failed = printings.isError;

  return useMemo(() => {
    const byKey = new Map<string, number | null>();
    const eachByKey = new Map<string, number | null>();
    let total = 0;
    const ready = printings.data && files.data;
    if (ready) {
      for (const { key, card } of entries) {
        const print = printings.data!.get(`${card.set}/${card.number}`.toLowerCase());
        const each = print ? copyPrice(store, kind, print, finishOf(card), files.data) : null;
        const line = each === null ? null : Math.round(each * cardCount(card) * 100) / 100;
        byKey.set(key, line);
        // The price of a single copy, kept to the cent
        eachByKey.set(key, each === null ? null : Math.round(each * 100) / 100);
        if (line !== null) total += line;
      }
    }
    return { byKey, eachByKey, total: ready ? Math.round(total * 100) / 100 : null, currency, slot, book: files.data, loading, failed, printings: printings.data };
  }, [entries, printings.data, files.data, store, kind, slot, currency, loading, failed]);
}
