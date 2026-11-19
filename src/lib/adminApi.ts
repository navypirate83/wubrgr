/* =====================================================================
   THE ADMIN PAGE'S REQUESTS TO THE SERVER
   Only an account with the Admin right can use these (the server refuses
   everyone else, whatever the app does). They are:
     - listPeople: everyone with an account, with their rights and when they last used it
     - setRights: change which of PRISM, AIScan and Admin a person has
     - deletePerson: delete a person and everything they own (the person's
       name has to be sent too: the page makes you type it)
   The server also refuses to change or delete your own account, and to take
   down or delete the last Admin; its plain-English message comes back as the
   error. Plain TypeScript with no React in it.
   ===================================================================== */

import { apiRequest } from './api';

// The special rights an account can hold, in the order they are shown. An account can hold
// any mix of them (or none). Admin includes PRISM and AIScan (and everything else).
export type Right = 'prism' | 'aiscan' | 'admin';
export const RIGHTS: Right[] = ['prism', 'aiscan', 'admin'];

export type Person = {
  id: string;
  email: string;
  username: string;
  name: string;
  roles: Right[];         // the rights this account holds (an empty list = the normal app only)
  createdAt: string;      // when the account was made (as the server sends dates)
  lastAccessAt: string;   // when the account was last used (empty if the server has no record yet)
};

// What the server sends for one person
type ServerPerson = { _id: string; email: string; username?: string; name?: string; roles?: unknown; createdAt?: string; lastAccessAt?: string };

// The words for each right, shown on the page
export const RIGHTS_LABEL: Record<Right, string> = { prism: 'PRISM', aiscan: 'AIScan', admin: 'Admin' };
export const RIGHTS_ABOUT: Record<Right, string> = {
  prism: 'The PRISM section.',
  aiscan: 'The AI art matching option in the scanner (it downloads the AI files).',
  admin: 'Everything: PRISM and AIScan included, plus the Admin page.',
};

const PAGE = 100;       // the server sends at most 100 people at a time

// Everyone, oldest account first (several requests if there are more than 100 people)
export async function listPeople(): Promise<Person[]> {
  const people: Person[] = [];
  for (let page = 1; page <= 200; page++) {
    const batch = await apiRequest<ServerPerson[]>(`/admin/users?page=${page}&limit=${PAGE}`);
    for (const p of batch) {
      people.push({
        id: p._id,
        email: p.email,
        username: p.username ?? p.email,
        name: p.name?.trim() || p.username || p.email,
        // Keep only known rights (a missing or damaged list counts as none)
        roles: Array.isArray(p.roles) ? RIGHTS.filter((r) => (p.roles as unknown[]).includes(r)) : [],
        createdAt: p.createdAt ?? '',
        lastAccessAt: p.lastAccessAt ?? '',
      });
    }
    if (batch.length < PAGE) break;
  }
  return people;
}

// Replace someone's list of rights with a new one
export async function setRights(id: string, roles: Right[]): Promise<void> {
  await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: { roles } });
}

// Delete a person and everything they own. "name" is what was typed to confirm.
export async function deletePerson(id: string, name: string): Promise<void> {
  await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', body: { name } });
}

// When an account was last used, in plain words: "just now", "5 min ago", "3 days ago", or
// "Not since tracking began" for an account that hasn't been used since the server started noting it.
// ("now" can be passed in so this can be checked with a made-up clock.)
export function lastAccessText(lastAccessAt: string, now: number = Date.now()): string {
  const then = new Date(lastAccessAt).getTime();
  if (!lastAccessAt || Number.isNaN(then)) return 'Not since tracking began';
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// "Mar 2026" from a date the server sent (empty if there isn't one)
export function joinedText(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
