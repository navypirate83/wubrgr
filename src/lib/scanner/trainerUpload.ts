/* =====================================================================
   SENDING SCAN PHOTOS FOR TRAINING (accounts with the "trainer" right)
   The website's scanner keeps a small photo with every scan (see
   ScannerCamera.web.tsx). For an account with the trainer right (admins
   have it too), the photos that teach something are sent to the server
   automatically, with what the scanner said and what the right card was:
   the ones it wasn't sure about, the ones whose printing or language was
   changed, the ones marked "Wrong" in the list, and the ones nothing could
   be read from (rules in core/training.ts). Later they are downloaded into a
   folder (server/scripts/download-training.mjs) and used to make the
   scanner better.
   - A scan is sent again whenever its reason or its card changes, and the
     server keeps only the newest copy. If a "Wrong" tick is taken off a
     card the scanner was sure of, its photo is taken back off the server.
   - Nothing here ever stops or slows a scan: a photo that can't be sent is
     tried once more a little later, then left (the next change to the same
     card tries again), and no message is shown.
   - Only photos from this visit exist (they aren't saved on the device), so a
     card still on the list after the page was refreshed has none to send.
   ===================================================================== */

import { apiRequest } from '@/lib/api';
import { hasTrainerAccess } from '@/lib/session';
import { newScanId, type ScanItem } from './scanItems';
import { trainingReason, type Said } from './core/training';
import type { ScanReading, TrainingPhoto } from './core/scannerTypes';

// What was last sent for each scan (its reason and card), so the same thing is never sent twice
const sent = new Map<string, string>();
// How long to wait before trying again after a photo couldn't be sent
const RETRY_MS = 20_000;

// A photo as text for sending (the server wants it that way)
function photoAsText(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof FileReader === 'undefined') { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const comma = text.indexOf(',');
      resolve(comma < 0 ? null : text.slice(comma + 1));
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// What the scanner said, as the server wants it
const saidBody = (said: Said) => ({ printingId: said.printingId, name: said.name, set: said.set, number: said.number, lang: said.lang, finish: said.finish });

// Send one scan's photo and record (true when it went)
async function post(scanId: string, reason: string, photo: TrainingPhoto, extra: Record<string, unknown>, reading: ScanReading | null): Promise<boolean> {
  const text = await photoAsText(photo.jpeg);
  if (!text) return false;
  try {
    await apiRequest('/training', {
      method: 'POST',
      body: {
        scanId, reason, photo: text, width: photo.width, height: photo.height, card: photo.card,
        reading: { nameText: reading?.nameText ?? '', infoText: reading?.infoText ?? '', bottomText: reading?.bottomText ?? '' },
        takenAt: reading?.takenAt, timings: reading?.timings, ...extra,
      },
    });
    return true;
  } catch {
    return false;
  }
}

// Make sure the server has the right record for this card on the list (or none): called when the card
// is added, changed or ticked "Wrong". It does nothing for an account without the trainer right.
export async function syncTraining(item: ScanItem, retry = true): Promise<void> {
  if (!hasTrainerAccess()) return;
  const reason = trainingReason(item);
  const key = reason ? `${reason}|${item.printing.id}|${item.lang}` : '';
  const before = sent.get(item.id) ?? '';
  if (key === before) return;
  // Nothing to keep any more (the "Wrong" tick was taken off a card the scanner was sure of): take the photo back off
  if (!reason) {
    sent.delete(item.id);
    try { await apiRequest(`/training/scan/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); } catch { /* it stays; harmless */ }
    return;
  }
  const photo = await item.reading?.photo;
  if (!photo) return;
  // Marked as sent at once, so a second change while this goes isn't sent twice
  sent.set(item.id, key);
  const changed = item.said && (item.printing.id !== item.said.printingId || item.lang !== item.said.lang);
  const ok = await post(item.id, reason, photo, {
    status: item.said?.status,
    said: item.said ? saidBody(item.said) : null,
    // What the card was changed to (when it was)
    final: changed ? { printingId: item.printing.id, name: item.printing.name, set: item.printing.setCode, number: item.printing.collectorNumber, lang: item.lang, finish: item.finish } : null,
  }, item.reading);
  if (ok) return;
  // Not sent: forget that it was, and try again once a little later
  if (sent.get(item.id) === key) sent.delete(item.id);
  if (retry) setTimeout(() => { syncTraining(item, false).catch(() => { /* left until the next change */ }); }, RETRY_MS);
}

// A scan nothing could be read from: its photo is the most useful kind, so it is sent too (there's no card to go with it)
export async function syncUnread(reading: ScanReading): Promise<void> {
  if (!hasTrainerAccess()) return;
  const photo = await reading.photo;
  if (!photo) return;
  const id = newScanId();
  if (!(await post(id, 'unread', photo, { status: 'none', said: null, final: null }, reading))) {
    setTimeout(() => { post(id, 'unread', photo, { status: 'none', said: null, final: null }, reading).catch(() => { /* given up on */ }); }, RETRY_MS);
  }
}
