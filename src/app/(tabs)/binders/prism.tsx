/* =====================================================================
   PRISM (/binders/prism)
   The shelf's fourth section, only for accounts with the PRISM role (and
   admins). It's a placeholder for now: a "coming soon" page. Anyone else who
   gets here (by typing the address, or from an old link) is sent straight
   back to the shelf, and nothing in the app points to this page for them.
   The plan for what goes here is in docs/prism-plan.md.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Image } from 'expo-image';
import { useAccount } from '@/hooks/useAccount';
import { useColors } from '@/hooks/useTheme';

export default function PrismScreen() {
  const colors = useColors();
  const { hasPrism, usingBinders } = useAccount();

  // No PRISM role (or not using the binders at all): back to the shelf
  if (!hasPrism || !usingBinders) return <Redirect href="/binders" />;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <Image source={require('../../../../assets/images/prism-icon.png') as number} style={styles.icon} contentFit="contain" accessibilityLabel="PRISM" />
      <Text style={[styles.title, { color: colors.text }]}>PRISM</Text>
      <Text style={[styles.soon, { color: colors.accent }]}>Coming soon</Text>
      <Text style={[styles.text, { color: colors.muted }]}>
        One card, every Commander deck. This is where your PRISM sets will go.
      </Text>
    </View>
  );
}

// The look: everything centered on the page
const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  icon: { width: 96, height: 96, borderRadius: 22, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800' },
  soon: { fontSize: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  text: { fontSize: 15, textAlign: 'center', maxWidth: 360 },
});
