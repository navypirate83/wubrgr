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
   - POST /auth/forgot       email a 10-character code (and the username) to an account
   - POST /auth/reset        set a new password using that code
   - DELETE /auth/account    delete the account and everything in it (needs sign-in + password)
   Every sign-in ends by calling issueSession (see utils/tokens.js).
   THE WEBSITE keeps its long-lived login code in a locked cookie its own page can't read, not in the
   reply: sign-in answers go out through sendSession, and /refresh and /logout read the cookie
   (see utils/sessionCookie.js). The phone app is unchanged: tokens in the reply and in the body.
   The strict rate limits on these routes are attached in app.js.
   ===================================================================== */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User, { USERNAME_PATTERN } from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import PasswordReset from '../models/PasswordReset.js';
import LoginTry from '../models/LoginTry.js';
import { RESET_CODE_MINUTES, cleanResetCode, makeResetCode, showResetCode } from '../utils/resetCode.js';
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

// COUNT ONE LOGIN TRY, in ONE step in the database, BEFORE the password's answer is given.
// "Add one to the tries in a row, unless this name is paused or needs a reset. If that makes 5 (or 10, 15...),
// start a 30-minute pause; if it makes 10 and email works, mark it as needing a password reset."
// Doing the count AND the pause as one step is what stops a burst: guesses that arrive at the same instant
// can't all read "not paused yet", so no more than 5 are ever answered between pauses.
// "Model" and "who" say where the count lives: an account (User, by id) or a typed name with no account
// (LoginTry, by the name's fingerprint, made the first time it is tried).
// Gives null when the try may go ahead, 'reset' when a password reset is needed, or the minutes left of a pause.
async function countLoginTry(Model, who) {
  const now = new Date();
  // "Reset needed" only counts while email works: without it nobody could ever get back in
  const resetCounts = mailIsConfigured();
  const filter = {
    ...who,
    ...(resetCounts ? { mustResetPassword: { $ne: true } } : {}),
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
  };
  const update = [
    { $set: { failedLogins: { $add: [{ $ifNull: ['$failedLogins', 0] }, 1] } } },
    { $set: {
      // Every 5th try in a row starts a pause
      lockedUntil: { $cond: [{ $eq: [{ $mod: ['$failedLogins', WRONG_BEFORE_LOCK] }, 0] }, new Date(now.getTime() + LOCK_MINUTES * 60 * 1000), { $ifNull: ['$lockedUntil', null] }] },
      // The 10th in a row: the password stops working until it is reset by email
      mustResetPassword: { $cond: [{ $and: [resetCounts, { $gte: ['$failedLogins', WRONG_BEFORE_RESET] }] }, true, { $ifNull: ['$mustResetPassword', false] }] },
      // (a row for a name with no account deletes itself 30 days after its last try)
      ...(Model === LoginTry ? { expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } : {}),
    } },
  ];
  try {
    const counted = await Model.findOneAndUpdate(filter, update, { returnDocument: 'after', upsert: Model === LoginTry, updatePipeline: true });
    if (counted) return null;
  } catch (err) {
    // (11000: the row for this name exists but is paused, so "make a new one" was refused. That is a pause.)
    if (err?.code !== 11000) throw err;
  }
  // Not counted, so it is paused or needs a reset: which?
  const state = await Model.findOne(who).select('lockedUntil mustResetPassword').lean();
  if (state?.mustResetPassword && resetCounts) return 'reset';
  const left = state?.lockedUntil ? state.lockedUntil.getTime() - Date.now() : 0;
  return Math.max(1, Math.ceil(left / 60000));
}

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

    // EVERY try is counted before the answer is given (see countLoginTry above): on the account itself when
    // the name belongs to one with a password, and otherwise on a row for the name that was typed, so a
    // made-up name is paused and answered in exactly the same way as a real one. While a name is paused or
    // needs a reset, even the RIGHT password is refused (otherwise the pause would not slow a guesser down).
    const real = !!user?.password;
    const refused = real
      ? await countLoginTry(User, { _id: user._id })
      : await countLoginTry(LoginTry, { key: hashToken(`login:${name}`) });
    if (refused === 'reset') {
      return res.status(403).json({ error: 'Too many wrong passwords. Reset your password to log in again: tap "Forgot username/password?".' });
    }
    if (refused) {
      return res.status(429).json({ error: `Too many wrong passwords. Try again in ${refused} minute${refused === 1 ? '' : 's'}, or reset your password.` });
    }

    // One answer for "no such account" and "wrong password"
    if (!real || !ok) return res.status(401).json({ error: 'Invalid username or password' });

    // The right password: the count of wrong ones starts again from nothing
    await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: '', mustResetPassword: '' } });
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
    let row = await RefreshToken.findOne({ tokenHash });
    // Not found, or past its 60 days
    if (!row || row.expiresAt <= new Date()) return over();

    // "Two parties hold this login": every token that came from it is deleted, and the answer is "sign in"
    const endLogin = async () => {
      await RefreshToken.deleteMany({ family: row.family });
      return over();
    };

    // The account must still exist (this also picks up a change of rights)
    const user = await User.findById(row.user);
    if (!user) return endLogin();

    // Hand out the new pair (in the same family, remembering which token it replaces), then look once more:
    // if the old token has been deleted while this was going on (the person tapped "log out everywhere", reset
    // their password or deleted the account, or the login was ended as copied), the new token must not
    // survive it, so it is deleted again and the answer is "sign in".
    const handOut = async () => {
      const session = await issueSession(user, row.family, tokenHash);
      if (!(await RefreshToken.exists({ tokenHash }))) {
        await RefreshToken.deleteOne({ tokenHash: hashToken(session.refreshToken) });
        return over();
      }
      return sendSession(req, res, 200, session);
    };

    // THE NORMAL CASE: a token that has never been used or cancelled. It is CLAIMED in one step in the database
    // ("mark it used, but only if it is still unused and not cancelled"), so when two requests arrive with it at
    // the same instant only one can claim it. The other finds it changed and is handled below, as a token that
    // was just swapped (two browser tabs) or just cancelled.
    if (!row.usedAt && !row.cancelledAt) {
      const claimed = await RefreshToken.findOneAndUpdate({ tokenHash, usedAt: null, cancelledAt: null }, { usedAt: new Date() });
      if (claimed) {
        if (row.parent) {
          // Other tokens may have been handed out in place of the same older one (two tabs, or a retry after a
          // lost reply). Only one line of tokens may carry on for a login:
          //  - one of the others has already been USED: two parties are each carrying on with their own. One of
          //    them holds a copy, so the whole login is ended.
          //  - none has: this is the one carrying on, and the others are cancelled.
          if (await RefreshToken.exists({ parent: row.parent, tokenHash: { $ne: tokenHash }, usedAt: { $ne: null } })) return endLogin();
          await RefreshToken.updateMany({ parent: row.parent, tokenHash: { $ne: tokenHash }, usedAt: null, cancelledAt: null }, { cancelledAt: new Date() });
        }
        return handOut();
      }
      // Somebody else changed it in the same instant: read it again and carry on below with what it is now
      row = await RefreshToken.findOne({ tokenHash });
      if (!row) return over();
    }

    // A CANCELLED token: the server decided earlier that this one never reached the app, and handed out
    // another in its place. If it turns up after all, two parties hold this login (one of them a copy),
    // so the whole login is ended and the real owner signs in again with their password.
    if (row.cancelledAt) return endLogin();

    // ALREADY SWAPPED for a newer one, and now it is back. Honest, or a copy? Look at what happened to
    // the token(s) handed out in its place:
    //  - one of them has been USED: so the new token did arrive, and somebody is carrying on with it.
    //    The old one coming back means a second party has this login. (Except in the first two
    //    minutes, when it is just two browser tabs renewing at the same moment.) The login is ended.
    //  - none has been used: that is what a lost reply looks like (the app never got the new token, so
    //    it tries the old one again). Let through, for up to 14 days.
    const sinceSwap = Date.now() - row.usedAt.getTime();
    const replacementUsed = await RefreshToken.exists({ parent: tokenHash, usedAt: { $ne: null } });
    if ((replacementUsed && sinceSwap > SAME_MOMENT_MS) || sinceSwap > LOST_REPLY_DAYS * 24 * 60 * 60 * 1000) return endLogin();
    // A lost reply: the unused token(s) handed out before are CANCELLED, so only the one given out now
    // carries on. (Not in the first two minutes: with two tabs, either tab's token may be the one kept.)
    // If one of them is being used at this very instant, it is not cancelled here; the "already USED" check
    // in the normal case above ends the login the next time either line renews.
    if (sinceSwap > SAME_MOMENT_MS) {
      await RefreshToken.updateMany({ parent: tokenHash, usedAt: null, cancelledAt: null }, { cancelledAt: new Date() });
    }
    return handOut();
  } catch (err) {
    return handleDbError(err, res);
  }
});

