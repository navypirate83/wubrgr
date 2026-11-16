/* =====================================================================
   SETTINGS → CARD SCANNER CATALOGUE
   A link to the catalogue page (/scan-catalogue): the database the card
   scanner uses to identify cards with no internet. It shows what's on this
   device and downloads or updates it. (The scanner itself is still being
   built; this is the first part.)
   ===================================================================== */

import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '@/components/Button';
import { SPACE } from '@/theme/colors';
import { SettingRow, SettingsSection } from './SettingsParts';

export default function ScannerCatalogueSection() {
  return (
    <SettingsSection title="Card scanner">
      <SettingRow
        name="Card catalogue"
        description="A database of every printing, kept on this device so the scanner can identify cards with no internet."
      />
      <View style={styles.buttons}>
        <Button label="Open the catalogue page" kind="secondary" icon="albums-outline" onPress={() => router.push('/scan-catalogue')} />
      </View>
    </SettingsSection>
  );
}

// The button, with room around it
const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.m, padding: SPACE.m },
});
