// Extractor for Reddit posts, using Reddit's public ".json" version of every post URL.
// Reddit blocks browser-like clients, so it gets the app's own User-Agent.
import { fetchText } from './http';
import { ExtractError, type Extractor } from './types';

const REDDIT_USER_AGENT = 'Smaran/1.0 (Android)';
const COMMENT_COUNT = 5;
const COMMENT_MAX_CHARS = 500;

interface RedditChild {
  kind: string;
  data: Record<string, any>;
}

export const redditExtractor: Extractor = async (url, ctx) => {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '.json';

  const response = await fetchText(ctx.http, parsed.toString(), { ua: REDDIT_USER_AGENT });
  let listings: { data: { children: RedditChild[] } }[];
  let post: Record<string, any>;
  try {
    listings = JSON.parse(response.text);
    post = listings[0].data.children[0].data;
  } catch {
    throw new ExtractError('parse', `Unexpected Reddit response for ${url}`);
  }

  // Link posts have no selftext; keep the linked URL so the AI knows what was shared.
  const body = post.selftext ? post.selftext : `${post.title}\n${post.url}`;
  const comments = (listings[1]?.data.children ?? [])
    .filter((child) => child.kind === 't1') // skips "load more" placeholders
    .slice(0, COMMENT_COUNT)
    .map((child) => `- ${String(child.data.body).slice(0, COMMENT_MAX_CHARS)}`);
  const text = comments.length > 0 ? `${body}\n\nTop comments:\n${comments.join('\n')}` : body;

  // Reddit HTML-escapes the preview URL, so "&amp;" must become "&" or the image 403s.
  const previewUrl: string | undefined = post.preview?.images?.[0]?.source?.url;
  return {
    title: post.title,
    author: `u/${post.author}`,
    text,
    imageUrl: previewUrl?.replace(/&amp;/g, '&'),
    publishedAt: post.created_utc ? post.created_utc * 1000 : undefined,
    extra: { subreddit: post.subreddit, score: post.score, numComments: post.num_comments },
  };
};