/* ---------- forgot username / password ---------- */

// How many "forgot password" emails one account can be sent per hour. Each code allows 5 guesses, so
// without a cap somebody could keep asking for fresh codes to get more guesses (and bury the real
// owner in emails). 5 an hour is plenty for a person who really forgot.
const RESET_EMAILS_PER_HOUR = 5;

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
const FORGOT_ANSWER = { message: `If that email has an account, we sent it a code. It works for ${RESET_CODE_MINUTES} minutes.` };

// THE WORK BEHIND "FORGOT", DONE AFTER THE ANSWER HAS GONE OUT. If the server did this work first and answered
// afterwards, a real account would take noticeably longer to answer than an unknown email (it has a code to save
// and an email to send), and a failed send would give a different answer. Either would show which emails have
// accounts. So the route answers at once, the same way for everyone, and then this runs. A problem here is
// written in the server's log; the person just sees no email arrive and asks again.
async function sendResetEmail(user) {
  // Over this account's cap for the hour: nothing is sent
  if (!(await countResetEmail(user._id))) return;
  const code = makeResetCode();
  // A Google-only account has no password to reset: just remind the username
  const googleOnly = !user.password;
  if (!googleOnly) {
    // ADD this code to the person's working codes. The earlier ones keep working (so asking again can't
    // be used to cancel somebody's code); only the newest 5 are kept, which is also the most that can be
    // emailed in an hour.
    const expiresAt = new Date(Date.now() + RESET_CODE_MINUTES * 60 * 1000);
    await PasswordReset.findOneAndUpdate(
      { user: user._id },
      { $push: { codes: { $each: [{ hash: hashToken(code), expiresAt }], $slice: -RESET_EMAILS_PER_HOUR } }, $set: { expiresAt } },
      { upsert: true },
    );
  }
  await sendMail({
    to: user.email,
    subject: 'Your WUBRG\'r sign-in details',
    text: `Your WUBRG'r username is: ${user.username}\n\n`
      + (googleOnly
        ? 'This account signs in with Google, so there is no password to reset.\n'
        : `Your password reset code is: ${showResetCode(code)}\nIt works for ${RESET_CODE_MINUTES} minutes. Type it in the app, or on the website if your app only takes 6 digits. If you didn't ask for it, ignore this email.\n`),
  });
}

