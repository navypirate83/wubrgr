/* =====================================================================
   "MOVE TO…" FOR SEVERAL SELECTED CARDS: WHICH BINDER?
   The usual pop-up list of binders (cover colour, name, card count), lists or
   decks ("kind"), without the one the cards are already in. Tap one and all the
   cards go into it (see moveMany.ts; a deck gets them on its maybe board);
   "onDone" then tells the screen, which takes them out of where they were.
   ===================================================================== */

import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { PickerSheet } from '@/components/search/PickerSheet';
import CoverSwatch from '@/components/binders/CoverSwatch';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { coverLook } from '@/lib/covers';
import { cardCountText, loadBinder, loadBinderList, type BinderCard } from '@/lib/binderStorage';
import { moveCardsToBinder, moveCardsToDeck, moveCardsToList } from '@/lib/moveMany';
import { loadLists } from '@/lib/listStorage';
import { loadDecks } from '@/lib/deckStorage';

type Props = {
  cards: BinderCard[];
  kind: 'binder' | 'list' | 'deck';     // what to choose from
  exceptId?: string;                    // the binder or list they are in now (not offered)
  onDone: (note: string) => void;       // they are in the other binder
  onCancel: () => void;
};

export default function MoveManyDialog({ cards, kind, exceptId, onDone, onCancel }: Props) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>({ text: '' });
  // What can be chosen: binders (with their cover), lists or decks, each with how many cards it has
  type Choice = { id: string; name: string; count: number; cover?: string };
  const binders: Choice[] = kind === 'binder'
    ? loadBinderList().filter((b) => b.id !== exceptId).map((b) => ({ id: b.id, name: b.name, count: Object.keys(loadBinder(b.id)).length, cover: b.cover }))
    : kind === 'list'
      ? loadLists().filter((l) => l.id !== exceptId).map((l) => ({ id: l.id, name: l.name, count: l.cards.length }))
      : loadDecks().map((d) => ({ id: d.id, name: d.name, count: d.cards.length }));
  const copies = cards.reduce((sum, c) => sum + (c.count ?? 1), 0);

  async function move(id: string, name: string) {
    setBusy(true);
    setMessage({ text: 'Moving…' });
    try {
      if (kind === 'binder') await moveCardsToBinder(id, cards);
      else if (kind === 'list') await moveCardsToList(id, cards);
      else await moveCardsToDeck(id, cards);
      onDone(`Moved ${cards.length} ${cards.length === 1 ? 'card' : 'cards'} (${copies} ${copies === 1 ? 'copy' : 'copies'}) to ${kind === 'deck' ? 'the maybe board of ' : kind === 'list' ? 'the list ' : ''}${name}.`);
    } catch (err) {
      setBusy(false);
      setMessage({ text: (err as Error).message, error: true });
    }
  }

  return (
    <PickerSheet
      title={`Move ${cards.length} ${cards.length === 1 ? 'card' : 'cards'} to…`}
      items={binders}
      keyOf={(b) => b.id}
      labelOf={(b) => `${b.name}, ${cardCountText(b.count)}`}
      isDisabled={() => busy}
      renderRow={(b) => (
        <>
          {kind === 'binder' && <CoverSwatch shades={coverLook(b.cover).shades} style={styles.dot} />}
          <SymbolText style={[styles.name, { color: colors.text }]} numberOfLines={1}>{b.name}</SymbolText>
          <Text style={[styles.count, { color: colors.muted }]}>{cardCountText(b.count)}</Text>
        </>
      )}
      onPick={(b) => move(b.id, b.name)}
      onClose={onCancel}
      header={message.text || binders.length === 0 ? (
        <Text style={[styles.message, { color: message.error ? colors.error : colors.muted }]}>
          {message.text || `You have no ${kind === 'deck' ? 'decks' : kind === 'list' ? 'other lists' : 'other binders'} to move them to.`}
        </Text>
      ) : undefined}
    />
  );
}

// The look: a cover-coloured dot, the binder's name and its card count
const styles = StyleSheet.create({
  dot: { width: 22, height: 22, borderRadius: 11 },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  count: { fontSize: 14 },
  message: { fontSize: 14, paddingHorizontal: 14, paddingVertical: 8 },
});
