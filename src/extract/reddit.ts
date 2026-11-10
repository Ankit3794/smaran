// Extractor for Reddit posts, using Reddit's public ".json" version of every post URL.
// Reddit blocks browser-like clients, so it gets the app's own User-Agent.
import { fetchText } from './http';
import { ExtractError, type Extractor } from './types';
import { webExtractor } from './web';

const REDDIT_USER_AGENT = 'Smaran/1.0 (Android)';
const COMMENT_COUNT = 5;
const COMMENT_MAX_CHARS = 500;

// Reddit's JSON HTML-escapes text; these are the escapes it uses.
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" becomes "&lt;" and not "<"
}

interface RedditChild {
  kind: string;
  data: Record<string, any>;
}

export const redditExtractor: Extractor = async (url, ctx) => {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '.json';

  let response;
  try {
    response = await fetchText(ctx.http, parsed.toString(), { ua: REDDIT_USER_AGENT });
  } catch (error) {
    if (!(error instanceof ExtractError) || error.kind !== 'blocked') throw error;
    // Reddit often refuses anonymous .json; the post page still carries title and preview as social-card meta.
    const page = await webExtractor(url, ctx);
    const subreddit = new URL(url).pathname.match(/\/r\/([^/]+)/)?.[1];
    return { ...page, extra: { ...page.extra, subreddit } };
  }
  let listings: { data: { children: RedditChild[] } }[];
  let post: Record<string, any>;
  try {
    listings = JSON.parse(response.text);
    post = listings[0].data.children[0].data;
  } catch {
    throw new ExtractError('parse', `Unexpected Reddit response for ${url}`);
  }

  // Link posts have no selftext; keep the linked URL so the AI knows what was shared.
  const body = post.selftext ? decodeEntities(post.selftext) : `${post.title}\n${post.url}`;
  const comments = (listings[1]?.data.children ?? [])
    .filter((child) => child.kind === 't1') // skips "load more" placeholders
    .slice(0, COMMENT_COUNT)
    .map((child) => `- ${decodeEntities(String(child.data.body)).replace(/\s+/g, ' ').trim().slice(0, COMMENT_MAX_CHARS)}`);
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
