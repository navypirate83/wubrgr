/* =====================================================================
   ONE PRISM SET (/binders/prismset/<id>)
   A group of Commander decks that share cards, with its four tabs (see
   docs/prism-plan.md and prismStorage.ts):
     - Decks:   which decks are in the set, each deck's slot and color,
                and which corner of the sleeve is slot 1
     - Cards:   every card the decks use, with the decks that use it, how
                many copies are needed and how many you own
     - Mark:    painting the sleeves, one copy at a time
     - Changes: what to touch up after a deck changed
   The line above the cards adds it up: the physical copies needed, how many
   are shared by two or more decks, and what PRISM saves (the copies you
   don't have to buy, at your price store's prices).
   Each tab has its own address (".../prismset/<id>?tab=mark", and "&card=" for
   the card being marked), so the back arrow steps back through the tabs you
   visited, like pages in a browser. How far down each tab was scrolled is
   remembered, so going back to the Cards tab puts you where you were.
   Only for accounts with the PRISM right: anyone else is sent to the shelf.
   ===================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useColors } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { useBinderPrices } from '@/hooks/useBinderPrices';
import HelpButton from '@/components/HelpButton';
import ShelfSwitch from '@/components/binders/ShelfSwitch';
import type { CardEntry } from '@/components/binder/CardList';
import DecksTab from '@/components/prism/DecksTab';
import CardsTab, { type FilterId } from '@/components/prism/CardsTab';
import MarkTab from '@/components/prism/MarkTab';
import ChangesTab from '@/components/prism/ChangesTab';
import PinDialog from '@/components/prism/PinDialog';
import { loadDecks } from '@/lib/deckStorage';
import { loadOwned } from '@/lib/deckOwnership';
import { findPrismSet } from '@/lib/prismStorage';
import { changesFor, planFor, totalsOf } from '@/lib/prismPlan';
import { formatPrice } from '@/lib/prices';

// The page is never wider than this (points), with the same space around its edge
const PAGE_MAX_WIDTH = 900;
const PAGE_PADDING = 16;

const TABS = [
  { id: 'decks', label: 'Decks' },
  { id: 'cards', label: 'Cards' },
  { id: 'mark', label: 'Mark' },
  { id: 'changes', label: 'Changes' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function PrismSetScreen() {
  const colors = useColors();
  const navigation = useNavigation();
  const { id, tab: tabParam, card: cardParam } = useLocalSearchParams<{ id: string; tab?: string; card?: string }>();
  const { hasPrism, usingBinders } = useAccount();

  // The set, your decks and what you own, read again every time the page
  // comes into view (a deck may have changed since)
  const [set, setSet] = useState(() => findPrismSet(id));
  const [decks, setDecks] = useState(loadDecks);
  const [owned, setOwned] = useState(loadOwned);
  const refresh = useCallback(() => { setSet(findPrismSet(id)); setDecks(loadDecks()); setOwned(loadOwned()); }, [id]);
  useFocusEffect(refresh);

  // The tab showing, and the card being marked, are in the page's address (so
  // the back arrow steps through them). A set just opened shows the Cards tab.
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'cards';
  const selected = cardParam && tab === 'mark' ? { key: cardParam, copy: 0 } : null;
  // Go to a tab (and, for Mark, a card): a new step for the back arrow
  const goTab = (next: TabId, card?: string) => router.setParams({ tab: next, card });
  // What's typed in the Cards tab's search box and the button chosen there
  // (kept here so they're still there when you come back to it)
  const [cardText, setCardText] = useState('');
  const [cardFilter, setCardFilter] = useState<FilterId>('all');
  // The card (its lowercase name) whose pin window is open, if any
  const [pinning, setPinning] = useState<string | null>(null);

  // How far down each tab was scrolled, so going back to it puts you there
  // again. While the tab changes the page's height changes too, which makes
  // the scroll position jump; those jumps aren't remembered ("settling").
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Partial<Record<TabId, number>>>({});
  const settling = useRef(false);
  const shownTab = useRef<TabId>(tab);
  if (shownTab.current !== tab) { shownTab.current = tab; settling.current = true; }
  // Where a tab is waiting to be scrolled to (null: nothing waiting). A long tab, like the Cards list,
  // may not be fully drawn yet, so the scroll is tried again as the page grows (see onContentSizeChange below).
  const waitingFor = useRef<number | null>(null);
  useEffect(() => {
    // After the new tab is drawn: scroll to where it was (the top for a tab not seen yet, and always
    // the top for Mark, which shows one card at a time)
    const wanted = tab === 'mark' ? 0 : offsets.current[tab] ?? 0;
    const move = () => scrollRef.current?.scrollTo({ y: wanted, animated: false });
    waitingFor.current = wanted > 0 ? wanted : null;
    const timers = [setTimeout(move, 0), setTimeout(move, 120), setTimeout(() => { settling.current = false; waitingFor.current = null; }, 600)];
    return () => { timers.forEach(clearTimeout); waitingFor.current = null; };
  }, [tab]);
  function rememberScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!settling.current) offsets.current[tab] = event.nativeEvent.contentOffset.y;
  }

  // The cards the decks need, what's changed, and the totals
  const plan = useMemo(() => (set ? planFor(set, decks) : []), [set, decks]);
  const changes = useMemo(() => (set ? changesFor(set, plan) : []), [set, plan]);
  const totals = useMemo(() => totalsOf(plan), [plan]);

  // What the saved copies are worth: one entry per card with copies saved,
  // priced like a binder's cards at the price store chosen in Settings
  const savedEntries = useMemo<CardEntry[]>(
    () => plan.filter((c) => c.separate > c.copies).map((c) => ({ key: c.key, card: { ...c.sample, count: c.separate - c.copies } })),
    [plan],
  );
  const prices = useBinderPrices(savedEntries);
  const worth = totals.saved === 0 ? '' : prices.total !== null ? `saves about ${formatPrice(prices.total, prices.currency)}`
    : prices.failed ? '' : 'working out the savings…';
  const header = [
    `${totals.needed} ${totals.needed === 1 ? 'copy' : 'copies'} needed`,
    `${totals.shared} shared`,
    totals.saved > 0 ? `${totals.saved} fewer to buy` : '',
    worth,
  ].filter(Boolean).join(' · ');

  // The header: the set's name, then the shelf switch and Help
  useLayoutEffect(() => {
    navigation.setOptions({
      title: set?.name ?? 'PRISM',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ShelfSwitch current="prism" />
          <HelpButton topic="prism" />
        </View>
      ),
    });
  }, [navigation, set?.name]);

  // Not allowed, or no such set (deleted): back to the PRISM page
  if (!hasPrism || !usingBinders) return <Redirect href="/binders" />;
  if (!set) return <Redirect href="/binders/prism" />;

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <ScrollView ref={scrollRef} onScroll={rememberScroll} scrollEventThrottle={32}
                  onContentSizeChange={() => { if (waitingFor.current !== null) scrollRef.current?.scrollTo({ y: waitingFor.current, animated: false }); }}
                  contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* The four tabs */}
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const on = tab === t.id;
            const count = t.id === 'changes' ? changes.length : 0;
            return (
              <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }}
                         onPress={() => { if (!on) goTab(t.id); }}
                         style={[styles.tab, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : 'transparent' }]}>
                <Text style={[styles.tabText, { color: on ? colors.bg : colors.text }]}>
                  {t.label}{count > 0 ? ` ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'decks' && <DecksTab set={set} decks={decks} onChange={refresh} />}
        {tab === 'cards' && (
          <CardsTab set={set} plan={plan} decks={decks} owned={owned} header={header} onPin={setPinning}
                    text={cardText} onText={setCardText} filter={cardFilter} onFilter={setCardFilter}
                    onOpenCard={(key) => goTab('mark', key)} />
        )}
        {tab === 'mark' && (
          <MarkTab set={set} plan={plan} decks={decks} changes={changes} selected={selected}
                   onChanged={refresh}
                   // A card opened from the Cards tab stays the one marked until its last copy is done, then back to the Cards tab
                   onCardFinished={() => goTab('cards')} />
        )}
        {tab === 'changes' && <ChangesTab set={set} plan={plan} decks={decks} changes={changes} onChanged={refresh} />}
      </ScrollView>
      {/* The window for keeping a card in one deck only */}
      {pinning !== null && (
        <PinDialog set={set} decks={decks} name={pinning} onClose={() => setPinning(null)} onSaved={() => { setPinning(null); refresh(); }} />
      )}
    </KeyboardAvoidingView>
  );
}

// The page's look: a column, never wider than PAGE_MAX_WIDTH, with the tabs along the top
const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: PAGE_PADDING, gap: 12, width: '100%', maxWidth: PAGE_MAX_WIDTH, alignSelf: 'center', flexGrow: 1 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  tabText: { fontSize: 14, fontWeight: '700' },
});
