// Delete with Undo for list screens (long press a card, then Delete). A deleted save is hidden straight away and really deleted a few seconds
// later, unless the user taps Undo. Leaving the screen deletes whatever is still waiting, so nothing comes back.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDb } from '@/db/DbProvider';
import { deleteSave } from '@/db/saves';

export const UNDO_WINDOW_MS = 5000;

export function useUndoableDelete() {
  const db = useDb();
  // Saves hidden from the list but not deleted yet, oldest first, each with its delete timer. The ref is the record;
  // pendingIds mirrors it so the screen re-renders.
  const pending = useRef<Array<{ id: number; timer: ReturnType<typeof setTimeout> }>>([]);
  const [pendingIds, setPendingIds] = useState<number[]>([]);

  const update = useCallback((next: typeof pending.current) => {
    pending.current = next;
    setPendingIds(next.map((entry) => entry.id));
  }, []);

  const remove = useCallback(
    (id: number) => {
      if (pending.current.some((entry) => entry.id === id)) return;
      const timer = setTimeout(() => {
        update(pending.current.filter((entry) => entry.id !== id));
        // A failed delete just leaves the save in the library; the next reload shows it again.
        deleteSave(db, id).catch(() => {});
      }, UNDO_WINDOW_MS);
      update([...pending.current, { id, timer }]);
    },
    [db, update],
  );

  // Brings back the most recently deleted save.
  const undo = useCallback(() => {
    const last = pending.current.at(-1);
    if (last === undefined) return;
    clearTimeout(last.timer);
    update(pending.current.slice(0, -1));
  }, [update]);

  useEffect(
    () => () => {
      for (const { id, timer } of pending.current) {
        clearTimeout(timer);
        deleteSave(db, id).catch(() => {});
      }
      pending.current = [];
    },
    [db],
  );

  return { pendingIds, remove, undo };
}
