/* =====================================================================
   SCANNER TRAINING PHOTOS (/training/...)
   The website scanner sends the photos it was NOT sure about, and the ones
   the person corrected or marked "wrong", here, so they can be used later to
   make the scanner better. Only accounts with the "trainer" right (and admins,
   who have every right) may use this: app.js mounts it behind requireAuth AND
   requireTrainer.
   Each photo is kept in MongoDB (GridFS, like the AI files) with a small
   record of what the scanner said, what the right card turned out to be and
   why the photo was kept:
     unsure   the scanner wasn't sure which printing it was (it asked, or made a guess)
     unread   nothing could be read from the card
     changed  the person changed the printing or the language of the card
     wrong    the person ticked "wrong" on the card in the list
   (Marking a card as foil is not a change: a photo can't show that.)
   - POST   /training            send one photo (a JPEG as text) and its record. A scan is sent again
                                 when something about it changes; the newest copy replaces the older.
   - DELETE /training/scan/:id   take a scan's photo back out (the "wrong" tick was removed, say)
   - GET    /training            the person's own photos' records (no pictures)
   - GET    /training/:id/photo  one of the person's own photos
   Nobody can see anybody else's photos here (even an admin): everything is looked up by owner.
   To get all the photos into a folder, see scripts/download-training.mjs.
   ===================================================================== */

import { Router } from 'express';
import mongoose from 'mongoose';
import { COLLECTIONS } from '../models/collectionNames.js';
import { handleDbError } from '../middleware/errorHandler.js';

const router = Router();

export const REASONS = ['unsure', 'unread', 'changed', 'wrong'];
// A photo is at most 2 MB once decoded (the scanner sends about 150 to 300 KB)
const MOST_BYTES = 2 * 1024 * 1024;
// Each person's most saved photos (a safety limit on the space they can use)
const MOST_PHOTOS = 5000;

// Open the shelf the photos are kept on (null if the database isn't connected)
function openBucket() {
  const db = mongoose.connection.db;
  return db ? new mongoose.mongo.GridFSBucket(db, { bucketName: COLLECTIONS.trainingBucket }) : null;
}

// A piece of text from the scanner, cut to a safe length ('' when it isn't text)
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
// A number from the scanner (null when it isn't a normal number)
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// What the scanner said, or what the card turned out to be: only the known small pieces, as text
function cleanPrinting(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    printingId: text(value.printingId, 64),
    name: text(value.name, 200),
    set: text(value.set, 12),
    number: text(value.number, 16),
    lang: text(value.lang, 8),
    finish: text(value.finish, 8),
  };
}

// The words the scanner read from the card
function cleanReading(value) {
  const reading = value && typeof value === 'object' ? value : {};
  return { nameText: text(reading.nameText, 300), infoText: text(reading.infoText, 300), bottomText: text(reading.bottomText, 300) };
}

// How long each step took (a small table of numbers)
function cleanTimings(value) {
  const out = {};
  if (value && typeof value === 'object') {
    for (const [key, ms] of Object.entries(value).slice(0, 20)) {
      if (number(ms) !== null) out[text(key, 30)] = ms;
    }
  }
  return out;
}

// Where the card was in the photo, as shares of the photo's width and height (0 to 1)
function cleanCard(value) {
  if (!value || typeof value !== 'object') return null;
  const box = { x: number(value.x), y: number(value.y), w: number(value.w), h: number(value.h) };
  return Object.values(box).every((part) => part !== null) ? box : null;
}

// Keep one scan's photo and record. The newest copy of the same scan replaces the older one.
router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const scanId = text(body.scanId, 80);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(scanId)) return res.status(400).json({ error: 'A scan id is needed' });
  if (!REASONS.includes(body.reason)) return res.status(400).json({ error: `The reason must be one of: ${REASONS.join(', ')}` });
  if (typeof body.photo !== 'string' || body.photo === '') return res.status(400).json({ error: 'A photo is needed' });
  const photo = Buffer.from(body.photo, 'base64');
  // A real JPEG starts with these three bytes; this also stops anything else being stored as a "photo"
  if (photo.length < 100 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) return res.status(400).json({ error: 'The photo must be a JPEG' });
  if (photo.length > MOST_BYTES) return res.status(413).json({ error: 'That photo is too big' });
  const bucket = openBucket();
  if (!bucket) return res.status(503).json({ error: 'The database is not ready' });

  const owner = String(req.user.sub);
  try {
    const older = await bucket.find({ 'metadata.owner': owner, 'metadata.scanId': scanId }).toArray();
    // A new scan (not a replacement) must fit under the person's limit
    if (older.length === 0 && (await bucket.find({ 'metadata.owner': owner }).limit(MOST_PHOTOS).toArray()).length >= MOST_PHOTOS) {
      return res.status(409).json({ error: 'Too many training photos are saved' });
    }
    const metadata = {
      owner,
      scanId,
      reason: body.reason,
      said: cleanPrinting(body.said),
      final: cleanPrinting(body.final),
      reading: cleanReading(body.reading),
      status: text(body.status, 12),
      card: cleanCard(body.card),
      width: number(body.width),
      height: number(body.height),
      takenAt: number(body.takenAt),
      timings: cleanTimings(body.timings),
      savedAt: new Date(),
    };
    // The new copy goes in first and the older ones are deleted after, so there is never a moment with no photo
    const id = await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(`${owner}/${scanId}.jpg`, { metadata, contentType: 'image/jpeg' });
      upload.on('error', reject).on('finish', () => resolve(upload.id));
      upload.end(photo);
    });
    for (const old of older) await bucket.delete(old._id);
    return res.status(201).json({ id: String(id) });
  } catch (err) {
    return handleDbError(err, res);
  }
});

// Take one scan's photo back out
router.delete('/scan/:scanId', async (req, res) => {
  const bucket = openBucket();
  if (!bucket) return res.status(503).json({ error: 'The database is not ready' });
  try {
    const found = await bucket.find({ 'metadata.owner': String(req.user.sub), 'metadata.scanId': text(req.params.scanId, 80) }).toArray();
    for (const file of found) await bucket.delete(file._id);
    return res.status(204).end();
  } catch (err) {
    return handleDbError(err, res);
  }
});

// The records of the person's own photos (not the pictures)
router.get('/', async (req, res) => {
  const bucket = openBucket();
  if (!bucket) return res.status(503).json({ error: 'The database is not ready' });
  try {
    const found = await bucket.find({ 'metadata.owner': String(req.user.sub) }).sort({ uploadDate: -1 }).limit(MOST_PHOTOS).toArray();
    return res.json(found.map((file) => ({ id: String(file._id), bytes: file.length, ...file.metadata, owner: undefined })));
  } catch (err) {
    return handleDbError(err, res);
  }
});

// One of the person's own photos
router.get('/:id/photo', async (req, res) => {
  const bucket = openBucket();
  if (!bucket) return res.status(503).json({ error: 'The database is not ready' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Photo not found' });
  try {
    const found = await bucket.find({ _id: new mongoose.Types.ObjectId(req.params.id), 'metadata.owner': String(req.user.sub) }).limit(1).toArray();
    if (found.length === 0) return res.status(404).json({ error: 'Photo not found' });
    res.set({ 'Content-Type': 'image/jpeg', 'Content-Length': String(found[0].length), 'Cache-Control': 'private, no-store' });
    const stream = bucket.openDownloadStream(found[0]._id);
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  } catch (err) {
    return handleDbError(err, res);
  }
});

export default router;
