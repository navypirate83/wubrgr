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
   TWO WAYS TO AIM (the "Track card" button at the top switches between them):
     Guide: line the card up inside the four corners, tap the round button.
     Track: no lining up. Several times a second a small copy of the live picture goes
       to the card finder (lib/scanner/core/cardFinder.ts), which says where the card's
       four corners are, and an outline is drawn around the card. When the outline has
       held still for a moment the card is straightened into a flat upright picture
       (core/perspective.ts) and read exactly like a lined-up card. The round button
       does the same at once. After a scan, the card has to leave (or move) before it is
       scanned again, so one card isn't read over and over. A DIFFERENT card put down in the same
       place without the first one leaving counts too: each look is squeezed to a tiny grey
       signature (core/frameChange.ts) and when the card's signature has clearly changed and then
       held steady for a few looks in a row, the next scan is allowed.
   The tracker only ever looks at the small copy of the picture and reads NO text, so nothing is
   re-read while a scanned card sits there. The live video is where each scan's picture comes from
   (a frame is copied out of the video, there is no separate "take a photo" wait on the website);
   how long that copy took is shown in the scan timings as "frame".
   Nothing native is imported here (Android's is ScannerCamera.native.tsx).
   ===================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/hooks/useTheme';
import { readCard, cardOcr } from '@/lib/scanner/ocr/ocr.web';
import { CARD_ASPECT } from '@/lib/scanner/core/scannerTypes';
import { blendQuads, findCard, quadCentre, quadShift } from '@/lib/scanner/core/cardFinder';
import { longestSide, warpCard, type Point, type Quad } from '@/lib/scanner/core/perspective';
import { changedFrame, signatureDifference, tinyFromRgba } from '@/lib/scanner/core/frameChange';
import { aiCardPictures } from '@/lib/scanner/ai/aiPhoto.web';
import { getScanOptions } from '@/lib/scanner/scanSettings';
import type { ScannerCameraProps } from './scannerCameraTypes';

// The card shape on the screen (as a share of the camera area's height, and never wider than this share of its width)
const GUIDE_HEIGHT = 0.96;
// The room kept free along the bottom for the hint and the buttons
const BOTTOM_ROOM = 150;
const GUIDE_WIDTH = 0.82;

// Tracking: how wide the small copy of each frame is, how often it is looked at, how long a card must
// hold still before it is scanned, how far a corner may drift (as a share of the picture) and still count as
// holding still, and how many looks with no card it takes to count the card as taken away
const LOOK_WIDTH = 320;
const LOOK_EVERY_MS = 140;
const HOLD_STILL_MS = 700;
const STILL_DRIFT = 0.015;
const GONE_LOOKS = 8;
// A different card put down in the same place: its look must have clearly changed (see core/frameChange.ts) and held
// steady for this many looks in a row (a hand passing over the card moves too much to count), before it can be scanned
const CHANGE_LOOKS = 4;
const STEADY_BELOW = 0.06;
// Whether the person left Track on, remembered on this device (the browser may not allow saving; then it starts off)
const TRACK_KEY = 'wubrgr.scanner.track';
const savedTrack = () => { try { return globalThis.localStorage?.getItem(TRACK_KEY) === '1'; } catch { return false; } };

type Rect = { x: number; y: number; w: number; h: number };
// What the tracker currently sees: the card's corners (as fractions of the video picture), how far
// through the hold-still wait it is (0 to 1), and whether it will scan when the wait is over
type Found = { quad: Quad; hold: number; armed: boolean };

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
  // Track mode: on or off, and what it sees right now
  const [tracking, setTracking] = useState(savedTrack);
  const [found, setFound] = useState<Found | null>(null);
  // The tracking loop runs on a timer, so it reads the newest values through these notes-to-self
  const live = useRef({ busy, paused: !!paused, found: null as Found | null, armed: true, scannedAt: null as Point | null, scannedSig: null as Uint8Array | null });
  live.current.busy = busy;
  live.current.paused = !!paused;
  live.current.found = found;

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

  // "frameMs" is how long it took to copy the picture out of the video (for the timings shown after the scan)
  async function scan(source: HTMLCanvasElement, card: Rect, frameMs?: number) {
    setBusy(true);
    setHint('');
    try {
      const dark = brightness(source, card) < 45;
      const reading = await readCard(source, card, looksLikeName);
      if (frameMs !== undefined) reading.timings = { frame: frameMs, ...reading.timings };
      // With "AI art matching" on, also leave a way to make the flat card pictures the AI looks at. It does its
      // slow work only if the scan turns out to need it, and the photo is let go with the reading afterwards.
      if (getScanOptions().aiArt) reading.aiPictures = () => aiCardPictures(source, card);
      if (dark) setHint('It is dark. Light the card better (or use the torch) and scan again.');
      onReading(reading);
    } catch (err) {
      setHint((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The round button: a still of the whole picture, then the card cut out of it
  // (in Track mode: the card the tracker is looking at, straightened)
  async function takePicture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    if (tracking) {
      const seen = live.current.found;
      if (!seen) { setHint('Can\'t see the whole card. Put it on a plain, different-coloured surface, or switch to Guide.'); return; }
      // (a scan from the button has no saved signature, so a changed card isn't judged against an older one)
      live.current.scannedSig = null;
      await scanTracked(seen.quad);
      return;
    }
    const grabStart = Date.now();
    const still = document.createElement('canvas');
    still.width = video.videoWidth;
    still.height = video.videoHeight;
    still.getContext('2d')!.drawImage(video, 0, 0);
    await scan(still, guideInVideo(video), Date.now() - grabStart);
  }

  /* ----- Track mode ----- */

  // The card cut out of the picture and made flat and upright. "quad" is the card's corners as
  // fractions of the picture; only the box around the card is copied, so a big camera picture isn't copied whole.
  function straighten(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, quad: Quad): HTMLCanvasElement {
    const corners = quad.map((p) => ({ x: p.x * sourceWidth, y: p.y * sourceHeight })) as Quad;
    const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2);
    const top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2);
    const right = Math.min(sourceWidth, Math.ceil(Math.max(...corners.map((p) => p.x))) + 2);
    const bottom = Math.min(sourceHeight, Math.ceil(Math.max(...corners.map((p) => p.y))) + 2);
    const crop = document.createElement('canvas');
    crop.width = right - left;
    crop.height = bottom - top;
    const cropContext = crop.getContext('2d', { willReadFrequently: true })!;
    cropContext.drawImage(source, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const picture = cropContext.getImageData(0, 0, crop.width, crop.height);
    const shifted = corners.map((p) => ({ x: p.x - left, y: p.y - top })) as Quad;
    // The flat picture is about as tall as the card looked, but never tiny or enormous
    const flatHeight = Math.max(700, Math.min(1500, Math.round(longestSide(shifted))));
    const flatWidth = Math.round(flatHeight * CARD_ASPECT);
    const flat = document.createElement('canvas');
    flat.width = flatWidth;
    flat.height = flatHeight;
    flat.getContext('2d')!.putImageData(new ImageData(warpCard(picture, shifted, flatWidth, flatHeight) as unknown as ImageDataArray, flatWidth, flatHeight), 0, 0);
    return flat;
  }

  // Scan the card the tracker found, in the live picture
  async function scanTracked(quad: Quad) {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Until the card leaves or moves, don't scan it again
    live.current.armed = false;
    live.current.scannedAt = quadCentre(quad);
    const grabStart = Date.now();
    const flat = straighten(video, video.videoWidth, video.videoHeight, quad);
    await scan(flat, { x: 0, y: 0, w: flat.width, h: flat.height }, Date.now() - grabStart);
  }

  // The newest version of scanTracked (the timer below lives on past renders, and the scan screen
  // changes what it does with a reading as its mode and list change)
  const scanTrackedNow = useRef(scanTracked);
  scanTrackedNow.current = scanTracked;

  // The loop: look at the live picture a few times a second while Track is on
  useEffect(() => {
    if (!tracking || problem) { setFound(null); return; }
    const small = document.createElement('canvas');
    const context = small.getContext('2d', { willReadFrequently: true })!;
    let last: Quad | null = null;       // where the card was last time (smoothed)
    let stillSince = 0;                 // when it last stopped moving
    let missing = 0;                    // how many looks in a row found no card
    let changedLooks = 0;               // how many looks in a row the scanned card's picture has clearly changed and held steady
    let lastSig: Uint8Array | null = null;   // the card's tiny signature on the look before this one
    const timer = setInterval(() => {
      const video = videoRef.current;
      const state = live.current;
      if (!video || !video.videoWidth || state.busy || state.paused) return;
      // A small copy of the frame, for the finder
      const lookHeight = Math.round((LOOK_WIDTH * video.videoHeight) / video.videoWidth);
      if (small.width !== LOOK_WIDTH || small.height !== lookHeight) { small.width = LOOK_WIDTH; small.height = lookHeight; }
      context.drawImage(video, 0, 0, LOOK_WIDTH, lookHeight);
      const look = context.getImageData(0, 0, LOOK_WIDTH, lookHeight);
      const quad = findCard(look);
      const now = Date.now();
      if (!quad) {
        // No card: only believe it after a second look (one bad frame shouldn't make the outline blink)
        missing++;
        if (missing >= 2) { last = null; stillSince = 0; setFound(null); }
        if (missing >= GONE_LOOKS) state.armed = true;
        lastSig = null;
        changedLooks = 0;
        return;
      }
      missing = 0;
      // Moving a lot: the hold-still wait starts again (and a card moved well away from where it was scanned counts as a new card)
      const moved = last ? quadShift(last, quad) : 1;
      if (!stillSince || moved > STILL_DRIFT) stillSince = now;
      const centre = quadCentre(quad);
      if (state.scannedAt && Math.hypot(centre.x - state.scannedAt.x, centre.y - state.scannedAt.y) > 0.2) state.armed = true;
      const smooth = last ? blendQuads(last, quad, 0.4) : quad;
      last = smooth;
      const hold = Math.min(1, (now - stillSince) / HOLD_STILL_MS);
      // The card's tiny signature (a box around the card, squeezed to a grid): used to notice a DIFFERENT card put
      // down where the scanned one was, without it leaving first. Only worked out when it can matter.
      let sig: Uint8Array | null = null;
      if (!state.armed || hold >= 1) {
        const xs = smooth.map((p) => p.x);
        const ys = smooth.map((p) => p.y);
        sig = tinyFromRgba(look.data, LOOK_WIDTH, lookHeight, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      }
      if (!state.armed && sig && state.scannedSig) {
        // Clearly different from the card that was scanned, and the same as a moment ago (so not mid-move): a new card
        const different = changedFrame(state.scannedSig, sig) && !!lastSig && signatureDifference(lastSig, sig) < STEADY_BELOW;
        changedLooks = different ? changedLooks + 1 : 0;
        if (changedLooks >= CHANGE_LOOKS) { state.armed = true; changedLooks = 0; }
      }
      lastSig = sig;
      setFound({ quad: smooth, hold, armed: state.armed });
      if (hold >= 1 && state.armed) {
        // Remember what this card looked like when it was scanned
        state.scannedSig = sig;
        scanTrackedNow.current(smooth);
      }
    }, LOOK_EVERY_MS);
    return () => clearInterval(timer);
  }, [tracking, problem]);

  // The Track button: switch, and remember the choice
  function toggleTracking() {
    const next = !tracking;
    setTracking(next);
    setHint('');
    live.current.armed = true;
    live.current.scannedAt = null;
    live.current.scannedSig = null;
    try { globalThis.localStorage?.setItem(TRACK_KEY, next ? '1' : '0'); } catch { /* not remembered, that's all */ }
  }

  // A photo picked from the device: the card is the whole picture if it's card-shaped, else the middle of it
  // (in Track mode the card is looked for first, so a tilted card on a table works too)
  async function readPhoto(file: File) {
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      if (tracking) {
        const small = document.createElement('canvas');
        small.width = LOOK_WIDTH;
        small.height = Math.max(1, Math.round((LOOK_WIDTH * bitmap.height) / bitmap.width));
        const smallContext = small.getContext('2d', { willReadFrequently: true })!;
        smallContext.drawImage(bitmap, 0, 0, small.width, small.height);
        const quad = findCard(smallContext.getImageData(0, 0, small.width, small.height));
        if (quad) {
          const flat = straighten(bitmap, bitmap.width, bitmap.height, quad);
          await scan(flat, { x: 0, y: 0, w: flat.width, h: flat.height });
          return;
        }
      }
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

      {/* Guide mode: the card-shaped guide, with its four corners */}
      {!tracking && !problem && area.w > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: guide.x, top: guide.y, width: guide.w, height: guide.h }}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      )}

      {/* Track mode: an outline drawn around the card the tracker found. White while it moves, the accent
          colour once it has held still long enough to scan, faded after a scan until the card moves away. */}
      {tracking && !problem && found && area.w > 0 && videoRef.current && (() => {
        const video = videoRef.current!;
        const scale = Math.max(area.w / video.videoWidth, area.h / video.videoHeight);
        const offsetX = (area.w - video.videoWidth * scale) / 2;
        const offsetY = (area.h - video.videoHeight * scale) / 2;
        const points = found.quad.map((p) => `${offsetX + p.x * video.videoWidth * scale},${offsetY + p.y * video.videoHeight * scale}`).join(' ');
        const colour = !found.armed ? 'rgba(255,255,255,0.4)' : found.hold >= 1 ? colors.accent : '#ffffff';
        return (
          <svg width={area.w} height={area.h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
            <polygon points={points} fill={found.armed ? 'rgba(255,255,255,0.08)' : 'none'} stroke={colour} strokeWidth={found.armed ? 2 + 3 * found.hold : 2} strokeLinejoin="round" />
          </svg>
        );
      })()}

      {/* One line of words: why there's no camera, what just happened, a hint, or how to start */}
      <Text style={[styles.hint, { color: '#ffffff' }]} pointerEvents="none">
        {busy ? 'Reading the card…' : problem || message || hint || (tracking
          ? (found ? (found.armed ? 'Hold still…' : 'Move the card to scan another') : 'Show the whole card on a plain surface')
          : 'Line the card up in the corners')}
      </Text>

      {/* The button that switches between lining the card up (Guide) and letting the scanner find it (Track) */}
      <View pointerEvents="box-none" style={styles.topMiddle}>
        <Pressable
          accessibilityRole="switch" accessibilityLabel="Track card" accessibilityState={{ checked: tracking }}
          onPress={toggleTracking}
          style={[styles.trackButton, { backgroundColor: tracking ? colors.accent : 'rgba(0,0,0,0.45)', borderColor: tracking ? colors.accent : 'rgba(255,255,255,0.45)' }]}
        >
          <Ionicons name="scan-outline" size={18} color={tracking ? colors.accentText : '#ffffff'} />
          <Text style={[styles.trackText, { color: tracking ? colors.accentText : '#ffffff' }]}>Track card</Text>
        </Pressable>
      </View>

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
  // The Track button sits in the middle of the top edge, between the photo and torch buttons
  topMiddle: { position: 'absolute', top: 10, left: 64, right: 64, height: 44, alignItems: 'center', justifyContent: 'center' },
  trackButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1.5 },
  trackText: { fontSize: 13, fontWeight: '700' },
  barSide: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  barRight: { justifyContent: 'flex-end' },
  shutter: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 48, height: 48, borderRadius: 24 },
});