// The background work still going on (one request's after another's, so two requests for the same account can't
// trip over each other). The tests wait for it with afterForgot(); nothing else needs to.
let forgotWork = Promise.resolve();
export const afterForgot = () => forgotWork;

// Emails a reset code AND the username to the account, if the email has one
router.post('/forgot', async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !EMAIL_SHAPE.test(email.trim())) {
    return res.status(400).json({ error: 'Enter the email address of your account' });
  }
  if (!mailIsConfigured()) return res.status(503).json({ error: 'Email isn\'t set up on this server yet' });
  try {
    // One look in the database, the same for a real and an unknown email, and then the answer goes out
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    res.status(200).json(FORGOT_ANSWER);
    if (user) {
      forgotWork = forgotWork
        .then(() => sendResetEmail(user))
        .catch((err) => console.error('Could not send the reset email:', err.message));
    }
    return undefined;
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
    // The code must be one of this person's emailed codes that still works. A wrong guess changes nothing:
    // the code is far too long to guess (see utils/resetCode.js), so there is no "too many guesses" rule that
    // somebody else could set off on purpose to throw a person's code away.
    const row = user ? await PasswordReset.findOne({ user: user._id }) : null;
    const typed = cleanResetCode(code);
    const typedHash = typed ? hashToken(typed) : '';
    const now = new Date();
    if (!row || !typedHash || !(row.codes ?? []).some((one) => one.hash === typedHash && one.expiresAt > now)) {
      return res.status(400).json(WRONG);
    }
    // Now that we know who it is: the new password can't hold their username either
    // (the code stays good, so picking another password doesn't use it up)
    const ownProblem = checkNewPassword(password, { email: user.email, username: user.username });
    if (ownProblem) return res.status(400).json({ error: ownProblem });
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
