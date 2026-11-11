// What each source (platform) is called on screen. Used by the Search filters and browse tiles, the save sheet's
// "Open on …" button and the Insights screen. The order here is the order of the Search source filter.
import type { Source } from '@/core/types';

export const SOURCE_NAMES: Record<Source, string> = {
  x: 'X',
  reddit: 'Reddit',
  github: 'GitHub',
  instagram: 'Instagram',
  threads: 'Threads',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  hackernews: 'Hacker News',
  web: 'Web',
  text: 'Text',
};

export const ALL_SOURCES = Object.keys(SOURCE_NAMES) as Source[];
