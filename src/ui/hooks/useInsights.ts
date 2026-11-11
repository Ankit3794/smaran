// Loads everything the Insights screen shows: totals, per-platform counts and storage, and saves per week.
// Storage per platform is the text stored for its saves plus their thumbnail files. Reloads when saves change.
import { useCallback, useEffect, useState } from 'react';
import type { Source } from '@/core/types';
import { useDb } from '@/db/DbProvider';
import { libraryTotals, sourceBreakdown, weeklyCounts } from '@/db/insights';
import { libraryStats } from '@/db/saves';
import { thumbnailBytesFor, thumbnailFolderBytes } from '@/ui/storage';
import { useReloadOnChange } from './useReloadOnChange';

export const WEEKS_SHOWN = 12;

export interface Insights {
  total: number;
  thisWeek: number;
  lastWeek: number;
  opened: number;
  libraryBytes: number;
  platforms: Array<{ source: Source; count: number; opened: number; bytes: number }>;
  weeks: number[]; // oldest first; the last one is this week
}

export function useInsights(): Insights | null {
  const db = useDb();
  const [insights, setInsights] = useState<Insights | null>(null);

  const reload = useCallback(() => {
    const now = Date.now();
    Promise.all([libraryTotals(db, now), sourceBreakdown(db), weeklyCounts(db, now, WEEKS_SHOWN), libraryStats(db)]).then(
      ([totals, breakdown, weeks, stats]) =>
        setInsights({
          ...totals,
          libraryBytes: stats.databaseBytes + thumbnailFolderBytes(),
          platforms: breakdown.map(({ source, count, opened, textBytes, saveIds }) => ({
            source, count, opened, bytes: textBytes + thumbnailBytesFor(saveIds),
          })),
          weeks,
        }),
      // A failed read keeps what is on screen; the next change tries again.
      () => {},
    );
  }, [db]);

  useEffect(reload, [reload]);
  useReloadOnChange(reload, ['saves']);

  return insights;
}
