/* =====================================================================
   KEEPING THIS DEVICE'S PRISM SETS AND THE ACCOUNT THE SAME
   Part of the sync with the WUBRG'r server (see serverSync.ts, which calls
   syncPrism after the decks, because a set refers to decks). Only for
   accounts with the PRISM role (and admins).
   - The device keeps the working copy of every set (so the section works
     with no internet), and each set is also saved in the account, so it
     shows up on your other phones and computers.
   - How it knows what changed: every set has an "editedAt" time (set
     whenever it's changed on a device), and after each sync the device
     remembers the "editedAt" it synced (its "link"). A set newer than its
     link has changed here; one on the account newer than its link has
     changed somewhere else.
   - Changed only here: sent up. Changed only on the account: brought down.
     Changed in both places: the NEWER one wins, and a message says so.
   - A set on the account that this device has never seen is brought down.
     A set you deleted here is deleted on the account; one deleted on
     another device is removed here (but only if you hadn't changed it since).
   - Deck ids: a set refers to decks by id, and each device gives the same
     deck its own id. So the account's copy uses the SERVER's deck ids, and
     they're converted on the way up and down. A deck this device doesn't
     have yet (not brought down so far) is kept as "srv:<id>" text, and
     turned into the device's own id on a later sync once the deck arrives.
     A deck that no longer exists is kept as "local:<id>" text.
     A set whose decks haven't reached the account yet waits for the next sync.
   Plain TypeScript with no React in it.
   ===================================================================== */

import { ApiError, apiRequest } from './api';
import { showMessage } from './dialogs';
import { loadDecks } from './deckStorage';
import { forgetPrismSet, keepPrismSet, loadPrismSets, type PrismSet } from './prismStorage';

// What we remember for each set after a sync: the "editedAt" that was synced
export type PrismLink = { editedAt: number };

// What a sync needs from the sync's memory: each set's link, and each
// deck's link to the account (this device's deck id -> the server's)
export type PrismMemory = { prism: Record<string, PrismLink>; decks: Record<string, { serverId: string }> };

// A set as the account keeps it (the deck ids are the account's)
type ServerSet = Omit<PrismSet, 'id'> & { clientId: string };

/* ---------- changing deck ids ---------- */

// This device's deck id -> the account's (a deck that's gone is kept as "local:<id>")
function toServerId(id: string, memory: PrismMemory): string {
  const link = memory.decks[id];
  if (link) return link.serverId;
  return id.startsWith('srv:') ? id.slice(4) : `local:${id}`;
}

// The account's deck id -> this device's ("srv:<id>" until the deck is here)
function toLocalId(id: string, memory: PrismMemory): string {
  if (id.startsWith('local:')) return id.slice(6);
  const found = Object.entries(memory.decks).find(([, link]) => link.serverId === id);
  return found ? found[0] : `srv:${id}`;
}

// A copy of the set with every deck id changed by "change"
function withDeckIds(set: PrismSet, change: (id: string) => string): PrismSet {
  return {
    ...set,
    decks: set.decks.map((d) => ({ ...d, deckId: change(d.deckId) })),
    pins: set.pins.map((p) => ({ ...p, deckId: change(p.deckId) })),
    painted: Object.fromEntries(Object.entries(set.painted).map(([key, copies]) => [key, copies.map((ids) => ids.map(change))])),
  };
}

// Every deck id a set mentions
function deckIdsIn(set: PrismSet): Set<string> {
  const ids = new Set<string>();
  for (const d of set.decks) ids.add(d.deckId);
  for (const p of set.pins) ids.add(p.deckId);
  for (const copies of Object.values(set.painted)) for (const list of copies) for (const id of list) ids.add(id);
  return ids;
}

// Does the set mention a deck that's on this device but hasn't reached the
// account yet? (Then the set waits: sending it now would lose what the deck is.)
function waitsForDecks(set: PrismSet, memory: PrismMemory): boolean {
  const here = new Set(loadDecks().map((d) => d.id));
  return [...deckIdsIn(set)].some((id) => here.has(id) && !memory.decks[id]);
}

/* ---------- sending and bringing down ---------- */

