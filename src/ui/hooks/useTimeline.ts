// Loads the saves for the Timeline (newest first) and the topics for its filter chips, and keeps them fresh.
// Used by the Timeline screen, and later by the topic detail screen with a topic or tag filter.
import { useCallback, useEffect, useState } from 'react';
import type { Save } from '@/core/types';
import { useDb } from '@/db/DbProvider';
import { listTimeline } from '@/db/saves';
import { listTopics, type TopicSummary } from '@/db/topics';
import { useReloadOnChange } from './useReloadOnChange';

const PAGE_SIZE = 100;

export function useTimeline(filter: { topicId?: number; tag?: string }) {
  const db = useDb();
  const [saves, setSaves] = useState<Save[]>([]);
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { topicId, tag } = filter;

  const reload = useCallback(() => {
    // Both reads run together; a failed read leaves the previous list on screen rather than blanking it.
    Promise.all([listTimeline(db, { topicId, tag, limit }), listTopics(db, Date.now())]).then(
      ([loadedSaves, loadedTopics]) => {
        setSaves(loadedSaves);
        setTopics(loadedTopics);
      },
      () => {},
    );
  }, [db, topicId, tag, limit]);

  useEffect(reload, [reload]);
  useReloadOnChange(reload, ['saves', 'save_tags', 'topics']);

  // Asking for more only grows the window; a full page back means there may be older saves.
  const loadMore = useCallback(() => {
    if (saves.length >= limit) setLimit(limit + PAGE_SIZE);
  }, [saves.length, limit]);

  return { saves, topics, loadMore };
}
