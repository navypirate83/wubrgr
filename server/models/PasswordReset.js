/* =====================================================================
   THE PASSWORD RESET MODEL
   When someone taps "Forgot username/password", we email a 10-character
   code (see utils/resetCode.js). Here we keep only each code's fingerprint
   (never the code itself) and when it stops working (90 minutes). A person
   can have up to 5 working codes at once: asking again does NOT cancel the
   earlier ones, so nobody else can cancel a person's code by asking for
   another. The row deletes itself when its newest code has expired.
   (codeHash and attempts are from the older 6-digit design and are no
   longer used.)
   ===================================================================== */

import mongoose from 'mongoose';
import { COLLECTIONS } from './collectionNames.js';

const passwordResetSchema = new mongoose.Schema(
  {
    // One waiting reset per person
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // The codes that were emailed and may still work: each one's fingerprint and when it stops working
    codes: {
      type: [{ _id: false, hash: { type: String, required: true, maxlength: 128 }, expiresAt: { type: Date, required: true } }],
      default: [],
    },
    codeHash: { type: String, maxlength: 128 },
    // Guesses made so far (the code allows 5, then it is thrown away). Every guess is counted before it is
    // checked; a right code with an unusable new password is handed back (see /auth/reset).
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// A "self-destruct date": MongoDB deletes each row once its expiresAt passes
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PasswordReset', passwordResetSchema, COLLECTIONS.passwordReset);
