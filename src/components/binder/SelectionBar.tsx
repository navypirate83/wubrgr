/* =====================================================================
   THE BAR AT THE TOP WHILE CARDS ARE SELECTED
   It says how many cards are picked and has three buttons: "Move to"
   (or "Move / Add" in a binder or a list, where a deck gets a copy; it
   opens a floating list of places: "options"), a red "Delete" and
   "Cancel" (ends the selection without changing anything). The screen
   decides what moving and deleting do; this only draws the bar and
   asks "Delete 3 cards?" before deleting.
   The bar FLOATS: the screen puts it inside a "SelectionCover" laid over its
   search box and the buttons under it, so nothing moves when it appears, and
   what is underneath can't be tapped by accident while it shows.
   ===================================================================== */

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PickerButton, PickerSheet, type Anchor } from '@/components/search/PickerSheet';
import { useColors } from '@/hooks/useTheme';
import { askYesNo } from '@/lib/dialogs';

// A cover laid over the part of the screen it is placed in (that part must be "position: relative"): the
// screen's colour hides what's under it and soaks up taps, and the bar floats in the middle
export function SelectionCover({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.cover, { backgroundColor: colors.bg }]}>{children}</View>;
}

// A place in the floating list. "hint" is a small line under it ("They leave this binder").
export type MoveOption = { id: string; label: string; hint?: string };

type Props = {
  count: number;                         // how many cards are picked
  noun?: string;                         // "card" (the default)
  options: MoveOption[];                 // the places "Move to" offers (none: no Move to button)
  moveLabel?: string;                    // what the button says ("Move to", the default, or "Move / Add")
  onMove: (id: string) => void;
  onDelete: () => void;                  // called once it's been confirmed
  onCancel: () => void;
  deleteWords?: string;                  // "Delete 3 cards?" is followed by this ("Take them out of this deck.")
};

export default function SelectionBar({ count, noun = 'card', options, moveLabel = 'Move to', onMove, onDelete, onCancel, deleteWords }: Props) {
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
        <PickerButton accessibilityLabel={`${moveLabel}: ${what}`} onPress={setAnchor} style={styles.move}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{moveLabel}</Text>
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
          title={`${moveLabel}…`}
          items={options}
          keyOf={(o) => o.id}
          labelOf={(o) => (o.hint ? `${o.label}. ${o.hint}` : o.label)}
          // The place, and under it (when given) whether the cards leave or stay
          renderRow={(o) => (
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{o.label}</Text>
              {o.hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{o.hint}</Text> : null}
            </View>
          )}
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
  cover: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', zIndex: 40 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 14, boxShadow: '0px 4px 14px rgba(0,0,0,0.45)', elevation: 6 },
  count: { flex: 1, fontSize: 15, fontWeight: '700' },
  move: { minWidth: 110 },
  delete: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  deleteText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  cancel: { padding: 6 },
});
