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
   Run it with:  node serve.mjs [folder]     (the folder defaults to ./out)
   ===================================================================== */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? join(here, 'out'));
const PORT = 4200;

const types = { '.json': 'application/json', '.gz': 'application/octet-stream', '.db': 'application/octet-stream' };

createServer((request, response) => {
  const name = normalize(decodeURIComponent((request.url ?? '/').split('?')[0])).replace(/^([/\\])+/, '');
  const file = join(root, name);
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.statusCode = 404;
    response.end('Not found');
    return;
  }
  const extension = file.slice(file.lastIndexOf('.'));
  response.setHeader('Content-Type', types[extension] ?? 'application/octet-stream');
  response.setHeader('Content-Length', statSync(file).size);
  createReadStream(file).pipe(response);
}).listen(PORT, () => console.log(`Serving ${root} at http://localhost:${PORT}`));
