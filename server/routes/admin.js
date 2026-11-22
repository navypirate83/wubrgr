/* =====================================================================
   ADMIN ROUTES (/admin/...)
   Only for the admin account (mounted behind requireAuth AND
   requireAdmin in app.js). Admin power is kept to managing accounts: an
   admin can NOT read other people's binders or lists (a privacy choice).
   - GET    /admin/users        everyone's account details (never passwords), a page at a time,
                                including when each account was last used (lastAccessAt)
   - PATCH  /admin/users/:id    change one person's rights: { roles: [...] }, a list holding any of
                                "prism", "aiscan" and "admin" (an empty list = a normal account)
   - DELETE /admin/users/:id    delete a person and everything they own: { name } must be
                                their name (or username, or email) typed out, as a last check
   Two rules protect the admins: nobody can change or delete their OWN account here (so an
   admin can't lock themselves out), and the LAST admin can't be taken down or deleted
   (checked before the change and again after it, so two admins acting on each other at the
   same moment can never leave zero admins).
   New rights reach a signed-in person within 15 minutes (the rights are in their login token).
   ===================================================================== */

import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { deleteAccountAndData } from '../utils/deleteAccount.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { parsePaging } from '../utils/paging.js';
import { cleanRoles } from '../utils/roles.js';

const router = Router();

router.get('/users', async (req, res) => {
  const paging = parsePaging(req.query);
  if (paging.error) return res.status(400).json({ error: paging.error });
  try {
    const [users, total] = await Promise.all([
      // Only the fields that are safe to show (password is also off by default)
      User.find().select('email username name roles createdAt lastAccessAt').sort({ _id: 1 }).skip(paging.skip).limit(paging.limit).lean(),
      User.countDocuments(),
    ]);
    res.set('X-Total-Count', String(total));
    return res.json(users);
  } catch (err) {
    return handleDbError(err, res);
  }
});

// The person in the address, or null (no such account, or not even an id)
async function findPerson(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return User.findById(id).select('email username name roles');
}

// Is this the only admin left?
async function isLastAdmin(person) {
  return person.roles.includes('admin') && (await User.countDocuments({ roles: 'admin' })) <= 1;
}

// THE CHECK AFTER THE CHANGE. Counting the admins first and changing afterwards are two separate steps, so two
// admins taking each other down at the very same moment could both count "2, fine" and both go through, leaving
// nobody who can open the Admin page. So after an admin right has been taken away, the admins are counted AGAIN.
// If none is left, the person is given back the rights they had, and the caller answers "the last admin can't...".
// (If two do this at once, both are undone, or one goes through and the other is undone: never zero admins.)
// Gives true when the change had to be undone.
async function undoIfNoAdminLeft(person) {
  if ((await User.countDocuments({ roles: 'admin' })) > 0) return false;
  await User.updateOne({ _id: person._id }, { $set: { roles: [...person.roles] } });
  return true;
}

router.patch('/users/:id', async (req, res) => {
  try {
    // The new list of rights: must be a list of known names (repeats are dropped)
    const checked = cleanRoles(req.body?.roles);
    if (checked.error) return res.status(400).json({ error: checked.error });
    const { roles } = checked;
    const person = await findPerson(req.params.id);
    if (!person) return res.status(404).json({ error: 'No such person' });
    if (String(person._id) === req.user.sub) return res.status(403).json({ error: 'You can\'t change your own rights' });
    if (!roles.includes('admin') && await isLastAdmin(person)) return res.status(409).json({ error: 'The last admin can\'t be taken down' });
    // updateOne, not save: only the rights change, nothing else is checked again
    await User.updateOne({ _id: person._id }, { $set: { roles } });
    // An admin right was just taken away: make sure an admin is still left (see undoIfNoAdminLeft)
    if (person.roles.includes('admin') && !roles.includes('admin') && await undoIfNoAdminLeft(person)) {
      return res.status(409).json({ error: 'The last admin can\'t be taken down' });
    }
    return res.json({ id: String(person._id), roles });
  } catch (err) {
    return handleDbError(err, res);
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const person = await findPerson(req.params.id);
    if (!person) return res.status(404).json({ error: 'No such person' });
    if (String(person._id) === req.user.sub) return res.status(403).json({ error: 'You can\'t delete your own account here' });
    if (await isLastAdmin(person)) return res.status(409).json({ error: 'The last admin can\'t be deleted' });
    // The name must be typed out, as the page asks (capitals and spaces at the ends don't matter)
    const typed = typeof req.body?.name === 'string' ? req.body.name.trim().toLowerCase() : '';
    const wanted = [person.name, person.username, person.email].filter(Boolean).map((text) => text.trim().toLowerCase());
    if (typed === '' || !wanted.includes(typed)) return res.status(400).json({ error: 'Type the person\'s name to confirm' });
    // Deleting an admin: first take away just the admin right and make sure an admin is still left (see
    // undoIfNoAdminLeft). Only then is the account and everything in it deleted, which can't be undone.
    if (person.roles.includes('admin')) {
      await User.updateOne({ _id: person._id }, { $pull: { roles: 'admin' } });
      if (await undoIfNoAdminLeft(person)) return res.status(409).json({ error: 'The last admin can\'t be deleted' });
    }
    await deleteAccountAndData(person._id);
    return res.status(204).end();
  } catch (err) {
    return handleDbError(err, res);
  }
});

export default router;
