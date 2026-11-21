/* =====================================================================
   RULES FOR A NEW PASSWORD
   Used whenever a password is CHOSEN: making an account, and setting a new
   one with a reset code. Logging in never uses these rules, so every
   password that already exists keeps working exactly as before.
   A new password must:
   - be at least 12 characters long (and at most 72 bytes: see below)
   - have at least one letter, and at least one number or symbol
   - use at least 5 different characters (so not "aaaaaaaaaaa1")
   - not contain a well-known weak piece ("password", "123456", "qwerty"...)
   - not contain the person's own username or the name part of their email
   checkNewPassword returns a message saying what is wrong, or null when
   the password is fine.
   ===================================================================== */

// The shortest a new password may be
export const MIN_PASSWORD_LENGTH = 12;

// Pieces that the most-guessed passwords are built from. A password holding
// any of these (in capitals or not) is refused.
const WEAK_PIECES = ['password', 'passw0rd', 'qwerty', '123456', 'abcdef', 'letmein', 'iloveyou', 'welcome', 'wubrg'];

// "about": what we know of the person, so their password can't simply be
// their own username or email name: { email, username }
export function checkNewPassword(password, about = {}) {
  if (typeof password !== 'string') return 'Password must be text';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  // bcrypt (the scrambler) silently ignores everything after 72 bytes
  if (Buffer.byteLength(password) > 72) return 'Password must be at most 72 bytes long';

  // A letter of any alphabet, plus something that is not a letter (a number or a symbol)
  if (!/\p{L}/u.test(password) || !/[^\p{L}\s]/u.test(password)) {
    return 'Password must have at least one letter and at least one number or symbol';
  }
  // Mostly one character repeated is easy to guess however long it is
  if (new Set(password).size < 5) return 'Password must use at least 5 different characters';

  const lower = password.toLowerCase();
  const weak = WEAK_PIECES.find((piece) => lower.includes(piece));
  if (weak) return `Password can't contain "${weak}": it is one of the first things guessed`;

  // The person's own username, and the part of their email before the "@"
  // (only when 4 or more characters long, so a tiny name doesn't block everything)
  const own = [about.username, typeof about.email === 'string' ? about.email.split('@')[0] : null]
    .filter((text) => typeof text === 'string' && text.trim().length >= 4)
    .map((text) => text.trim().toLowerCase());
  if (own.some((text) => lower.includes(text))) return 'Password can\'t contain your username or email name';

  return null;
}
