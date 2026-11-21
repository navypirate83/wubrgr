/* =====================================================================
   THE USER MODEL
   One document per account. A person can sign in with a password, with
   Google, or both. The password is never saved as typed: it is
   scrambled ("hashed") with bcrypt first, and it is left out of every
   query unless asked for by name.
   ===================================================================== */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { COLLECTIONS } from './collectionNames.js';
import { ALLOWED_ROLES } from '../utils/roles.js';

// What a chosen username may look like: 3 to 30 letters, numbers, dots,
// underscores and dashes. No "@", so nobody can register someone else's
// email address as a username.
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

const userSchema = new mongoose.Schema(
  {
    // The email: saved lowercase and trimmed, and no two accounts share one
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, trim: true, maxlength: 100 },
    // The special rights this account holds: any of "prism" (may see the PRISM
    // section), "aiscan" (may download the AI scanner files) and "admin" (may manage
    // accounts, and counts as having every right). A normal account has none (an
    // empty list). Only an admin can change this, through the admin route; signing
    // up never sets it. The list can't hold repeats or unknown names.
    roles: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.every((item) => ALLOWED_ROLES.includes(item)) && new Set(list).size === list.length,
        message: 'Rights must be prism, aiscan or admin, each at most once',
      },
    },
    // Google's own stable id for the person (only for Google sign-ins).
    // Its unique rule is "sparse": accounts without one don't clash.
    googleId: { type: String, maxlength: 255 },
    // Shown/used for login. If none is chosen it becomes the email.
    username: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      validate: {
        // A chosen username must match the pattern; the defaulted one (the
        // email itself) is also fine. When a person is made by an "upsert"
        // (Google sign-up), there is no document yet, so "this" is the
        // update itself, and the email is read from what is being inserted.
        validator(value) {
          const email = this?.email ?? this?.getUpdate?.()?.$setOnInsert?.email;
          return (typeof email === 'string' && String(value).toLowerCase() === email.toLowerCase())
            || USERNAME_PATTERN.test(value);
        },
        message: 'Username must be 3 to 30 letters, numbers, dots, underscores or dashes',
      },
    },
    // The scrambled password. "select: false" keeps it out of every query
    // unless asked for with .select('+password'). Google-only accounts have none.
    // The length rule here is only a last safety net for a NEW password (the full
    // rules are in utils/password.js). It never touches a password that already
    // exists: a saved one is its 60-character scramble, and it is only checked
    // again when it is changed.
    password: {
      type: String,
      minlength: [12, 'Password must be at least 12 characters long'],
      maxlength: 72,
      select: false,
      required: [function () { return !this.googleId; }, 'Password is required'],
    },
    // The person's app settings (theme, hidden formats, page layouts), kept
    // here so they follow the person to every phone and computer. It stays
    // empty until the first time the app saves them. The routes in
    // routes/settings.js check every value before it is saved.
    settings: {
      theme: { type: String, enum: ['system', 'light', 'dark'] },
      hiddenFormats: { type: [String], default: undefined },
      // Which store's prices the binders show
      priceStore: { type: String, enum: ['tcgplayer', 'cardkingdom', 'cardmarket'] },
      // How an opened binder is shown on a narrow and on a wide window, and
      // how its list and grid are sorted
      phoneView: { type: String, enum: ['list', 'grid', 'binder'] },
      wideView: { type: String, enum: ['list', 'grid', 'binder'] },
      // The same for an opened card list (no Binder view)
      phoneListView: { type: String, enum: ['list', 'grid'] },
      wideListView: { type: String, enum: ['list', 'grid'] },
      binderSort: { type: String, enum: ['name', 'added', 'price', 'color', 'set', 'type', 'rarity', 'value'] },
      // Whether the sort is the other way round (cheapest first, oldest first...)
      binderSortReversed: { type: Boolean },
      // Card lists, decks and PRISM's Cards tab each have their own sort
      listSort: { type: String, enum: ['name', 'added', 'price', 'color', 'set', 'type', 'rarity', 'value'] },
      listSortReversed: { type: Boolean },
      deckSort: { type: String, enum: ['name', 'added', 'price', 'color', 'set', 'type', 'rarity', 'value'] },
      deckSortReversed: { type: Boolean },
      prismSort: { type: String, enum: ['shared', 'decks', 'name', 'added', 'color', 'set', 'type', 'rarity', 'value'] },
      prismSortReversed: { type: Boolean },
      // How the Binders, Lists, Decks and PRISM pages sort their own items: a
      // sort's name, with ":r" after it when reversed (checked in routes/settings.js)
      shelfBinders: { type: String, maxlength: 20 },
      shelfLists: { type: String, maxlength: 20 },
      shelfDecks: { type: String, maxlength: 20 },
      shelfPrisms: { type: String, maxlength: 20 },
      // Whether header bars show between groups in the list and grid
      sortHeaders: { type: Boolean },
      // The layout the account's cards are stored in (see routes/settings.js)
      pageLayout: {
        across: { type: Number, min: 1, max: 6 },
        down: { type: Number, min: 1, max: 6 },
      },
      // The layouts shown on a phone (narrow window) and a wide screen
      phoneLayout: {
        across: { type: Number, min: 1, max: 6 },
        down: { type: Number, min: 1, max: 6 },
      },
      wideLayout: {
        across: { type: Number, min: 1, max: 6 },
        down: { type: Number, min: 1, max: 6 },
      },
    },
    // When the settings were last saved
    settingsSavedAt: { type: Date },
    // When the account was last used: set every time the person signs in or the
    // app renews their login (about every 15 minutes while the app is open).
    // Accounts that haven't been used since this was added have none yet.
    lastAccessAt: { type: Date },
  },
  { timestamps: true },
);

// No two accounts share a Google id, but accounts without one are fine
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

// Before checking the rules: no username chosen means "use my email"
userSchema.pre('validate', function () {
  if (!this.username) this.username = this.email;
});

// Just before saving: scramble the password, but only if it was just
// changed (otherwise an already-scrambled password would be scrambled
// again and the person could never sign in)
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// A second safety net: the password never appears when a user is turned into JSON
userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.password;
    return ret;
  },
});

export default mongoose.model('User', userSchema, COLLECTIONS.user);
