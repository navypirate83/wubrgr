/* =====================================================================
   LIVE FRAMES FOR THE ANDROID SCANNER (this file is only ever used on the phone, never the website)
   The scanner normally takes a full photo for every "is there a card?" look in Auto scan.
   The camera also has a live picture running all the time; this borrows a single picture from
   it (a "frame") and saves it as a small JPEG file in the phone's temporary folder, so every
   function that reads a photo file (see lib/scanner/ocr/ocr.native.ts) can read it as it is.
   Nothing else in the scanner has to know the difference.

   HOW IT WORKS
     1. The camera is given an extra "frame output" (react-native-vision-camera's useFrameOutput).
        It hands every live frame to a small function that runs on the camera's own thread.
     2. That function almost always does nothing and lets go of the frame at once. Only when
        grab() has asked for one does it turn the NEXT frame into a picture (the library's own
        FrameConverter does the colour conversion and the turning) and pass that to the app.
     3. The app turns it the right way up if needed, saves it as a JPEG and gives back the file path.
   Anything that goes wrong (no frame within 1.5 seconds, a conversion error, a save error) just
   gives back "no frame" (null) and the scanner takes a normal photo instead. The scanner also
   counts such failures and stops using frames altogether after a few (see core/liveFrames.ts).

   THE SWITCH: LIVE_FRAMES_ON below. It is OFF to begin with because this code needs the
   new native add-on (react-native-vision-camera-worklets) in the Android build, and it has not
   been tried on a phone yet. With it OFF nothing from this file touches the camera at all: the
   frame output is never created and the scanner behaves exactly as before.
   ===================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HybridFrameConverter, useFrameOutput, type CameraFrameOutput, type Frame } from 'react-native-vision-camera';
import type { Image } from 'react-native-nitro-image';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { FRAME_TARGET, totalTurn } from '@/lib/scanner/core/liveFrames';

// THE MASTER SWITCH. false = the scanner takes a photo for every look, as it always did.
// true = Auto scan borrows live camera frames for its repeated looks (a photo is still taken for the real reading
// of a card, unless READ_CARDS_FROM_FRAMES below is also true). Change it to true, and make a new Android build.
export const LIVE_FRAMES_ON = false;

// SECOND SWITCH (only matters when LIVE_FRAMES_ON is true): also read the card itself (the info line, the set
// symbol, the artwork) from a frame instead of a photo, for Auto scan and for the round button. Faster again, but
// a frame is smaller and rougher than a photo, so small print is read less surely. false = the card is always read
// from a photo; the frames only do the repeated "is a card there? has anything changed?" looks.
export const READ_CARDS_FROM_FRAMES = false;

// How long to wait for a frame before giving up on it (milliseconds). The camera makes about 30 a second, so
// a wait this long means something is wrong (or the camera has not started yet).
const GRAB_TIMEOUT_MS = 1500;
// The JPEG quality of a saved frame, 0 to 100 (high, because small print matters more than file size here)
const FRAME_JPEG_QUALITY = 92;

// A frame that was turned into a file
export type GrabbedFrame = { path: string; ms: number };

// What the scanner camera gets from this
export type LiveFrames = {
  // Add this to the Camera's list of outputs when it is not null
  output: CameraFrameOutput | null;
  // Get the next live frame as a JPEG file. "extraTurn" is the half turn the photo check found necessary (0 or 180).
  // Gives null if no frame could be had (the caller then takes a photo).
  grab(extraTurn: 0 | 180): Promise<GrabbedFrame | null>;
  // Stop using frames from now on (the frame output is taken off the camera)
  giveUp(): void;
};

// A frame being waited for
type Job = { resolve: (frame: GrabbedFrame | null) => void; extra: 0 | 180; startedAt: number; timer: ReturnType<typeof setTimeout> | null };

// Let go of a picture's memory, ignoring any complaint (it may already be gone)
function release(image: Image | null | undefined) {
  try { image?.dispose(); } catch { /* already released */ }
}

// Is the add-on that lets the camera hand frames to the app part of this build? Its code is loaded the first time it
// is asked for; if the build doesn't have it, loading fails and frames are simply not used.
function frameAddOnPresent(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-vision-camera-worklets');
    return true;
  } catch {
    return false;
  }
}

// ----- the version used when frames are OFF: does nothing at all -----
function useNoFrames(): LiveFrames {
  return useMemo<LiveFrames>(() => ({ output: null, grab: async () => null, giveUp: () => {} }), []);
}

