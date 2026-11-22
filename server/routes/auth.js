/* =====================================================================
   SIGNING UP, SIGNING IN AND STAYING SIGNED IN (/auth/...)
   - POST /auth/signup       make an account (email + password)
   - POST /auth/login        sign in with a username-or-email + password (5 wrong passwords in a row pause
                             the account for 30 minutes; 5 more and the password must be reset by email)
   - POST /auth/google       sign in with Google (SWITCHED OFF: answers 403 unless GOOGLE_LOGIN=on)
   - POST /auth/refresh      swap the long-lived token for a fresh pair (an already-swapped token still
                             works when its replacement was never used, which is what a lost reply
                             looks like; a copied token ends the whole login: see the note in the route)
   - POST /auth/logout       end this login
   - POST /auth/logout-all   end every login of this account (needs sign-in)
   - POST /auth/forgot       email a 6-digit code (and the username) to an account
   - POST /auth/reset        set a new password using that code
   - DELETE /auth/account    delete the account and everything in it (needs sign-in + password)
   Every sign-in ends by calling issueSession (see utils/tokens.js).
   THE WEBSITE keeps its long-lived login code in a locked cookie its own page can't read, not in the
   reply: sign-in answers go out through sendSession, and /refresh and /logout read the cookie
   (see utils/sessionCookie.js). The phone app is unchanged: tokens in the reply and in the body.
   The strict rate limits on these routes are attached in app.js.
   ===================================================================== */

import { Router } from 'express';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import User, { USERNAME_PATTERN } from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import PasswordReset from '../models/PasswordReset.js';
import { mailIsConfigured, sendMail, sendWelcomeEmail } from '../utils/mail.js';
import { requireAuth } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { checkText } from '../utils/validate.js';
import { checkNewPassword } from '../utils/password.js';
import { deleteAccountAndData } from '../utils/deleteAccount.js';
import { hashToken, issueSession } from '../utils/tokens.js';
import { checkGoogleAccessToken, googleIsConfigured, googleLoginIsOn } from '../utils/google.js';
import { clearRefreshCookie, readRefreshCookie, sendSession, wantsCookie } from '../utils/sessionCookie.js';

const router = Router();

// Usernames nobody may register (so no one can pose as the admin or the app)
const RESERVED_USERNAMES = ['admin', 'administrator', 'root', 'support', 'system', 'moderator', 'staff', 'wubrg', 'wubrgr', 'wubgr', 'wubrgrexpo'];

// A throwaway scrambled password, made once. Login compares against it
// when there is no such account, so "no account" takes as long as "wrong
// password" and can't be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// A refresh token is meant to be swapped once. Two honest things make an already-swapped one come back
// (see /auth/refresh for how they are told apart from a copied token):
//  - two requests at the same moment (two browser tabs renewing together): allowed for this long after the swap
const SAME_MOMENT_MS = 2 * 60 * 1000;
//  - the new token never reached the app (it was closed, or the signal dropped, while the reply was on its
//    way), so the app tries the old one again next time it is opened: allowed for this many days, but ONLY
//    while the token handed out in its place has never been used
const LOST_REPLY_DAYS = 14;

// Guarding one account against password guessing (on top of the limit per internet address in app.js):
// after this many wrong passwords in a row the account is paused...
const WRONG_BEFORE_LOCK = 5;
// ...for this long...
const LOCK_MINUTES = 30;
// ...and after this many in a row (5 more) the password stops working until it is reset by email.
const WRONG_BEFORE_RESET = 10;

// A rough "looks like an email" check
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- sign up ---------- */

