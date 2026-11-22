/* =====================================================================
   IS THE SIGNING SECRET SAFE TO USE? (checked once, when the server starts)
   Every login pass ("access token") is stamped using a private value,
   JWT_SECRET, from the server's settings (see utils/tokens.js). Anyone who
   knows or can guess it could make a pass for any account, an admin's
   included. So before the server takes a single request it makes sure the
   secret is really there, long, and not a well-known placeholder. If not,
   the server refuses to start and says why: a setup mistake then fails
   loudly at once, instead of the server running with a secret that can be
   guessed (or with logins that mysteriously fail).
   ===================================================================== */

// The shortest secret allowed. A program can try billions of guesses a second against one captured
// pass, so the secret must be far too long to guess. (The one made by the command in .env.example is 128.)
export const MIN_SECRET_LENGTH = 32;

// Values people type "for now" and forget to change. Refused whatever their length (also when
// repeated or padded: "secretsecretsecret...", "changeme-changeme-...").
const PLACEHOLDERS = ['secret', 'changeme', 'change-me', 'password', 'jwtsecret', 'jwt-secret', 'your-secret', 'example', 'test', 'default', '12345'];

// What is wrong with this secret, in plain words, or null when it is fine.
export function secretProblem(secret) {
  if (typeof secret !== 'string' || secret.trim() === '') {
    return 'JWT_SECRET is not set. Add it to the server\'s settings (see .env.example for how to make one).';
  }
  const text = secret.trim();
  if (text.length < MIN_SECRET_LENGTH) {
    return `JWT_SECRET is too short (${text.length} characters; it needs at least ${MIN_SECRET_LENGTH}). Make a new one with the command in .env.example.`;
  }
  // Mostly one repeated character ("aaaaaaaa...") is no secret at all
  if (new Set(text).size < 8) {
    return 'JWT_SECRET is too simple (it uses fewer than 8 different characters). Make a new one with the command in .env.example.';
  }
  // Take out every placeholder word: if little is left, the secret was made of them
  let rest = text.toLowerCase();
  for (const word of PLACEHOLDERS) rest = rest.split(word).join('');
  if (rest.replace(/[^a-z0-9]/g, '').length < MIN_SECRET_LENGTH / 2) {
    return 'JWT_SECRET looks like a placeholder, not a real secret. Make a new one with the command in .env.example.';
  }
  return null;
}

// Stop the server from starting when the secret is not safe. (Called from server.js, before anything else.)
export function requireGoodSecret() {
  const problem = secretProblem(process.env.JWT_SECRET);
  if (!problem) return;
  console.error(`\nThe server did not start: ${problem}\n`);
  process.exit(1);
}