// ----- the version used when frames are ON -----
function useRealFrames(): LiveFrames {
  // True once frames have been given up on (the output is then left off the camera)
  const [off, setOff] = useState(false);
  // The frame grab() is waiting for, if any
  const waiting = useRef<Job | null>(null);
  // "Yes, the next frame please": shared between the app's thread and the camera's thread, so the camera's thread can read it
  const wanted = useMemo(() => createSynchronizable(false), []);
  // The library's converter from a frame to a picture (a plain object that can be used on the camera's thread too)
  const converter = HybridFrameConverter;

  // Runs on the app's thread, called by the camera's thread with the converted picture. It turns it the right way up if
  // needed, saves it as a JPEG, and answers the waiting grab().
  const handOver = useMemo(() => (image: Image, orientation: string) => {
    const job = waiting.current;
    // Nobody is waiting any more (it took too long): just throw the picture away
    if (!job) { release(image); return; }
    waiting.current = null;
    if (job.timer) clearTimeout(job.timer);
    (async () => {
      let turned: Image | null = null;
      try {
        const turn = totalTurn(orientation, job.extra);
        turned = turn === 0 ? null : await image.rotateAsync(turn, false);
        const path = await (turned ?? image).saveToTemporaryFileAsync('jpg', FRAME_JPEG_QUALITY);
        job.resolve({ path, ms: Date.now() - job.startedAt });
      } catch {
        job.resolve(null);
      } finally {
        release(image);
        release(turned);
      }
    })();
  }, []);

  // Runs on the app's thread, called by the camera's thread when it could not make the picture
  const handFailed = useMemo(() => () => {
    const job = waiting.current;
    if (!job) return;
    waiting.current = null;
    if (job.timer) clearTimeout(job.timer);
    job.resolve(null);
  }, []);

  // What runs on the camera's own thread for every live frame (about 30 a second): it lets go of the frame at once
  // unless one was asked for. The word 'worklet' on its first line is what tells the build tools that this small
  // function may run on that other thread. It is made only once (useMemo), because the camera would otherwise be
  // handed a "new" function every time the screen is drawn.
  const onFrame = useMemo(() => (frame: Frame) => {
    'worklet';
    try {
      if (!wanted.getBlocking()) return;
      wanted.setBlocking(false);
      const image = converter.convertFrameToImage(frame);
      scheduleOnRN(handOver, image, frame.orientation);
    } catch {
      scheduleOnRN(handFailed);
    } finally {
      frame.dispose();
    }
  }, [wanted, converter, handOver, handFailed]);

  // The camera's live-frame output
  const frameOutput = useFrameOutput({
    targetResolution: FRAME_TARGET,
    // A format the phone's own code can turn into a picture (the default, "native", cannot be)
    pixelFormat: 'yuv',
    // A frame arriving while the last is still being handled is dropped, not queued
    dropFramesWhileBusy: true,
    onFrameDropped: () => { /* dropped frames are normal here */ },
    onFrame,
  });

  // Ask for the next frame and wait for it (null after a while, or if frames were given up on)
  const grab = useCallback((extraTurn: 0 | 180) => new Promise<GrabbedFrame | null>((resolve) => {
    if (off || waiting.current) { resolve(null); return; }
    const job: Job = { resolve, extra: extraTurn, startedAt: Date.now(), timer: null };
    job.timer = setTimeout(() => {
      if (waiting.current === job) {
        waiting.current = null;
        wanted.setBlocking(false);
        resolve(null);
      }
    }, GRAB_TIMEOUT_MS);
    waiting.current = job;
    wanted.setBlocking(true);
  }), [off, wanted]);

  // When the camera screen goes away: nobody is left waiting for a frame
  useEffect(() => () => {
    const job = waiting.current;
    waiting.current = null;
    if (job) { if (job.timer) clearTimeout(job.timer); job.resolve(null); }
    try { wanted.setBlocking(false); } catch { /* the shared flag may already be gone */ }
  }, [wanted]);

  const giveUp = useCallback(() => setOff(true), []);
  return useMemo<LiveFrames>(() => ({ output: off ? null : frameOutput, grab, giveUp }), [off, frameOutput, grab, giveUp]);
}

// Which version is used is decided once, when the app starts, so the same one runs every time the screen is drawn
// (a screen must always use the same pieces in the same order). Frames are on only if the switch is on AND this build has the add-on.
export const useLiveFrames: () => LiveFrames = LIVE_FRAMES_ON && frameAddOnPresent() ? useRealFrames : useNoFrames;
