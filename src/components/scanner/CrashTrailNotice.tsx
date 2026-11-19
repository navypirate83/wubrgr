/* =====================================================================
   THE "SCANNER DID NOT CLOSE PROPERLY" MESSAGE (shared by Android and the website)
   Shown at the top of the Scan screen, once, only when the diary kept by lib/scanner/crashTrail.ts
   says the scanner stopped in the middle of something last time (the app closed by itself).
   It lists the last few steps the scanner reached, and "Copy details" puts the whole diary on the
   clipboard so it can be pasted into a message to the developer. "Dismiss" forgets it.
   It floats over the top of the camera (so nothing on the screen moves) and shows nothing at all
   when there is nothing to report.
   ===================================================================== */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '@/hooks/useTheme';
import { sessionText } from '@/lib/scanner/crashTrail';
import { reportText, stepsInWords, type Crumb } from '@/lib/scanner/core/crashTrailCore';

export default function CrashTrailNotice({ report, onDismiss }: { report: Crumb[]; onDismiss: () => void }) {
  const colors = useColors();
  // Whether the details have just been copied (the button says so)
  const [copied, setCopied] = useState(false);

  // Put the whole diary on the clipboard. If the phone refuses, the button just stays as it was.
  async function copy() {
    try {
      // (the sign-in diary goes under the steps, so a signed-out mystery can be traced too)
      await Clipboard.setStringAsync([reportText(report), sessionText()].filter(Boolean).join('\n\n'));
      setCopied(true);
    } catch {
      /* nothing more can be done */
    }
  }

  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="alert">
      <Text style={[styles.title, { color: colors.text }]}>The app did not close properly last time</Text>
      <Text style={[styles.steps, { color: colors.muted }]}>Last steps it reached: {stepsInWords(report, 4)}.</Text>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Copy details"
          onPress={copy}
          style={[styles.button, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.buttonText, { color: colors.accentText }]}>{copied ? 'Copied' : 'Copy details'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

// The look: a small card floating at the top of the screen
const styles = StyleSheet.create({
  box: { position: 'absolute', top: 8, left: 12, right: 12, padding: 12, borderRadius: 12, borderWidth: 1, gap: 6, zIndex: 20, elevation: 6 },
  title: { fontSize: 14, fontWeight: '800' },
  steps: { fontSize: 12 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '700' },
});
