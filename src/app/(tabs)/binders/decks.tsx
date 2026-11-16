/* =====================================================================
   DECKS (/binders/decks)
   The third page of The Shelf, after Binders and Lists. From top to
   bottom: the search bar (it searches your decks' names AND the cards
   inside them), the "Add deck" button, then your decks, one row each.
   - on a phone its header has the same small Binders / Lists / Decks
     buttons as the other two pages (see ShelfSwitch.tsx and
     binders/_layout.tsx), and on a wide screen the side menu lists Decks
     under Lists and highlights it here (see SideMenu.tsx)
   - "Add deck" asks for a name and a format (Commander, Modern...), then
     opens the new deck
   - tap a row to open the deck
   - press and HOLD a row for its options: Rename and Delete (it asks first)
   - the Sort button (under Add deck) puts the decks in order: My own order
     (the start), name, recently opened, newest, most cards, format, not legal
     first, highest bracket or most cards missing (see shelfSort.ts). In My own order, a held
     deck also has Move up and Move down.
   Each row is plain, like the Lists page: the deck's name in bold, its
   format and how many cards it has under that, and an arrow.
   Decks are saved on this device and in your account (see deckStorage.ts
   and serverSync.ts).
   ===================================================================== */

import { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import DeckSearch from '@/components/decks/DeckSearch';
import PopupWindow from '@/components/PopupWindow';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import NewDeckDialog from '@/components/decks/NewDeckDialog';
import { addDeck, forgetDeck, loadDecks, moveDeck, nextDeckName, renameDeck, type Deck } from '@/lib/deckStorage';
import { ShelfHeaderBar, ShelfSortBar, isOwnOrder, useShelfSort } from '@/components/ShelfSort';
import { sortShelf, withShelfHeaders, parseShelfSort } from '@/lib/shelfSort';
import { markOpened, stampsFor } from '@/lib/shelfStamps';
import { loadOwned, marksFor } from '@/lib/deckOwnership';
import { readImportSource, importIntoDeck, summaryText } from '@/lib/deckImportRun';
import { deckProblems } from '@/lib/deckLegality';
import { useBannedIn } from '@/lib/bannedCards';
import type { ImportedDeck } from '@/lib/deckImport';
import { deckFormat } from '@/lib/deckFormats';
import { bracketText, countGameChangers, effectiveBracket, hasBrackets } from '@/lib/deckBrackets';
import { gameChangersReady, useGameChangers } from '@/lib/gameChangers';
import { cardCountText } from '@/lib/binderStorage';
import { askYesNo, showMessage } from '@/lib/dialogs';
import { hapticTap } from '@/lib/haptics';
import { RADIUS } from '@/theme/colors';
import SymbolText from '@/components/SymbolText';

// The page is never wider than the shelf of binders (points), with the
// same space around its edge
const PAGE_MAX_WIDTH = 1400;
const PAGE_PADDING = 16;

// The longest a deck's name can be
const NAME_LIMIT = 40;

// How many cards a deck holds, counting every copy
const cardsIn = (deck: Deck) => deck.cards.reduce((sum, card) => sum + (card.count ?? 1), 0);

// Opening a deck: its page slides in over this one
function openDeck(id: string) {
  markOpened(id);
  router.push(`/binders/deck/${encodeURIComponent(id)}` as never);
}

export default function DecksScreen() {
  const colors = useColors();
  const { usingBinders } = useAccount();
  // The decks, the new deck being made (its name and format), and which
  // window is open: a held deck's options, or Rename (with the name being typed)
  const [decks, setDecks] = useState<Deck[]>(loadDecks);
  // The banned lists of the formats your decks use (to mark a deck that has a banned card in it as not legal)
  const bannedIn = useBannedIn(decks.map((d) => d.format));
  // The Game Changers list (they set the lowest power bracket a Commander deck may have)
  const isGameChanger = useGameChangers();
  const [making, setMaking] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  // Every time this page comes into view (a deck's cards may have changed)
  useFocusEffect(useCallback(() => { setDecks(loadDecks()); }, []));

  // "Create" in the new deck window: make it and open it
  // With a decklist (pasted, a link or a file) the deck is filled from it: the
  // list is read first (a list that can't be read leaves the window open, with
  // nothing made); a name left as it was suggested takes the list's own name,
  // and the list's format wins over the one picked
  async function create(name: string, format: string, source?: string) {
    let imported: ImportedDeck | undefined;
    if (source) {
      try {
        imported = await readImportSource(source);
      } catch (err) {
        showMessage("Couldn't import that", (err as Error).message);
        return;
      }
    }
    const keptSuggestion = name.trim() === nextDeckName();
    const id = addDeck(keptSuggestion && imported?.name ? imported.name.slice(0, 40) : name, imported?.format ?? format);
    let skipped: string | null = null;
    if (imported) {
      try {
        const summary = await importIntoDeck(id, imported);
        if (summary.notFound.length > 0) skipped = summaryText(summary);
      } catch (err) {
        skipped = `The deck was made, but its cards couldn't be added. ${(err as Error).message}`;
      }
    }
    setMaking(false);
    setDecks(loadDecks());
    openDeck(id);
    if (skipped) showMessage('Import finished', skipped);
  }

  // "Save" in the Rename window
  function saveName() {
    if (!renaming) return;
    renameDeck(renaming.id, renaming.name);
    setRenaming(null);
    setDecks(loadDecks());
  }

  // "Delete" in a deck's options: ask first
  async function confirmDelete(deck: Deck) {
    setMenuId(null);
    const yes = await askYesNo(`Delete ${deck.name}?`, `It has ${cardCountText(cardsIn(deck))}. This can't be undone.`, 'Yes, delete', 'No');
    if (!yes) return;
    forgetDeck(deck.id);
    setDecks(loadDecks());
  }

  // The decks in the order chosen with the Sort button, with a header bar before
  // each group when the sort has groups (format, legal or not...)
  const { saved: sortSaved, headersOn } = useShelfSort('decks');
  // A Commander deck's power bracket, raised to the lowest its Game Changers allow (none for other formats)
  const bracketOf = (deck: Deck) => (hasBrackets(deck.format) ? effectiveBracket(deck.bracket, countGameChangers(deck.cards, isGameChanger)) : undefined);
  // (the sorted list is made again when the Game Changers list arrives)
  const gameChangersLoaded = gameChangersReady();
  const rows = useMemo(() => {
    const stamps = stampsFor(decks.map((d) => d.id));
    // What you own is only read when it's needed (for "Most cards missing")
    const owned = parseShelfSort('decks', sortSaved).sort === 'missing' ? loadOwned() : null;
    const items = decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      deck,
      cards: cardsIn(deck),
      format: deckFormat(deck.format).name,
      // A Commander deck's power bracket (none for other formats, or one not rated)
      bracket: bracketOf(deck),
      legal: deckProblems(deck, deckFormat(deck.format), (name) => bannedIn(deck.format, name)).length === 0,
      // Cards in the deck that you don't have in any binder (every copy counted)
      missing: owned ? marksFor(deck.cards, owned).reduce((sum, mark, i) => sum + (mark === false ? (deck.cards[i].count ?? 1) : 0), 0) : 0,
      used: stamps[deck.id].used,
      made: stamps[deck.id].made,
    }));
    return withShelfHeaders('decks', sortShelf('decks', items, sortSaved), sortSaved, headersOn);
  }, [decks, sortSaved, headersOn, bannedIn, isGameChanger, gameChangersLoaded]);
  const ownOrder = isOwnOrder('decks', sortSaved);

  // Move up / Move down in a held deck's options
  function move(id: string, by: -1 | 1) {
    moveDeck(id, by);
    setDecks(loadDecks());
  }

  // Not signed in and not using the app on this device: the shelf shows how to start
  if (!usingBinders) return <Redirect href="/binders" />;

  const menuDeck = menuId ? decks.find((d) => d.id === menuId) : undefined;

  return (
    // The keyboard pushes everything up instead of covering the search bar
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <FlatList
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={(row) => (row.kind === 'header' ? row.id : row.item.id)}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        // At the top: the search bar (drawn over the decks below, so its
        // drop-down can cover them), and Add deck
        ListHeaderComponent={
          <View style={styles.header}>
            <DeckSearch onPick={openDeck} />
            <Button label="Add deck" icon="add" onPress={() => setMaking(true)} />
            <ShelfSortBar area="decks" />
          </View>
        }
        ListHeaderComponentStyle={styles.headerOnTop}
        // No decks yet: an intentional empty page, not a blank screen
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Image source={require('../../../../assets/images/deckbox-outline.svg')} style={styles.emptyPicture}
                   contentFit="contain" tintColor={colors.muted} accessible={false} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No decks yet</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Tap Add deck above to start one.</Text>
          </View>
        }
        renderItem={({ item: row }) => {
          // A header bar between groups
          if (row.kind === 'header') return <ShelfHeaderBar text={row.text} />;
          const item = row.item.deck;
          return (
          // One deck: tap to open, hold for its options
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${deckFormat(item.format).name}${bracketOf(item) ? `, ${bracketText(bracketOf(item))}` : ''}, ${cardCountText(cardsIn(item))}${deckProblems(item, deckFormat(item.format), (name) => bannedIn(item.format, name)).length > 0 ? ', not legal' : ''}`}
            accessibilityHint="Opens the deck. Hold for Rename and Delete."
            onPress={() => openDeck(item.id)}
            onLongPress={() => { hapticTap(); setMenuId(item.id); }}
            delayLongPress={500}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceHover : colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.rowText}>
              <SymbolText style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.name}</SymbolText>
              <Text style={[styles.rowCount, { color: colors.muted }]}>
                {deckFormat(item.format).name} · {cardCountText(cardsIn(item))}
                {/* A Commander deck with a power bracket says which (Bracket 3 · Upgraded) */}
                {bracketOf(item) ? <Text style={{ color: colors.accent, fontWeight: '700' }}> · {bracketText(bracketOf(item))}</Text> : null}
                {/* A deck that isn't legal says so, in red (too many cards, or a banned card in it) */}
                {deckProblems(item, deckFormat(item.format), (name) => bannedIn(item.format, name)).length > 0
                  ? <Text style={{ color: colors.error, fontWeight: '700' }}> · Not legal</Text> : null}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.muted} />
          </Pressable>
          );
        }}
      />

      {/* Add deck: a name, and the format to build it for */}
      {making && <NewDeckDialog allowImport onCreate={create} onCancel={() => setMaking(false)} />}

      {/* A held deck's options: Rename and Delete */}
      {menuDeck && (
        <PopupWindow title={menuDeck.name} onClose={() => setMenuId(null)}
                     buttons={[{ label: 'Close', onPress: () => setMenuId(null), kind: 'secondary' }]}>
          <View style={styles.menu}>
            <Button label="Rename" icon="create-outline" kind="secondary"
                    onPress={() => { setMenuId(null); setRenaming({ id: menuDeck.id, name: menuDeck.name }); }} />
            {/* Moving by hand only makes sense in "My own order" */}
            {ownOrder && decks.findIndex((d) => d.id === menuDeck.id) > 0 && (
              <Button label="Move up" icon="arrow-up" kind="secondary" onPress={() => move(menuDeck.id, -1)} />
            )}
            {ownOrder && decks.findIndex((d) => d.id === menuDeck.id) < decks.length - 1 && (
              <Button label="Move down" icon="arrow-down" kind="secondary" onPress={() => move(menuDeck.id, 1)} />
            )}
            <Button label="Delete" icon="trash-outline" kind="danger" onPress={() => confirmDelete(menuDeck)} />
          </View>
        </PopupWindow>
      )}

      {/* Rename: the name in a box, then Save (or Cancel to keep it) */}
      {renaming && (
        <PopupWindow title="Rename deck" onClose={() => setRenaming(null)}
                     buttons={[
                       { label: 'Cancel', onPress: () => setRenaming(null), kind: 'secondary' },
                       { label: 'Save', onPress: saveName, disabled: !renaming.name.trim() },
                     ]}>
          <TextField
            label="Name"
            value={renaming.name}
            onChangeText={(name) => setRenaming({ ...renaming, name })}
            onSubmitEditing={saveName}
            returnKeyType="done"
            autoFocus
            selectTextOnFocus
            maxLength={NAME_LIMIT}
            autoCapitalize="words"
          />
        </PopupWindow>
      )}
    </KeyboardAvoidingView>
  );
}

// The page's look, matching the Lists page
const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: PAGE_PADDING, gap: 12, width: '100%', maxWidth: PAGE_MAX_WIDTH, alignSelf: 'center', flexGrow: 1 },
  header: { gap: 10, marginBottom: 4 },
  headerOnTop: { zIndex: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: RADIUS * 1.2, borderWidth: 1 },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontSize: 18, fontWeight: '700' },
  rowCount: { fontSize: 14 },
  menu: { gap: 8 },
  empty: { alignItems: 'center', gap: 10, padding: 28, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS * 1.4, marginTop: 8 },
  emptyPicture: { width: 74, height: 56 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
