/* =====================================================================
   THE SETS TAB (in the Card Finder)
   A list of every set, newest release first. Each row is one big area to
   tap, with the set's symbol on the left as tall as the two lines of text:
       Set name (CODE)
       123 cards                     Release date
   Tapping a row opens that set's cards (see SetCardsPage.tsx); which set is open is in
   the page's address, so the header's back arrow (and Android's Back) returns to the list. Only the
   main set's own cards are counted, not its tokens or Commander cards.
   A search box above the list finds sets with a forgiving ("fuzzy") match
   (see lib/setList.ts): small typos, part of a word, or the letters of a
   word in order ("cmdr") still find the set. It also looks inside the
   extras, so typing "tokens" finds every set that has tokens.
   A set that came with extras (its tokens, Commander decks, Timeshifts,
   promos, art cards) has a small arrow at the end of its row. Tapping the
   arrow pushes the rest of the list down and shows them right under that
   set (a Commander set's own tokens sit under it, one step in); the arrow
   flips up, and tapping it again closes them. Tapping one of the extras
   opens its cards. When a search matches only an extra, its set opens by
   itself with the matching extras in orange.
   The list stays in place (just hidden) while a set's cards show, so
   going back finds the search, the open extras and the scrolling as they were.
   ===================================================================== */

import { useCallback, useMemo, useState } from 'react';
import { BackHandler, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { goBackInApp } from '@/lib/navHistory';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useTheme';
import TextField from '@/components/TextField';
import { SearchError } from '@/components/search/SearchStates';
import SetCardsPage from '@/components/search/SetCardsPage';
import { buildSetList, filterSets, type SetInfo, type SetKid, type SetResult } from '@/lib/setList';
import { loadSetIcons, loadSetList, type ScryfallCard } from '@/lib/scryfall';
import { plural } from '@/lib/cards';
import { MAX_CONTENT_WIDTH, RADIUS, SPACE } from '@/theme/colors';

// "2024-08-02" as "Aug 2, 2024" (nothing when the day isn't known)
function dateText(day: string): string {
  if (!day) return '';
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Props = {
  visible: boolean;                       // is this tab showing? (It stays drawn, hidden, while the Cards tab shows.)
  shownCode: string | null;               // the code of the set whose cards are open (from the page's address), if any
  onShow: (code: string | null) => void;  // a set was tapped (the screen puts it in the address)
  onPickCard: (card: ScryfallCard) => void;   // "open in the Card Finder" for a card in a set
  usingBinders: boolean;                  // can cards be added to binders, lists and decks?
  announce: (text: string) => void;       // say something to screen readers
};

export default function SetsTab({ visible, shownCode, onShow, onPickCard, usingBinders, announce }: Props) {
  const colors = useColors();
  // What's typed in the search box and which sets have their extras open
  const [typed, setTyped] = useState('');
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const sets = useQuery({ queryKey: ['set-list'], queryFn: loadSetList, staleTime: 24 * 60 * 60 * 1000 });
  const icons = useQuery({ queryKey: ['set-icons'], queryFn: loadSetIcons });
  const nodes = useMemo(() => (sets.data ? buildSetList(sets.data) : []), [sets.data]);
  const results = useMemo(() => filterSets(nodes, typed), [nodes, typed]);
  // The set whose cards are open: the one the address names (any set, a main one or an extra)
  const shown = useMemo<SetInfo | null>(
    () => (shownCode ? sets.data?.find((set) => set.code === shownCode) ?? null : null),
    [shownCode, sets.data],
  );
  const open = useCallback((set: SetInfo) => onShow(set.code), [onShow]);
  // A card picked in a set page's search: its set and number, so that set's page highlights it
  const [jump, setJump] = useState<{ set: string; number: string } | null>(null);
  const jumpToCard = (set: string, number: string) => {
    setJump({ set, number });
    if (set !== shownCode) onShow(set);
  };

  const toggle = useCallback((code: string) => {
    setOpened((now) => {
      const next = new Set(now);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  }, []);

  // Android's own Back, while a set's cards show: the same as the header's back arrow
  useFocusEffect(useCallback(() => {
    if (!visible || !shown) return undefined;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { goBackInApp(); return true; });
    return () => listener.remove();
  }, [visible, shown]));

  return (
    <View style={[styles.fill, !visible && styles.hidden]}>
      {/* The list of sets (hidden, not removed, while a set's cards show) */}
      <View style={[styles.fill, shown !== null && styles.hidden]}>
        <View style={styles.searchBox}>
          <TextField
            accessibilityLabel="Search sets"
            placeholder="Search sets…"
            value={typed}
            onChangeText={setTyped}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
          />
        </View>

        {sets.isError ? (
          <View style={styles.message}>
            <SearchError title="Couldn't load the sets" message={(sets.error as Error).message || 'Something went wrong.'}
                         onRetry={() => sets.refetch()} retrying={sets.isFetching} />
          </View>
        ) : sets.isPending ? (
          <Text style={[styles.note, { color: colors.muted }]} accessibilityLiveRegion="polite">Loading the sets…</Text>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(result) => result.node.code}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={[styles.note, { color: colors.muted }]}>No set matches "{typed.trim()}".</Text>}
            renderItem={({ item }) => (
              <SetRow result={item} icons={icons.data} open={item.open || opened.has(item.node.code)} onToggle={toggle} onOpen={open} />
            )}
          />
        )}
      </View>

      {/* One set's cards */}
      {shown && (
        <SetCardsPage
          key={shown.code}
          set={{ code: shown.code, name: shown.name, count: shown.count, icon: icons.data?.get(shown.code) ?? shown.icon }}
          onPickCard={onPickCard}
          visible={visible}
          usingBinders={usingBinders}
          announce={announce}
          jumpTo={jump?.set === shown.code ? jump.number : null}
          onJump={jumpToCard}
          onJumped={() => setJump(null)}
        />
      )}
    </View>
  );
}

/* ---------------------------------------------------------------------
   ONE SET IN THE LIST: its row, and under it (when open) its extras
   --------------------------------------------------------------------- */
function SetRow({ result, icons, open, onToggle, onOpen }: {
  result: SetResult;
  icons: Map<string, string> | undefined;
  open: boolean;
  onToggle: (code: string) => void;
  onOpen: (set: SetInfo) => void;
}) {
  const colors = useColors();
  const { node, hits } = result;
  const hasKids = node.kids.length > 0;
  const symbol = icons?.get(node.code) ?? node.icon;
  return (
    <View>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        {/* The whole left part is one big area to tap: the symbol (tall as both lines) and the two lines */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${node.name}, ${plural(node.count, 'card')}${node.released ? `, released ${dateText(node.released)}` : ''}. Opens its cards.`}
          onPress={() => onOpen(node)}
          style={({ pressed }) => [styles.rowMain, pressed && { backgroundColor: colors.surfaceHover }]}
        >
          <View style={[styles.symbolBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {symbol ? <Image source={{ uri: symbol }} style={styles.symbol} contentFit="contain" tintColor={colors.iconTint} /> : null}
          </View>
          <View style={styles.texts}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{node.name} ({node.code.toUpperCase()})</Text>
            <View style={styles.secondLine}>
              <Text style={[styles.small, { color: colors.muted }]} numberOfLines={1}>{plural(node.count, 'card')}</Text>
              <Text style={[styles.small, { color: colors.muted }]} numberOfLines={1}>{dateText(node.released)}</Text>
            </View>
          </View>
        </Pressable>
        {/* The small arrow at the end: shows or hides the extras (only for a set that has some) */}
        {hasKids && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${open ? 'Hide' : 'Show'} the other sets released with ${node.name}`}
            accessibilityState={{ expanded: open }}
            onPress={() => onToggle(node.code)}
            style={({ pressed }) => [styles.arrow, { borderLeftColor: colors.border }, pressed && { backgroundColor: colors.surfaceHover }]}
          >
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={open ? colors.accent : colors.muted} />
          </Pressable>
        )}
      </View>

      {/* The extras, right under the set: a shaded block, a Commander set's own extras one step in */}
      {open && hasKids && (
        <View style={[styles.kids, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {node.kids.map((kid) => (
            <KidRow key={kid.code} kid={kid} symbol={icons?.get(kid.code) ?? kid.icon} hit={hits.has(kid.code)} onOpen={onOpen} />
          ))}
        </View>
      )}
    </View>
  );
}

// One extra set: tokens, Commander, Timeshifts, promos... (orange when the search matched it)
function KidRow({ kid, symbol, hit, onOpen }: { kid: SetKid; symbol: string | undefined; hit: boolean; onOpen: (set: SetInfo) => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kid.name}, ${plural(kid.count, 'card')}. Opens its cards.`}
      onPress={() => onOpen(kid)}
      style={({ pressed }) => [styles.kid, { paddingLeft: 6 + (kid.depth - 1) * 22 }, pressed && { backgroundColor: colors.surfaceHover }]}
    >
      {symbol ? <Image source={{ uri: symbol }} style={styles.kidSymbol} contentFit="contain" tintColor={colors.iconTint} /> : <View style={styles.kidSymbol} />}
      <Text style={[styles.kidName, { color: hit ? colors.accent : colors.text, fontWeight: hit ? '700' : '500' }]} numberOfLines={1}>{kid.name}</Text>
      <Text style={[styles.small, { color: colors.muted }]}>{kid.count.toLocaleString('en-US')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Out of sight but still there, so it keeps what it shows
  hidden: { display: 'none' },
  searchBox: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: SPACE.l, paddingTop: 10, paddingBottom: 6 },
  message: { paddingHorizontal: SPACE.l },
  note: { fontSize: 14, paddingHorizontal: SPACE.l, paddingTop: 12 },
  list: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: SPACE.l, paddingBottom: 90 },
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 2, minHeight: 62 },
  // The symbol's box is as tall as the two lines of text beside it
  symbolBox: { width: 44, height: 44, borderRadius: RADIUS - 2, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  symbol: { width: 30, height: 30 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  secondLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  small: { fontSize: 13, fontVariant: ['tabular-nums'] },
  // The arrow's area: a tall strip at the end of the row
  arrow: { width: 52, alignItems: 'center', justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth },
  kids: { paddingVertical: 4, paddingLeft: 50, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: RADIUS - 2, borderBottomRightRadius: RADIUS - 2, marginBottom: 4 },
  kid: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingRight: 6, borderRadius: 6 },
  kidSymbol: { width: 20, height: 20 },
  kidName: { flex: 1, minWidth: 0, fontSize: 15 },
});
