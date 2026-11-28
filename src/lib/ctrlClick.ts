/* =====================================================================
   WAS IT A CTRL+CLICK?
   On a computer, holding Ctrl (or Cmd on a Mac) while clicking picks
   several things at once. This looks at a press and says whether one of
   those keys was down. A tap with a finger never has them, so on phones
   the answer is always no.
   ===================================================================== */

// "event" is whatever a button's onPress hands over. On the website the
// key flags are on it (or on the browser's own event inside it).
export function isCtrlClick(event: unknown): boolean {
  type Keys = { ctrlKey?: boolean; metaKey?: boolean };
  const press = event as (Keys & { nativeEvent?: Keys }) | undefined;
  // "metaKey" is the Cmd key on a Mac
  return Boolean(press?.ctrlKey || press?.metaKey || press?.nativeEvent?.ctrlKey || press?.nativeEvent?.metaKey);
}