router.post('/signup', async (req, res) => {
  // Take ONLY these four fields, so extras like "roles" are never looked at
  const { email, password, name, username } = req.body ?? {};

  // Check the input (400 with a clear message)
  const emailProblem = checkText(email, 'Email', { max: 254 });
  if (emailProblem) return res.status(400).json({ error: emailProblem });
  if (!EMAIL_SHAPE.test(email.trim())) return res.status(400).json({ error: 'Email must look like name@example.com' });

  const nameProblem = checkText(name, 'Name', { max: 100 });
  if (nameProblem) return res.status(400).json({ error: nameProblem });

  // A username is optional (nothing, null or empty text = "use my email")
  let chosenUsername;
  if (username !== undefined && username !== null && username !== '') {
    if (typeof username !== 'string') return res.status(400).json({ error: 'Username must be text' });
    if (!USERNAME_PATTERN.test(username.trim())) {
      return res.status(400).json({ error: 'Username must be 3 to 30 letters, numbers, dots, underscores or dashes' });
    }
    chosenUsername = username.trim().toLowerCase();
    if (RESERVED_USERNAMES.includes(chosenUsername)) return res.status(400).json({ error: 'That username is reserved' });
  }

  // The rules for a NEW password (12 or more characters, a letter plus a number or symbol,
  // nothing well known, not the person's own username or email name): see utils/password.js.
  // Checked after the username so the password can be compared with it.
  const passwordProblem = checkNewPassword(password, { email, username: chosenUsername });
  if (passwordProblem) return res.status(400).json({ error: passwordProblem });

  try {
    // Duplicates (the model saves both trimmed and lowercase, so search the same way)
    const cleanEmail = email.trim().toLowerCase();
    if (await User.exists({ email: cleanEmail })) return res.status(409).json({ error: 'Email already registered' });
    if (chosenUsername && (await User.exists({ username: chosenUsername }))) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    // create() runs the model's rules, so the password is scrambled here
    const user = await User.create({ email: cleanEmail, password, name: name.trim(), username: chosenUsername });
    // Say welcome by email (not waited for, and never a reason signing up fails)
    sendWelcomeEmail(user);
    return sendSession(req, res, 201, await issueSession(user));
  } catch (err) {
    // Two signups at the same instant can both pass the checks above; the
    // unique rule in the database stops the second one
    if (err?.code === 11000) {
      const which = err.keyPattern?.username ? 'Username already taken' : 'Email already registered';
      return res.status(409).json({ error: which });
    }
    return handleDbError(err, res);
  }
});

/* ---------- log in ---------- */

