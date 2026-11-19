/* =====================================================================
   A CARD'S RULES TEXT (folded away until you ask for it)
   Part of the card screen you get when you tap a card in a binder, a
   list or a deck (see CardScreen.tsx). It shows a "Show rules" button;
   tapping it opens what the card does, in Scryfall's wording, with the
   mana and tap symbols drawn as pictures. The flavor text isn't shown. A
   two-sided card (or a split or adventure card) shows each side's text
   under its name.
   The rules text is only looked up once you open the button (see
   loadRulesText in scryfall.ts), and kept, so it's quick the next time.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useTheme';
import { symbolUrl } from '@/lib/cards';
import { loadRulesText } from '@/lib/scryfall';
import type { BinderCard } from '@/lib/binderStorage';
import { RADIUS } from '@/theme/colors';

// The symbols' size in the text (points)
const SYMBOL = 15;

export default function CardRules({ card }: { card: BinderCard }) {
  const colors = useColors();
  // Is the rules text showing? It starts folded away.
  const [open, setOpen] = useState(false);
  // The text is only asked for once the button has been opened
  const rules = useQuery({
    queryKey: ['rules', card.set, card.number],
    queryFn: () => loadRulesText(card.set, card.number),
    staleTime: Infinity,
    enabled: open,
  });
  return (
    <View style={styles.wrap}>
      {/* The button that opens and closes the rules */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide rules' : 'Show rules'}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.toggle, { backgroundColor: colors.surfaceHover }, pressed && styles.pressed]}
      >
        <Text style={[styles.toggleText, { color: colors.text }]}>{open ? 'Hide rules' : 'Show rules'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {/* What the card does (nothing here for a card with no rules text, like a basic land) */}
      {open && rules.data && rules.data.length > 0 && (
        <View style={styles.rules} accessibilityLabel="Rules text">
          {rules.data.map((face, index) => (
            <View key={index} style={styles.face}>
              {face.name ? <Text style={[styles.faceName, { color: colors.muted }]}>{face.name}</Text> : null}
              {face.text.split('\n').map((line, lineIndex) => (
                <RulesLine key={lineIndex} line={line} color={colors.text} />
              ))}
            </View>
          ))}
        </View>
      )}
      {/* Opened, but the card has no rules text */}
      {open && rules.data && rules.data.length === 0 && (
        <Text style={[styles.text, { color: colors.muted }]}>This card has no rules text.</Text>
      )}
    </View>
  );
}

// One line of rules text: the words, with {T}, {2}, {U} and the like drawn
// as Scryfall's symbol pictures. The line is cut into chunks at the spaces
// (so a symbol and the punctuation right after it, like "{T}:", stay
// together) and the chunks wrap onto more lines as needed.
function RulesLine({ line, color }: { line: string; color: string }) {
  const chunks = line.split(/\s+/).filter(Boolean);
  return (
    <View style={styles.line} accessibilityLabel={line.replace(/\{([^}]+)\}/g, '$1 ')}>
      {chunks.map((chunk, index) => (
        <View key={index} style={styles.chunk}>
          {chunk.split(/(\{[^}]+\})/).filter(Boolean).map((part, partIndex) => (
            /^\{[^}]+\}$/.test(part)
              ? <Image key={partIndex} source={{ uri: symbolUrl(part.slice(1, -1)) }} style={styles.symbol} contentFit="contain" />
              : <Text key={partIndex} style={[styles.text, { color }]}>{part}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// The look: a button to open the rules, then the rules as small paragraphs under it
const styles = StyleSheet.create({
  wrap: { gap: 10 },
  toggle: {
    minHeight: 44, paddingHorizontal: 14, borderRadius: RADIUS * 1.4,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  toggleText: { fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  rules: { gap: 8 },
  face: { gap: 4 },
  faceName: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 1 },
  chunk: { flexDirection: 'row', alignItems: 'center' },
  text: { fontSize: 14, lineHeight: 20 },
  symbol: { width: SYMBOL, height: SYMBOL, marginHorizontal: 1 },
});
