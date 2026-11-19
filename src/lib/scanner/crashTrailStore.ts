/* =====================================================================
   WHERE THE CRASH TRAIL IS KEPT (what the platforms must provide)
   The real thing is in crashTrailStore.native.ts (the phone: a small file, written at
   once) and crashTrailStore.web.ts (the website: the browser's local storage). The app
   picks the right file by its ending when it's built. THIS file is never used when the
   app runs: it only gives TypeScript the shape both of them have, and does nothing if
   it ever is used by mistake.
   Nothing here may ever throw: the diary is a help, never a risk.
   ===================================================================== */

export type TrailStore = {
  // The text kept under this name (null if nothing, or it can't be read)
  get(name: string): Promise<string | null>;
  // The same as get, but answers on the spot (no waiting). Only some stores can; used at the very start of the app.
  getSync?(name: string): string | null;
  // Keep this text under this name, right away (the app may close a moment later). Never throws.
  set(name: string, text: string): void;
  // Forget what is kept under this name. Never throws.
  remove(name: string): void;
};

export const trailStore: TrailStore = {
  get: async () => null,
  set: () => {},
  remove: () => {},
};
