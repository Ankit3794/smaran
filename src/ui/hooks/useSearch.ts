// Runs the keyword search for the Search tab as the user types: waits 150 ms after the last keystroke,
// then asks searchSaves (FTS5) for results grouped by topic. Re-runs when saves change in the database.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Source } from '@/core/types';
import { useDb } from '@/db/DbProvider';
import { searchSaves, type SearchGroup } from '@/db/search';
import { useReloadOnChange } from './useReloadOnChange';

const DEBOUNCE_MS = 150;

export interface SearchFilter {
  since?: number;
  source?: Source;
  topicId?: number;
}

export function useSearch(query: string, filter: SearchFilter) {
  const db = useDb();
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  // The query the shown groups belong to, so the screen can tell "no matches" from "still searching".
  const [searchedQuery, setSearchedQuery] = useState('');
  const { since, source, topicId } = filter;
  // The query and filters together: when the shown groups belong to the current key, the results are settled.
  const key = JSON.stringify([query, since, source, topicId]);
  const [searchedKey, setSearchedKey] = useState<string | null>(null);
  // Counts searches; an answer from an older search (slower than the latest one) is dropped.
  const latestSearch = useRef(0);

  const runSearch = useCallback(() => {
    const thisSearch = ++latestSearch.current;
    searchSaves(db, query, { since, source, topicId }).then(
      (found) => {
        if (thisSearch !== latestSearch.current) return;
        setGroups(found);
        setSearchedQuery(query);
        setSearchedKey(key);
      },
      // A failed search leaves the previous results on screen rather than blanking them.
      () => {},
    );
  }, [db, query, since, source, topicId, key]);

  useEffect(() => {
    const timer = setTimeout(runSearch, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      latestSearch.current++;
    };
  }, [runSearch]);
  useReloadOnChange(runSearch, ['saves', 'save_tags', 'topics']);

  return { groups, searchedQuery, settled: searchedKey === key };
}
