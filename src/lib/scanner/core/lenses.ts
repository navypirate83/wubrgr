/* =====================================================================
   THE CAMERA'S LENSES (shared, plain TypeScript, no React)
   Many phones have more than one lens on the back: an ultra-wide, the
   main one, and sometimes a zoom (telephoto). The scanner lets the person
   pick which lens to look through, right on the camera picture. This file
   works out WHICH buttons to offer, from the list of cameras the phone reports.
   A card is read best from the main lens, but the ultra-wide lets you hold
   the phone close to a card and still fit it in, and zooming in lets you
   scan from further away, so it's useful to be able to try them.

   HOW A LENS IS SWITCHED TO. Most Android phones report ONE back camera that
   is really all the back lenses blended together. The phone itself swaps
   lens as that camera is zoomed: below 1x it uses the ultra-wide, around 1x
   the main lens, and far in the zoom lens (this is what the phone's own
   camera app's "0.6x  1x  2x" buttons do). The single lenses inside that
   blended camera can NOT be opened by themselves (the camera library lists
   them, but with no kind and no abilities), which is why the earlier buttons,
   which tried to open them, did not work.
   So a button here is a camera to use AND a zoom level to set on it:
     - on a blended camera: the same camera, at its widest zoom, 1x and 2x;
     - on a phone that lists its lenses as separate cameras instead: the
       ultra-wide (or zoom) camera itself.
   ===================================================================== */

// The parts of a camera we need to know about (the camera library's devices have all of these)
export type LensCandidate = {
  id: string;
  type: string;                       // 'wide-angle', 'ultra-wide-angle', 'telephoto', 'dual', 'triple', ...
  position: string;                   // 'back', 'front', ...
  minZoom: number;                    // the widest it can zoom out to (below 1 means it reaches an ultra-wide lens)
  maxZoom: number;                    // the furthest it can zoom in (0 for a lens that can't be opened by itself)
};

// One button: its words, the camera it uses and the zoom level it sets on that camera
export type LensChoice = { id: string; label: string; deviceId: string; zoom: number };

// A camera counts as "reaching the ultra-wide by zooming out" when it can zoom out to below this
const WIDE_BELOW = 0.95;
// The zoomed-in button's level (offered when the camera can zoom that far)
const ZOOM_IN = 2;

// The back cameras that can really be opened (a lens listed only as a part of another camera can't zoom at all)
function backCameras<T extends LensCandidate>(devices: readonly T[]): T[] {
  return devices.filter((device) => device.position === 'back' && device.maxZoom >= 1);
}

// Can this camera get to the ultra-wide lens just by zooming out? (An ultra-wide camera by itself is not counted: its
// own "1x" is already the wide view.)
function reachesWide(device: LensCandidate): boolean {
  return device.type !== 'ultra-wide-angle' && device.minZoom < WIDE_BELOW;
}

// The camera the scanner starts on and that the zoom buttons work on. "usualId" is the camera the phone calls its
// usual back camera. That one is used if it can zoom out to the ultra-wide; if it can't but another back camera can
// (a blended one), that one is used instead, so the lens buttons have something to work with; otherwise the usual one.
export function mainCamera<T extends LensCandidate>(devices: readonly T[], usualId: string | null): T | null {
  const backs = backCameras(devices);
  const usual = backs.find((device) => device.id === usualId) ?? null;
  if (usual && reachesWide(usual)) return usual;
  const blended = backs.filter(reachesWide).sort((a, b) => a.minZoom - b.minZoom)[0];
  return blended ?? usual ?? backs.find((device) => device.type === 'wide-angle') ?? backs[0] ?? null;
}

// The words on a zoom button: "0.6x", "1x", "2x"
function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 10) / 10}x`;
}

// A button's id: the camera and the zoom level together
function choiceId(deviceId: string, zoom: number): string {
  return `${deviceId}@${zoom}`;
}

// The buttons to show, widest first. Gives back nothing when there is no real choice (fewer than two).
export function lensChoices(devices: readonly LensCandidate[], usualId: string | null): LensChoice[] {
  const main = mainCamera(devices, usualId);
  if (!main) return [];
  const backs = backCameras(devices);
  const choices: LensChoice[] = [];
  const add = (deviceId: string, zoom: number, label: string) => choices.push({ id: choiceId(deviceId, zoom), label, deviceId, zoom });

  // The ultra-wide: by zooming the main camera right out, or (failing that) a separate ultra-wide camera
  const wideCamera = backs.find((device) => device.id !== main.id && device.type === 'ultra-wide-angle');
  if (reachesWide(main)) add(main.id, main.minZoom, zoomLabel(main.minZoom));
  else if (wideCamera) add(wideCamera.id, 1, 'Ultra-wide');

  // The main lens, and zoomed in (the phone swaps to its zoom lens by itself when it has one and it helps)
  add(main.id, 1, '1x');
  if (main.maxZoom >= ZOOM_IN) add(main.id, ZOOM_IN, zoomLabel(ZOOM_IN));

  // A separate zoom (telephoto) camera, on a phone that lists one
  const teleCamera = backs.find((device) => device.id !== main.id && device.type === 'telephoto');
  if (teleCamera) add(teleCamera.id, 1, 'Tele');

  return choices.length >= 2 ? choices : [];
}

// The camera with this id if the phone still has it, otherwise nothing
// (It gives back the same kind of object it was given, so the camera library's own devices come back as themselves.)
export function findCamera<T extends LensCandidate>(devices: readonly T[], id: string | null): T | null {
  if (!id) return null;
  return devices.find((device) => device.id === id) ?? null;
}
