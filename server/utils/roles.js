/* =====================================================================
   RIGHTS ("roles")
   An account can hold several special rights at once. They are kept in a
   list on the account, for example ["prism", "aiscan", "trainer"]. A plain account
   has an empty list. "admin" is the boss right: an admin counts as having
   EVERY right. This one file is the only place that rule is written down.
   ===================================================================== */

// The rights an account may hold (the order is the order they are shown in)
// ("trainer": may send scanner photos to be used for training; see routes/training.js)
export const ALLOWED_ROLES = ['prism', 'aiscan', 'trainer', 'admin'];

// Does this list of rights let the person use `right`?
// Admin passes every check; every other right only passes for itself.
// Anything that is not a list (a missing or damaged value) counts as "no rights".
export function hasRight(roles, right) {
  if (!Array.isArray(roles)) return false;
  return roles.includes('admin') || roles.includes(right);
}

// Checks a list sent by the admin page. Returns { roles } (cleaned: no
// repeats, in the standard order) or { error } with a plain message.
export function cleanRoles(value) {
  if (!Array.isArray(value)) return { error: 'The rights must be a list' };
  if (!value.every((item) => ALLOWED_ROLES.includes(item))) {
    return { error: `Each right must be one of: ${ALLOWED_ROLES.join(', ')}` };
  }
  return { roles: ALLOWED_ROLES.filter((right) => value.includes(right)) };
}
