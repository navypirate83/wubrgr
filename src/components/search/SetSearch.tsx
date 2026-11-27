/* =====================================================================
   THE CARD SEARCH ON A SET'S PAGE (Card Finder, Sets tab)
   A search box that works like the one in a binder (BinderSearch.tsx),
   with a switch beside it:
   - "This set" (on, the start): the set's own cards narrow as you type
     (the page does that: it's told the text through "onQuery"), and a list
     of the closest names drops down unless what's typed is already an
     exact card name. Tapping one scrolls to that card and highlights it.
   - "All sets" (off): the list shows printings from every paper set.
     Tapping one opens its set with the card highlighted.
   The search forgives small typos and part of a name, the same as
   everywhere else in the app (see lib/nameSearch.ts).
   ===================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import TextField from '@/components/TextField';
import { useColors } from '@/hooks/useTheme';
import { fuzzySearch, matchParts, prepareNames } from '@/lib/nameSearch';
import { isExactName, isSearching } from '@/lib/nameFilter';
import { loadCardNames, loadSetList, searchAllPrints, type ScryfallCard } from '@/lib/scryfall';
import { RADIUS, SPACE } from '@/theme/colors';

// Wait this long (milliseconds) after a key press before asking about all sets
const TYPING_PAUSE_MS = 350;
// Show at most this many results, taken from this many of the best-matching names
const MAX_RESULTS = 50;
const MAX_NAMES = 8;

// One row of the list: the card's name, the line under it, and what tapping it opens
type Found = { id: string; name: string; where: string; set: string; number: string };

// One printing as a row of the list
const asFound = (card: ScryfallCard, setName: string): Found => ({
  id: card.id,
  name: card.name,
  where: `${setName} · #${card.collector_number}`,
  set: card.set,
  number: card.collector_number,
});

type Props = {
  cards: ScryfallCard[];                              // the cards of the set on show
  onQuery: (text: string) => void;                    // what to narrow the set's cards by ('' for all of them)
  onPick: (set: string, number: string) => void;      // a result was tapped
};

export default function SetSearch({ cards, onQuery, onPick }: Props) {
  const colors = useColors();
  // What's typed, which sets are searched, and whether the list is open
  const [text, setText] = useState('');
  const [onlyThis, setOnlyThis] = useState(true);
  const [open, setOpen] = useState(false);
  // What was typed once the typing paused (searching all sets asks the internet, so not on every letter)
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Matches in this set: the names ranked best first, then each name's printings in set order
  const prepared = useMemo(() => prepareNames([...new Set(cards.map((card) => card.name))]), [cards]);
  const here = useMemo<Found[]>(() => {
    if (!onlyThis || !isSearching(text)) return [];
    return fuzzySearch(prepared, text)
      .flatMap((name) => cards.filter((card) => card.name === name))
      .slice(0, MAX_RESULTS)
      .map((card) => asFound(card, card.set.toUpperCase()));
  }, [onlyThis, text, prepared, cards]);

  // All sets: the best names from the list of every card (an exact name stands alone) ...
  const names = useQuery({ queryKey: ['card-names'], queryFn: loadCardNames, select: prepareNames, enabled: !onlyThis });
  const wanted = useMemo(() => {
    if (onlyThis || !isSearching(settled) || !names.data) return [];
    const ranked = fuzzySearch(names.data, settled);
    const exact = ranked.find((name) => isExactName([name], settled));
    return exact ? [exact] : ranked.slice(0, MAX_NAMES);
  }, [onlyThis, settled, names.data]);
  // ... then their printings, keeping only sets the Sets tab lists (so every row can be opened)
  const sets = useQuery({ queryKey: ['set-list'], queryFn: loadSetList, staleTime: 24 * 60 * 60 * 1000 });
  const prints = useQuery({
    queryKey: ['set-search-prints', wanted],
    queryFn: () => searchAllPrints(wanted),
    enabled: wanted.length > 0,
    staleTime: 60 * 60 * 1000,
  });
  const everywhere = useMemo<Found[]>(() => {
    const known = new Map((sets.data ?? []).map((set) => [set.code, set.name]));
    return (prints.data ?? [])
      // (Scryfall also matches one face's name, like an art card "Name // Name": keep only the names asked for)
      .filter((card) => known.has(card.set) && wanted.includes(card.name))
      .sort((a, b) => wanted.indexOf(a.name) - wanted.indexOf(b.name))
      .slice(0, MAX_RESULTS)
      .map((card) => asFound(card, known.get(card.set)!));
  }, [prints.data, sets.data, wanted]);

  const results = onlyThis ? here : everywhere;
  // Still waiting for the answer from all sets?
  const waiting = !onlyThis && (settled !== text || names.isPending || (wanted.length > 0 && (prints.isFetching || sets.isPending)));
  const failed = !onlyThis && (names.isError || prints.isError || sets.isError);
  // This set only, and an exact card name typed: the cards are already narrowed to it, so no list
  const exactHere = onlyThis && isExactName(here.map((found) => found.name), text);
  const showList = open && isSearching(text) && !exactHere;

  function handleChange(value: string) {
    setText(value);
    setOpen(true);
    onQuery(onlyThis ? value : '');
  }

  // A result was tapped (or Enter picked the top one): empty the box and go to the card
  function pick(found: Found | undefined) {
    if (!found) return;
    setText('');
    setOpen(false);
    onQuery('');
    onPick(found.set, found.number);
  }

  return (
    <View style={styles.wrap} accessibilityRole="search">
      {/* The box, with the switch beside it */}
      <View style={styles.searchRow}>
        <View style={[styles.field, styles.grow]}>
          <TextField
            accessibilityLabel="Search cards"
            placeholder={onlyThis ? 'Search this set…' : 'Search all sets…'}
            value={text}
            onChangeText={handleChange}
            onSubmitEditing={() => pick(results[0])}
            onKeyPress={(event) => { if (event.nativeEvent.key === 'Escape') { if (open) setOpen(false); else handleChange(''); } }}
            // Leaving the box closes the list (a moment later, so a tap on a result still counts)
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            style={styles.input}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => pick(results[0])} hitSlop={6}
                     style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}>
            <Ionicons name="search" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Which cards to search: "This set" (on) or "All sets" (off) */}
        <View style={styles.scope}>
          <Switch
            value={onlyThis}
            onValueChange={(on) => { setOnlyThis(on); setOpen(true); onQuery(on ? text : ''); }}
            trackColor={{ true: colors.accent, false: colors.switchTrack }}
            accessibilityLabel={onlyThis ? 'Searching this set. Switch to search all sets' : 'Searching all sets. Switch to search this set'}
          />
          <Text style={[styles.scopeWord, { color: colors.muted }]}>{onlyThis ? 'This set' : 'All sets'}</Text>
        </View>
      </View>

      {/* The results, dropping down over the cards */}
      {showList && (
        <View style={[styles.results, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }]}>
          <FlatList
            showsVerticalScrollIndicator={false}
            data={results}
            keyExtractor={(found) => found.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.noResults, { color: colors.muted }]}>
                {failed ? 'Couldn\'t search all sets. Check your internet connection.'
                  : waiting ? 'Searching…'
                  : `No cards in ${onlyThis ? 'this set' : 'any set'} match.`}
              </Text>
            }
            renderItem={({ item: found }) => {
              // The part of the name that matches what was typed is highlighted
              const parts = matchParts(found.name, text);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${found.name}, ${found.where}`}
                  onPress={() => pick(found)}
                  style={({ pressed }) => [styles.result, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.surfaceHover }]}
                >
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {parts.before}
                    <Text style={{ color: colors.accent, fontWeight: '700' }}>{parts.match}</Text>
                    {parts.after}
                  </Text>
                  <Text style={[styles.resultWhere, { color: colors.muted }]} numberOfLines={1}>{found.where}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </View>
  );
}

// The bar's look, the same as the binder's. "zIndex" keeps the list on top of the cards below.
const styles = StyleSheet.create({
  wrap: { zIndex: 10, paddingHorizontal: SPACE.l, paddingBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  field: { justifyContent: 'center' },
  input: { paddingRight: 44 },
  searchButton: { position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
  // The switch with its word under it
  scope: { alignItems: 'center', width: 56 },
  scopeWord: { fontSize: 12, marginTop: 2 },
  results: { position: 'absolute', top: 48, left: SPACE.l, right: SPACE.l, maxHeight: 320, borderWidth: 1, borderRadius: RADIUS, overflow: 'hidden' },
  noResults: { padding: 14, fontSize: 15 },
  result: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  resultName: { fontSize: 16 },
  resultWhere: { fontSize: 13, marginTop: 2 },
});
