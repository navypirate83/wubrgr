/* =====================================================================
   A CARD'S RULES TEXT
   What the card does, in Scryfall's wording, with the mana and tap
   symbols drawn as pictures. The flavor text isn't shown. A two-sided
   card (or a split or adventure card) shows each side's text under its
   name.
   It's drawn inside the card screen's slide-up rules sheet (see
   CardScreen.tsx), so the text is only looked up once that sheet is
   opened (see loadRulesText in scryfall.ts), and kept, so it's quick the
   next time.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useTheme';
import { symbolUrl } from '@/lib/cards';
import { loadRulesText } from '@/lib/scryfall';
import type { BinderCard } from '@/lib/binderStorage';

// The symbols' size in the text (points)
const SYMBOL = 15;

export default function CardRules({ card }: { card: BinderCard }) {
  const colors = useColors();
  const rules = useQuery({
    queryKey: ['rules', card.set, card.number],
    queryFn: () => loadRulesText(card.set, card.number),
    staleTime: Infinity,
  });
  // Still asking
  if (rules.isPending) return <Text style={[styles.text, { color: colors.muted }]}>Loading the rules...</Text>;
  // Couldn't ask
  if (rules.isError) return <Text style={[styles.text, { color: colors.muted }]}>The rules couldn't be loaded.</Text>;
  // A card with no rules text, like a basic land
  if (!rules.data || rules.data.length === 0) return <Text style={[styles.text, { color: colors.muted }]}>This card has no rules text.</Text>;
  return (
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

// The look: the rules as small paragraphs
const styles = StyleSheet.create({
  rules: { gap: 8 },
  face: { gap: 4 },
  faceName: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 1 },
  chunk: { flexDirection: 'row', alignItems: 'center' },
  text: { fontSize: 14, lineHeight: 20 },
  symbol: { width: SYMBOL, height: SYMBOL, marginHorizontal: 1 },
});
