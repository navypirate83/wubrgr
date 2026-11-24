/* =====================================================================
   THE BAR AT THE TOP WHILE CARDS ARE SELECTED
   It says how many cards are picked and has three buttons: "Move to"
   (opens a floating list of places: "options"), a red "Delete" and
   "Cancel" (ends the selection without changing anything). The screen
   decides what moving and deleting do; this only draws the bar and
   asks "Delete 3 cards?" before deleting.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PickerButton, PickerSheet, type Anchor } from '@/components/search/PickerSheet';
import { useColors } from '@/hooks/useTheme';
import { askYesNo } from '@/lib/dialogs';

export type MoveOption = { id: string; label: string };

type Props = {
  count: number;                         // how many cards are picked
  noun?: string;                         // "card" (the default)
  options: MoveOption[];                 // the places "Move to" offers (none: no Move to button)
  onMove: (id: string) => void;
  onDelete: () => void;                  // called once it's been confirmed
  onCancel: () => void;
  deleteWords?: string;                  // "Delete 3 cards?" is followed by this ("Take them out of this deck.")
};

export default function SelectionBar({ count, noun = 'card', options, onMove, onDelete, onCancel, deleteWords }: Props) {
  const colors = useColors();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const what = `${count} ${noun}${count === 1 ? '' : 's'}`;

  async function askDelete() {
    const yes = await askYesNo(`Delete ${what}?`, deleteWords ?? 'They will be taken out. This can\'t be undone.', 'Yes, delete', 'No');
    if (yes) onDelete();
  }

  return (
    <View style={[styles.bar, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="toolbar">
      <Text style={[styles.count, { color: colors.text }]} accessibilityLiveRegion="polite">{count} selected</Text>
      {options.length > 0 && (
        <PickerButton accessibilityLabel={`Move ${what} to…`} onPress={setAnchor} style={styles.move}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Move to</Text>
        </PickerButton>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${what}`} onPress={askDelete}
                 style={[styles.delete, { backgroundColor: colors.error }]}>
        <Ionicons name="trash-outline" size={16} color="#ffffff" />
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel the selection" onPress={onCancel} style={styles.cancel}>
        <Ionicons name="close" size={22} color={colors.muted} />
      </Pressable>
      {anchor && (
        <PickerSheet
          title="Move to…"
          items={options}
          keyOf={(o) => o.id}
          labelOf={(o) => o.label}
          renderRow={(o) => <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{o.label}</Text>}
          anchor={anchor}
          onPick={(o) => { setAnchor(null); onMove(o.id); }}
          onClose={() => setAnchor(null)}
        />
      )}
    </View>
  );
}

// The look: one row along the top, the count on the left
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, zIndex: 30 },
  count: { flex: 1, fontSize: 15, fontWeight: '700' },
  move: { minWidth: 110 },
  delete: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  deleteText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  cancel: { padding: 6 },
});
