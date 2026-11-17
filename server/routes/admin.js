/* =====================================================================
   ADMIN ROUTES (/admin/...)
   Only for the admin account (mounted behind requireAuth AND
   requireAdmin in app.js). Admin power is kept to managing accounts: an
   admin can NOT read other people's binders or lists (a privacy choice).
   - GET    /admin/users        everyone's account details (never passwords), a page at a time,
                                including when each account was last used (lastAccessAt)
   - PATCH  /admin/users/:id    change one person's rights: { role: "user" | "prism" | "admin" }
   - DELETE /admin/users/:id    delete a person and everything they own: { name } must be
                                their name (or username, or email) typed out, as a last check
   Two rules protect the admins: nobody can change or delete their OWN account here (so an
   admin can't lock themselves out), and the LAST admin can't be taken down or deleted.
   A new role reaches a signed-in person within 15 minutes (the role is in their login token).
   ===================================================================== */

import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { deleteAccountAndData } from '../utils/deleteAccount.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { parsePaging } from '../utils/paging.js';

const router = Router();

router.get('/users', async (req, res) => {
  const paging = parsePaging(req.query);
  if (paging.error) return res.status(400).json({ error: paging.error });
  try {
    const [users, total] = await Promise.all([
      // Only the fields that are safe to show (password is also off by default)
      User.find().select('email username name role createdAt lastAccessAt').sort({ _id: 1 }).skip(paging.skip).limit(paging.limit).lean(),
      User.countDocuments(),
    ]);
    res.set('X-Total-Count', String(total));
    return res.json(users);
  } catch (err) {
    return handleDbError(err, res);
  }
});

const ROLES = ['user', 'prism', 'admin'];

// The person in the address, or null (no such account, or not even an id)
async function findPerson(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return User.findById(id).select('email username name role');
}

// Is this the only admin left?
async function isLastAdmin(person) {
  return person.role === 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1;
}

router.patch('/users/:id', async (req, res) => {
  try {
    const role = req.body?.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'The rights must be user, prism or admin' });
    const person = await findPerson(req.params.id);
    if (!person) return res.status(404).json({ error: 'No such person' });
    if (String(person._id) === req.user.sub) return res.status(403).json({ error: 'You can\'t change your own rights' });
    if (role !== 'admin' && await isLastAdmin(person)) return res.status(409).json({ error: 'The last admin can\'t be taken down' });
    // updateOne, not save: only the role changes, nothing else is checked again
    await User.updateOne({ _id: person._id }, { $set: { role } });
    return res.json({ id: String(person._id), role });
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
    await deleteAccountAndData(person._id);
    return res.status(204).end();
  } catch (err) {
    return handleDbError(err, res);
  }
});

export default router;
