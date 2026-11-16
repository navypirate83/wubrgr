/* =====================================================================
   THE SCANNER CAMERA: THE WEBSITE
   Shows the device's rear camera (the browser's getUserMedia, at the highest
   resolution it will give; it only works on a secure https page, which the site
   is) with a card-shaped guide on top. When you tap the round button it takes
   a still of the whole picture, crops the card out using the guide, reads the
   text in the three places the scanner needs (see ocr.web.ts), and hands the
   reading to the scan screen. It reads one photo per tap, not every video frame,
   because the website's text reader is slower and weaker on small text than
   Android's.
   If the camera isn't allowed, isn't there, or the page isn't secure, it says so
   and you can still pick a photo of a card from the device ("Choose a photo").
   The torch button only shows if the camera has one (many don't, or the browser
   hides it); tap-to-focus and zoom are left to the browser.
   A very dark picture is noticed and the hint says to light the card better.
   Nothing native is imported here (Android's is ScannerCamera.native.tsx).
   ===================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';
import { readCard, cardOcr } from '@/lib/scanner/ocr/ocr.web';
import { CARD_ASPECT } from '@/lib/scanner/core/scannerTypes';
import type { ScannerCameraProps } from './scannerCameraTypes';

// The card shape on the screen (as a share of the camera area's height, and never wider than this share of its width)
const GUIDE_HEIGHT = 0.96;
// The room kept free along the bottom for the hint and the buttons
const BOTTOM_ROOM = 150;
const GUIDE_WIDTH = 0.82;

type Rect = { x: number; y: number; w: number; h: number };

export default function ScannerCamera({ onReading, message, bar, paused, looksLikeName }: ScannerCameraProps) {
  const colors = useColors();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  // Why there's no camera (empty: it's working)
  const [problem, setProblem] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null);   // null: this camera has no torch
  const [torchOn, setTorchOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  /* ----- the camera, started when the screen opens and stopped when it closes ----- */
  useEffect(() => {
    let cancelled = false;
    // Start loading the text reader now, so the first scan doesn't wait for it
    cardOcr.warmUp().catch(() => { /* a scan reports it if it can't load */ });
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem('The camera needs a secure (https) page. You can choose a photo of a card instead.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play().catch(() => { /* needs a tap on some browsers */ }); }
        const capabilities = (stream.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(capabilities.torch ? true : null);
      } catch (err) {
        const name = (err as { name?: string }).name;
        setProblem(name === 'NotAllowedError' || name === 'SecurityError'
          ? 'The camera is blocked. Allow it for this site in your browser, or choose a photo of a card instead.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera was found. You can choose a photo of a card instead.'
            : 'The camera could not be started. You can choose a photo of a card instead.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch { setTorch(null); }
  }

  /* ----- where the card is, on the screen and in the picture ----- */

  // The guide: a card-shaped box, centred (in the camera area's own pixels)
  const guide: Rect = (() => {
    // Leave room along the bottom for the hint and the buttons
    const free = Math.max(0, area.h - BOTTOM_ROOM);
    const h = Math.min(free * GUIDE_HEIGHT, (area.w * GUIDE_WIDTH) / CARD_ASPECT);
    const w = h * CARD_ASPECT;
    return { x: (area.w - w) / 2, y: (free - h) / 2 + 8, w, h };
  })();

  // The same box in the video's own pixels (the video fills the area, cropped at the edges: "cover")
  function guideInVideo(video: HTMLVideoElement): Rect {
    const scale = Math.max(area.w / video.videoWidth, area.h / video.videoHeight);
    const offsetX = (area.w - video.videoWidth * scale) / 2;
    const offsetY = (area.h - video.videoHeight * scale) / 2;
    return { x: (guide.x - offsetX) / scale, y: (guide.y - offsetY) / scale, w: guide.w / scale, h: guide.h / scale };
  }

  // How bright a picture is, 0 to 255 (from a small sample)
  function brightness(source: HTMLCanvasElement, from: Rect): number {
    const sample = document.createElement('canvas');
    sample.width = 32;
    sample.height = 32;
    const context = sample.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(source, from.x, from.y, from.w, from.h, 0, 0, 32, 32);
    const { data } = context.getImageData(0, 0, 32, 32);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return sum / (data.length / 4);
  }

  async function scan(source: HTMLCanvasElement, card: Rect) {
    setBusy(true);
    setHint('');
    try {
      const dark = brightness(source, card) < 45;
      const reading = await readCard(source, card, looksLikeName);
      if (dark) setHint('It is dark. Light the card better (or use the torch) and scan again.');
      onReading(reading);
    } catch (err) {
      setHint((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The round button: a still of the whole picture, then the card cut out of it
  async function takePicture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    const still = document.createElement('canvas');
    still.width = video.videoWidth;
    still.height = video.videoHeight;
    still.getContext('2d')!.drawImage(video, 0, 0);
    await scan(still, guideInVideo(video));
  }

  // A photo picked from the device: the card is the whole picture if it's card-shaped, else the middle of it
  async function readPhoto(file: File) {
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const still = document.createElement('canvas');
      still.width = bitmap.width;
      still.height = bitmap.height;
      still.getContext('2d')!.drawImage(bitmap, 0, 0);
      const shaped = Math.abs(bitmap.width / bitmap.height - CARD_ASPECT) < 0.06;
      const h = shaped ? bitmap.height : Math.min(bitmap.height, bitmap.width / CARD_ASPECT);
      const w = h * CARD_ASPECT;
      await scan(still, shaped ? { x: 0, y: 0, w: bitmap.width, h: bitmap.height } : { x: (bitmap.width - w) / 2, y: (bitmap.height - h) / 2, w, h });
    } catch {
      setHint('That picture could not be read.');
      setBusy(false);
    }
  }

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setArea({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height });
  }, []);

  return (
    <View style={styles.area} onLayout={onLayout}>
      {/* The live picture. (A plain video element: the website's own camera view.) */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' }}
      />

      {/* The card-shaped guide, with its four corners */}
      {!problem && area.w > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: guide.x, top: guide.y, width: guide.w, height: guide.h }}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      )}

      {/* One line of words: why there's no camera, what just happened, a hint, or how to start */}
      <Text style={[styles.hint, { color: '#ffffff' }]} pointerEvents="none">
        {busy ? 'Reading the card…' : problem || message || hint || 'Line the card up in the corners'}
      </Text>

      {/* The photo and torch buttons, in the top corners */}
      <Pressable
        accessibilityRole="button" accessibilityLabel="Choose a photo of a card"
        onPress={() => fileRef.current?.click()}
        style={[styles.side, styles.topLeftButton]}
      >
        <Ionicons name="images-outline" size={22} color="#ffffff" />
      </Pressable>
      {torch !== null && (
        <Pressable
          accessibilityRole="button" accessibilityLabel={torchOn ? 'Torch off' : 'Torch on'}
          onPress={toggleTorch}
          style={[styles.side, styles.topRightButton]}
        >
          <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={22} color={torchOn ? colors.accent : '#ffffff'} />
        </Pressable>
      )}

      {/* Along the bottom: what the screen gives (the mode choice), the round scan button, what the screen gives (the list) */}
      <View style={styles.bar}>
        <View style={styles.barSide}>{bar?.left}</View>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Scan the card" accessibilityState={{ disabled: !!problem || busy || !!paused }}
          disabled={!!problem || busy || !!paused}
          onPress={takePicture}
          style={[styles.shutter, (!!problem || busy || !!paused) && { opacity: 0.4 }]}
        >
          {busy ? <ActivityIndicator color={colors.accentText} /> : <View style={[styles.shutterInner, { backgroundColor: colors.accent }]} />}
        </Pressable>
        <View style={[styles.barSide, styles.barRight]}>{bar?.right}</View>
      </View>

      {/* The hidden file chooser behind the "photo" button */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) readPhoto(file);
        }}
      />
    </View>
  );
}

// The look: the camera fills the area; the guide's corners are white L-shapes; the buttons sit along the bottom
const styles = StyleSheet.create({
  area: { flex: 1, minHeight: 320, backgroundColor: '#000', overflow: 'hidden' },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: '#ffffff', borderWidth: 3 },
  topLeft: { top: -3, left: -3, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  topRight: { top: -3, right: -3, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  bottomLeft: { bottom: -3, left: -3, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  bottomRight: { bottom: -3, right: -3, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  hint: { position: 'absolute', left: 16, right: 16, bottom: 112, textAlign: 'center', fontSize: 14, textShadowColor: '#000', textShadowRadius: 4 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100, flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  side: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  topLeftButton: { position: 'absolute', top: 10, left: 12 },
  topRightButton: { position: 'absolute', top: 10, right: 12 },
  barSide: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  barRight: { justifyContent: 'flex-end' },
  shutter: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 48, height: 48, borderRadius: 24 },
});
