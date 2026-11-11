// Chooses the extractor for a save's source. The share pipeline calls this once per save.
// Plain text notes have nothing to fetch, so they get no extractor.
import type { Source } from '@/core/types';
import { githubExtractor } from './github';
import { hackerNewsExtractor } from './hackernews';
import { instagramExtractor } from './instagram';
import { linkedinExtractor } from './linkedin';
import { redditExtractor } from './reddit';
import { threadsExtractor } from './threads';
import type { Extractor } from './types';
import { webExtractor } from './web';
import { xExtractor } from './x';
import { youtubeExtractor } from './youtube';

export function extractorFor(source: Source): Extractor | null {
  switch (source) {
    case 'x':
      return xExtractor;
    case 'reddit':
      return redditExtractor;
    case 'github':
      return githubExtractor;
    case 'instagram':
      return instagramExtractor;
    case 'threads':
      return threadsExtractor;
    case 'youtube':
      return youtubeExtractor;
    case 'linkedin':
      return linkedinExtractor;
    case 'hackernews':
      return hackerNewsExtractor;
    case 'web':
      return webExtractor;
    case 'text':
      return null;
  }
}
