/* =====================================================================
   PRICES (on the Card Finder)
   Three tabs, one per store, with the Settings price store first and
   open. The open tab lists all of that store's prices for the printing
   showing, with "Regular" and "Foil" columns (the one matching the Foil
   button is highlighted), and an orange dot beside the price picked in
   Settings. Under it, a link to the card at that store (not Cardmarket:
   its website blocks many visitors).
   (Where the prices come from: see lib/prices.ts.)
   ===================================================================== */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import type { ScryfallCard } from '@/lib/scryfall';
import type { Finish } from '@/lib/cards';
import {
  PRICE_KINDS, PRICE_STORES, currencyOf, formatPrice, loadPriceBook, pickedPrice, priceValues, slotOf,
  storeLink, type PriceStore,
} from '@/lib/prices';
import { openLink } from '@/lib/links';
import { useColors } from '@/hooks/useTheme';
import { useSettings } from '@/hooks/useSettings';
import { STORE_ICONS } from '@/components/settings/PriceStorePicker';
import { RADIUS } from '@/theme/colors';

type Props = {
  // The printing showing
  print: ScryfallCard;
  // The finish chosen on the Foil button: not foil, foil or etched
  finish: Finish;
};

export default function PricePanel({ print, finish }: Props) {
  const colors = useColors();
  const picked = pickedPrice(useSettings());
  // The tab that's open: the Settings store until another is tapped
  const [tab, setTab] = useState<PriceStore>(picked.store);
  useEffect(() => setTab(picked.store), [picked.store]);

  // This set's price file
  const file = useQuery({
    queryKey: ['price-files', print.set.toLowerCase()],
    queryFn: () => loadPriceBook([print.set]),
    staleTime: 60 * 60 * 1000,
  });
  const book = file.data;

  // Any foil (including etched) highlights the Foil column; with Etched chosen it shows etched prices
  const foil = finish !== 'nonfoil';
  const foilFinish: Finish = finish === 'etched' || (print.finishes?.includes('etched') && !print.finishes?.includes('foil')) ? 'etched' : 'foil';
  // The prices for each column (a printing that doesn't come in a finish shows dashes)
  const comesIn = (wanted: Finish) => !print.finishes || print.finishes.includes(wanted);
  const regularPrices = comesIn('nonfoil') ? priceValues(print, 'nonfoil', book) : [];
  const foilPrices = comesIn(foilFinish) ? priceValues(print, foilFinish, book) : [];

  const currency = currencyOf(tab);
  const storeName = (store: PriceStore) => PRICE_STORES.find((s) => s.value === store)!.name;
  // The Settings store's tab first, then the others in their usual order
  const order = [picked.store, ...PRICE_STORES.map((s) => s.value).filter((s) => s !== picked.store)];

  // A price as text. Card Kingdom's Buy price is blank when they aren't buying the card.
  const priceText = (value: number | null | undefined, kind: string, exists: boolean) => {
    if (!file.data) return '…';
    if (tab === 'cardkingdom' && kind === 'buy' && value == null && exists && book?.has(print.id)) return 'Not buying';
    return formatPrice(value ?? null, currency);
  };
  const shownCell = (isFoil: boolean) => (isFoil === foil ? { backgroundColor: `${colors.accent}1f` } : null);
  const shownText = (isFoil: boolean) => (isFoil === foil ? [styles.shownText, { color: colors.text }] : { color: colors.muted });

  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="Prices">
      {/* The three store tabs */}
      <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        {order.map((store) => {
          const open = store === tab;
          return (
            <Pressable
              key={store}
              accessibilityRole="tab"
              accessibilityLabel={`${storeName(store)} prices`}
              accessibilityState={{ selected: open }}
              onPress={() => setTab(store)}
              style={[styles.tab, { borderBottomColor: open ? colors.accent : 'transparent' }, open && { backgroundColor: colors.surface }]}
            >
              <Image source={STORE_ICONS[store]} style={styles.icon} contentFit="contain" />
              <Text style={[styles.tabText, { color: open ? colors.text : colors.muted }]} numberOfLines={1}>{storeName(store)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.panel}>
        {/* Column headings */}
        <View style={styles.row}>
          <View style={styles.name} />
          <View style={[styles.cell, shownCell(false)]}><Text style={[styles.heading, { color: colors.muted }]}>Regular</Text></View>
          <View style={[styles.cell, shownCell(true)]}>
            <Text style={[styles.heading, { color: colors.muted }]}>{foilFinish === 'etched' ? 'Etched' : 'Foil'}</Text>
          </View>
        </View>

        {/* One row per price the store has */}
        {PRICE_KINDS[tab].map((kind) => {
          const slot = slotOf(tab, kind.id);
          const mine = tab === picked.store && kind.id === picked.kind;
          return (
            <View key={kind.id} style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={styles.name}>
                {mine && <View style={[styles.mark, { backgroundColor: colors.accent }]} accessibilityLabel="Your price" />}
                <Text style={[styles.kind, { color: mine ? colors.accent : colors.text }, mine && styles.shownText]}>{kind.label}</Text>
              </View>
              <View style={[styles.cell, shownCell(false)]}>
                <Text style={[styles.price, shownText(false)]}>{priceText(regularPrices[slot], kind.id, comesIn('nonfoil'))}</Text>
              </View>
              <View style={[styles.cell, shownCell(true)]}>
                <Text style={[styles.price, shownText(true)]}>{priceText(foilPrices[slot], kind.id, comesIn(foilFinish))}</Text>
              </View>
            </View>
          );
        })}

        {/* The link to the card at this store (Cardmarket: no link) */}
        {tab !== 'cardmarket' && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${storeName(tab)}: see this card`}
            onPress={() => openLink(storeLink(tab, print, book))}
            style={({ pressed }) => [styles.link, { borderTopColor: colors.border }, pressed && styles.pressed]}
          >
            <Text style={[styles.linkText, { color: colors.accent }]}>See this card on {storeName(tab)} ›</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// The table's look. Each row: the price's name (taking the spare room), then two price columns of a
// fixed width with the numbers on the right so the dots line up ("tabular-nums").
const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: RADIUS, overflow: 'hidden', marginTop: 16 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, minWidth: 0, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 3, borderBottomWidth: 3, paddingHorizontal: 2 },
  icon: { width: 22, height: 22, padding: 1, borderRadius: 4, backgroundColor: '#ffffff' },
  tabText: { fontSize: 12, fontWeight: '600' },
  panel: { paddingHorizontal: 12, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  name: { flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mark: { width: 8, height: 8, borderRadius: 4 },
  kind: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  cell: { width: 92, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'flex-end' },
  heading: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', paddingVertical: 8 },
  price: { fontSize: 14, fontVariant: ['tabular-nums'] },
  shownText: { fontWeight: '700' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  linkText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
