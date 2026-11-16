/* =====================================================================
   THE PRISM SET MODEL
   One document per PRISM set: a group of Commander decks that share
   physical cards, with what is painted on the sleeves (see the app's
   src/lib/prismStorage.ts). A set belongs to one person and is only ever
   read or changed by its owner.
   The app makes each set's id ("clientId") on the device; it is what the
   app and the server use to tell sets apart, so a set made on one phone
   is the same set on every other device. The deck ids inside a set are the
   SERVER's deck ids (the app converts from and to each device's own), so
   they mean the same thing everywhere; a deck that is gone is kept as
   "local:<id>" text, which matches nothing.
   "editedAt" is when the set was last changed on a device (milliseconds),
   which is how the app tells which copy of a set is newer.
   ===================================================================== */

import mongoose from 'mongoose';
import { COLLECTIONS } from './collectionNames.js';

const prismSetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    // Which corner of the sleeve is slot 1: 0 top left, 1 top right, 2 bottom right, 3 bottom left
    corner: { type: Number, min: 0, max: 3, default: 0 },
    // The decks in the set and the slot (1 to 48) of each
    decks: {
      type: [{ _id: false, deckId: { type: String, required: true, maxlength: 80 }, slot: { type: Number, required: true, min: 1, max: 48 } }],
      default: [],
    },
    // Cards a deck keeps to itself: by name, or one printing ("set/number")
    pins: {
      type: [{ _id: false, deckId: { type: String, required: true, maxlength: 80 }, key: { type: String, required: true, maxlength: 200 }, print: { type: String, maxlength: 60 } }],
      default: [],
    },
    // What is painted: for each card (lowercase name), a list per physical copy of the deck ids painted on it
    painted: { type: mongoose.Schema.Types.Mixed, default: {} },
    // The names as shown, by lowercase name
    names: { type: mongoose.Schema.Types.Mixed, default: {} },
    editedAt: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, minimize: false },
);

// One set per id per person
prismSetSchema.index({ owner: 1, clientId: 1 }, { unique: true });

export default mongoose.model('PrismSet', prismSetSchema, COLLECTIONS.prismSet);
