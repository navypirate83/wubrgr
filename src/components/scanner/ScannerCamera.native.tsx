/* =====================================================================
   THE SCANNER CAMERA: ANDROID, THE FRONT DOOR
   The Scan screen uses this file. It is deliberately small and does NOT load the camera library
   (react-native-vision-camera) when the Scan tab opens. The real camera is in
   ScannerCameraLive.native.tsx, which is loaded only when the camera is switched on. Why: the camera
   library sets up native (phone-side) pieces the moment its code is loaded, and if that goes wrong the
   whole app closes. This way the Scan screen always draws, "Choose a photo" works with no camera, and the
   crash diary says "camera code loading", "camera code loaded" and "camera starting" so a crash can be placed.
   SAFE MODE: if the app closed by itself last time while the camera was loading or starting (the diary says
   so: see lib/scanner/crashTrail.ts), the camera is NOT started automatically. The screen shows a "Start
   camera" button and "Choose a photo" instead. Starting it from there uses the camera library's plain photo settings.
   A clean exit after the camera has really run switches safe mode off again.
   Nothing from the website's camera is used here.
   ===================================================================== */

import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useColors } from '@/hooks/useTheme';
import { finishPhoto, photoSize, readCardPhoto } from '@/lib/scanner/ocr/ocr.native';
import { CARD_ASPECT } from '@/lib/scanner/core/scannerTypes';
import { cardInPickedPhoto } from '@/lib/scanner/core/cardInPhoto';
import { isSafeMode, mark } from '@/lib/scanner/crashTrail';
import type { ScannerCameraProps } from './scannerCameraTypes';
// (only the TYPE of the camera's settings is imported here: types are erased when the app is built, so this loads nothing)
import type { ScannerCameraLiveProps } from './ScannerCameraLive.native';

// The real camera, once it has been loaded
type LiveCamera = ComponentType<ScannerCameraLiveProps>;

export default function ScannerCamera(props: ScannerCameraProps) {
  const colors = useColors();
  const { onReading, message, bar, looksLikeName, paused } = props;
  // Was the camera left off because the app closed last time? Decided once, when the screen opens.
  const [safeStart] = useState(() => isSafeMode());
  // Should the camera be loaded and started? (Yes at once, unless safe mode is on; the button turns it on.)
  const [wanted, setWanted] = useState(!safeStart);
  // The camera's screen, after it has been loaded
  const [Live, setLive] = useState<LiveCamera | null>(null);
  // A problem loading the camera code (shown in words; the screen stays usable)
  const [problem, setProblem] = useState('');
  // Reading a picture from the gallery
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  // Load the camera's code when it is wanted. "require" inside a function runs only when the function runs,
  // which is what keeps the camera library out of the app until now.
  useEffect(() => {
    if (!wanted || Live) return;
    try {
      mark('camera code loading');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require('./ScannerCameraLive.native').default as LiveCamera;
      mark('camera code loaded');
      mark('camera starting');
      setLive(() => loaded);
    } catch (err) {
      mark(`camera code failed: ${(err as Error).message}`);
      setProblem((err as Error).message || 'The camera could not be loaded.');
      setWanted(false);
    }
  }, [wanted, Live]);

  // A picture chosen from the phone (no camera needed): the card is the whole picture if it's card-shaped, else its middle
  async function choosePhoto() {
    if (busy || paused) return;
    let path = '';
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.length) return;
      setBusy(true);
      setHint('');
      // The reader wants a plain file path, not a "file://" address
      path = decodeURIComponent(picked.assets[0].uri.replace(/^file:\/\//, ''));
      const [width, height] = await photoSize(path);
      const reading = await readCardPhoto(path, cardInPickedPhoto({ w: width, h: height }, CARD_ASPECT), looksLikeName);
      await onReading(reading);
    } catch (err) {
      setHint((err as Error).message || 'That picture could not be read.');
    } finally {
      if (path) await finishPhoto(path, false).catch(() => { /* a temporary file */ });
      setBusy(false);
    }
  }

  // The real camera is up: let it do everything
  if (Live) return <Live {...props} plainFromStart={safeStart} />;

  // The camera is not running (safe mode, still loading, or it could not be loaded)
  return (
    <View style={styles.area}>
      <View style={styles.centre}>
        <Ionicons name="camera-outline" size={44} color={colors.muted} />
        {wanted ? (
          <ActivityIndicator color={colors.muted} />
        ) : (
          <>
            <Text style={[styles.text, { color: colors.text }]}>
              {problem
                ? `The camera could not be loaded: ${problem}`
                : 'The camera is off, because the app closed by itself last time while the camera was starting.'}
            </Text>
            <Pressable
              accessibilityRole="button" accessibilityLabel="Start camera"
              onPress={() => { setProblem(''); setWanted(true); }}
              style={[styles.button, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.buttonText, { color: colors.accentText }]}>Start camera</Text>
            </Pressable>
          </>
        )}
        <Pressable
          accessibilityRole="button" accessibilityLabel="Choose a photo of a card"
          onPress={choosePhoto} disabled={busy}
          style={[styles.button, { borderColor: colors.border, borderWidth: 1, opacity: busy ? 0.5 : 1 }]}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>{busy ? 'Reading the card…' : 'Choose a photo'}</Text>
        </Pressable>
        {!!(message || hint) && <Text style={[styles.hint, { color: colors.muted }]}>{message || hint}</Text>}
      </View>
      {/* The mode choice and the options button, as on the camera screen */}
      <View style={styles.bar}>
        <View style={styles.barSide}>{bar?.left}</View>
        <View style={[styles.barSide, styles.barRight]}>{bar?.right}</View>
      </View>
    </View>
  );
}

// The look: the message in the middle, the mode and options buttons along the bottom
const styles = StyleSheet.create({
  area: { flex: 1, minHeight: 320 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  text: { fontSize: 16, textAlign: 'center' },
  hint: { fontSize: 14, textAlign: 'center' },
  button: { paddingHorizontal: 20, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '700' },
  bar: { height: 80, flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  barSide: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  barRight: { justifyContent: 'flex-end' },
});