router.post('/login', async (req, res) => {
  const { password } = req.body ?? {};
  // "username" or "email": either field may hold the username or the email
  const who = req.body?.username ?? req.body?.email;
  if (typeof who !== 'string' || who.trim() === '' || typeof password !== 'string' || password === '') {
    return res.status(400).json({ error: 'Username or email, and password, are required' });
  }
  try {
    const name = who.trim().toLowerCase();
    // A username can't contain "@", so it can never equal someone else's email
    const user = await User.findOne({ $or: [{ username: name }, { email: name }] }).select('+password');
    // Same amount of work whether or not the account exists (or has a password)
    const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

    // An account with a password can be paused or made to reset it after too many wrong
    // passwords. While that holds, even the RIGHT password is refused (otherwise the pause
    // would not slow a guesser down at all). Signing in with Google is not affected.
    if (user?.password) {
      // "Reset needed" only counts while email works: without it nobody could ever get back in
      if (user.mustResetPassword && mailIsConfigured()) {
        return res.status(403).json({ error: 'Too many wrong passwords. Reset your password to log in again: tap "Forgot username/password?".' });
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
        return res.status(429).json({ error: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.` });
      }
    }

    if (!user || !user.password || !ok) {
      // A wrong password for a real account: count it, in ONE step in the database so
      // guesses sent at the same instant are all counted
      if (user?.password) {
        const counted = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedLogins: 1 } }, { returnDocument: 'after' }).select('failedLogins');
        const wrong = counted?.failedLogins ?? 0;
        if (wrong >= WRONG_BEFORE_RESET && mailIsConfigured()) {
          // The 10th in a row: the password stops working until it is reset by email
          await User.updateOne({ _id: user._id }, { $set: { mustResetPassword: true } });
        } else if (wrong >= WRONG_BEFORE_LOCK && wrong % WRONG_BEFORE_LOCK === 0) {
          // The 5th in a row (and, where email is not set up, every 5th after it): pause for 30 minutes
          await User.updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) } });
        }
      }
      // One answer for "no such account" and "wrong password"
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    // The right password: the count of wrong ones starts again from nothing
    if (user.failedLogins || user.lockedUntil || user.mustResetPassword) {
      await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: '', mustResetPassword: '' } });
    }
    return sendSession(req, res, 200, await issueSession(user));
  } catch (err) {
    return handleDbError(err, res);
  }
});

/* ---------- Google sign-in (SWITCHED OFF: see googleLoginIsOn in utils/google.js) ---------- */

router.post('/google', async (req, res) => {
  // Switched off unless the server's settings say GOOGLE_LOGIN=on: everyone is turned away here, before
  // anything else is looked at. The rest of the route is kept for when it is switched back on.
  // BEFORE THAT: the step below that joins a Google sign-in to a password account with the same email
  // must be changed (refuse, and tell the person to log in with their password), because nobody has
  // confirmed that the password account's email really belongs to whoever made it.
  if (!googleLoginIsOn()) return res.status(403).json({ error: 'Signing in with Google is switched off. Log in with your username and password.' });
  const { accessToken } = req.body ?? {};
  if (typeof accessToken !== 'string' || accessToken === '' || accessToken.length > 4096) {
    return res.status(400).json({ error: 'accessToken is required' });
  }
  if (!googleIsConfigured()) return res.status(503).json({ error: 'Google sign-in is not set up on this server' });
  try {
    let google;
    try {
      google = await checkGoogleAccessToken(accessToken);
    } catch {
      return res.status(503).json({ error: 'Could not reach Google. Try again.' });
    }
    if (!google || !google.emailVerified) return res.status(401).json({ error: 'Please sign in' });

    // Already signed in with this Google account before?
    let user = await User.findOne({ googleId: google.sub });
    if (!user) {
      // An account with this email already exists (a password account)?
      // Link them, because Google says the email is verified.
      const sameEmail = await User.findOne({ email: google.email });
      if (sameEmail) {
        if (sameEmail.googleId) return res.status(409).json({ error: 'That email belongs to another Google account' });
        sameEmail.googleId = google.sub;
        await sameEmail.save();
        user = sameEmail;
      } else {
        // A brand-new person. One upsert, so two simultaneous first sign-ins
        // can't create two users. Upserts skip model hooks, so set the
        // username (the email) and other fields ourselves.
        // (includeResultMetadata tells us whether this call made the person
        // or somebody else's simultaneous call did, so only one welcome is sent)
        const result = await User.findOneAndUpdate(
          { googleId: google.sub },
          { $setOnInsert: { googleId: google.sub, email: google.email, username: google.email, name: google.name, roles: [] } },
          { upsert: true, returnDocument: 'after', runValidators: true, includeResultMetadata: true },
        );
        user = result.value;
        if (result.lastErrorObject?.updatedExisting === false) sendWelcomeEmail(user);
      }
    }
    return sendSession(req, res, 200, await issueSession(user));
  } catch (err) {
    return handleDbError(err, res);
  }
});

/* ---------- staying signed in ---------- */

router.post('/refresh', async (req, res) => {
  // The refresh token comes in the request's body (the phone app, and a website login from before the
  // cookie existed) or, for the website, in the locked cookie (see utils/sessionCookie.js)
  const cookieMode = wantsCookie(req);
  const sent = req.body?.refreshToken;
  const refreshToken = typeof sent === 'string' && sent !== '' ? sent : readRefreshCookie(req);
  // The website with no cookie at all (it ran out, or the browser threw it away): the login is simply over
  if (refreshToken === '' && cookieMode) return res.status(401).json({ error: 'Please sign in' });
  if (refreshToken === '') {
    return res.status(400).json({ error: 'refreshToken is required' });
  }
  // "The login is over": for the website, the cookie is thrown away as well
  const over = () => {
    if (cookieMode) clearRefreshCookie(req, res);
    return res.status(401).json({ error: 'Please sign in' });
  };
  try {
    const tokenHash = hashToken(refreshToken);
    const row = await RefreshToken.findOne({ tokenHash });
    // Not found, or past its 60 days
    if (!row || row.expiresAt <= new Date()) return over();

    // A CANCELLED token: the server decided earlier that this one never reached the app, and handed out
    // another in its place. If it turns up after all, two parties hold this login (one of them a copy),
    // so the whole login is ended and the real owner signs in again with their password.
    if (row.cancelledAt) {
      await RefreshToken.deleteMany({ family: row.family });
      return over();
    }

    if (row.usedAt) {
      // ALREADY SWAPPED for a newer one, and now it is back. Honest, or a copy? Look at what happened to
      // the token(s) handed out in its place:
      //  - one of them has been USED: so the new token did arrive, and somebody is carrying on with it.
      //    The old one coming back means a second party has this login. (Except in the first two
      //    minutes, when it is just two browser tabs renewing at the same moment.) The login is ended.
      //  - none has been used: that is what a lost reply looks like (the app never got the new token, so
      //    it tries the old one again). Let through, for up to 14 days.
      const sinceSwap = Date.now() - row.usedAt.getTime();
      const replacementUsed = await RefreshToken.exists({ parent: tokenHash, usedAt: { $ne: null } });
      if ((replacementUsed && sinceSwap > SAME_MOMENT_MS) || sinceSwap > LOST_REPLY_DAYS * 24 * 60 * 60 * 1000) {
        await RefreshToken.deleteMany({ family: row.family });
        return over();
      }
      // A lost reply: the unused token(s) handed out before are CANCELLED, so only the one given out now
      // carries on. (Not in the first two minutes: with two tabs, either tab's token may be the one kept.)
      if (sinceSwap > SAME_MOMENT_MS) {
        await RefreshToken.updateMany({ parent: tokenHash, usedAt: null, cancelledAt: null }, { cancelledAt: new Date() });
      }
    } else if (row.parent) {
      // THE NORMAL CASE, a token used for the first time. If other tokens were handed out in place of the
      // same older one (two tabs, or a retry after a lost reply), this is the one that is carrying on, so
      // the others are cancelled. Only one line of tokens stays alive for a login.
      await RefreshToken.updateMany({ parent: row.parent, tokenHash: { $ne: tokenHash }, usedAt: null, cancelledAt: null }, { cancelledAt: new Date() });
    }

    // The account must still exist (this also picks up a change of rights)
    const user = await User.findById(row.user);
    if (!user) {
      await RefreshToken.deleteMany({ family: row.family });
      return over();
    }

    // Mark it used in ONE step (it does nothing if it was already used, which is fine now)
    await RefreshToken.updateOne({ tokenHash, usedAt: null }, { usedAt: new Date() });

    // A new pair, in the same family, remembering which token it replaces
    return sendSession(req, res, 200, await issueSession(user, row.family, tokenHash));
  } catch (err) {
    return handleDbError(err, res);
  }
});

/* ---------- forgot username / password ---------- */

// How many "forgot password" emails one account can be sent per hour. Each code allows 5 guesses, so
// without a cap somebody could keep asking for fresh codes to get more guesses (and bury the real
// owner in emails). 5 an hour is plenty for a person who really forgot.
const RESET_EMAILS_PER_HOUR = 5;
// How many guesses one reset code allows before it is thrown away
const RESET_GUESSES = 5;

// May this account be sent another "forgot password" email right now? Counts it if so. Done in ONE step
// in the database each way, so requests arriving at the same instant can't all slip under the cap.
async function countResetEmail(userId) {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  // Still inside this account's current hour, and under the cap: one more
  const more = await User.findOneAndUpdate(
    { _id: userId, resetEmailsSince: { $gt: hourAgo }, resetEmailsSent: { $lt: RESET_EMAILS_PER_HOUR } },
    { $inc: { resetEmailsSent: 1 } },
  ).select('_id');
  if (more) return true;
  // No hour running (never asked before, or the last hour is over): a new hour starts with this one
  const fresh = await User.findOneAndUpdate(
    { _id: userId, $or: [{ resetEmailsSince: { $exists: false } }, { resetEmailsSince: null }, { resetEmailsSince: { $lte: hourAgo } }] },
    { $set: { resetEmailsSince: now, resetEmailsSent: 1 } },
  ).select('_id');
  return !!fresh;
}

// The same answer whether or not the email has an account, so nobody can
// use this to find out who is registered
const FORGOT_ANSWER = { message: 'If that email has an account, we sent it a code. It works for 15 minutes.' };

// Sends a 6-digit code AND the username to the account's email
router.post('/forgot', async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !EMAIL_SHAPE.test(email.trim())) {
    return res.status(400).json({ error: 'Enter the email address of your account' });
  }
  if (!mailIsConfigured()) return res.status(503).json({ error: 'Email isn\'t set up on this server yet' });
  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (user) {
      // Over this account's cap for the hour: nothing is sent, and the answer is the usual one (so the
      // cap can't be used to find out whether the email has an account)
      if (!(await countResetEmail(user._id))) return res.status(200).json(FORGOT_ANSWER);
      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      // A Google-only account has no password to reset: just remind the username
      const googleOnly = !user.password;
      if (!googleOnly) {
        // Replace any code still waiting for this person
        await PasswordReset.findOneAndUpdate(
          { user: user._id },
          { codeHash: hashToken(code), attempts: 0, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
          { upsert: true },
        );
      }
      try {
        await sendMail({
          to: user.email,
          subject: 'Your WUBRG\'r sign-in details',
          text: `Your WUBRG'r username is: ${user.username}\n\n`
            + (googleOnly
              ? 'This account signs in with Google, so there is no password to reset.\n'
              : `Your password reset code is: ${code}\nIt works for 15 minutes. If you didn't ask for it, ignore this email.\n`),
        });
      } catch (err) {
        console.error('Could not send the reset email:', err.message);
        return res.status(503).json({ error: 'Could not send the email. Try again in a moment.' });
      }
    }
    return res.status(200).json(FORGOT_ANSWER);
  } catch (err) {
    return handleDbError(err, res);
  }
});

