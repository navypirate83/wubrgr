/* =====================================================================
   TESTS: THE ROLE -> ROLES MOVE
   Puts a few accounts in the OLD shape (a single "role", no "roles") into
   the test database with the raw collection, then checks each step of the
   move: adding the lists, signing everybody out, and removing the old field.
   ===================================================================== */

import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/db.js';
import { COLLECTIONS } from '../../models/collectionNames.js';
import { addRoles, logoutAll, dropOldRole } from '../../utils/migrateRoles.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const users = () => mongoose.connection.db.collection(COLLECTIONS.user);

// Old-shaped accounts: all four old roles, one with no role at all, and one already moved
async function insertOldAccounts() {
  const base = (n, extra) => ({ email: `old${n}@example.com`, username: `old${n}@example.com`, ...extra });
  await users().insertMany([
    base(1, { role: 'admin' }),
    base(2, { role: 'prism' }),
    base(3, { role: 'aiscan' }),
    base(4, { role: 'user' }),
    base(5, {}),
    base(6, { role: 'admin', roles: ['prism', 'aiscan'] }),
  ]);
}
const rolesOf = async (n) => (await users().findOne({ email: `old${n}@example.com` })).roles;

describe('--add-roles', () => {
  test('each old role becomes the right list, and accounts that already have a list are untouched', async () => {
    await insertOldAccounts();
    expect(await addRoles(mongoose.connection.db)).toBe(5);
    expect(await rolesOf(1)).toEqual(['admin']);
    expect(await rolesOf(2)).toEqual(['prism']);
    expect(await rolesOf(3)).toEqual(['aiscan']);
    expect(await rolesOf(4)).toEqual([]);
    expect(await rolesOf(5)).toEqual([]);
    expect(await rolesOf(6)).toEqual(['prism', 'aiscan']);
  });

  test('running it again changes nothing', async () => {
    await insertOldAccounts();
    await addRoles(mongoose.connection.db);
    expect(await addRoles(mongoose.connection.db)).toBe(0);
    expect(await rolesOf(1)).toEqual(['admin']);
  });
});

describe('--drop-old-role', () => {
  test('removes the old field everywhere and keeps the lists; a second run changes nothing', async () => {
    await insertOldAccounts();
    await addRoles(mongoose.connection.db);
    expect(await dropOldRole(mongoose.connection.db)).toBe(5);
    expect(await users().countDocuments({ role: { $exists: true } })).toBe(0);
    expect(await rolesOf(1)).toEqual(['admin']);
    expect(await dropOldRole(mongoose.connection.db)).toBe(0);
  });
});

describe('--logout-all', () => {
  test('deletes every saved login and reports how many', async () => {
    const tokens = mongoose.connection.db.collection(COLLECTIONS.refreshToken);
    const soon = new Date(Date.now() + 100000);
    await tokens.insertMany([
      { user: new mongoose.Types.ObjectId(), tokenHash: 'a', family: 'f1', expiresAt: soon },
      { user: new mongoose.Types.ObjectId(), tokenHash: 'b', family: 'f2', expiresAt: soon },
    ]);
    expect(await logoutAll(mongoose.connection.db)).toBe(2);
    expect(await tokens.countDocuments()).toBe(0);
    expect(await logoutAll(mongoose.connection.db)).toBe(0);
  });
});
