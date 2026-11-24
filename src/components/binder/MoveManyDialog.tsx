/* =====================================================================
   "MOVE TO…" FOR SEVERAL SELECTED CARDS: WHICH BINDER?
   The usual pop-up list of binders (cover colour, name, card count), without
   the binder the cards are already in. Tap one and all the cards go into it
   (see moveMany.ts); "onDone" then tells the screen, which takes them out of
   where they were.
   ===================================================================== */

import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { PickerSheet } from '@/components/search/PickerSheet';
import CoverSwatch from '@/components/binders/CoverSwatch';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { coverLook } from '@/lib/covers';
import { cardCountText, loadBinder, loadBinderList, type BinderCard } from '@/lib/binderStorage';
import { moveCardsToBinder } from '@/lib/moveMany';

type Props = {
  cards: BinderCard[];
  exceptId?: string;                    // the binder they are in now (not offered)
  onDone: (note: string) => void;       // they are in the other binder
  onCancel: () => void;
};

export default function MoveManyDialog({ cards, exceptId, onDone, onCancel }: Props) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>({ text: '' });
  const binders = loadBinderList().filter((b) => b.id !== exceptId);
  const copies = cards.reduce((sum, c) => sum + (c.count ?? 1), 0);

  async function move(id: string, name: string) {
    setBusy(true);
    setMessage({ text: 'Moving…' });
    try {
      await moveCardsToBinder(id, cards);
      onDone(`Moved ${cards.length} ${cards.length === 1 ? 'card' : 'cards'} (${copies} ${copies === 1 ? 'copy' : 'copies'}) to ${name}.`);
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
      labelOf={(b) => `${b.name}, ${cardCountText(Object.keys(loadBinder(b.id)).length)}`}
      isDisabled={() => busy}
      renderRow={(b) => (
        <>
          <CoverSwatch shades={coverLook(b.cover).shades} style={styles.dot} />
          <SymbolText style={[styles.name, { color: colors.text }]} numberOfLines={1}>{b.name}</SymbolText>
          <Text style={[styles.count, { color: colors.muted }]}>{cardCountText(Object.keys(loadBinder(b.id)).length)}</Text>
        </>
      )}
      onPick={(b) => move(b.id, b.name)}
      onClose={onCancel}
      header={message.text || binders.length === 0 ? (
        <Text style={[styles.message, { color: message.error ? colors.error : colors.muted }]}>
          {message.text || 'You have no other binders. Make one on the Shelf first.'}
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
