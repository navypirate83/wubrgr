/* =====================================================================
   PRISM (/binders/prism)
   The shelf's fourth section, only for accounts with the PRISM role (and
   admins); anyone else who gets here (by typing the address, or from an old
   link) is sent straight back to the shelf, and nothing in the app points
   to this page for them.
   PRISM shares one physical card between several Commander decks, by
   painting a small mark on its inner sleeve for each deck (see
   docs/prism-plan.md). This page lists your PRISM SETS: each is a group of
   decks that share cards. "Add set" makes one; tap a set to open it; hold
   one for Rename and Delete (deleting a set never touches your decks).
   ===================================================================== */

import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAccount } from '@/hooks/useAccount';
import { useColors } from '@/hooks/useTheme';
import Button from '@/components/Button';
import PopupWindow from '@/components/PopupWindow';
import TextField from '@/components/TextField';
import DeckSquare from '@/components/prism/DeckSquare';
import { loadDecks } from '@/lib/deckStorage';
import { addPrismSet, forgetPrismSet, loadPrismSets, nextPrismSetName, renamePrismSet, SET_NAME_LIMIT, type PrismSet } from '@/lib/prismStorage';
import { planFor, totalsOf } from '@/lib/prismPlan';
import { askYesNo } from '@/lib/dialogs';
import { hapticTap } from '@/lib/haptics';
import { RADIUS } from '@/theme/colors';

// The page is never wider than this (points), with the same space around its edge
const PAGE_MAX_WIDTH = 1400;
const PAGE_PADDING = 16;

function openSet(id: string) {
  router.push(`/binders/prismset/${encodeURIComponent(id)}` as never);
}

