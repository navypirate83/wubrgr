/* =====================================================================
   "ADD TO A LIST" (from a card in a binder)
   The list of your lists opens (the same pop-up list the Card Finder uses).
   Tapping one adds ONE copy of this exact printing to it. The card stays
   where it is: this is a copy, not a move. A list that already has the
   printing gets one more copy.
   ===================================================================== */

import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { PickerSheet } from '@/components/search/PickerSheet';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { cardCountText, isLocalMode, type BinderCard } from '@/lib/binderStorage';
import { costAndTypeOf } from '@/lib/cardDetails';
import { addCardsToList } from '@/lib/collectionImport';
import { fillAddedPrices } from '@/lib/addedPrice';
import { isSignedIn, syncList } from '@/lib/googleDrive';
import { loadLists, type CardList, type ListCard } from '@/lib/listStorage';

type Props = {
  card: BinderCard;
  onDone: (note: string) => void;   // the copy was added: what to say
  onCancel: () => void;
};

export default function AddToListDialog({ card, onDone, onCancel }: Props) {
  const colors = useColors();
  const lists = loadLists();
  // Something to tell the person (a list that wouldn't save)
  const [message, setMessage] = useState('');

  // A list was picked: add one copy (a list's card also keeps its cost and type). A card with no price
  // written on it yet gets today's, as the price it was added at (see addedPrice.ts).
  async function addTo(list: CardList) {
    const { count: _count, ...single } = card;
    const [listCard] = await fillAddedPrices<ListCard>([{ ...single, ...costAndTypeOf(card) }]);
    if (!addCardsToList(list.id, [listCard])) {
      setMessage('That list couldn\'t be saved on this device.');
      return;
    }
    // Saved to Google Drive in the background, if that backup is on
    if (!isLocalMode() && isSignedIn()) syncList(list.id).catch(() => { /* kept on the device; saved to Drive next time the list opens */ });
    onDone(`Added ${card.name} to the list ${list.name}.`);
  }

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
      onPick={addTo}
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

// The look: the list's name, then how many cards it has
const styles = StyleSheet.create({
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  count: { fontSize: 14 },
  message: { fontSize: 14, paddingHorizontal: 12, paddingVertical: 8 },
});
