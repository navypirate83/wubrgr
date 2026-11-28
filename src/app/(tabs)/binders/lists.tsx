/* =====================================================================
   LISTS (/binders/lists)
   The other side of The Shelf tab: your card lists (a want list, cards
   to trade, upgrades for a deck...). From top to bottom: the Binders /
   Lists switch (here the Lists button is faded, and the Binders one goes
   back to the shelf), the search bar (it searches your lists' names),
   the "Add list" button, then your lists, one row each, and a message
   line (only when something went wrong).
   - the Sort button (under the Add buttons) puts the lists in order: My own
     order (the start), name, recently opened, newest or most cards (see
     shelfSort.ts). In My own order, a held list also has Move up and Move down.
   Each row is plain (no colors or icons): the list's name in bold, how
   many cards it has under that, and an arrow.
   - tap a row to open the list
   - press and HOLD a row for its options: Rename (a small window with
     the name in a box) and Delete (it asks first)
   - pull the page DOWN to load the lists again (from Google Drive, when
     signed in)
   Lists are saved like binders: in Google Drive when signed in, or on
   this device only (see listStorage.ts and googleDrive.ts). With no
   lists yet, the page says so, with a picture of a notebook.
   ===================================================================== */

import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import ListSearch from '@/components/lists/ListSearch';
import PopupWindow from '@/components/PopupWindow';
import ShelfSelectionBar from '@/components/binders/ShelfSelectionBar';
import { isCtrlClick } from '@/lib/ctrlClick';
import { cardsOnLists, resetLists } from '@/lib/resetValue';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import {
  addListToDevice, forgetList, loadLists, moveList, nextListName, renameList, type CardList,
} from '@/lib/listStorage';
import { ShelfHeaderBar, ShelfSortBar, isOwnOrder, useShelfSort } from '@/components/ShelfSort';
import { sortShelf, withShelfHeaders } from '@/lib/shelfSort';
import { markOpened, stampsFor } from '@/lib/shelfStamps';
import { DriveError, createListFile, syncList, trashListFile } from '@/lib/googleDrive';
import { reconcileWithDrive } from '@/lib/driveSync';
import { cardCountText } from '@/lib/binderStorage';
import { askYesNo, showMessage } from '@/lib/dialogs';
import ImportCardsDialog from '@/components/ImportCardsDialog';
import { cardsForCollection } from '@/lib/collectionImport';
import { summaryText, type ImportSummary } from '@/lib/deckImportRun';
import type { ImportedDeck } from '@/lib/deckImport';
import { hapticTap } from '@/lib/haptics';
import { RADIUS } from '@/theme/colors';
import SymbolText from '@/components/SymbolText';

// The page is never wider than the shelf of binders (points), with the
// same space around its edge
const PAGE_MAX_WIDTH = 1400;
const PAGE_PADDING = 16;

// The longest a list's name can be
const NAME_LIMIT = 40;

// Opening a list: its page slides in over this one
function openList(id: string) {
  markOpened(id);
  router.push(`/binders/list/${encodeURIComponent(id)}` as never);
}

