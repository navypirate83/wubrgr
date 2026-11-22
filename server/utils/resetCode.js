/* =====================================================================
   THE PASSWORD RESET CODE
   The code emailed for "Forgot username/password". It is 10 letters and
   digits, shown in two halves ("K7QM2-XH4RT") so it is easy to read and
   type. Why so long: a 6-digit code has a million possibilities, so it
   needed a "five wrong guesses and it is thrown away" rule, and that rule
   let anybody throw away somebody else's code on purpose. Ten of these
   characters have about a thousand million million possibilities: nobody
   can guess one, so nothing needs throwing away, and a person's way back
   into their account can't be blocked.
   ===================================================================== */

import { randomInt } from 'node:crypto';

// The characters a code is made of: capital letters and digits, leaving out the ones that look
// alike when read from an email (0 and O, 1 and I and L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const RESET_CODE_LENGTH = 10;
// How long an emailed code works. Longer than the "5 emails an hour" cap's hour (see /auth/forgot), so
// when the cap has been reached there is always a code in the inbox that still works.
export const RESET_CODE_MINUTES = 90;

// A new code, as plain characters ("K7QM2XH4RT"), from the system's secure random numbers
export function makeResetCode() {
  let code = '';
  for (let i = 0; i < RESET_CODE_LENGTH; i += 1) code += ALPHABET[randomInt(0, ALPHABET.length)];
  return code;
}

// The code the way it is written in the email: two halves with a dash ("K7QM2-XH4RT")
export function showResetCode(code) {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

// What a person typed, tidied to compare: capitals, with the dash, spaces and anything else that is
// not a letter or digit taken out. Gives '' unless exactly 10 characters are left.
export function cleanResetCode(typed) {
  if (typeof typed !== 'string' || typed.length > 40) return '';
  const code = typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === RESET_CODE_LENGTH ? code : '';
}