export default function PrismScreen() {
  const colors = useColors();
  const { hasPrism, usingBinders } = useAccount();
  // The sets, your decks (for the counts), and which window is open: a new
  // set's name being typed, a held set's options, or Rename
  const [sets, setSets] = useState<PrismSet[]>(loadPrismSets);
  const [decks, setDecks] = useState(loadDecks);
  const [naming, setNaming] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  // Every time this page comes into view (a deck may have changed)
  useFocusEffect(useCallback(() => { setSets(loadPrismSets()); setDecks(loadDecks()); }, []));

  // "Create" in the new set window: make it and open it
  function create() {
    if (naming === null) return;
    const id = addPrismSet(naming);
    setNaming(null);
    setSets(loadPrismSets());
    openSet(id);
  }

  // "Save" in the Rename window
  function saveName() {
    if (!renaming) return;
    renamePrismSet(renaming.id, renaming.name);
    setRenaming(null);
    setSets(loadPrismSets());
  }

  // "Delete" in a set's options: ask first
  async function confirmDelete(set: PrismSet) {
    setMenuId(null);
    const yes = await askYesNo(`Delete ${set.name}?`, 'The set and what it remembers about your painted sleeves are removed. Your decks aren\'t touched. This can\'t be undone.', 'Yes, delete', 'No');
    if (!yes) return;
    forgetPrismSet(set.id);
    setSets(loadPrismSets());
  }

  // No PRISM role (or not using the binders at all): back to the shelf
  if (!hasPrism || !usingBinders) return <Redirect href="/binders" />;

  const menuSet = menuId ? sets.find((s) => s.id === menuId) : undefined;

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <FlatList
        showsVerticalScrollIndicator={false}
        data={sets}
        keyExtractor={(set) => set.id}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.lead, { color: colors.muted }]}>Share one physical copy of a card between your Commander decks.</Text>
            <Button label="Add set" icon="add" onPress={() => setNaming(nextPrismSetName())} />
          </View>
        }
        // No sets yet: an intentional empty page, not a blank screen
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Image source={require('../../../../assets/images/prism-icon.png') as number} style={styles.emptyPicture} contentFit="contain" accessible={false} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No PRISM sets yet</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Tap Add set above, then choose the Commander decks that share cards.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const totals = totalsOf(planFor(item, decks));
          const inSet = item.decks.filter((d) => decks.some((deck) => deck.id === d.deckId));
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${inSet.length} ${inSet.length === 1 ? 'deck' : 'decks'}, ${totals.needed} copies needed`}
              accessibilityHint="Opens the set. Hold for Rename and Delete."
              onPress={() => openSet(item.id)}
              onLongPress={() => { hapticTap(); setMenuId(item.id); }}
              delayLongPress={500}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceHover : colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.rowCount, { color: colors.muted }]}>
                  {inSet.length} {inSet.length === 1 ? 'deck' : 'decks'} · {totals.needed} {totals.needed === 1 ? 'copy' : 'copies'} needed
                  {totals.saved > 0 ? ` · ${totals.saved} fewer to buy` : ''}
                </Text>
                {inSet.length > 0 && (
                  <View style={styles.squares}>
                    {[...inSet].sort((a, b) => a.slot - b.slot).slice(0, 24).map((d) => <DeckSquare key={d.deckId} slot={d.slot} size={18} />)}
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.muted} />
            </Pressable>
          );
        }}
      />

      {/* Add set: a name */}
      {naming !== null && (
        <PopupWindow title="New PRISM set" onClose={() => setNaming(null)}
                     buttons={[
                       { label: 'Cancel', onPress: () => setNaming(null), kind: 'secondary' },
                       { label: 'Create', onPress: create, disabled: !naming.trim() },
                     ]}>
          <TextField label="Name" value={naming} onChangeText={setNaming} onSubmitEditing={create} returnKeyType="done"
                     autoFocus selectTextOnFocus maxLength={SET_NAME_LIMIT} autoCapitalize="words" />
        </PopupWindow>
      )}

      {/* A held set's options: Rename and Delete */}
      {menuSet && (
        <PopupWindow title={menuSet.name} onClose={() => setMenuId(null)}
                     buttons={[{ label: 'Close', onPress: () => setMenuId(null), kind: 'secondary' }]}>
          <View style={styles.menu}>
            <Button label="Rename" icon="create-outline" kind="secondary"
                    onPress={() => { setMenuId(null); setRenaming({ id: menuSet.id, name: menuSet.name }); }} />
            <Button label="Delete" icon="trash-outline" kind="danger" onPress={() => confirmDelete(menuSet)} />
          </View>
        </PopupWindow>
      )}

      {/* Rename: the name in a box, then Save (or Cancel to keep it) */}
      {renaming && (
        <PopupWindow title="Rename set" onClose={() => setRenaming(null)}
                     buttons={[
                       { label: 'Cancel', onPress: () => setRenaming(null), kind: 'secondary' },
                       { label: 'Save', onPress: saveName, disabled: !renaming.name.trim() },
                     ]}>
          <TextField label="Name" value={renaming.name} onChangeText={(name) => setRenaming({ ...renaming, name })} onSubmitEditing={saveName}
                     returnKeyType="done" autoFocus selectTextOnFocus maxLength={SET_NAME_LIMIT} autoCapitalize="words" />
        </PopupWindow>
      )}
    </KeyboardAvoidingView>
  );
}

// The page's look, matching the Decks page
const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: PAGE_PADDING, gap: 12, width: '100%', maxWidth: PAGE_MAX_WIDTH, alignSelf: 'center', flexGrow: 1 },
  header: { gap: 10, marginBottom: 4 },
  lead: { fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: RADIUS * 1.2, borderWidth: 1 },
  rowText: { flex: 1, gap: 3 },
  rowName: { fontSize: 18, fontWeight: '700' },
  rowCount: { fontSize: 14 },
  squares: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 4 },
  menu: { gap: 8 },
  empty: { alignItems: 'center', gap: 10, padding: 28, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS * 1.4, marginTop: 8 },
  emptyPicture: { width: 74, height: 74, borderRadius: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
