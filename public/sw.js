/* =====================================================================
   THE SERVICE WORKER (the website only)
   A small program the browser keeps running for the site so it can work with no
   internet: the app, the card scanner and its text reader open from what's saved
   on the device. (The scanner's card catalogue is saved separately, in the browser's
   own storage: see src/lib/scanner/catalogue/catalogueDb.web.ts.)
   What it saves, and how:
   - The page itself (index.html) and the app's own scripts: saved when the worker is
     installed, and kept up to date. For a page, it asks the internet first and uses
     the saved copy only when that fails, so a new version of the site always arrives
     as soon as there's a connection.
   - The app's scripts and pictures (their names change with every version, so a
     saved one is never out of date): saved the first time they're used, then used from
     the saved copy.
   - The scanner's text reader, database library and AI runtime (public/tesseract, public/sqljs and public/onnx;
     large, and they change only when someone replaces them): saved the first time
     they're used, then used from the saved copy.
   - The AI background worker's script (public/onnx/ai-worker.js): small, and made from the app's own code, so it is kept
     with the app's files and refreshed like them, not with the big files above.
   - Everything else on this site (icons, the manifest): the saved copy is used and
     refreshed behind the scenes.
   Other websites (Scryfall's card pictures, the server) are never touched here.
   The build's time in the line "const BUILD" below is put in by scripts/finish-web-build.js,
   so each new version of the site gets its own saved set, and old ones are deleted.
   ===================================================================== */

const BUILD = '__BUILD__';
const SHELL = `wubrgr-shell-${BUILD}`;
const BIG_FILES = 'wubrgr-big-files-v1';
// The folder the site lives in ("/wubrgr/" on GitHub Pages), from where this worker is
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  // Save the page and the scripts it names, so the app opens offline after the first visit
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    try {
      const page = await fetch(BASE, { cache: 'reload' });
      const html = await page.clone().text();
      await cache.put(BASE, page);
      const scripts = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
      await Promise.all(scripts.map((url) => cache.add(url).catch(() => { /* saved when used instead */ })));
    } catch { /* offline while installing: it saves things as they're used */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  // Delete the saved sets of older versions of the site
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('wubrgr-shell-') && name !== SHELL) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

// Use the saved copy if there is one; otherwise get it, and save it
async function savedFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// Use the saved copy now, and refresh it behind the scenes
async function savedThenRefresh(request) {
  const cache = await caches.open(SHELL);
  const saved = await cache.match(request);
  const refresh = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; }).catch(() => saved);
  return saved ?? refresh;
}

// A page: the internet first; the saved page when that fails
async function pageOrSaved(request) {
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).pathname === BASE) {
      (await caches.open(SHELL)).put(BASE, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL);
    return (await cache.match(BASE)) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  // The scanner's catalogue is large and is kept in the browser's own storage, so it's never saved here
  if (path.startsWith('catalogue/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(pageOrSaved(request));
  } else if (path === 'onnx/ai-worker.js') {
    // The AI background worker's script (small, and it changes when the scanner code does, unlike the big
    // runtime files beside it): used from the saved copy and refreshed behind the scenes, so each new version
    // of the site brings its own (the build's saved set is replaced every time)
    event.respondWith(savedThenRefresh(request));
  } else if (path.startsWith('tesseract/') || path.startsWith('sqljs/') || path.startsWith('onnx/')) {
    event.respondWith(savedFirst(request, BIG_FILES));
  } else if (path.startsWith('_expo/static/') || path.startsWith('assets/')) {
    event.respondWith(savedFirst(request, SHELL));
  } else {
    event.respondWith(savedThenRefresh(request));
  }
});
