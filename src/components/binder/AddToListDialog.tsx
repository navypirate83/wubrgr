/* =====================================================================
   "ADD TO A LIST" and "MOVE TO A LIST" (one card)
   The list of your lists opens (the same pop-up list the Card Finder uses).
   - ADD (the usual way, for a card you're looking at somewhere else, like
     a set's page): tapping a list adds ONE copy of this exact printing to
     it. The card stays where it is.
   - MOVE ("move", from a card in a binder): putting a binder's card on a
     list means it is leaving your collection, so the copies go onto the
     list and the binder screen takes them out of the binder ("onDone"
     tells it how many went). If the pocket has several copies, the top of
     the list asks how many to move (− and + buttons); the rest stay.
   A list that already has the printing gets that many more copies.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PickerSheet } from '@/components/search/PickerSheet';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { cardCount, cardCountText, isLocalMode, withCount, type BinderCard } from '@/lib/binderStorage';
import { costAndTypeOf } from '@/lib/cardDetails';
import { addCardsToList } from '@/lib/collectionImport';
import { fillAddedPrices } from '@/lib/addedPrice';
import { isSignedIn, syncList } from '@/lib/googleDrive';
import { loadLists, type CardList, type ListCard } from '@/lib/listStorage';

type Props = {
  card: BinderCard;
  move?: boolean;                                    // a binder's card: it leaves the binder (see the top of this file)
  onDone: (note: string, amount: number) => void;    // it's on the list: what to say, and how many copies went
  onCancel: () => void;
};

export default function AddToListDialog({ card, move = false, onDone, onCancel }: Props) {
  const colors = useColors();
  const lists = loadLists();
  // Something to tell the person (a list that wouldn't save)
  const [message, setMessage] = useState('');
  // Moving: how many copies the pocket has, and how many of them to move (all, to start with)
  const owned = move ? cardCount(card) : 1;
  const [amount, setAmount] = useState(owned);

  // A list was picked: put the copies on it (a list's card also keeps its cost and type). A card with no
  // price written on it yet gets today's, as the price it was added at (see addedPrice.ts).
  async function addTo(list: CardList) {
    const { count: _count, ...single } = card;
    const [priced] = await fillAddedPrices<ListCard>([{ ...single, ...costAndTypeOf(card) }]);
    const listCard = amount > 1 ? (withCount(priced, amount) as ListCard) : priced;
    if (!addCardsToList(list.id, [listCard])) {
      setMessage('That list couldn\'t be saved on this device.');
      return;
    }
    // Saved to Google Drive in the background, if that backup is on
    if (!isLocalMode() && isSignedIn()) syncList(list.id).catch(() => { /* kept on the device; saved to Drive next time the list opens */ });
    onDone(move
      ? `Moved ${amount > 1 ? `${amount} ` : ''}${card.name} to the list ${list.name}.`
      : `Added ${card.name} to the list ${list.name}.`, amount);
  }

  return (
    <PickerSheet
      title={`${move ? 'Move' : 'Add'} "${card.name}" to a list`}
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
      // Above the lists: what moving does and how many copies to move (only when the
      // pocket holds several), then a problem or "no lists yet"
      header={
        <>
          {move && <Text style={[styles.message, { color: colors.muted }]}>{owned > 1 ? 'The copies you move leave this binder.' : 'It leaves this binder.'}</Text>}
          {move && owned > 1 && (
            <View style={styles.amountRow}>
              <Text style={[styles.amountLabel, { color: colors.text }]}>How many to move</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="One fewer" hitSlop={4}
                         disabled={amount <= 1} onPress={() => setAmount(amount - 1)}
                         style={({ pressed }) => [styles.step, { borderColor: colors.border }, pressed && styles.pressed, amount <= 1 && styles.faded]}>
                <Ionicons name="remove" size={20} color={colors.text} />
              </Pressable>
              <Text style={[styles.amount, { color: colors.text }]} accessibilityLabel={`${amount} of ${owned}`}>
                {amount} <Text style={{ color: colors.muted }}>of {owned}</Text>
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="One more" hitSlop={4}
                         disabled={amount >= owned} onPress={() => setAmount(amount + 1)}
                         style={({ pressed }) => [styles.step, { borderColor: colors.border }, pressed && styles.pressed, amount >= owned && styles.faded]}>
                <Ionicons name="add" size={20} color={colors.text} />
              </Pressable>
            </View>
          )}
          {(message || lists.length === 0) && (
            <Text style={[styles.message, { color: message ? colors.error : colors.muted }]}>
              {message || 'You have no lists yet. Make one on the Lists page first.'}
            </Text>
          )}
        </>
      }
    />
  );
}

// The look: the "how many" row (− 2 of 3 +), then each list's name and how many cards it has
const styles = StyleSheet.create({
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  count: { fontSize: 14 },
  message: { fontSize: 14, paddingHorizontal: 12, paddingVertical: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  amountLabel: { flex: 1, fontSize: 16 },
  step: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  amount: { minWidth: 56, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  faded: { opacity: 0.4 },
});
