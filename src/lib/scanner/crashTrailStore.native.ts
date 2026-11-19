/* =====================================================================
   WHERE THE CRASH TRAIL IS KEPT: ANDROID (and iPhone)
   Each piece of the diary is a tiny text file in the app's own files folder. Writing
   a file with expo-file-system is done on the spot (the app waits for it), which is
   what we want: if the app closes a moment later, the line is already saved.
   Nothing here may ever throw: a diary that can't be saved just isn't saved.
   ===================================================================== */

import { File, Paths } from 'expo-file-system';
import type { TrailStore } from './crashTrailStore';

// The file for a name (a plain word like "trail"), kept with the app's other files
const fileFor = (name: string) => new File(Paths.document, `scan-crash-${name}.txt`);

export const trailStore: TrailStore = {
  // Read the file's text, or null if there isn't one
  async get(name) {
    try {
      const file = fileFor(name);
      return file.exists ? await file.text() : null;
    } catch {
      return null;
    }
  },
  // Read the file's text right now, or null (the file API has a version that doesn't make the caller wait)
  getSync(name) {
    try {
      const file = fileFor(name);
      return file.exists ? file.textSync() : null;
    } catch {
      return null;
    }
  },
  // Write the text at once (making the file first if it isn't there yet)
  set(name, text) {
    try {
      const file = fileFor(name);
      if (!file.exists) file.create();
      file.write(text);
    } catch {
      /* the diary is only a help */
    }
  },
  // Delete the file if there is one
  remove(name) {
    try {
      const file = fileFor(name);
      if (file.exists) file.delete();
    } catch {
      /* nothing to remove, or it can't be */
    }
  },
};
