// Extractor for YouTube videos (watch, youtu.be, Shorts, live links). Third in the data flow, for source "youtube".
// Two requests, made together: YouTube's public oEmbed lookup (title, channel, thumbnail; tiny and stable) and the
// watch page, whose player data holds the full description. Either one alone is enough to make a useful save.
// Channel and playlist pages are not videos, so they go to webExtractor.
import { youtubeVideoId } from '@/core/url';
import { fetchText } from './http';
import { parseMeta } from './html';
import { ExtractError, type Extractor } from './types';
import { webExtractor } from './web';

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

function parseOEmbed(text: string): OEmbed | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The watch page embeds the player data as JSON; "shortDescription" is the whole description, despite its name.
// og:description is cut at about 160 characters, so it is only the fallback.
function fullDescription(html: string): string | undefined {
  const match = html.match(/"shortDescription"\s*:\s*("(?:[^"\\]|\\.)*")/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]) || undefined;
  } catch {
    return undefined;
  }
}

export const youtubeExtractor: Extractor = async (url, ctx) => {
  const videoId = youtubeVideoId(url);
  if (!videoId) return webExtractor(url, ctx);

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
  const [oEmbedResult, pageResult] = await Promise.allSettled([fetchText(ctx.http, oEmbedUrl), fetchText(ctx.http, watchUrl)]);

  const info = oEmbedResult.status === 'fulfilled' ? parseOEmbed(oEmbedResult.value.text) : null;
  const html = pageResult.status === 'fulfilled' ? pageResult.value.text : '';
  const meta = parseMeta(html);
  // A missing video's page is titled just " - YouTube", which leaves nothing.
  const pageTitle = meta.title?.replace(/\s*-\s*YouTube$/, '').trim() || undefined;

  const title = info?.title ?? pageTitle;
  if (!title) {
    // A page that loaded but has no video in it: the video was removed or made private. Retrying will not help.
    if (pageResult.status === 'fulfilled') throw new ExtractError('not_found', `No video at ${watchUrl}`);
    throw oEmbedResult.status === 'rejected' ? oEmbedResult.reason : pageResult.reason;
  }

  return {
    title,
    author: info?.author_name,
    text: fullDescription(html) ?? meta.description,
    imageUrl: info?.thumbnail_url ?? meta.image,
  };
};
