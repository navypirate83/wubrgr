/* =====================================================================
   THE STEPS OF THE "SINGLE ROLE -> LIST OF RIGHTS" MOVE
   Each function takes the open database (`db`) and returns how many
   documents it changed. They use the raw collections on purpose: the new
   User model no longer knows the old "role" field, so going through the
   model would hide it. scripts/migrate-roles.mjs runs these by hand.
   ===================================================================== */

import { COLLECTIONS } from '../models/collectionNames.js';

// What each old single role becomes as a list of rights
// ("user" and anything missing or unknown become an empty list)
const OLD_TO_NEW = { admin: ['admin'], prism: ['prism'], aiscan: ['aiscan'] };

// Step 1: give every account that has no "roles" list one, made from its
// old "role". Accounts that already have a list are left alone, so
// running it twice changes nothing the second time.
export async function addRoles(db) {
  const accounts = db.collection(COLLECTIONS.user);
  let changed = 0;
  // Only accounts with no "roles" at all are looked at
  for await (const account of accounts.find({ roles: { $exists: false } }, { projection: { role: 1 } })) {
    const roles = OLD_TO_NEW[account.role] ?? [];
    await accounts.updateOne({ _id: account._id, roles: { $exists: false } }, { $set: { roles } });
    changed += 1;
  }
  return changed;
}

// Step 2: delete every saved login (refresh token), so everybody has to
// sign in again and gets a login that carries the new list of rights.
export async function logoutAll(db) {
  const result = await db.collection(COLLECTIONS.refreshToken).deleteMany({});
  return result.deletedCount;
}

// Step 3: remove the old "role" field from every account that still has it
export async function dropOldRole(db) {
  const result = await db.collection(COLLECTIONS.user).updateMany({ role: { $exists: true } }, { $unset: { role: '' } });
  return result.modifiedCount;
}
