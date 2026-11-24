/* =====================================================================
   THE UNDO BAR
   A small bar that floats over the bottom of the screen for a few seconds
   after something that moved cards around (like Clean-up): it says what
   happened and has an "Undo" button that puts things back. It goes away on
   its own, or when you tap the X.
   It's drawn over the screen (not part of it), so it takes no room.
   ===================================================================== */

import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';
import { RADIUS, SPACE } from '@/theme/colors';

// How long the bar stays before it goes away by itself
const STAY_MS = 15000;

type Props = {
  text: string;              // what happened, like "Cards arranged by Name"
  onUndo: () => void;
  onClose: () => void;       // the X was tapped, or the time ran out
};

export default function UndoBar({ text, onUndo, onClose }: Props) {
  const colors = useColors();
  // Go away by itself after a while (the timer starts again for a new message)
  useEffect(() => {
    const timer = setTimeout(onClose, STAY_MS);
    return () => clearTimeout(timer);
  }, [text, onClose]);
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View accessibilityLiveRegion="polite" style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }]}>
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>{text}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={onUndo} hitSlop={6}
                   style={({ pressed }) => [styles.undo, { borderColor: colors.accent }, pressed && styles.pressed]}>
          <Ionicons name="arrow-undo" size={14} color={colors.accent} />
          <Text style={[styles.undoText, { color: colors.accent }]}>Undo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
          <Ionicons name="close" size={18} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

// The look: a rounded bar centered near the bottom, over everything
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', paddingHorizontal: SPACE.l, zIndex: 40 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 480, width: '100%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS, borderWidth: 1 },
  text: { flex: 1, fontSize: 14 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS - 4, borderWidth: 1 },
  undoText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