// Checks the code and sets the new password. Every login of the account
// is ended, so anyone who had the old password is signed out.
router.post('/reset', async (req, res) => {
  const { email, code, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof code !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email, code and new password are required' });
  }
  // The same rules as a brand-new account's password (utils/password.js). The old password,
  // whatever it was, kept working until now: only the NEW one has to meet them.
  const shapeProblem = checkNewPassword(password, { email });
  if (shapeProblem) return res.status(400).json({ error: shapeProblem });
  const WRONG = { error: 'That code is wrong or has run out. Ask for a new one.' };
  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    // EVERY guess is counted BEFORE the code is looked at, in ONE step in the database: "add one to the
    // count, but only if it is still under 5 and the code has not run out". Guesses that arrive at the
    // same instant can't all read the old count, so exactly 5 are ever checked per code. No row back
    // means there is no code, it ran out, or its guesses are used up.
    const row = user
      ? await PasswordReset.findOneAndUpdate(
        { user: user._id, attempts: { $lt: RESET_GUESSES }, expiresAt: { $gt: new Date() } },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' },
      )
      : null;
    if (!row) return res.status(400).json(WRONG);
    if (row.codeHash !== hashToken(code.trim())) {
      // A wrong guess. That was the last one allowed: the code is thrown away.
      if (row.attempts >= RESET_GUESSES) await row.deleteOne();
      return res.status(400).json(WRONG);
    }
    // Now that we know who it is: the new password can't hold their username either
    const ownProblem = checkNewPassword(password, { email: user.email, username: user.username });
    if (ownProblem) {
      // The code was right, so this try is handed back: picking another password doesn't use up the code
      await PasswordReset.updateOne({ _id: row._id }, { $inc: { attempts: -1 } });
      return res.status(400).json({ error: ownProblem });
    }
    user.password = password;   // scrambled by the model when saved
    // A reset also lifts any pause or "reset needed" from too many wrong passwords
    user.failedLogins = 0;
    user.lockedUntil = undefined;
    user.mustResetPassword = undefined;
    await user.save();
    await row.deleteOne();
    await RefreshToken.deleteMany({ user: user._id });
    return res.status(200).json({ message: 'Password changed. You can sign in now.' });
  } catch (err) {
    return handleDbError(err, res);
  }
});

