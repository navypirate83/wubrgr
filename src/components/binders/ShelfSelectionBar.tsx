/* =====================================================================
   THE FLOATING BAR WHILE BINDERS, LISTS OR DECKS ARE PICKED (the Shelf)
   It floats over the top of the page (so nothing moves when it appears)
   and says how many are picked, with a small button for each thing that
   can be done to them: Edit (or Rename: only with ONE picked), Copy,
   Reset value, and a red Delete, then a cross that drops the picks.
   The bar floats over the page's search box and Add button(s): "coverHeight" is how tall
   those are, and a cover in the page's colour hides them (and soaks up taps) while the
   bar sits in the middle of it.
   A page leaves out the buttons it doesn't have (decks have no Reset
   value). Each button is an icon with a small word under it. The page
   decides what each one does (and asks before deleting or resetting).
   ===================================================================== */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';

type Props = {
  count: number;                    // how many are picked
  noun: string;                     // "binder", "list" or "deck"
  editLabel?: string;               // "Edit" (binders) or "Rename" (lists and decks)
  onEdit: () => void;               // only offered with exactly one picked
  onCopy?: () => void;              // (binders only)
  onReset?: () => void;             // (binders and lists)
  onDelete: () => void;
  onCancel: () => void;
  busy?: boolean;                   // something is being done: the buttons are greyed out
  coverHeight: number;              // how tall the search box and Add button(s) under the bar are (points)
};

// The space above the page's search box (the page's padding), and the little gap under the Add button
const PAGE_TOP = 16;
const BELOW_GAP = 4;

export default function ShelfSelectionBar({ count, noun, editLabel = 'Edit', onEdit, onCopy, onReset, onDelete, onCancel, busy, coverHeight }: Props) {
  const colors = useColors();

  // One small button: its icon with its word under it
  const button = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void, opts: { red?: boolean; off?: boolean } = {}) => {
    const off = busy || opts.off;
    return (
      <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled: !!off }} accessibilityLabel={`${label}${count > 1 && !opts.off ? ` ${count} ${noun}s` : ''}`}
                 disabled={off} onPress={onPress} style={[styles.button, off && { opacity: 0.35 }]}>
        <Ionicons name={icon} size={22} color={opts.red ? colors.error : colors.text} />
        <Text style={[styles.buttonText, { color: opts.red ? colors.error : colors.text }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.cover, { backgroundColor: colors.bg, height: PAGE_TOP + coverHeight + BELOW_GAP }]}>
    <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="toolbar">
      <Text style={[styles.count, { color: colors.text }]} accessibilityLiveRegion="polite">{count} selected</Text>
      {button(editLabel, 'create-outline', onEdit, { off: count !== 1 })}
      {onCopy && button('Copy', 'copy-outline', onCopy)}
      {onReset && button('Reset value', 'refresh-outline', onReset)}
      {button('Delete', 'trash-outline', onDelete, { red: true })}
      <Pressable accessibilityRole="button" accessibilityLabel="Drop the picks" onPress={onCancel} style={styles.cancel}>
        <Ionicons name="close" size={22} color={colors.muted} />
      </Pressable>
    </View>
    </View>
  );
}

// The look: a rounded bar with a shadow, floating a little in from the edges at the top of the page
const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, justifyContent: 'center', paddingHorizontal: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: 14, boxShadow: '0px 4px 14px rgba(0,0,0,0.45)', elevation: 8 },
  count: { flex: 1, fontSize: 15, fontWeight: '700' },
  button: { alignItems: 'center', gap: 1, paddingHorizontal: 6, paddingVertical: 2, minWidth: 48 },
  buttonText: { fontSize: 10.5, fontWeight: '600' },
  cancel: { padding: 6 },
});
