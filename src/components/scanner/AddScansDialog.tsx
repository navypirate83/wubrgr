/* =====================================================================
   "ADD TO COLLECTION": WHERE SHOULD THE SCANNED CARDS GO?
   A list that pops up from the bottom. At the top are three pictures, evenly
   spaced, with no button boxes around them: a binder, a list and a deck.
   Tap one and the rows below change to that kind of thing. The first row is
   always "+ Binder" (or "+ List" / "+ Deck"), which makes a new one and puts
   the cards in it; under it come the ones you already have.
     - a BINDER gets the cards the way the app always adds them (a printing
       it already has gets more copies; the rest fill empty pockets, adding
       pages if needed): see scanItems.ts, addScansToBinder
     - a LIST gets them the same way (more copies of a printing it has)
     - a DECK gets them on its MAYBE BOARD, so they don't count towards the
       deck's size or legality until you move them into the main deck.
   ===================================================================== */

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PickerSheet } from '@/components/search/PickerSheet';
import CoverSwatch from '@/components/binders/CoverSwatch';
import NewBinderDialog from '@/components/binders/NewBinderDialog';
import NewDeckDialog from '@/components/decks/NewDeckDialog';
import PopupWindow from '@/components/PopupWindow';
import TextField from '@/components/TextField';
import SymbolText from '@/components/SymbolText';
import { BINDER_ICON, DECK_ICON, LIST_ICON } from '@/components/binder/CardScreen';
import { useColors } from '@/hooks/useTheme';
import { coverLook } from '@/lib/covers';
import { DEFAULT_PAGES, cardCountText, loadBinder, loadBinderList, saveBinder, saveBinderList } from '@/lib/binderStorage';
import { createBinderFile, createListFile } from '@/lib/googleDrive';
import { addListToDevice, loadLists, nextListName } from '@/lib/listStorage';
import { addDeck, loadDecks } from '@/lib/deckStorage';
import { addScansToBinder, addScansToDeckMaybe, addScansToList, type ScanItem } from '@/lib/scanner/scanItems';

type Kind = 'binder' | 'list' | 'deck';
type Stage = Kind | 'closing' | 'newBinder' | 'newList' | 'newDeck';

// One row in the list: a thing you have, or the "+ New" row at the top
type Row = { id: string; name: string; count: number; cover?: string; isNew?: boolean };

type Props = {
  items: ScanItem[];
  // The cards are safely added: "note" says where they went
  onDone: (note: string) => void;
  onCancel: () => void;
};

const KINDS: { kind: Kind; label: string; picture: number }[] = [
  { kind: 'binder', label: 'Binder', picture: BINDER_ICON },
  { kind: 'list', label: 'List', picture: LIST_ICON },
  { kind: 'deck', label: 'Deck', picture: DECK_ICON },
];

