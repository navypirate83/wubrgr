/* =====================================================================
   THE PRICES OF SCANNED CARDS
   For each card the scanner has, the price of ONE copy at the store and
   price picked in Settings, in the card's finish (foil and etched cost
   differently), as text like "$1.93".
   Each printing is looked up by itself, so scanning one more card doesn't
   make the prices already showing disappear while it loads.
   A card with no price (or not looked up yet, or with no internet) is
   simply left out.
   ===================================================================== */

import { useQueries } from '@tanstack/react-query';
import { useSettings } from '@/hooks/useSettings';
import { copyPrice, formatPrice, loadPriceBook, pickedPrice, type PriceBook } from '@/lib/prices';
import { cardBySetPath, loadOneCard } from '@/lib/scryfall';
import type { ScanItem } from '@/lib/scanner/scanItems';

export function useScanPrices(items: ScanItem[]): Map<string, string> {
  const { store, kind, currency } = pickedPrice(useSettings());

  // The printings to look up (each set and number once) and the sets they're from
  const wanted = [...new Set(items.map((item) => `${item.printing.setCode}/${item.printing.collectorNumber}`))];
  const sets = [...new Set(items.map((item) => item.printing.setCode.toLowerCase()))];

  // Each printing's details from Scryfall (shared with the card pop-up in a binder, so it's only asked once)
  const prints = useQueries({
    queries: wanted.map((id) => {
      const [set, number] = id.split('/');
      return { queryKey: ['edit-print', set, number], queryFn: () => loadOneCard(cardBySetPath(set, number)), staleTime: Infinity };
    }),
  });
  // Each set's daily price file
  const books = useQueries({
    queries: sets.map((set) => ({ queryKey: ['price-files', set], queryFn: () => loadPriceBook([set]), staleTime: 60 * 60 * 1000 })),
  });

  // Put them together, one price for each scanned card
  const found = new Map<string, string>();
  for (const item of items) {
    const print = prints[wanted.indexOf(`${item.printing.setCode}/${item.printing.collectorNumber}`)]?.data;
    const book: PriceBook | undefined = books[sets.indexOf(item.printing.setCode.toLowerCase())]?.data;
    if (!print || !book) continue;
    const price = copyPrice(store, kind, print, item.finish, book);
    if (price !== null) found.set(item.id, formatPrice(price, currency));
  }
  return found;
}
