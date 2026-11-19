/* =====================================================================
   SERVE THE CATALOGUE ON YOUR OWN COMPUTER (for trying it out)
   After build-catalogue.mjs has made out/catalogue.db.gz and
   out/catalogue.json, this shares that folder at http://localhost:4200 so the
   app can download the catalogue from it. Run the app with
       EXPO_PUBLIC_CATALOGUE_URL=http://localhost:4200
   (from a phone on the same Wi-Fi, use your computer's address instead of
   "localhost"). Websites may only fetch from another address if it allows it,
   so this sends the "allow anyone" header: fine for trying things, and the
   reason this isn't how the real catalogue would be shared.
   It also shares the AI files for the scanner's "AI art matching" option: anything
   asked for under /ai/ (like /ai/model.onnx) comes from the ./out-ai folder that
   build-ai-files.mjs makes, so the app can download them from
   http://localhost:4200/ai/ too.
   Run it with:  node serve.mjs [folder]     (the folder defaults to ./out)
   ===================================================================== */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? join(here, 'out'));
// The AI files folder (see build-ai-files.mjs), shared under /ai/
const aiRoot = resolve(join(here, 'out-ai'));
const PORT = 4200;

// What kind of file each ending is (anything else is sent as plain bytes)
const types = { '.json': 'application/json', '.gz': 'application/octet-stream', '.db': 'application/octet-stream', '.txt': 'text/plain', '.onnx': 'application/octet-stream', '.bin': 'application/octet-stream' };

createServer((request, response) => {
  const name = normalize(decodeURIComponent((request.url ?? '/').split('?')[0])).replace(/^([/\\])+/, '');
  // Anything under ai/ comes from the AI folder, everything else from the catalogue folder
  const inAi = /^ai[/\\]/.test(name);
  const base = inAi ? aiRoot : root;
  const file = join(base, inAi ? name.slice(3) : name);
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
    response.statusCode = 404;
    response.end('Not found');
    return;
  }
  const extension = file.slice(file.lastIndexOf('.'));
  response.setHeader('Content-Type', types[extension] ?? 'application/octet-stream');
  response.setHeader('Content-Length', statSync(file).size);
  createReadStream(file).pipe(response);
}).listen(PORT, () => console.log(`Serving ${root} at http://localhost:${PORT}`));
