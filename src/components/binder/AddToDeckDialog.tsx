/* =====================================================================
   "ADD TO A DECK" (from a card in a binder)
   Pick the board first, then the deck. The list of your decks opens (the
   same pop-up list the Card Finder uses); each deck shows its format, how
   many cards it has, and, if it already has this card, how many.
   Tapping a deck adds ONE copy of this exact printing to it. The card stays
   where it is: this is a copy, not a move (a deck isn't part of your
   collection).
   The same questions as the "+" in a deck's own card search:
   - a card that's banned in the deck's format asks first
   - so does a deck that already has as many copies as its format allows
     (basic lands, snow-covered basics and Wastes never ask)
   "Add anyway" goes ahead, since people build decks their own way.
   Boards: the main deck, or the sideboard (only decks whose format has
   one). The command zone and a maybe board come later.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PickerSheet } from '@/components/search/PickerSheet';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { cardCountText, type BinderCard } from '@/lib/binderStorage';
import { isBanned } from '@/lib/bannedCards';
import { costAndTypeOf } from '@/lib/cardDetails';
import { addCardToDeck, copiesOf, findDeck, loadDecks, type Deck } from '@/lib/deckStorage';
import { deckFormat, skipsCopyWarning } from '@/lib/deckFormats';
import { askYesNo } from '@/lib/dialogs';

type Props = {
  card: BinderCard;
  onDone: (note: string) => void;   // the copy was added: what to say
  onCancel: () => void;
};

// The boards that can be picked here
const BOARDS: { id: 'main' | 'side'; label: string }[] = [
  { id: 'main', label: 'Main deck' },
  { id: 'side', label: 'Sideboard' },
];

export default function AddToDeckDialog({ card, onDone, onCancel }: Props) {
  const colors = useColors();
  const decks = loadDecks();
  const [board, setBoard] = useState<'main' | 'side'>('main');
  // Something to tell the person (a deck with no sideboard, or one that wouldn't save)
  const [message, setMessage] = useState('');

  // A deck was picked: ask the usual questions, then add one copy
  async function addTo(deck: Deck) {
    const format = deckFormat(deck.format);
    if (board === 'side' && format.sideboard === 0) {
      setMessage(`${deck.name} is a ${format.name} deck, which has no sideboard.`);
      return;
    }
    setMessage('');
    if (await isBanned(format.code, card.name)) {
      const sure = await askYesNo(`${card.name} is banned`, `${card.name} is banned in ${format.name}. Are you sure you want to add it?`, 'Add anyway', 'Cancel');
      if (!sure) return;
    }
    const have = copiesOf(findDeck(deck.id), card.name);
    if (have >= format.copyLimit && !skipsCopyWarning(card.name)) {
      const why = format.copyLimit === 1
        ? `${format.name} decks are singleton: one copy of each card. (A few cards allow more.)`
        : `${format.name} decks allow up to ${format.copyLimit} copies of a card. (A few cards allow more.)`;
      const sure = await askYesNo(`${card.name} is already in this deck`, `${deck.name} has ${have} ${have === 1 ? 'copy' : 'copies'}. ${why}`, 'Add anyway', 'Cancel');
      if (!sure) return;
    }
    // A deck's card keeps its cost and type, and starts as one copy
    const { count: _count, ...single } = card;
    if (!addCardToDeck(deck.id, { ...single, ...costAndTypeOf(card) }, board)) {
      setMessage('That deck couldn\'t be saved on this device.');
      return;
    }
    onDone(`Added ${card.name} to ${deck.name}${board === 'side' ? ' (sideboard)' : ''}.`);
  }

  return (
    <PickerSheet
      title={`Add "${card.name}" to a deck`}
      items={decks}
      keyOf={(deck) => deck.id}
      labelOf={(deck) => `${deck.name}, ${deckFormat(deck.format).name}, ${cardCountText(deck.cards.length)}`}
      renderRow={(deck) => {
        const have = copiesOf(deck, card.name);
        return (
          <>
            <View style={styles.text}>
              <SymbolText style={[styles.name, { color: colors.text }]} numberOfLines={1}>{deck.name}</SymbolText>
              <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>{deckFormat(deck.format).name} · {cardCountText(deck.cards.length)}</Text>
            </View>
            {have > 0 && <Text style={[styles.has, { color: colors.muted }]}>Has {have}</Text>}
          </>
        );
      }}
      onPick={addTo}
      onClose={onCancel}
      header={
        <View style={styles.header}>
          {/* The board: tap to switch (the one picked is orange) */}
          <View style={styles.boards} accessibilityRole="tablist">
            {BOARDS.map((choice) => (
              <Pressable
                key={choice.id} accessibilityRole="tab" accessibilityState={{ selected: board === choice.id }}
                onPress={() => { setBoard(choice.id); setMessage(''); }} style={({ pressed }) => [styles.board, pressed && styles.pressed]}
              >
                <Text style={[styles.boardText, { color: board === choice.id ? colors.accent : colors.muted }]}>{choice.label}</Text>
              </Pressable>
            ))}
          </View>
          {(message || decks.length === 0) && (
            <Text style={[styles.message, { color: message ? colors.error : colors.muted }]}>
              {message || 'You have no decks yet. Make one on the Decks page first.'}
            </Text>
          )}
        </View>
      }
    />
  );
}

// The look: the two boards side by side at the top, then each deck's name and format
const styles = StyleSheet.create({
  header: { gap: 4 },
  boards: { flexDirection: 'row', gap: 8, paddingHorizontal: 8 },
  board: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  boardText: { fontSize: 15, fontWeight: '700' },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13 },
  has: { fontSize: 13, fontWeight: '600' },
  message: { fontSize: 14, paddingHorizontal: 12, paddingBottom: 8 },
  pressed: { opacity: 0.7 },
});
