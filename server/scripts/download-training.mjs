/* =====================================================================
   DOWNLOAD THE SCANNER TRAINING PHOTOS INTO A FOLDER
   Copies every photo the scanner's trainers sent (see routes/training.js) out
   of MongoDB into a folder on this computer, ready to be given to Claude:
     <folder>/photos/<scan id>.jpg                         the pictures
     <folder>/labels.json                                  one entry per picture: what the scanner said,
                                                           what the right card was, what it read, timings
   Photos already in the folder are skipped, so it can be run again and again to
   fetch only the new ones (labels.json is rewritten each time).
   It only ever prints counts and file names, never the connection address.

   To run it (from the server folder), the "--yes" is required so it never runs by accident:
     node scripts/download-training.mjs --yes
   Optional: "--to <folder>" (the default is scripts/catalogue/training in the project, which is never
   committed); "--test" uses the test database instead of the real one.
   ===================================================================== */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { COLLECTIONS } from '../models/collectionNames.js';

// Read the choices typed after the command
const args = process.argv.slice(2);
const useTestDb = args.includes('--test');
const toAt = args.indexOf('--to');
const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.resolve(toAt >= 0 && args[toAt + 1] ? args[toAt + 1] : path.join(here, '..', '..', 'scripts', 'catalogue', 'training'));

// A short message and a stop (the message never contains a secret)
function stop(message) {
  console.error(message);
  process.exit(1);
}

if (!args.includes('--yes')) stop('Nothing done. This reads the database and writes files here; run it again with --yes to go ahead.');

// Connect. The address comes from .env (MONGODB_URI, or MONGODB_TEST_URI for --test) and is never printed.
const uri = useTestDb ? process.env.MONGODB_TEST_URI || process.env.MONGODB_URI : process.env.MONGODB_URI;
if (!uri) stop('No database address is set in .env');
const dbName = useTestDb ? process.env.TEST_DB_NAME || 'wubgr-test' : undefined;
await mongoose.connect(uri, dbName ? { dbName } : {});
console.log(`Connected to the database "${mongoose.connection.name}"`);

const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: COLLECTIONS.trainingBucket });
const files = await bucket.find({}).sort({ uploadDate: 1 }).toArray();
fs.mkdirSync(path.join(folder, 'photos'), { recursive: true });

// A name that is safe to use as part of a file name
const safe = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'unknown';

const labels = [];
let fetched = 0;
for (const file of files) {
  const meta = file.metadata ?? {};
  // Named by the scan only (what it was is in labels.json), so a scan sent again replaces its own picture
  const name = `${safe(meta.scanId)}.jpg`;
  const target = path.join(folder, 'photos', name);
  // A scan sent again (changed since) has a newer photo record: always take the newest copy
  const newer = !fs.existsSync(target) || fs.statSync(target).mtimeMs < new Date(file.uploadDate).getTime();
  if (newer) {
    await new Promise((resolve, reject) => {
      bucket.openDownloadStream(file._id).pipe(fs.createWriteStream(target)).on('error', reject).on('finish', resolve);
    });
    fetched += 1;
  }
  const { owner, ...rest } = meta;
  labels.push({ file: `photos/${name}`, ...rest });
}
fs.writeFileSync(path.join(folder, 'labels.json'), JSON.stringify(labels, null, 2));

console.log(`${files.length} photos in the database, ${fetched} fetched now, saved in ${folder}`);
await mongoose.disconnect();
