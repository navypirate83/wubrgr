/* =====================================================================
   "ADD TO A BINDER / LIST" (for a deck card you don't own)
   A deck card with a solid red border isn't in any of your binders. This
   window, opened by its "Add to a binder/list" button, helps with that. First
   it asks what you want:
     - ADD TO A BINDER: you own the card, it's just not in your collection
       yet (say you bought a deck and uploaded its card list first). The
       familiar list of binders opens, and the copies go into the one picked.
     - ADD TO A LIST: you don't own it and want it on a wishlist. A list of
       your lists opens, and the copies are added to the one picked.
   Either way the card STAYS in the deck: it's only added to the collection,
   so its red border goes away once it's in a binder (a list doesn't count:
   lists are wishes).
   ===================================================================== */

import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import PopupWindow from '@/components/PopupWindow';
import Button from '@/components/Button';
import MoveCardDialog from '@/components/binder/MoveCardDialog';
import { PickerSheet } from '@/components/search/PickerSheet';
import { useColors } from '@/hooks/useTheme';
import type { DeckCard } from '@/lib/deckStorage';
import { loadLists, type CardList, type ListCard } from '@/lib/listStorage';
import { addCardsToList } from '@/lib/collectionImport';
import { fillAddedPrices } from '@/lib/addedPrice';
import { cardCountText, isLocalMode } from '@/lib/binderStorage';
import { isSignedIn, syncList } from '@/lib/googleDrive';
import SymbolText from '@/components/SymbolText';

type Props = {
  card: DeckCard;
  haveOtherVersion?: boolean;       // you own the card, just not this printing or finish
  onDone: (note: string) => void;   // the copies were added: what to say
  onCancel: () => void;
};

export default function AddToCollectionDialog({ card, haveOtherVersion, onDone, onCancel }: Props) {
  const colors = useColors();
  // What's showing: the two choices, a list of binders, a list of lists (with
  // "closing" between two, since a phone can't show one pop-up while another fades away)
  const [stage, setStage] = useState<'choose' | 'closing' | 'binder' | 'list'>('choose');
  const [message, setMessage] = useState('');
  const copies = card.count ?? 1;

  function go(next: 'binder' | 'list') {
    setStage('closing');
    setTimeout(() => setStage(next), Platform.OS === 'ios' ? 350 : 0);
  }

  // The card as a binder keeps it (a deck's cost, type, zone and spot aren't part of one)
  const binderCard = (({ manaCost: _cost, typeLine: _type, zone: _zone, slot: _slot, ...rest }) => rest)(card);
  // The card as a list keeps it
  const listCard: ListCard = (({ zone: _zone, slot: _slot, ...rest }) => rest)(card);

  // A list was picked: add the copies to it (and save it to Drive in the background). The card first gets
  // today's price written on it, as the price it was added at (see addedPrice.ts).
  async function addToList(list: CardList) {
    const [priced] = await fillAddedPrices([listCard]);
    if (!addCardsToList(list.id, [priced])) {
      setMessage('That list couldn\'t be saved on this device.');
      return;
    }
    if (!isLocalMode() && isSignedIn()) syncList(list.id).catch(() => { /* kept on the device; saved to Drive next time the list opens */ });
    onDone(`Added ${copies > 1 ? `${copies} copies of ` : ''}${card.name} to the list ${list.name}.`);
  }

  if (stage === 'closing') return null;

  if (stage === 'binder') {
    return <MoveCardDialog binderId="" card={binderCard} mode="add" onMoved={(note) => onDone(note.replace('✓ ', '') + '.')} onCancel={onCancel} />;
  }

  if (stage === 'list') {
    const lists = loadLists();
    return (
      <PickerSheet
        title={`Add "${card.name}" to a list`}
        items={lists}
        keyOf={(list) => list.id}
        labelOf={(list) => `${list.name}, ${cardCountText(list.cards.length)}`}
        renderRow={(list) => (
          <>
            <SymbolText style={[styles.name, { color: colors.text }]} numberOfLines={1}>{list.name}</SymbolText>
            <Text style={[styles.count, { color: colors.muted }]}>{cardCountText(list.cards.length)}</Text>
          </>
        )}
        onPick={addToList}
        onClose={onCancel}
        header={
          message || lists.length === 0 ? (
            <Text style={[styles.message, { color: message ? colors.error : colors.muted }]}>
              {message || 'You have no lists yet. Make one on the Lists page first.'}
            </Text>
          ) : undefined
        }
      />
    );
  }

  return (
    <PopupWindow title={`Add ${card.name}`} onClose={onCancel}
                 buttons={[{ label: 'Cancel', onPress: onCancel, kind: 'secondary' }]}>
      <View style={styles.menu}>
        <Text style={[styles.text, { color: colors.text }]}>
          {haveOtherVersion
            ? `You don't own this exact version${card.foil ? ' (foil)' : ''} of the card, only other versions. The card stays in the deck either way.`
            : "This card isn't in any of your binders. The card stays in the deck either way."}
        </Text>
        <Button label="Add to a binder" icon="albums-outline" kind="secondary" onPress={() => go('binder')} />
        <Text style={[styles.hint, { color: colors.muted }]}>You own it, it's just not in your collection yet.</Text>
        <Button label="Add to a list" icon="list-outline" kind="secondary" onPress={() => go('list')} />
        <Text style={[styles.hint, { color: colors.muted }]}>You don't own it: keep it on a wishlist.</Text>
      </View>
    </PopupWindow>
  );
}

// The look: the two choices one under another, each with a line saying when to use it
const styles = StyleSheet.create({
  menu: { gap: 8 },
  text: { fontSize: 15 },
  hint: { fontSize: 13, marginTop: -2, marginBottom: 6 },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  count: { fontSize: 14 },
  message: { fontSize: 14, paddingHorizontal: 12, paddingVertical: 8 },
});
