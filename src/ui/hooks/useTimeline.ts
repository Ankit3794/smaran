// Loads the saves for the Timeline (newest first) and the topics for its filter chips, and keeps them fresh.
// Used by the Timeline screen and the topic detail screen. topicId null means "saves with no topic".
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Save } from '@/core/types';
import { useDb } from '@/db/DbProvider';
import { listTimeline } from '@/db/saves';
import { listTopics, type TopicSummary } from '@/db/topics';
import { useReloadOnChange } from './useReloadOnChange';

const PAGE_SIZE = 100;

export function useTimeline(filter: { topicId?: number | null; tag?: string }) {
  const db = useDb();
  const [saves, setSaves] = useState<Save[]>([]);
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const { topicId, tag } = filter;
  // The limit remembers which filter it was grown for, so a new filter starts from the first page again.
  const filterKey = `${topicId}|${tag}`;
  const [grownLimit, setGrownLimit] = useState({ filterKey, limit: PAGE_SIZE });
  const limit = grownLimit.filterKey === filterKey ? grownLimit.limit : PAGE_SIZE;
  // Counts reloads; an answer from an older reload (for a previous filter) is dropped.
  const latestReload = useRef(0);

  const reload = useCallback(() => {
    // Both reads run together; a failed read leaves the previous list on screen rather than blanking it.
    const thisReload = ++latestReload.current;
    Promise.all([listTimeline(db, { topicId, tag, limit }), listTopics(db, Date.now())]).then(
      ([loadedSaves, loadedTopics]) => {
        if (thisReload !== latestReload.current) return;
        setSaves(loadedSaves);
        setTopics(loadedTopics);
      },
      () => {},
    );
  }, [db, topicId, tag, limit]);

  useEffect(() => {
    reload();
    // Leaving the screen or changing the filter makes any answer still on its way stale.
    return () => {
      latestReload.current++;
    };
  }, [reload]);
  useReloadOnChange(reload, ['saves', 'save_tags', 'topics']);

  // Asking for more only grows the window; a full page back means there may be older saves.
  const loadMore = useCallback(() => {
    if (saves.length >= limit) setGrownLimit({ filterKey, limit: limit + PAGE_SIZE });
  }, [saves.length, limit, filterKey]);

  return { saves, topics, loadMore };
}
