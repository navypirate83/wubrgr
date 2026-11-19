/* =====================================================================
   A BAR THAT FOLDS ITS SECTION AWAY
   A section of a deck page (the command zone, the power bracket) sits
   under one of these bars. Tap the bar to hide the section; tap it again
   to show it. The little arrow says which way it is now (down: showing,
   right: hidden), and a short note on the right says what's inside while
   it's hidden. The look matches the bars between groups of cards.
   ===================================================================== */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';

type Props = {
  title: string;
  open: boolean;
  onToggle: () => void;
  summary?: string;          // shown on the right while the section is hidden
  children: ReactNode;       // the section itself (drawn only while open)
};

export default function CollapseBar({ title, open, onToggle, summary, children }: Props) {
  const colors = useColors();
  return (
    <View>
      {/* The bar: arrow, title, a thin line, and the note */}
      <Pressable
        accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${open ? 'Tap to hide it.' : 'Tap to show it.'}${!open && summary ? ` ${summary}` : ''}`}
        onPress={onToggle} style={styles.bar}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        {!open && summary ? <Text style={[styles.summary, { color: colors.muted }]} numberOfLines={1}>{summary}</Text> : null}
      </Pressable>
      {/* The section, only while it's open */}
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  line: { flex: 1, height: StyleSheet.hairlineWidth * 2, minWidth: 12 },
  summary: { fontSize: 13, flexShrink: 1 },
});
