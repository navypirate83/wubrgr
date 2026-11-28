/* =====================================================================
   "ADD TO A DECK" (one card, or several selected cards)
   Pick the board first, then the deck. The list of your decks opens (the
   same pop-up list the Card Finder uses); each deck shows its format and
   how many cards it has (and, for one card, how many of it the deck has).
   Tapping a deck adds ONE copy of each card's exact printing to it. The
   cards stay where they are: this is a copy, not a move (a deck isn't part
   of your collection).
   Boards: the main deck (chosen to start with), the sideboard (only decks
   whose format has one) or the maybe board.
   BEFORE ADDING to the main deck or the sideboard, it checks:
   - a card that's banned in the deck's format
   - a deck that already has as many copies as its format allows (basic
     lands, snow-covered basics and Wastes never count)
   - a main deck that would go over its format's size
   ONE card: each of those asks its own question ("Add anyway" goes ahead,
   since people build decks their own way).
   SEVERAL cards: ONE window lists the cards that need a look, with Cancel,
   "Skip those" (add only the others) and "Add all".
   The maybe board asks nothing: its cards don't count towards the deck.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PickerSheet } from '@/components/search/PickerSheet';
import PopupWindow from '@/components/PopupWindow';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { cardCountText, type BinderCard } from '@/lib/binderStorage';
import { isBanned } from '@/lib/bannedCards';
import { costAndTypeOf } from '@/lib/cardDetails';
import { addCardToDeck, copiesOf, findDeck, loadDecks, type Deck } from '@/lib/deckStorage';
import { deckFormat, skipsCopyWarning } from '@/lib/deckFormats';
import { overLimitIfAdded } from '@/lib/deckLegality';
import { askYesNo } from '@/lib/dialogs';

type Props = {
  cards: BinderCard[];              // the card (or the selected cards) to add one copy of
  onDone: (note: string) => void;   // they were added: what to say
  onCancel: () => void;
};

type Board = 'main' | 'side' | 'maybe';

// The boards that can be picked here
const BOARDS: { id: Board; label: string }[] = [
  { id: 'main', label: 'Main deck' },
  { id: 'side', label: 'Sideboard' },
  { id: 'maybe', label: 'Maybe' },
];
// What the note says after the deck's name
const BOARD_NOTE: Record<Board, string> = { main: '', side: ' (sideboard)', maybe: ' (maybe board)' };

// A card that needs a look before it's added, and why
type Flag = { card: BinderCard; banned: boolean; atLimit: number | null };
// The one question asked when several cards are being added
type Question = { deck: Deck; flags: Flag[]; over: { total: number; limit: number } | null };

export default function AddToDeckDialog({ cards, onDone, onCancel }: Props) {
  const colors = useColors();
  const decks = loadDecks();
  const one = cards.length === 1 ? cards[0] : null;
  const [board, setBoard] = useState<Board>('main');
  // Something to tell the person (a deck with no sideboard, or one that wouldn't save)
  const [message, setMessage] = useState('');
  // The question about the cards that need a look (several cards only)
  const [question, setQuestion] = useState<Question | null>(null);

  // Which of the cards need a look for this deck: banned ones, and ones the deck already has
  // as many of as its format allows (counting the copies this very batch adds before them)
  async function flagsFor(deck: Deck): Promise<Flag[]> {
    const format = deckFormat(deck.format);
    const fresh = findDeck(deck.id);
    const adding = new Map<string, number>();
    const flags: Flag[] = [];
    for (const card of cards) {
      const key = card.name.trim().toLowerCase();
      const have = copiesOf(fresh, card.name) + (adding.get(key) ?? 0);
      adding.set(key, (adding.get(key) ?? 0) + 1);
      const banned = await isBanned(format.code, card.name);
      const atLimit = have >= format.copyLimit && !skipsCopyWarning(card.name) ? have : null;
      if (banned || atLimit !== null) flags.push({ card, banned, atLimit });
    }
    return flags;
  }

  // Put one copy of each of these cards on the board, and say what happened
  function add(deck: Deck, which: BinderCard[], skipped = 0) {
    for (const card of which) {
      // A deck's card keeps its cost and type, and goes in as one copy
      const { count: _count, ...single } = card;
      if (!addCardToDeck(deck.id, { ...single, ...costAndTypeOf(card) }, board)) {
        setQuestion(null);
        setMessage('That deck couldn\'t be saved on this device.');
        return;
      }
    }
    const what = one ? one.name : `${which.length} ${which.length === 1 ? 'card' : 'cards'}`;
    onDone(`Added ${what} to ${deck.name}${BOARD_NOTE[board]}.${skipped > 0 ? ` Skipped ${skipped}.` : ''}`);
  }

  // A deck was picked: check first (not for the maybe board), then add
  async function addTo(deck: Deck) {
    const format = deckFormat(deck.format);
    if (board === 'side' && format.sideboard === 0) {
      setMessage(`${deck.name} is a ${format.name} deck, which has no sideboard.`);
      return;
    }
    setMessage('');
    if (board === 'maybe') { add(deck, cards); return; }
    const flags = await flagsFor(deck);
    const over = board === 'main' ? overLimitIfAdded(findDeck(deck.id) ?? deck, format, cards.length) : null;

    // SEVERAL CARDS: one window about all of them (or straight in, if nothing needs a look)
    if (!one) {
      if (flags.length === 0 && !over) add(deck, cards);
      else setQuestion({ deck, flags, over });
      return;
    }

    // ONE CARD: a question for each thing, "Add anyway" goes on
    const flag = flags[0];
    if (flag?.banned) {
      const sure = await askYesNo(`${one.name} is banned`, `${one.name} is banned in ${format.name}. Are you sure you want to add it?`, 'Add anyway', 'Cancel');
      if (!sure) return;
    }
    if (flag && flag.atLimit !== null) {
      const why = format.copyLimit === 1
        ? `${format.name} decks are singleton: one copy of each card. (A few cards allow more.)`
        : `${format.name} decks allow up to ${format.copyLimit} copies of a card. (A few cards allow more.)`;
      const sure = await askYesNo(`${one.name} is already in this deck`, `${deck.name} has ${flag.atLimit} ${flag.atLimit === 1 ? 'copy' : 'copies'}. ${why}`, 'Add anyway', 'Cancel');
      if (!sure) return;
    }
    if (over) {
      const sure = await askYesNo('Over the limit', `Adding ${one.name} to the main deck would make it ${over.total} cards. A ${format.name} deck has at most ${over.limit}.`, 'Add anyway', 'Cancel');
      if (!sure) return;
    }
    add(deck, cards);
  }

  // THE ONE QUESTION (several cards): which cards need a look, and what to do about them
  if (question) {
    const { deck, flags, over } = question;
    const format = deckFormat(deck.format);
    const flagged = new Set(flags.map((flag) => flag.card));
    const others = cards.filter((card) => !flagged.has(card));
    return (
      <PopupWindow
        title={flags.length > 0 ? `${flags.length} of the ${cards.length} cards ${flags.length === 1 ? 'needs' : 'need'} a look` : 'Over the limit'}
        onClose={() => setQuestion(null)}
        buttons={[
          { label: 'Cancel', kind: 'secondary', onPress: () => setQuestion(null) },
          // "Skip those" only when it would leave something to add
          ...(flags.length > 0 && others.length > 0
            ? [{ label: `Skip ${flags.length === 1 ? 'that one' : `those ${flags.length}`}`, kind: 'secondary' as const, onPress: () => add(deck, others, flags.length) }]
            : []),
          { label: `Add all ${cards.length}`, onPress: () => add(deck, cards) },
        ]}
      >
        <Text style={[styles.sub, { color: colors.muted }]}>Adding to {deck.name} ({format.name}).</Text>
        {/* Each card that needs a look, and why */}
        {flags.map((flag, index) => (
          <View key={index} style={[styles.flag, { borderTopColor: colors.border }]}>
            <SymbolText style={[styles.name, { color: colors.text }]} numberOfLines={1}>{flag.card.name}</SymbolText>
            <Text style={[styles.sub, { color: colors.muted }]}>
              {flag.banned ? <Text style={{ color: colors.error, fontWeight: '700' }}>Banned</Text> : null}
              {flag.banned ? ` in ${format.name}` : ''}
              {flag.banned && flag.atLimit !== null ? ' · ' : ''}
              {flag.atLimit !== null ? <Text style={{ color: colors.error, fontWeight: '700' }}>Already in the deck</Text> : null}
              {flag.atLimit !== null ? ` · ${flag.atLimit} ${flag.atLimit === 1 ? 'copy' : 'copies'}, and ${format.name} allows ${format.copyLimit}` : ''}
            </Text>
          </View>
        ))}
        {/* The main deck would be too big */}
        {over && (
          <View style={[styles.flag, { borderTopColor: colors.border }]}>
            <Text style={[styles.sub, { color: colors.text }]}>
              Adding all {cards.length} would make the main deck {over.total} cards. A {format.name} deck has at most {over.limit}.
            </Text>
          </View>
        )}
      </PopupWindow>
    );
  }

  return (
    <PickerSheet
      title={one ? `Add "${one.name}" to a deck` : `Add ${cards.length} cards to a deck`}
      items={decks}
      keyOf={(deck) => deck.id}
      labelOf={(deck) => `${deck.name}, ${deckFormat(deck.format).name}, ${cardCountText(deck.cards.length)}`}
      renderRow={(deck) => {
        const have = one ? copiesOf(deck, one.name) : 0;
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
          {/* Several cards: say plainly what will happen */}
          {!one && <Text style={[styles.message, { color: colors.muted }]}>One copy of each. They stay where they are.</Text>}
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
            <SymbolText inline style={[styles.message, { color: message ? colors.error : colors.muted }]}>
              {message || 'You have no decks yet. Make one on the Decks page first.'}
            </SymbolText>
          )}
        </View>
      }
    />
  );
}

// The look: the boards side by side at the top, then each deck's name and format
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
  // One card that needs a look, in the question window
  flag: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, marginTop: 8, gap: 2 },
  pressed: { opacity: 0.7 },
});
