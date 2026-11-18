/* =====================================================================
   THE SCANNER CAMERA: ANDROID
   Shows the phone's rear camera (react-native-vision-camera) with a card-shaped
   guide on top. When you tap the round button it takes a full-size photo,
   works out which part of the photo is under the guide, and gives that to
   Google's text reader (ML Kit, through our own small add-on; see
   lib/scanner/ocr/ocr.native.ts). The reading goes to the scan screen exactly
   like the website's does, so everything after it (finding the card, the
   confirm sheet, the stack list) is shared.
   You can also pinch to zoom, tap to focus, turn the torch on, or pick a photo
   of a card from the phone ("Choose a photo").
   The camera is switched off whenever you leave the Scan tab or the app goes to
   the background, so it doesn't drain the battery.
   AUTO SCAN (the button at the top): the camera takes a photo again and again by itself.
   Each look only reads the title bar (quick). When a real card's name is seen in the guide
   the same title has been read twice in a row (so a card still sliding in, or blurred, is skipped until
   it settles; see core/frameAgree.ts) the rest is read and the card is scanned, then nothing more happens until the card has been
   taken away (a couple of looks with no card), so one card isn't scanned over and over.
   Together with Stack mode this is hands-free: slide the next card into the guide and it's added.
   Older cards get their clues read (set symbol, artwork and border colour) only when the
   scan needs them (see core/readPlan.ts), the same as on the website.
   SCAN QUEUE (Stack mode): the screen says "queue" and the camera stops waiting for each card to be
   worked out. Once a card has been READ (the text reader), the photo goes to the scan screen to be
   worked out and the camera is free for the next card straight away; up to a few cards can be
   waiting at once (MAX_WAITING). Each photo is kept until the screen has finished with it, then deleted.
   If that many are already waiting, the button says so and the camera holds back until one finishes.
   SPEED: photos are taken in the quick mode (where the phone has it) at about 8 megapixels (plenty for the small
   print), and every scan notes how long each step took (shown after the scan).
   Nothing from the website's camera (video, canvas) is used here.
   ===================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { useColors } from '@/hooks/useTheme';
import { cardOcr, finishPhoto, photoSize, readCardPhoto, readTitleOnly } from '@/lib/scanner/ocr/ocr.native';
import { CARD_ASPECT } from '@/lib/scanner/core/scannerTypes';
import { cardInPickedPhoto, guideInPhoto, type Fractions } from '@/lib/scanner/core/cardInPhoto';
import { titlesAgree } from '@/lib/scanner/core/frameAgree';
import type { ScannerCameraProps } from './scannerCameraTypes';

// The card shape on the screen (as a share of the camera area's height, and never wider than this share of its width)
// These match the website's guide so the two look the same
const GUIDE_HEIGHT = 0.96;
const GUIDE_WIDTH = 0.82;
// The room kept free along the bottom for the hint and the buttons
const BOTTOM_ROOM = 150;
// Auto scan: the wait between one look and the next, and how many looks in a row with no
// card it takes to count the card as taken away
const LOOK_PAUSE_MS = 120;
const GONE_LOOKS = 2;
// The scan queue: how many cards may be waiting to be worked out at once (each one keeps its photo until
// it's done, so this is kept small)
const MAX_WAITING = 3;
// The photo size asked for (a target: the camera gives the nearest it has, in the same shape)
const PHOTO_SIZE = { width: 2448, height: 3264 };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function ScannerCamera({ onReading, message, bar, paused, looksLikeName, queue }: ScannerCameraProps) {
  const colors = useColors();
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  // The photo taker. Speed matters more than the last bit of quality: about 8 megapixels (4:3, like the
  // live picture) is plenty for the small print, and the quick mode and a little more JPEG
  // squeezing make each photo come back much sooner than a full-size, best-quality one.
  // The quick mode only exists on phones whose camera supports it (the camera library throws an error, which
  // closes the app, when it's asked for on one that doesn't), so ask the phone first and use the middle
  // setting ("balanced") when it can't.
  const photoOutput = usePhotoOutput({
    targetResolution: PHOTO_SIZE,
    qualityPrioritization: device?.supportsSpeedQualityPrioritization ? 'speed' : 'balanced',
    quality: 0.85,
  });
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [torchOn, setTorchOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  // Auto scan: on or off, and whether a card is being looked at right now (for the hint)
  const [auto, setAuto] = useState(false);
  const [seeing, setSeeing] = useState(false);
  // How many cards are waiting to be worked out in the scan queue right now (a note-to-self, not something
  // the screen draws, so changing it doesn't redraw anything)
  const waiting = useRef(0);
  // Whether this tab is the one being looked at, and whether the app is in front (the camera runs only then)
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const watch = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => watch.remove();
  }, []);

  // Ask for the camera the first time this screen opens
  useEffect(() => {
    if (!hasPermission && canRequestPermission) requestPermission().catch(() => { /* the screen shows the words below */ });
  }, [hasPermission, canRequestPermission, requestPermission]);
  // Check the text reader add-on is in this build (it says so if not)
  useEffect(() => { cardOcr.warmUp().catch((err: Error) => setHint(err.message)); }, []);

  /* ----- where the guide is on the screen ----- */

  // A card-shaped box, centred (in the camera area's own pixels)
  const guide = (() => {
    const free = Math.max(0, area.h - BOTTOM_ROOM);
    const h = Math.min(free * GUIDE_HEIGHT, (area.w * GUIDE_WIDTH) / CARD_ASPECT);
    const w = h * CARD_ASPECT;
    return { x: (area.w - w) / 2, y: (free - h) / 2 + 8, w, h };
  })();

  /* ----- scanning ----- */

  // Read the card in a photo file and hand the reading over. "card" is where the card is in it,
  // "fresh" is whether the camera just took it (its file is then deleted afterwards)
  // "photoMs" is how long the camera took to take the photo (for the timings shown after the scan)
  async function scanPhoto(path: string, card: Fractions, fresh: boolean, photoMs?: number) {
    // True once the photo has been given to the queue, which then deletes it when it's finished with it
    let handedOver = false;
    try {
      const reading = await readCardPhoto(path, card, looksLikeName);
      if (photoMs !== undefined) reading.timings = { photo: photoMs, ...reading.timings };
      if (queue) {
        // The queue: the screen works the card out in the background and this camera is free for the next one
        handedOver = true;
        startInQueue(onReading, reading, path, fresh);
      } else {
        // Wait until the reading has been worked out, because the extra clues are read from the photo then
        await onReading(reading);
      }
    } finally {
      if (!handedOver) await finishPhoto(path, fresh);
    }
  }

  // Give a reading to the screen to work out without waiting for the answer. The photo is kept until
  // the screen has finished (its extra clues are read from it), then deleted. While it's being worked
  // out it counts as waiting (see MAX_WAITING).
  function startInQueue(handler: ScannerCameraProps['onReading'], reading: Parameters<ScannerCameraProps['onReading']>[0], path: string, fresh: boolean) {
    waiting.current += 1;
    Promise.resolve()
      .then(() => handler(reading))
      .catch(() => { /* the screen tells the person about its own problems */ })
      .finally(() => {
        waiting.current -= 1;
        finishPhoto(path, fresh).catch(() => { /* the photo is only a temporary file */ });
      });
  }

  // The round button: take a photo, then read the card under the guide
  async function takePicture() {
    if (busy || paused || !device || auto) return;
    // The queue is full: wait for one of the waiting cards to be finished
    if (queue && waiting.current >= MAX_WAITING) { setHint('Still reading the earlier cards. One moment.'); return; }
    setBusy(true);
    setHint('');
    try {
      const startedAt = Date.now();
      const photo = await photoOutput.capturePhotoToFile({ enableShutterSound: false }, {});
      const photoMs = Date.now() - startedAt;
      try {
        const [width, height] = await photoSize(photo.filePath);
        await scanPhoto(photo.filePath, guideInPhoto(area, guide, { w: width, h: height }), true, photoMs);
      } catch (err) {
        await finishPhoto(photo.filePath, true);
        throw err;
      }
    } catch (err) {
      setHint((err as Error).message || 'The card could not be read.');
    } finally {
      setBusy(false);
    }
  }

  // A photo picked from the phone: the card is the whole picture if it's card-shaped, else the middle of it
  async function choosePhoto() {
    if (busy || paused) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.length) return;
      setBusy(true);
      setHint('');
      // The reader wants a plain file path, not a "file://" address
      const path = decodeURIComponent(picked.assets[0].uri.replace(/^file:\/\//, ''));
      try {
        const [width, height] = await photoSize(path);
        await scanPhoto(path, cardInPickedPhoto({ w: width, h: height }, CARD_ASPECT), false);
      } catch (err) {
        await finishPhoto(path, false);
        throw err;
      }
    } catch (err) {
      setHint((err as Error).message || 'That picture could not be read.');
    } finally {
      setBusy(false);
    }
  }

  /* ----- Auto scan ----- */

  // The loop below lives on past renders, so it reads the newest values through these notes-to-self
  const live = useRef({ busy, paused: !!paused, area, guide, onReading, looksLikeName, queue: !!queue });
  live.current = { busy, paused: !!paused, area, guide, onReading, looksLikeName, queue: !!queue };
  const running = !!device && hasPermission && focused && appActive;

  useEffect(() => {
    if (!auto || !running) { setSeeing(false); return; }
    let stop = false;
    (async () => {
      let armed = true;   // true until a card has been scanned, and again once it has been taken away
      let missing = 0;    // how many looks in a row found no card
      let lastTitle = ''; // the title read on the look before this one (empty if that look saw no card)
      while (!stop) {
        const now = live.current;
        // Wait while something else is open over the camera, or a button press is being read
        // (or, with the queue, while as many cards as it holds are still waiting to be worked out)
        if (now.paused || now.busy || now.area.w === 0 || (now.queue && waiting.current >= MAX_WAITING)) { await sleep(300); continue; }
        let path = '';
        try {
          const startedAt = Date.now();
          const photo = await photoOutput.capturePhotoToFile({ enableShutterSound: false }, {});
          const photoMs = Date.now() - startedAt;
          path = photo.filePath;
          const [width, height] = await photoSize(path);
          const card = guideInPhoto(now.area, now.guide, { w: width, h: height });
          // A quick look first: only the title bar, to see whether a real card is there
          const title = await readTitleOnly(path, card, now.looksLikeName ?? (() => true));
          const present = !!now.looksLikeName && now.looksLikeName(title);
          if (present) {
            missing = 0;
            setSeeing(true);
            // Two looks in a row must read the same title before the card is scanned. A card still sliding in,
            // or blurred, reads differently each time and is skipped until it settles.
            const steady = lastTitle !== '' && titlesAgree(lastTitle, title);
            lastTitle = title;
            if (armed && steady && !stop && !live.current.paused) {
              armed = false;
              // A card to scan: read the rest (the title isn't read again)
              const reading = await readCardPhoto(path, card, now.looksLikeName, title);
              reading.timings = { photo: photoMs, ...reading.timings };
              if (now.queue) {
                // The queue: hand it over and look for the next card; the queue deletes the photo when it's done
                startInQueue(live.current.onReading, reading, path, true);
                path = '';
              } else {
                await live.current.onReading(reading);
              }
            }
          } else {
            setSeeing(false);
            lastTitle = '';
            missing += 1;
            if (missing >= GONE_LOOKS) armed = true;
          }
        } catch (err) {
          setHint((err as Error).message || 'The camera had a problem.');
          await sleep(1500);
        } finally {
          if (path) await finishPhoto(path, true);
        }
        await sleep(LOOK_PAUSE_MS);
      }
    })();
    return () => { stop = true; };
    // The loop reads everything else through "live", so only these should restart it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, running, photoOutput]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setArea({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height });
  }, []);

  /* ----- when there's no camera to show ----- */

  if (!hasPermission || !device) {
    return (
      <View style={styles.noCamera}>
        <Ionicons name="camera-outline" size={44} color={colors.muted} />
        <Text style={[styles.noCameraText, { color: colors.text }]}>
          {!hasPermission
            ? (canRequestPermission
              ? 'The scanner needs your camera to see the cards.'
              : 'The camera is blocked for this app. Turn it on in the phone\'s settings for WUBRG\'r.')
            : 'No camera was found on this phone. You can still choose a photo of a card.'}
        </Text>
        {!hasPermission && (
          <Pressable
            accessibilityRole="button" accessibilityLabel={canRequestPermission ? 'Allow the camera' : 'Open the phone settings'}
            onPress={() => (canRequestPermission ? requestPermission() : Linking.openSettings())}
            style={[styles.allow, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.allowText, { color: colors.accentText }]}>{canRequestPermission ? 'Allow the camera' : 'Open settings'}</Text>
          </Pressable>
        )}
        {device === undefined && hasPermission && (
          <Pressable accessibilityRole="button" accessibilityLabel="Choose a photo of a card" onPress={choosePhoto} style={[styles.allow, { backgroundColor: colors.accent }]}>
            <Text style={[styles.allowText, { color: colors.accentText }]}>Choose a photo</Text>
          </Pressable>
        )}
      </View>
    );
  }

  /* ----- the camera ----- */

  const blocked = busy || !!paused || auto;
  return (
    <View style={styles.area} onLayout={onLayout}>
      {/* The live picture. Pinch to zoom, tap to focus. "cover" fills the area, cutting off the edges. */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={focused && appActive}
        outputs={[photoOutput]}
        resizeMode="cover"
        torchMode={torchOn ? 'on' : 'off'}
        enableNativeZoomGesture
        enableNativeTapToFocusGesture
        onError={(error) => setHint(error.message)}
      />

      {/* The card-shaped guide, with its four corners */}
      {area.w > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: guide.x, top: guide.y, width: guide.w, height: guide.h }}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      )}

      {/* One line of words: what just happened, a hint, or how to start */}
      <Text style={[styles.hint, { color: '#ffffff' }]} pointerEvents="none">
        {busy ? 'Reading the card…' : message || hint || (auto
          ? (seeing ? 'Got it. Take the card away for the next one' : 'Slide a card into the corners')
          : 'Line the card up in the corners')}
      </Text>

      {/* The button that switches Auto scan on and off */}
      <View pointerEvents="box-none" style={styles.topMiddle}>
        <Pressable
          accessibilityRole="switch" accessibilityLabel="Auto scan" accessibilityState={{ checked: auto }}
          onPress={() => { setAuto(!auto); setHint(''); }}
          style={[styles.autoButton, { backgroundColor: auto ? colors.accent : 'rgba(0,0,0,0.45)', borderColor: auto ? colors.accent : 'rgba(255,255,255,0.45)' }]}
        >
          <Ionicons name="scan-outline" size={18} color={auto ? colors.accentText : '#ffffff'} />
          <Text style={[styles.autoText, { color: auto ? colors.accentText : '#ffffff' }]}>Auto scan</Text>
        </Pressable>
      </View>

      {/* The photo and torch buttons, in the top corners */}
      <Pressable accessibilityRole="button" accessibilityLabel="Choose a photo of a card" onPress={choosePhoto} style={[styles.side, styles.topLeftButton]}>
        <Ionicons name="images-outline" size={22} color="#ffffff" />
      </Pressable>
      {device.hasTorch && (
        <Pressable
          accessibilityRole="button" accessibilityLabel={torchOn ? 'Torch off' : 'Torch on'}
          onPress={() => setTorchOn(!torchOn)}
          style={[styles.side, styles.topRightButton]}
        >
          <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={22} color={torchOn ? colors.accent : '#ffffff'} />
        </Pressable>
      )}

      {/* Along the bottom: what the screen gives (the mode choice), the round scan button, what the screen gives (the list) */}
      <View style={styles.bar}>
        <View style={styles.barSide}>{bar?.left}</View>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Scan the card" accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={takePicture}
          style={[styles.shutter, blocked && { opacity: 0.4 }]}
        >
          {busy ? <ActivityIndicator color={colors.accentText} /> : <View style={[styles.shutterInner, { backgroundColor: colors.accent }]} />}
        </Pressable>
        <View style={[styles.barSide, styles.barRight]}>{bar?.right}</View>
      </View>
    </View>
  );
}

// The look: the same as the website's camera, so the two match
const styles = StyleSheet.create({
  area: { flex: 1, minHeight: 320, backgroundColor: '#000', overflow: 'hidden' },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  noCameraText: { fontSize: 16, textAlign: 'center' },
  allow: { paddingHorizontal: 20, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  allowText: { fontSize: 15, fontWeight: '700' },
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
  // The Auto scan button sits in the middle of the top edge, between the photo and torch buttons
  topMiddle: { position: 'absolute', top: 10, left: 64, right: 64, height: 44, alignItems: 'center', justifyContent: 'center' },
  autoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1.5 },
  autoText: { fontSize: 13, fontWeight: '700' },
  barSide: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  barRight: { justifyContent: 'flex-end' },
  shutter: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 48, height: 48, borderRadius: 24 },
});