export default function ListsScreen() {
  const colors = useColors();
  const { usingBinders, localMode } = useAccount();
  // The lists (this device's copy to start, then Drive's once loaded),
  // the message line (red: something went wrong), whether a new list is
  // being made, and whether the page is being pulled down to load again
  const [lists, setLists] = useState<CardList[]>(loadLists);
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Which window is open: a held list's options, or Rename (with the
  // name being typed)
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  // Lists picked together (Ctrl+click on a computer, or "Select multiple" in a held list's options): their ids.
  // While any are picked, a tap
  // picks or un-picks a list instead of opening it, and a floating bar at the top has Rename, Reset value and Delete.
  const [selected, setSelected] = useState<string[]>([]);
  // How tall the search box and the Add / Import buttons are (measured), for the floating bar to cover
  const [coverH, setCoverH] = useState(170);
  const toggleSelected = (id: string) => setSelected((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  // Something went wrong talking to Google Drive: say what, in plain words
  function problem(err: unknown, what: string) {
    setMessage(err instanceof DriveError && err.signedOut
      ? 'Your Google sign-in has run out. Sign in again on the Home tab.'
      : `${what} ${(err as Error).message}`);
  }

  // Load the lists again: this device's copy first, then compare with
  // Google Drive (see lib/driveSync.ts). If they differ, a window asks
  // which way to sync; no list on this device is removed unless the
  // person chooses "Drive to phone". "fromUser" is true when pulling the
  // page down, which asks again after a "Not now".
  const reload = useCallback(async (fromUser = false) => {
    setLists(loadLists());
    if (localMode) return;
    try {
      await reconcileWithDrive({ fromUser });
      setLists(loadLists());
      setMessage('');
    } catch (err) {
      problem(err, 'Couldn\'t load your lists from Google Drive.');
    }
  }, [localMode]);

  // Every time this page comes into view (a list's cards may have changed)
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // Pulling the page down: load again, with the spinning wheel showing
  async function refresh() {
    setRefreshing(true);
    await reload(true);
    setRefreshing(false);
  }

  // "Add list": make a list called "List 1" (or the next free number), in
  // Drive when signed in, then open the Rename window to name it
  async function add() {
    setAdding(true);
    const name = nextListName();
    try {
      const file = await createListFile(name);
      addListToDevice(file.id, name);
      setLists(loadLists());
      setMessage('');
      setRenaming({ id: file.id, name });
    } catch (err) {
      problem(err, 'Couldn\'t make the list in Google Drive.');
    }
    setAdding(false);
  }

  // "Import a list": make a new list from a pasted list of cards or a file
  // (in Drive when signed in) named with the next free "List 3" (rename it any
  // time), then open it. Cards that couldn't be found are skipped and listed.
  const [importing, setImporting] = useState(false);
  const madeList = useRef<string | null>(null);
  async function importList(imported: ImportedDeck): Promise<ImportSummary> {
    const { cards, notFound } = await cardsForCollection(imported);
    const name = nextListName();
    const file = await createListFile(name, cards);
    addListToDevice(file.id, name, cards);
    madeList.current = file.id;
    return { copies: cards.reduce((sum, card) => sum + (card.count ?? 1), 0), notFound };
  }

  // "Save" in the Rename window: keep the new name here, then in Drive
  async function saveName() {
    if (!renaming) return;
    const { id, name } = renaming;
    setRenaming(null);
    renameList(id, name);
    setLists(loadLists());
    try {
      await syncList(id);
    } catch (err) {
      problem(err, 'Couldn\'t save the new name to Google Drive.');
    }
  }

  // "Delete" in a list's options: ask, then move its file to the Drive
  // trash (when signed in) and forget it here
  async function confirmDelete(list: CardList) {
    setMenuId(null);
    const yes = await askYesNo(`Delete ${list.name}?`,
      `It has ${cardCountText(list.cards.length)}.${localMode ? ' This can\'t be undone.' : ' It goes to your Google Drive trash.'}`,
      'Yes, delete', 'No');
    if (!yes) return;
    try {
      await trashListFile(list.id);
      forgetList(list.id);
      setLists(loadLists());
    } catch (err) {
      problem(err, 'Couldn\'t delete the list.');
    }
  }

  // "Delete" for the picked lists: ask once, then delete each the same way as one list
  async function deletePicked(ids: string[]) {
    const doomed = loadLists().filter((l) => ids.includes(l.id));
    if (doomed.length === 0) return;
    const yes = await askYesNo(
      doomed.length === 1 ? `Delete ${doomed[0].name}?` : `Delete these ${doomed.length} lists?`,
      `${doomed.map((l) => l.name).join(', ')}: ${cardCountText(doomed.reduce((sum, l) => sum + l.cards.length, 0))} in all.${localMode ? " This can't be undone." : ' They go to your Google Drive trash.'}`,
      'Yes, delete', 'No');
    if (!yes) return;
    try {
      for (const list of doomed) {
        await trashListFile(list.id);
        forgetList(list.id);
      }
    } catch (err) {
      problem(err, "Couldn't delete the lists.");
    }
    setLists(loadLists());
  }

  // "Reset value" for the picked lists: ask first, then every card's added price becomes today's price
  async function resetPicked(ids: string[]) {
    const chosen = loadLists().filter((l) => ids.includes(l.id));
    if (chosen.length === 0) return;
    const cards = cardsOnLists(chosen.map((l) => l.id));
    const what = chosen.length === 1 ? chosen[0].name : `${chosen.length} lists`;
    const yes = await askYesNo(
      `Reset the value of ${cards} ${cards === 1 ? 'card' : 'cards'} in ${what}?`,
      "Each card's added price becomes today's price, and the % changes start again from 0. This can't be undone.",
      'Yes, reset', 'No');
    if (!yes) return;
    setAdding(true);
    try {
      const { reset, skipped } = await resetLists(chosen.map((l) => l.id));
      setLists(loadLists());
      showMessage('Value reset', `Reset the value of ${reset} ${reset === 1 ? 'card' : 'cards'} in ${what}${skipped > 0 ? ` (${skipped} had no price today and kept their old one)` : ''}.`);
    } catch (err) {
      problem(err, "Couldn't reset the value.");
    }
    setAdding(false);
  }

  // The lists in the order chosen with the Sort button, with a header bar before
  // each group when the sort has groups (letters)
  const { saved: sortSaved, headersOn } = useShelfSort('lists');
  const rows = useMemo(() => {
    const stamps = stampsFor(lists.map((l) => l.id));
    const items = lists.map((list) => ({
      id: list.id, name: list.name, list, cards: list.cards.length, used: stamps[list.id].used, made: stamps[list.id].made,
    }));
    return withShelfHeaders('lists', sortShelf('lists', items, sortSaved), sortSaved, headersOn);
  }, [lists, sortSaved, headersOn]);
  const ownOrder = isOwnOrder('lists', sortSaved);

  // Move up / Move down in a held list's options
  function move(id: string, by: -1 | 1) {
    moveList(id, by);
    setLists(loadLists());
  }

  // Not signed in and not using the app on this device: the shelf shows
  // how to start (lists are saved the same way as binders)
  if (!usingBinders) return <Redirect href="/binders" />;

  const menuList = menuId ? lists.find((l) => l.id === menuId) : undefined;

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
        // Pull down to load the lists again
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        // At the top: the search bar (drawn over the lists below, so its
        // drop-down can cover them), and Add list
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTop} onLayout={(event) => setCoverH(event.nativeEvent.layout.height)}>
              <ListSearch onPick={openList} />
              <Button label="Add list" icon="add" onPress={add} disabled={adding} />
              <Button label="Import a list" icon="cloud-upload-outline" kind="secondary" onPress={() => setImporting(true)} disabled={adding} />
            </View>
            <ShelfSortBar area="lists" />
          </View>
        }
        ListHeaderComponentStyle={styles.headerOnTop}
        // No lists yet: an intentional empty page, not a blank screen
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Image source={require('../../../../assets/images/notebook-outline.svg')} style={styles.emptyPicture}
                   contentFit="contain" tintColor={colors.muted} accessible={false} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No lists yet</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Tap Add list above to start one.</Text>
          </View>
        }
        // The message line, only when something went wrong
        ListFooterComponent={message ? <Text style={[styles.message, { color: colors.error }]}>{message}</Text> : undefined}
        renderItem={({ item: row }) => {
          // A header bar between groups
          if (row.kind === 'header') return <ShelfHeaderBar text={row.text} />;
          const item = row.item.list;
          return (
          // One list: tap to open, hold for its options, Ctrl+click (Cmd on a Mac) to pick several
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${cardCountText(item.cards.length)}`}
            accessibilityHint="Opens the list. Hold for Rename and Delete."
            accessibilityState={{ selected: selected.includes(item.id) }}
            onPress={(event) => (selected.length > 0 || isCtrlClick(event) ? toggleSelected(item.id) : openList(item.id))}
            onLongPress={() => { hapticTap(); setMenuId(item.id); }}
            delayLongPress={500}
            style={({ pressed }) => [styles.row, { backgroundColor: selected.includes(item.id) ? `${colors.accent}2e` : pressed ? colors.surfaceHover : colors.surface, borderColor: selected.includes(item.id) ? colors.accent : colors.border }]}
          >
            {/* A picked list has an orange check (the highlight is the main sign; the check is for people who can't tell it) */}
            {selected.includes(item.id) && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
            <View style={styles.rowText}>
              <SymbolText style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.name}</SymbolText>
              <Text style={[styles.rowCount, { color: colors.muted }]}>{cardCountText(item.cards.length)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.muted} />
          </Pressable>
          );
        }}
      />

      {/* While lists are picked: the floating bar over the top */}
      {selected.length > 0 && (
        <ShelfSelectionBar
          count={selected.length} noun="list" editLabel="Rename" busy={adding} coverHeight={coverH}
          onEdit={() => { const list = lists.find((l) => l.id === selected[0]); setSelected([]); if (list) setRenaming({ id: list.id, name: list.name }); }}
          onReset={() => { const ids = selected; setSelected([]); resetPicked(ids); }}
          onDelete={() => { const ids = selected; setSelected([]); deletePicked(ids); }}
          onCancel={() => setSelected([])}
        />
      )}

      {/* A held list's options: Rename, Reset value, Select multiple and Delete */}
      {menuList && (
        <PopupWindow title={menuList.name} onClose={() => setMenuId(null)}
                     buttons={[{ label: 'Close', onPress: () => setMenuId(null), kind: 'secondary' }]}>
          <View style={styles.menu}>
            <Button label="Rename" icon="create-outline" kind="secondary"
                    onPress={() => { setMenuId(null); setRenaming({ id: menuList.id, name: menuList.name }); }} />
            <Button label="Reset value" icon="refresh-outline" kind="secondary" disabled={adding}
                    onPress={() => { setMenuId(null); resetPicked([menuList.id]); }} />
            <Button label="Select multiple" icon="checkmark-circle-outline" kind="secondary"
                    onPress={() => { setMenuId(null); setSelected([menuList.id]); }} />
            {/* Moving by hand only makes sense in "My own order" */}
            {ownOrder && lists.findIndex((l) => l.id === menuList.id) > 0 && (
              <Button label="Move up" icon="arrow-up" kind="secondary" onPress={() => move(menuList.id, -1)} />
            )}
            {ownOrder && lists.findIndex((l) => l.id === menuList.id) < lists.length - 1 && (
              <Button label="Move down" icon="arrow-down" kind="secondary" onPress={() => move(menuList.id, 1)} />
            )}
            <Button label="Delete" icon="trash-outline" kind="danger" onPress={() => confirmDelete(menuList)} />
          </View>
        </PopupWindow>
      )}

      {/* Import a list: a pasted list of cards or a file, made into a new list */}
      {importing && (
        <ImportCardsDialog
          title="Import a list"
          run={importList}
          onCancel={() => setImporting(false)}
          onDone={(summary: ImportSummary) => {
            setImporting(false);
            setLists(loadLists());
            // Cards that couldn't be found are listed, just for information
            if (summary.notFound.length > 0) showMessage('Import finished', summaryText(summary));
            if (madeList.current) openList(madeList.current);
          }}
        />
      )}

      {/* Rename: the name in a box, then Save (or Cancel to keep it) */}
      {renaming && (
        <PopupWindow title="Rename list" onClose={() => setRenaming(null)}
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
            selectTextOnFocus
            maxLength={NAME_LIMIT}
            autoCapitalize="words"
          />
        </PopupWindow>
      )}
    </KeyboardAvoidingView>
  );
}

// The page's look, matching the shelf of binders. Each list is a
// rounded, outlined row like the shelf's original binder rows.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: PAGE_PADDING, gap: 12, width: '100%', maxWidth: PAGE_MAX_WIDTH, alignSelf: 'center', flexGrow: 1 },
  header: { gap: 10, marginBottom: 4 },
  headerOnTop: { zIndex: 10 },
  // The search box and the Add / Import buttons (the floating selection bar is laid over these)
  headerTop: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: RADIUS * 1.2, borderWidth: 1 },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontSize: 18, fontWeight: '700' },
  rowCount: { fontSize: 14 },
  menu: { gap: 8 },
  message: { fontSize: 15, textAlign: 'center', marginTop: 8 },
  empty: { alignItems: 'center', gap: 10, padding: 28, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: RADIUS * 1.4, marginTop: 8 },
  emptyPicture: { width: 64, height: 74 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
