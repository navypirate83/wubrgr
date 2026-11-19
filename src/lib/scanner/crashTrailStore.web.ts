/* =====================================================================
   WHERE THE CRASH TRAIL IS KEPT: THE WEBSITE
   Each piece of the diary is one entry in the browser's local storage, which is saved on
   the spot. Some browsers (a private window, blocked site data) don't allow it, so every
   use is wrapped to do nothing instead of failing.
   ===================================================================== */

import type { TrailStore } from './crashTrailStore';

// The entry's name in local storage
const keyFor = (name: string) => `wubrgr-scan-crash-${name}`;

export const trailStore: TrailStore = {
  // Read the entry, or null if there isn't one (or storage isn't allowed)
  async get(name) {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(keyFor(name));
    } catch {
      return null;
    }
  },
  // Write the entry at once
  set(name, text) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(keyFor(name), text);
    } catch {
      /* the diary is only a help */
    }
  },
  // Delete the entry
  remove(name) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(keyFor(name));
    } catch {
      /* nothing to remove, or it can't be */
    }
  },
};
