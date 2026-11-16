/* =====================================================================
   THE SCANNER CAMERA: ANDROID (not built yet)
   The phone app's camera (react-native-vision-camera with Google's ML Kit text
   reading) is the next part to be built, after the website's. Nothing from
   the web side is used here.
   ===================================================================== */

import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useTheme';
import type { ScannerCameraProps } from './scannerCameraTypes';

export default function ScannerCamera(_props: ScannerCameraProps) {
  const colors = useColors();
  return (
    <View style={styles.box}>
      <Text style={[styles.text, { color: colors.muted }]}>
        The camera for the phone app is still being built. The website's scanner works first.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { fontSize: 16, textAlign: 'center' },
});
