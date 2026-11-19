/* =====================================================================
   THE DEVICE'S COPY OF THE CATALOGUE (what the platforms must provide)
   The real thing is in catalogueDb.native.ts (Android and iPhone: a SQLite
   file opened by our own Android add-on) and catalogueDb.web.ts (the website: sql.js,
   with the file kept in the browser's IndexedDB). The app picks the right
   file by its ending when it's built, so each platform only ever bundles its
   own. THIS file is never used when the app runs: it only gives TypeScript
   the shape both of them have (see CatalogueStore in core/catalogueTypes.ts),
   and refuses if it ever is used by mistake.
   ===================================================================== */

import type { CatalogueStore } from '../core/catalogueTypes';

const wrongPlatform = (): never => {
  throw new Error('The catalogue store for this platform is missing (see catalogueDb.native.ts and catalogueDb.web.ts)');
};

export const catalogueDb: CatalogueStore = {
  open: wrongPlatform,
  install: wrongPlatform,
  all: wrongPlatform,
  close: wrongPlatform,
  remove: wrongPlatform,
};
