/* =====================================================================
   MOVE ACCOUNTS FROM ONE "role" TO A LIST OF "roles"
   Accounts used to hold a single role (user, admin, prism or aiscan).
   Now they hold a list of rights. This script does the move in three
   separate steps, chosen by what you type after the command, so you can
   run them in the right order (the steps themselves are in
   utils/migrateRoles.js):
     --add-roles      give each account a "roles" list made from its old "role"
                      (admin -> admin, prism -> prism, aiscan -> aiscan, anything
                      else -> no rights). Accounts that already have a list are skipped.
     --logout-all     delete every saved login, so everyone has to sign in again
     --drop-old-role  remove the old "role" field from every account
   Required: "--yes", so it can never run by accident.
   Optional: "--test" works on the test database instead of the real one.
   Several steps can be given at once; they always run in the order above.
   It prints only counts, never the connection address or anything else from .env.

   Example (from the server folder):
     node scripts/migrate-roles.mjs --yes --add-roles
   ===================================================================== */

import 'dotenv/config';
import mongoose from 'mongoose';
import { addRoles, logoutAll, dropOldRole } from '../utils/migrateRoles.js';

// Read the choices typed after the command
const args = process.argv.slice(2);
const useTestDb = args.includes('--test');

// A short message and a stop (the message never contains a secret)
function stop(message) {
  console.error(message);
  process.exit(1);
}

// Refuse to do anything unless "--yes" was typed
if (!args.includes('--yes')) stop('Nothing done. This changes the database; run it again with --yes to go ahead.');

// At least one step must be chosen
const steps = ['--add-roles', '--logout-all', '--drop-old-role'].filter((flag) => args.includes(flag));
if (steps.length === 0) stop('Nothing done. Choose at least one step: --add-roles, --logout-all, --drop-old-role');

// Connect. The address comes from .env (MONGODB_URI, or MONGODB_TEST_URI for --test) and is never printed.
const uri = useTestDb ? process.env.MONGODB_TEST_URI || process.env.MONGODB_URI : process.env.MONGODB_URI;
if (!uri) stop('No database address is set in .env');
const dbName = useTestDb ? process.env.TEST_DB_NAME || 'wubgr-test' : undefined;
await mongoose.connect(uri, dbName ? { dbName } : {});
console.log(`Connected to the database "${mongoose.connection.name}"`);
const db = mongoose.connection.db;

// Run the chosen steps in the safe order and say how many documents each changed
if (steps.includes('--add-roles')) console.log(`--add-roles: ${await addRoles(db)} accounts given a roles list`);
if (steps.includes('--logout-all')) console.log(`--logout-all: ${await logoutAll(db)} saved logins deleted`);
if (steps.includes('--drop-old-role')) console.log(`--drop-old-role: ${await dropOldRole(db)} accounts had the old role field removed`);

await mongoose.disconnect();
console.log('Done.');
