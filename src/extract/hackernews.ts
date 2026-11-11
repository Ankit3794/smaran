// Extractor for Hacker News items, using HN's official public API (one JSON object per item, no login).
// For a link post it also reads the linked article, so the summary is about the thing shared and not only its
// headline. Third in the data flow, for source "hackernews". Other HN pages (front page, /show) are web pages.
import { fetchText } from './http';
import { htmlToText } from './html';
import { ExtractError, type Extractor } from './types';
import { webExtractor } from './web';

interface HnItem {
  title?: string;
  by?: string;
  text?: string; // HTML
  url?: string; // only on link posts
  time?: number; // seconds
  score?: number;
  descendants?: number; // comment count
}

export const hackerNewsExtractor: Extractor = async (url, ctx) => {
  const id = new URL(url).searchParams.get('id');
  if (!/^\d+$/.test(id ?? '')) return webExtractor(url, ctx);

  const response = await fetchText(ctx.http, `https://hacker-news.firebaseio.com/v0/item/${id}.json`);
  let item: HnItem | null;
  try {
    item = JSON.parse(response.text);
  } catch {
    throw new ExtractError('parse', `Unexpected Hacker News response for ${url}`);
  }
  // The API answers "null" for ids that don't exist.
  if (item === null) throw new ExtractError('not_found', `No Hacker News item ${id}`);

  // The article is a bonus: if it is blocked, a PDF or gone, the HN post is still worth saving.
  const article = item.url ? await webExtractor(item.url, ctx).catch(() => null) : null;

  const parts = [
    item.text ? htmlToText(item.text) : '',
    item.url ? `Link: ${item.url}` : '',
    article?.text ? `Linked article:\n${article.text}` : '',
  ];
  return {
    title: item.title,
    author: item.by,
    text: parts.filter(Boolean).join('\n\n') || undefined,
    imageUrl: article?.imageUrl,
    publishedAt: item.time ? item.time * 1000 : undefined,
    extra: { score: item.score, numComments: item.descendants, linkedUrl: item.url },
  };
};
