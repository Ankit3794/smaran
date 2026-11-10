// Loads every topic (with counts and 7-day activity) plus the "Unsorted" summary, and keeps them fresh.
// Used by the Topics tab and the topic detail header; saves and topics changing in SQLite trigger a reload.
import { useCallback, useEffect, useState } from 'react';
import { useDb } from '@/db/DbProvider';
import { listTopics, unsortedSummary, type TopicSummary } from '@/db/topics';
import { useReloadOnChange } from './useReloadOnChange';

export function useTopics() {
  const db = useDb();
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [unsorted, setUnsorted] = useState<{ count: number; lastSavedAt: number | null }>({ count: 0, lastSavedAt: null });

  const reload = useCallback(() => {
    // A failed read leaves the previous values on screen rather than blanking them.
    Promise.all([listTopics(db, Date.now()), unsortedSummary(db)]).then(
      ([loadedTopics, loadedUnsorted]) => {
        setTopics(loadedTopics);
        setUnsorted(loadedUnsorted);
      },
      () => {},
    );
  }, [db]);

  useEffect(reload, [reload]);
  useReloadOnChange(reload, ['saves', 'topics']);

  return { topics, unsorted };
}