async function push(set: PrismSet, memory: PrismMemory): Promise<void> {
  if (waitsForDecks(set, memory)) return;
  const { id, ...rest } = withDeckIds(set, (deckId) => toServerId(deckId, memory));
  await apiRequest(`/prism/${encodeURIComponent(id)}`, { method: 'PUT', body: rest });
  memory.prism[set.id] = { editedAt: set.editedAt };
}

function pull(remote: ServerSet, memory: PrismMemory): void {
  const { clientId, ...rest } = remote;
  const set = withDeckIds({ ...rest, id: clientId }, (deckId) => toLocalId(deckId, memory));
  keepPrismSet({
    id: clientId, name: set.name, corner: set.corner, decks: set.decks, pins: set.pins ?? [],
    painted: set.painted ?? {}, scrape: set.scrape ?? {}, names: set.names ?? {}, editedAt: set.editedAt,
  });
  memory.prism[clientId] = { editedAt: remote.editedAt };
}

// A deck that has since arrived: turn "srv:<id>" ids in the sets here into this device's own
function settlePlaceholders(memory: PrismMemory): void {
  for (const set of loadPrismSets()) {
    if (![...deckIdsIn(set)].some((id) => id.startsWith('srv:'))) continue;
    const settled = withDeckIds(set, (id) => (id.startsWith('srv:') ? toLocalId(id.slice(4), memory) : id));
    keepPrismSet(settled);
  }
}

/* ---------- a sync ---------- */

// Make this device's sets and the account's match, as described at the top
export async function syncPrism(memory: PrismMemory): Promise<void> {
  let remote: ServerSet[];
  try {
    remote = await apiRequest<ServerSet[]>('/prism');
  } catch (err) {
    // A server that doesn't have PRISM yet (not updated), or a login that
    // doesn't carry the role yet: leave the sets on this device for now, quietly
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return;
    throw err;
  }
  settlePlaceholders(memory);

  const byId = new Map(remote.map((r) => [r.clientId, r]));
  const local = loadPrismSets();
  const localIds = new Set(local.map((s) => s.id));
  const conflicts: string[] = [];

  for (const set of local) {
    const link = memory.prism[set.id];
    const there = byId.get(set.id);
    if (!there) {
      // Not on the account. Synced before and not changed since: it was deleted elsewhere
      if (link && set.editedAt <= link.editedAt) {
        forgetPrismSet(set.id);
        delete memory.prism[set.id];
      } else {
        await push(set, memory);
      }
      continue;
    }
    if (!link) {
      // Never synced here: the newer copy wins (the same time: they're the same)
      if (set.editedAt > there.editedAt) await push(set, memory);
      else if (there.editedAt > set.editedAt) pull(there, memory);
      else memory.prism[set.id] = { editedAt: set.editedAt };
      continue;
    }
    const changedHere = set.editedAt > link.editedAt;
    const changedThere = there.editedAt > link.editedAt;
    if (changedHere && changedThere) {
      conflicts.push(set.name);
      if (set.editedAt >= there.editedAt) await push(set, memory);
      else pull(there, memory);
    } else if (changedHere) {
      await push(set, memory);
    } else if (changedThere) {
      pull(there, memory);
    }
  }

  // On the account and not here: brought down, unless it was deleted here
  for (const there of remote) {
    if (localIds.has(there.clientId)) continue;
    const link = memory.prism[there.clientId];
    if (link && there.editedAt <= link.editedAt) {
      await apiRequest(`/prism/${encodeURIComponent(there.clientId)}`, { method: 'DELETE' });
      delete memory.prism[there.clientId];
    } else {
      pull(there, memory);
    }
  }

  if (conflicts.length > 0) {
    showMessage(
      conflicts.length === 1 ? 'A PRISM set was changed in two places' : 'Some PRISM sets were changed in two places',
      `${conflicts.join(', ')} ${conflicts.length === 1 ? 'was' : 'were'} changed on two devices since they last synced. The newer change was kept.`,
    );
  }
}

// Has any PRISM set changed here since the last sync? (Cheap: no internet
// needed.) A set deleted here that's still linked counts too.
export function prismChangedSinceSync(memory: PrismMemory): boolean {
  const local = loadPrismSets();
  const ids = new Set(local.map((s) => s.id));
  return local.some((s) => !memory.prism[s.id] || s.editedAt > memory.prism[s.id].editedAt)
    || Object.keys(memory.prism).some((id) => !ids.has(id));
}
