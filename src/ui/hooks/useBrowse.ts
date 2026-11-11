// Loads what the Search tab shows before anything is typed: recent searches, platforms with their save counts,
// and popular tags. Reloads when saves, tags or settings (where recent searches live) change.
import { useCallback, useEffect, useState } from 'react';
import type { Source } from '@/core/types';
import { useDb } from '@/db/DbProvider';
import { sourceBreakdown } from '@/db/insights';
import { popularTags, recentSearches } from '@/db/search';
import { useReloadOnChange } from './useReloadOnChange';

const TAG_COUNT = 12;

export interface BrowseData {
  recent: string[];
  sources: Array<{ source: Source; count: number }>;
  tags: Array<{ name: string; count: number }>;
}

export function useBrowse() {
  const db = useDb();
  const [data, setData] = useState<BrowseData>({ recent: [], sources: [], tags: [] });

  const reload = useCallback(() => {
    Promise.all([recentSearches(db), sourceBreakdown(db), popularTags(db, TAG_COUNT)]).then(
      ([recent, sources, tags]) => setData({ recent, sources: sources.map(({ source, count }) => ({ source, count })), tags }),
      // A failed read keeps what is on screen; the next change tries again.
      () => {},
    );
  }, [db]);

  useEffect(reload, [reload]);
  useReloadOnChange(reload, ['saves', 'save_tags', 'settings']);

  return { ...data, reload };
}