export default function AddScansDialog({ items, onDone, onCancel }: Props) {
  const colors = useColors();
  // Which kind is showing (or a window for making a new one; "closing" is the
  // moment between two pop-ups, since iPhones can't show one while another fades away)
  const [stage, setStage] = useState<Stage>('binder');
  const [kind, setKind] = useState<Kind>('binder');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>({ text: '' });
  const [listName, setListName] = useState('');
  const copies = items.reduce((sum, item) => sum + item.count, 0);
  const cardsText = `${copies} ${copies === 1 ? 'card' : 'cards'}`;

  // Close one pop-up, then open the next
  function goTo(next: Stage) {
    setStage('closing');
    setTimeout(() => setStage(next), Platform.OS === 'ios' ? 350 : 0);
  }

  // Run an add, showing "Adding…" and any problem
  async function run(work: () => Promise<string>, back: Stage) {
    setBusy(true);
    setMessage({ text: 'Adding…' });
    try {
      onDone(await work());
    } catch (err) {
      setBusy(false);
      setMessage({ text: (err as Error).message, error: true });
      if (back !== stage) goTo(back);
    }
  }

  const addToBinder = (id: string, name: string) => run(async () => {
    const { pagesAdded } = await addScansToBinder(id, items);
    return `Added ${cardsText} to ${name}${pagesAdded > 0 ? ` (${pagesAdded} ${pagesAdded === 1 ? 'page' : 'pages'} added)` : ''}.`;
  }, 'binder');

  const addToList = (id: string, name: string) => run(async () => {
    await addScansToList(id, items);
    return `Added ${cardsText} to the list ${name}.`;
  }, 'list');

  const addToDeck = (id: string, name: string) => run(async () => {
    await addScansToDeckMaybe(id, items);
    return `Added ${cardsText} to the maybe board of ${name}.`;
  }, 'deck');

  // "Create" in the New binder window: an empty binder at the end of the shelf, then the cards go in
  const makeBinder = (name: string, color: string | null, cover: string) => run(async () => {
    const list = loadBinderList();
    const file = await createBinderFile(name, {}, color, list.length, cover);
    saveBinderList([...list, { id: file.id, name, color, cover, pages: DEFAULT_PAGES }]);
    saveBinder({}, file.id, { dirty: false });   // Drive already has this (empty) binder
    await addScansToBinder(file.id, items);
    return `Added ${cardsText} to the new binder ${name}.`;
  }, 'binder');

  // "Create" in the New list window
  const makeList = () => run(async () => {
    const name = listName.trim() || nextListName();
    const file = await createListFile(name);
    addListToDevice(file.id, name);
    await addScansToList(file.id, items);
    return `Added ${cardsText} to the new list ${name}.`;
  }, 'list');

  // "Create" in the New deck window
  const makeDeck = async (name: string, format: string) => {
    await run(async () => {
      const id = addDeck(name, format);
      await addScansToDeckMaybe(id, items);
      return `Added ${cardsText} to the maybe board of the new deck ${name}.`;
    }, 'deck');
  };

  if (stage === 'closing') return null;
  if (stage === 'newBinder') return <NewBinderDialog onCreate={makeBinder} onCancel={onCancel} />;
  if (stage === 'newDeck') return <NewDeckDialog onCreate={makeDeck} onCancel={onCancel} />;
  if (stage === 'newList') {
    return (
      <PopupWindow title="New list" onClose={onCancel}
                   buttons={[{ label: 'Cancel', onPress: onCancel, kind: 'secondary' }, { label: 'Create', onPress: makeList }]}>
        <TextField label="Name" value={listName} onChangeText={setListName} onSubmitEditing={makeList} returnKeyType="done" maxLength={40} autoCapitalize="words" />
      </PopupWindow>
    );
  }

  // The rows for the kind showing: "+ New" first, then what you have
  const have: Row[] = kind === 'binder'
    ? loadBinderList().map((b) => ({ id: b.id, name: b.name, count: Object.keys(loadBinder(b.id)).length, cover: b.cover }))
    : kind === 'list'
      ? loadLists().map((l) => ({ id: l.id, name: l.name, count: l.cards.length }))
      : loadDecks().map((d) => ({ id: d.id, name: d.name, count: d.cards.length }));
  const word = KINDS.find((k) => k.kind === kind)!.label;
  const rows: Row[] = [{ id: '+new', name: `+ ${word}`, count: 0, isNew: true }, ...have];

  function pick(row: Row) {
    if (row.isNew) { goTo(kind === 'binder' ? 'newBinder' : kind === 'list' ? 'newList' : 'newDeck'); return; }
    if (kind === 'binder') addToBinder(row.id, row.name);
    else if (kind === 'list') addToList(row.id, row.name);
    else addToDeck(row.id, row.name);
  }

  return (
    <PickerSheet
      title={`Add ${cardsText} to…`}
      items={rows}
      keyOf={(row) => row.id}
      labelOf={(row) => (row.isNew ? `New ${word.toLowerCase()}` : `${row.name}, ${cardCountText(row.count)}`)}
      isDisabled={() => busy}
      renderRow={(row) => (row.isNew ? (
        <Text style={[styles.newRow, { color: colors.accent }]}>{row.name}</Text>
      ) : (
        <>
          {kind === 'binder' && <CoverSwatch shades={coverLook(row.cover).shades} style={styles.dot} />}
          <SymbolText style={[styles.name, { color: colors.text }]} numberOfLines={1}>{row.name}</SymbolText>
          <Text style={[styles.count, { color: colors.muted }]}>{cardCountText(row.count)}</Text>
        </>
      ))}
      onPick={pick}
      onClose={onCancel}
      header={(
        <View>
          {/* The three pictures, evenly spaced, with no boxes round them: the chosen one is in the accent colour */}
          <View style={styles.kinds}>
            {KINDS.map((k) => {
              const chosen = k.kind === kind;
              return (
                <Pressable key={k.kind} accessibilityRole="radio" accessibilityState={{ selected: chosen }} accessibilityLabel={k.label}
                           onPress={() => { setKind(k.kind); setMessage({ text: '' }); }} style={styles.kind}>
                  <Image source={k.picture} style={styles.kindPicture} contentFit="contain" tintColor={chosen ? colors.accent : colors.muted} />
                  <Text style={[styles.kindLabel, { color: chosen ? colors.accent : colors.muted }]}>{k.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {kind === 'deck' && (
            <View style={styles.maybeNote}>
              <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 13 }}>Scanned cards go to the deck's Maybe board.</Text>
            </View>
          )}
          {message.text !== '' && (
            <Text style={[styles.message, { color: message.error ? colors.error : colors.muted }]}>{message.text}</Text>
          )}
        </View>
      )}
    />
  );
}

// The look: three pictures spread evenly across the top, then the rows
const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10 },
  kind: { alignItems: 'center', gap: 4, minWidth: 72, paddingVertical: 4 },
  kindPicture: { width: 44, height: 38 },
  kindLabel: { fontSize: 13, fontWeight: '700' },
  maybeNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 6 },
  newRow: { flex: 1, fontSize: 16, fontWeight: '700' },
  dot: { width: 22, height: 22, borderRadius: 11 },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  count: { fontSize: 14 },
  message: { fontSize: 14, paddingHorizontal: 14, paddingVertical: 8 },
});
