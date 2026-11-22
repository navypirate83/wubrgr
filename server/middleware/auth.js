/* =====================================================================
   WHO IS ASKING?
   requireAuth checks the login token on a request and says who it is.
   requireAdmin goes after it and lets only admins through; requirePrism and
   requireAiScan let in accounts holding their own right (and admins, who have every right).
   ===================================================================== */

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { hasRight } from '../utils/roles.js';

// Every sign-in failure gets this same answer, so nothing is revealed
function pleaseSignIn(res) {
  return res.status(401).json({ error: 'Please sign in' });
}

// Reads "Authorization: Bearer <token>", checks the signature (only the
// HS256 way, so a forged token claiming "no signature needed" is refused),
// and that the account still exists. On success the request carries
// req.user = { id, sub, email, roles }.
// A token without a list of rights is from before rights became a list, so it
// is refused: that person simply signs in again.
export async function requireAuth(req, res, next) {
  try {
    const parts = (req.headers.authorization ?? '').split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || parts[1] === '') return pleaseSignIn(res);
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!Array.isArray(payload.roles)) return pleaseSignIn(res);
    // Look the account up. A real token for an account that has been deleted must not work.
    if (typeof payload.sub !== 'string') return pleaseSignIn(res);
    const account = await User.findById(payload.sub).select('roles').lean();
    if (!account) return pleaseSignIn(res);
    // THE RIGHTS COME FROM THE ACCOUNT AS IT IS NOW, not from the token. The token was made up to 15 minutes
    // ago, so going by it would let a right that has just been taken away (Admin, say) keep working until the
    // token ran out: long enough for a demoted Admin to make somebody else one. Read from the account, a
    // change of rights counts on the very next request. (The account is looked up here anyway, so it costs
    // nothing extra.)
    const roles = Array.isArray(account.roles) ? account.roles.filter((role) => typeof role === 'string') : [];
    req.user = { ...payload, id: payload.sub, roles };
    return next();
  } catch {
    // Missing, malformed, wrong signature, expired, or no secret set
    return pleaseSignIn(res);
  }
}

// Only admins may pass (the rights are the account's own, read fresh by requireAuth on every
// request, so giving or taking away a right counts at once)
export function requireAdmin(req, res, next) {
  if (!hasRight(req.user?.roles, 'admin')) return res.status(403).json({ error: 'Admin access required' });
  return next();
}

// Only accounts with the PRISM right (and admins, who have every right) may pass.
export function requirePrism(req, res, next) {
  if (!hasRight(req.user?.roles, 'prism')) return res.status(403).json({ error: 'PRISM access required' });
  return next();
}

// Only accounts with the AI scanner right (and admins, who have every right) may pass.
export function requireAiScan(req, res, next) {
  if (!hasRight(req.user?.roles, 'aiscan')) return res.status(403).json({ error: 'AI scanner access required' });
  return next();
}

// The one rule for "whose things may this person touch": only their own.
// Every database search spreads this in, so someone else's item looks
// exactly like one that doesn't exist (even admins get no special view).
export function ownerFilter(req) {
  return { owner: req.user.sub };
}
