/* =====================================================================
   FINISHING THE WEBSITE FOR GITHUB PAGES
   "npm run build" first runs "expo export -p web", which makes the
   finished website in the "dist" folder. Then this little script adds
   a few things:
   - the "install as an app" tags in index.html: a link to manifest.json (in
     the "public" folder, which says the site opens as a standalone app,
     with no address bar) and the matching tags iPhones read. Without
     these, "Add to Home Screen" would just make a bookmark.
   - the service worker: "public/sw.js" (copied into dist by the build) is stamped with
     the build's time so each version of the site saves its own files, and index.html
     gets a few lines that start it. It lets the site, and the card scanner, open with
     no internet (see public/sw.js).
   - the content rule ("Content-Security-Policy"): one tag at the top of index.html that tells
     the browser exactly what this page may load and who it may talk to. If a stranger's
     script ever got onto the page, the browser would refuse to run it, or to let it send
     anything away. The list is written out below (see RULE); anything not on it is blocked.
   - 404.html: a copy of index.html. GitHub Pages shows 404.html for any
     address it has no file for (like /binders/abc), and since
     it's the app itself, the app opens and shows the right page instead
     of "page not found".
   - .nojekyll: an empty file that tells GitHub Pages not to run Jekyll
     (a tool that hides files whose names start with "_", and Expo makes
     some of those).
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Where the finished website is
const dist = path.join(__dirname, '..', 'dist');

// Add the "install as an app" tags to index.html, just before </head>
// (the addresses start with "/" because the site lives at the top of its own address)
const indexPath = path.join(dist, 'index.html');
// The few lines that start the service worker once the page has loaded (so it never slows the first draw).
// They are written into the page itself, so the content rule below has to name them exactly (see scriptMark).
const startWorker = 'if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(function(){})})}';
const appTags = [
  '<link rel="manifest" href="/manifest.json">',
  '<link rel="apple-touch-icon" href="/icon-192.png">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="WUBRG\'r">',
  `<script>${startWorker}</script>`,
].join('\n');

/* ---------- THE CONTENT RULE ---------- */

// A script written into the page (not loaded from a file) is only allowed to run if the rule holds its
// "fingerprint": a code worked out from its exact text. Change one character and it no longer matches.
const scriptMark = (text) => `'sha256-${crypto.createHash('sha256').update(text).digest('base64')}'`;

// The WUBRG'r server's address (just "https://host", no path): the one the site was built to talk to
const serverUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4100';
const server = new URL(serverUrl).origin;

// What the page may do, one line per kind of thing. 'self' means "files from this website itself".
function buildRule(inlineScripts) {
  const RULE = {
    // Anything not named below: only from this website
    'default-src': ["'self'"],
    // Programs: this website's own files; the scripts written into the page (by fingerprint); Google's sign-in
    // script (for the Google Drive backup); and 'wasm-unsafe-eval', which lets the scanner's helper programs
    // (the text reader, the card catalogue, the AI model) run. They are "WebAssembly" files from this website.
    'script-src': ["'self'", ...inlineScripts.map(scriptMark), "'wasm-unsafe-eval'", 'https://accounts.google.com/gsi/client'],
    // Styles: the app writes its styles into the page as it runs, so written-in styles must be allowed
    'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
    // Pictures: this website, pictures made inside the page (data: and blob:), Scryfall's card pictures and
    // symbols, and the server-status badge in Settings
    'img-src': ["'self'", 'data:', 'blob:', 'https://cards.scryfall.io', 'https://svgs.scryfall.io', 'https://backs.scryfall.io', 'https://badge.uptimerobot.com'],
    'font-src': ["'self'", 'data:'],
    // Who the page may send requests to: this website, the WUBRG'r server, Scryfall (cards, and card pictures the
    // scanner compares), and Google (the Drive backup and its sign-in)
    'connect-src': ["'self'", server, 'https://api.scryfall.com', 'https://cards.scryfall.io', 'https://svgs.scryfall.io', 'https://www.googleapis.com', 'https://accounts.google.com/gsi/'],
    // Background helpers (the scanner's): from this website, or made inside the page (blob:)
    'worker-src': ["'self'", 'blob:'],
    // The camera preview and anything played from inside the page
    'media-src': ["'self'", 'blob:'],
    // Another site's page shown inside this one: only Google's sign-in
    'frame-src': ['https://accounts.google.com/gsi/'],
    'manifest-src': ["'self'"],
    // No plugins at all; links in the page can't be re-pointed; forms can only post back to this website
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(RULE).map(([kind, allowed]) => `${kind} ${allowed.join(' ')}`).join('; ');
}

// The page's own pinch-to-zoom is switched off too (the app has its own zoom
// in the Grid view; see src/lib/noPageZoom.ts), by changing the viewport tag
const html = fs.readFileSync(indexPath, 'utf8')
  .replace(/<meta name="viewport" content="[^"]*"\s*\/?>/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no" />');
if (!html.includes('</head>')) throw new Error('index.html has no </head> to add the app tags to');
const withTags = html.replace('</head>', `${appTags}\n</head>`);

// Every script written into the finished page (Expo may add its own, besides the one above): each gets its
// fingerprint in the rule. Scripts loaded from a file (<script src=...>) are covered by 'self'.
const inlineScripts = [...withTags.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((found) => found[1]).filter((text) => text.trim() !== '');
// The rule goes first in <head>, so it is in force before anything else on the page is read
if (!withTags.includes('<head>')) throw new Error('index.html has no <head> to add the content rule to');
const ruleTag = `<meta http-equiv="Content-Security-Policy" content="${buildRule(inlineScripts)}">`;
fs.writeFileSync(indexPath, withTags.replace('<head>', `<head>\n${ruleTag}`));

// Stamp the service worker with this build's time (so every build has its own saved set)
const workerPath = path.join(dist, 'sw.js');
if (fs.existsSync(workerPath)) {
  fs.writeFileSync(workerPath, fs.readFileSync(workerPath, 'utf8').replace("const BUILD = '__BUILD__'", `const BUILD = '${Date.now()}'`));
}

// Copy index.html to 404.html, and make the empty .nojekyll file
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

console.log(`Added the content rule (server: ${server}, ${inlineScripts.length} written-in script(s)), the app tags, 404.html and .nojekyll to dist`);
