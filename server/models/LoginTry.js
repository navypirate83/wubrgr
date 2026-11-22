/* =====================================================================
   THE LOGIN TRY MODEL: WRONG PASSWORDS FOR A NAME THAT HAS NO ACCOUNT
   A real account counts its own wrong passwords (see models/User.js): five
   in a row pause it for 30 minutes, ten make it need a password reset.
   If only real accounts did that, the pause itself would give away which
   usernames and emails have accounts: type five wrong passwords and see
   whether the answer changes. So a name with NO account is counted in
   exactly the same way, here, and gets exactly the same answers.
   Only a fingerprint of the typed name is kept, never the name itself.
   Rows delete themselves 30 days after the last try.
   ===================================================================== */

import mongoose from 'mongoose';
import { COLLECTIONS } from './collectionNames.js';

const loginTrySchema = new mongoose.Schema(
  {
    // The fingerprint (SHA-256) of the name that was typed, in lowercase
    key: { type: String, required: true, unique: true, maxlength: 128 },
    // The same three things an account keeps: wrong tries in a row, until when it is paused,
    // and whether it has reached "reset your password"
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    // (No longer used: the "reset needed" step was taken out. Kept so old rows still read.)
    mustResetPassword: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// A "self-destruct date": MongoDB deletes each row once its expiresAt passes
loginTrySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('LoginTry', loginTrySchema, COLLECTIONS.loginTry);
