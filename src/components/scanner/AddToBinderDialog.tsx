/* =====================================================================
   "ADD TO BINDER": WHICH BINDER?
   The same kind of list as the rest of the app uses for choosing a binder (it
   pops up from the bottom): one row for each binder, with its cover colour and
   card count. Tap one and the scanned cards go in: a printing the binder already
   has gets more copies, the rest fill its first empty pockets, and the binder
   gets as many new pages as it needs (see scanItems.ts: addScansToBinder).
   ===================================================================== */

import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { PickerSheet } from '@/components/search/PickerSheet';
import CoverSwatch from '@/components/binders/CoverSwatch';
import SymbolText from '@/components/SymbolText';
import { useColors } from '@/hooks/useTheme';
import { coverLook } from '@/lib/covers';
import { loadBinder, loadBinderList } from '@/lib/binderStorage';
import { addScansToBinder, type ScanItem } from '@/lib/scanner/scanItems';

type Props = {
  items: ScanItem[];
  // The cards are safely in the binder: "note" says where they went
  onDone: (note: string) => void;
  onCancel: () => void;
};

export default function AddToBinderDialog({ items, onDone, onCancel }: Props) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>({ text: '' });
  const binders = loadBinderList();
  const copies = items.reduce((sum, item) => sum + item.count, 0);

  async function add(binderId: string, name: string) {
    setBusy(true);
    setMessage({ text: 'Adding…' });
    try {
      const { pagesAdded } = await addScansToBinder(binderId, items);
      onDone(`Added ${copies} ${copies === 1 ? 'card' : 'cards'} to ${name}${pagesAdded > 0 ? ` (${pagesAdded} ${pagesAdded === 1 ? 'page' : 'pages'} added)` : ''}.`);
    } catch (err) {
      setBusy(false);
      setMessage({ text: (err as Error).message, error: true });
    }
  }

  return (
    <PickerSheet
      title={`Add ${copies} ${copies === 1 ? 'card' : 'cards'} to…`}
      items={binders}
      keyOf={(binder) => binder.id}
      labelOf={(binder) => {
        const count = Object.keys(loadBinder(binder.id)).length;
        return `${binder.name}, ${count} ${count === 1 ? 'card' : 'cards'}`;
      }}
      isDisabled={() => busy}
      renderRow={(binder) => {
        const count = Object.keys(loadBinder(binder.id)).length;
        return (
          <>
            <CoverSwatch shades={coverLook(binder.cover).shades} style={styles.dot} />
            <SymbolText style={[styles.name, { color: colors.text }]} numberOfLines={1}>{binder.name}</SymbolText>
            <Text style={[styles.count, { color: colors.muted }]}>{count} {count === 1 ? 'card' : 'cards'}</Text>
          </>
        );
      }}
      onPick={(binder) => add(binder.id, binder.name)}
      onClose={onCancel}
      header={
        message.text || binders.length === 0 ? (
          <Text style={[styles.message, { color: message.error ? colors.error : colors.muted }]}>
            {message.text || 'You have no binders yet. Make one on the Shelf first.'}
          </Text>
        ) : undefined
      }
    />
  );
}

// The look: a cover-coloured dot, the binder's name, and its card count
const styles = StyleSheet.create({
  dot: { width: 22, height: 22, borderRadius: 11 },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  count: { fontSize: 14 },
  message: { fontSize: 14, paddingHorizontal: 14, paddingVertical: 8 },
});
