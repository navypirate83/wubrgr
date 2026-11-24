/* =====================================================================
   PICKING SEVERAL CARDS (the app's one way of selecting many cards)
   A long press on a card starts a selection with that card; while a
   selection is going, a plain tap on a card picks it or un-picks it.
   Un-picking the last card ends the selection. The keys are the ones the
   card list uses for its cards (see CardList.tsx).
   ===================================================================== */

import { useCallback, useState } from 'react';

export function useCardSelection() {
  // The picked cards' keys (empty: nothing is being selected)
  const [keys, setKeys] = useState<Set<string>>(() => new Set());

  // Pick a card, or un-pick it if it was picked
  const toggle = useCallback((key: string) => {
    setKeys((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  // A long press: start with this card (or add it, if a selection is already going)
  const press = useCallback((key: string) => {
    setKeys((now) => (now.has(key) ? now : new Set(now).add(key)));
  }, []);

  // End the selection
  const clear = useCallback(() => setKeys(new Set()), []);

  return { keys, selecting: keys.size > 0, toggle, press, clear };
}
