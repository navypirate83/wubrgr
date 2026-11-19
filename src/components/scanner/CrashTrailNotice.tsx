/* =====================================================================
   THE "SCANNER DID NOT CLOSE PROPERLY" MESSAGE (shared by Android and the website)
   Shown at the top of the Scan screen, once, only when the diary kept by lib/scanner/crashTrail.ts
   says the scanner stopped in the middle of something last time (the app closed by itself).
   It is a COMPACT one-line message with two buttons: "Copy details" (puts the whole diary on the
   clipboard so it can be pasted into a message to the developer) and "Dismiss" (forgets it).
   The steps themselves are hidden until "Show details" is tapped, so they don't cover the camera.
   After the details are copied, or the message is dismissed, it goes away by itself and is
   forgotten (see ScanScreen.tsx), so the same report is never shown twice.
   It floats over the top of the camera (so nothing on the screen moves) and shows nothing at all
   when there is nothing to report.
   ===================================================================== */

import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '@/hooks/useTheme';
import { sessionText } from '@/lib/scanner/crashTrail';
import { reportText, type Crumb } from '@/lib/scanner/core/crashTrailCore';

// How long the "Copied" word stays before the message goes away (milliseconds)
const COPIED_SHOWN_MS = 1200;

export default function CrashTrailNotice({ report, onDismiss }: { report: Crumb[]; onDismiss: () => void }) {
  const colors = useColors();
  // Whether the details have just been copied (the button says so)
  const [copied, setCopied] = useState(false);
  // Whether the list of steps is open (closed to begin with, so the message stays small)
  const [open, setOpen] = useState(false);
  // The timer that removes the message after copying, kept so it can be cancelled if the screen goes away first
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Put the whole diary on the clipboard (always the complete text, whether or not the steps are showing),
  // then remove the message a moment later. If the phone refuses, the message just stays as it was.
  async function copy() {
    try {
      // (the sign-in diary goes under the steps, so a signed-out mystery can be traced too)
      await Clipboard.setStringAsync([reportText(report), sessionText()].filter(Boolean).join('\n\n'));
      setCopied(true);
      timer.current = setTimeout(onDismiss, COPIED_SHOWN_MS);
    } catch {
      /* nothing more can be done */
    }
  }

  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="alert">
      {/* The one line of words */}
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>The app did not close properly last time</Text>
      {/* The buttons, and the link that opens the steps */}
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
        <Pressable
          accessibilityRole="button" accessibilityLabel={open ? 'Hide details' : 'Show details'}
          onPress={() => setOpen(!open)}
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: colors.accent }]}>{open ? 'Hide details' : 'Show details'}</Text>
        </Pressable>
      </View>
      {/* The steps, only when asked for (scrolls if long, so it never covers more than part of the camera) */}
      {open && (
        <ScrollView style={styles.steps} nestedScrollEnabled>
          <Text selectable style={[styles.stepsText, { color: colors.muted }]}>{reportText(report)}</Text>
        </ScrollView>
      )}
    </View>
  );
}

// The look: a small card floating at the top of the screen
const styles = StyleSheet.create({
  box: { position: 'absolute', top: 8, left: 12, right: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 6, zIndex: 20, elevation: 6 },
  title: { fontSize: 13, fontWeight: '800' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 12, fontWeight: '700' },
  link: { paddingHorizontal: 6, paddingVertical: 6 },
  linkText: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  steps: { maxHeight: 180 },
  stepsText: { fontSize: 11 },
});
