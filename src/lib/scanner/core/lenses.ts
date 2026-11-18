/* =====================================================================
   THE CAMERA'S LENSES (shared, plain TypeScript, no React)
   Many phones have more than one lens on the back: an ultra-wide, the
   main one, and sometimes a zoom (telephoto). The scanner lets the person
   pick which lens to look through, right on the camera picture. This file
   works out WHICH lenses to offer, from the list of cameras the phone reports.
   A card is read best from the main lens, but the ultra-wide lets you hold
   the phone close to a card and still fit it in, and the zoom lens lets you
   scan from further away, so it's useful to be able to try them.
   ===================================================================== */

// The parts of a camera we need to know about (the camera library's devices have all of these)
export type LensCandidate = {
  id: string;
  type: string;                       // 'wide-angle', 'ultra-wide-angle', 'telephoto', 'dual', ...
  position: string;                   // 'back', 'front', ...
  isVirtualDevice: boolean;           // true for a camera that is really several lenses blended together
  physicalDevices: LensCandidate[];   // the single lenses a blended camera is made of
};

// What is shown for one lens: the button's words and the camera's id
export type LensChoice = { id: string; label: string; type: string };

// The single lenses we offer, in the order they're shown (widest first), with the words on their buttons
const OFFERED: { type: string; label: string }[] = [
  { type: 'ultra-wide-angle', label: 'Ultra-wide' },
  { type: 'wide-angle', label: 'Main' },
  { type: 'telephoto', label: 'Zoom' },
];

// The lenses on the back of the phone that can be chosen between: one per kind of lens. Looks at the cameras the
// phone lists, and inside any blended camera too. Gives back nothing when there is no real choice (fewer than two).
export function lensChoices(devices: readonly LensCandidate[]): LensChoice[] {
  // Every camera on the back, with the single lenses inside the blended ones
  const all: LensCandidate[] = [];
  for (const device of devices) {
    if (device.position !== 'back') continue;
    all.push(device);
    for (const inner of device.physicalDevices) all.push(inner);
  }
  const choices: LensChoice[] = [];
  for (const kind of OFFERED) {
    // The first single (not blended) lens of this kind; a lens already offered isn't offered twice
    const found = all.find((device) => !device.isVirtualDevice && device.type === kind.type);
    if (found) choices.push({ id: found.id, label: kind.label, type: kind.type });
  }
  return choices.length >= 2 ? choices : [];
}

// The lens to use: the one with this id if the phone still has it, otherwise nothing (the camera's own default is used)
// (It gives back the same kind of object it was given, so the camera library's own devices come back as themselves.)
export function findLens<T extends LensCandidate>(devices: readonly T[], id: string | null): T | null {
  if (!id) return null;
  for (const device of devices) {
    if (device.id === id) return device;
    const inner = device.physicalDevices.find((d) => d.id === id);
    if (inner) return inner as T;
  }
  return null;
}
