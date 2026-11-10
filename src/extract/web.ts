// Extractor for ordinary web pages: fetch the HTML, read the social-card meta and the main text.
// Also the fallback the GitHub extractor uses for non-repository URLs.
import { fetchText } from './http';
import { mainText, parseMeta } from './html';
import type { Extractor } from './types';

export const webExtractor: Extractor = async (url, ctx) => {
  const page = await fetchText(ctx.http, url);
  const meta = parseMeta(page.text);
  // Meta description is a useful fallback for pages that are mostly scripts.
  const text = mainText(page.text) || meta.description;
  return {
    title: meta.title,
    author: meta.author,
    text,
    imageUrl: meta.image,
    publishedAt: meta.publishedAt,
    extra: meta.siteName ? { siteName: meta.siteName } : undefined,
  };
};
