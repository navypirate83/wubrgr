/* =====================================================================
   BEING SIGNED IN: THE PLAIN DECISIONS (no imports, with tests)
   The rules for starting the app and deciding whether you are still signed in, kept apart from
   the code that talks to the phone's vault and the server (session.ts) so they can be tested:
   - what the saved copy of "who is signed in" must look like to be trusted
   - what to do at start-up for each mix of "a saved login code is there or not" and
     "the saved account details are there or not"
   - which server answers mean "that login is over" (the ONLY thing that signs you out)
   ===================================================================== */

// Who is signed in (what the server tells us about the account)
export type ServerUser = { id: string; username: string; email: string; name: string; roles: string[] };

// Make the rights a plain list of text (anything else counts as no rights)
export function normalizeUser(raw: ServerUser): ServerUser {
  return { ...raw, roles: Array.isArray(raw.roles) ? raw.roles.filter((r) => typeof r === 'string') : [] };
}

// The saved account details turned back into a user. Gives null for nothing saved or damaged text
// (it needs at least an id and a username to be believed).
export function parseSavedUser(text: string | null | undefined): ServerUser | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Partial<ServerUser>;
    if (typeof p.id !== 'string' || typeof p.username !== 'string') return null;
    return normalizeUser({
      id: p.id, username: p.username,
      email: typeof p.email === 'string' ? p.email : '',
      name: typeof p.name === 'string' ? p.name : '',
      roles: Array.isArray(p.roles) ? p.roles : [],
    });
  } catch {
    return null;
  }
}

// What the app does at start-up.
//   "signed-out"  : there is no login code, so there is nothing to continue
//   "use-saved"   : code and account details are both there: show signed in at once, renew in the background
//   "ask-server"  : the code is there but the saved details are missing or damaged (the app was closed or crashed
//                   before they were written, or the saved values could not be read): ask the server who it is
//   "keep-waiting": the phone's vault could not be read just now: do NOT treat that as signed out; show the saved
//                   details if there are any, and try the vault again when a login is needed
export type RestorePlan = 'signed-out' | 'use-saved' | 'ask-server' | 'keep-waiting';

export function restorePlan(input: { hasToken: boolean; vaultFailed: boolean; hasSavedUser: boolean }): RestorePlan {
  if (!input.hasToken) return input.vaultFailed ? 'keep-waiting' : 'signed-out';
  return input.hasSavedUser ? 'use-saved' : 'ask-server';
}

// Does this answer from the server mean "that login is finished"? Only a plain 401 does. Anything else (no
// reply, a timeout, a server error, a bad request) must keep you signed in.
export function isLoginOver(status: number | null | undefined): boolean {
  return status === 401;
}
