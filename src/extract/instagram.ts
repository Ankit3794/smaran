// Extractor for Instagram posts and reels. Instagram shows a login wall to browsers but serves
// social-card meta tags to link-preview bots, so we fetch as one and read og:description (the caption).
import { fetchText } from './http';
import { parseMeta } from './html';
import { ExtractError, type Extractor } from './types';

export const instagramExtractor: Extractor = async (url, ctx) => {
  const page = await fetchText(ctx.http, url, { ua: 'facebookexternalhit/1.1' });
  const meta = parseMeta(page.text);
  // The login wall has no caption; saving it would summarise the wrong thing.
  if (!meta.description) throw new ExtractError('blocked', `Instagram login wall for ${url}`);

  // og:title looks like: Google on Instagram: "caption..."
  const author = meta.title?.match(/^(.+?) on Instagram/)?.[1];
  return {
    title: meta.title,
    author,
    text: meta.description,
    imageUrl: meta.image,
  };
};
