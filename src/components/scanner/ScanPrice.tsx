/* =====================================================================
   A SCANNED CARD'S PRICE
   The price store's little icon, then the price. Used on the rows of the
   scanned list and on the confirm sheet.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { STORE_ICONS } from '@/components/settings/PriceStorePicker';
import { useSettings } from '@/hooks/useSettings';
import { useColors } from '@/hooks/useTheme';
import { pickedPrice } from '@/lib/prices';

// "text" is the price already written out ("$1.93"); "size" is the lettering's height
export default function ScanPrice({ text, size }: { text: string; size: number }) {
  const colors = useColors();
  const { store, label } = pickedPrice(useSettings());
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label} price of one copy: ${text}`}>
      {/* The store's icon, on a little white square so it shows on a dark background */}
      <Image source={STORE_ICONS[store]} style={[styles.icon, { width: size + 1, height: size + 1 }]} contentFit="contain" />
      <Text style={[styles.price, { color: colors.text, fontSize: size }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// The icon and the price side by side, never squeezed
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  icon: { borderRadius: 3, backgroundColor: '#ffffff' },
  price: { fontWeight: '700' },
});
