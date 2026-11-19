/* =====================================================================
   SIMPLE MESSAGES AND YES/NO QUESTIONS
   - showMessage: a small message with an OK button ("That file isn't a
     readable binder file.")
   - askYesNo: a question with two buttons; answers true for yes
   These used to be the phone's or browser's own message boxes, which can
   only show plain letters. Now they are the app's own pop-up (drawn once
   by components/DialogHost.tsx), so a name like "{R} Burn" shows its
   Scryfall symbol in them too. This file only keeps the line of waiting
   messages and questions; it has no React in it.
   If several are asked at once, they show one after another.
   ===================================================================== */

// One message or question waiting to be shown
export type Dialog = {
  title: string;
  message?: string;
  yes: string;                       // the main button's words
  no: string | null;                 // the other button's words (null for a plain message)
  done: (answer: boolean) => void;   // called with the answer when it's closed
};

// The line of dialogs: the first one is on the screen
let queue: Dialog[] = [];
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

// What the pop-up host reads: the dialog to show now (or null)
export function currentDialog(): Dialog | null {
  return queue[0] ?? null;
}

// The host asks to be told whenever the line changes
export function onDialogChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// The host calls this when the person answers: it closes that dialog and
// moves on to the next one
export function answerDialog(answer: boolean): void {
  const dialog = queue.shift();
  tell();
  dialog?.done(answer);
}

// Show a message with an OK button
export function showMessage(title: string, message?: string): void {
  queue = [...queue, { title, message, yes: 'OK', no: null, done: () => {} }];
  tell();
}

// Ask a question. "yes" and "no" are the buttons' words (like "Delete"
// and "Cancel"). Closing it any other way (tapping outside, Back) counts
// as no.
export function askYesNo(title: string, message: string, yes = 'OK', no = 'Cancel'): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { title, message, yes, no, done: resolve }];
    tell();
  });
}