/* ---------- signing out ---------- */

// Ends this login (its whole family). Always answers 204, so the answer
// reveals nothing about whether the token was real.
router.post('/logout', async (req, res) => {
  try {
    // The token to end: from the body (phone app) or, for the website, from the locked cookie
    const sent = req.body?.refreshToken;
    const refreshToken = typeof sent === 'string' && sent !== '' ? sent : readRefreshCookie(req);
    if (refreshToken !== '') {
      const row = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
      if (row) await RefreshToken.deleteMany({ family: row.family });
    }
  } catch (err) {
    console.error(err);
  }
  // The website's browser throws its cookie away too
  if (wantsCookie(req)) clearRefreshCookie(req, res);
  return res.status(204).end();
});

// Ends every login of this account (every phone, every browser)
router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    await RefreshToken.deleteMany({ user: req.user.sub });
    if (wantsCookie(req)) clearRefreshCookie(req, res);
    return res.status(204).end();
  } catch (err) {
    return handleDbError(err, res);
  }
});

/* ---------- delete the account ---------- */

// Deletes the signed-in person's account and everything that belongs to
// it: binders, cards, lists, logins and any waiting password-reset code.
// It cannot be undone, so it asks for the password again (so a stolen
// phone that is still logged in can't wipe the account). An account that
// only signs in with Google has no password, so it sends { confirm: true }.
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const { password, confirm } = req.body ?? {};
    const user = await User.findById(req.user.sub).select('+password');
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.password) {
      if (typeof password !== 'string' || password === '') {
        return res.status(400).json({ error: 'Your password is required to delete the account' });
      }
      if (!(await bcrypt.compare(password, user.password))) {
        // 403, not 401: the login is fine, only the password typed here is wrong
        return res.status(403).json({ error: 'That password is not right' });
      }
    } else if (confirm !== true) {
      return res.status(400).json({ error: 'Please confirm that you want to delete the account' });
    }
    await deleteAccountAndData(user._id);
    if (wantsCookie(req)) clearRefreshCookie(req, res);
    return res.status(204).end();
  } catch (err) {
    return handleDbError(err, res);
  }
});

export default router;
