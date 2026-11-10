// Extractor for X (Twitter) posts. X has no open API, so we read the public embed endpoint that
// powers embedded tweets, and fall back to the fxtwitter mirror when that fails (if mirrors are allowed).
// Third in the data flow after the pipeline picks an extractor for source "x".
import { fetchText } from './http';
import { ExtractError, type Extracted, type Extractor, type Http } from './types';

// The embed endpoint wants a token derived from the post id; this is the formula the react-tweet library uses.
export function xSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

function postIdFromUrl(url: string): string {
  const id = new URL(url).pathname.match(/\/status\/(\d+)/)?.[1];
  if (!id) throw new ExtractError('parse', `No post id in ${url}`);
  return id;
}

function parseJson(text: string, url: string): Record<string, any> {
  try {
    return JSON.parse(text);
  } catch {
    throw new ExtractError('parse', `Unexpected X response for ${url}`);
  }
}

async function fromSyndication(http: Http, id: string): Promise<Extracted> {
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${xSyndicationToken(id)}`;
  const post = parseJson((await fetchText(http, url)).text, url);
  if (typeof post.text !== 'string') throw new ExtractError('parse', `No text in X post ${id}`);
  return {
    title: `Post by ${post.user?.name}`,
    author: `@${post.user?.screen_name}`,
    // Long posts keep their full text in note_tweet; "text" is cut short.
    text: post.note_tweet?.note_tweet_results?.result?.text ?? post.text,
    imageUrl: post.mediaDetails?.[0]?.media_url_https ?? post.photos?.[0]?.url,
    publishedAt: Date.parse(post.created_at) || undefined,
  };
}

async function fromFxTwitter(http: Http, id: string): Promise<Extracted> {
  const url = `https://api.fxtwitter.com/status/${id}`;
  const post = parseJson((await fetchText(http, url)).text, url).tweet;
  if (!post || typeof post.text !== 'string') throw new ExtractError('parse', `No text in X post ${id}`);
  return {
    title: `Post by ${post.author?.name}`,
    author: `@${post.author?.screen_name}`,
    text: post.text,
    imageUrl: post.media?.photos?.[0]?.url,
    publishedAt: post.created_timestamp ? post.created_timestamp * 1000 : undefined,
  };
}

export const xExtractor: Extractor = async (url, ctx) => {
  const id = postIdFromUrl(url);
  try {
    return await fromSyndication(ctx.http, id);
  } catch (error) {
    if (!(error instanceof ExtractError)) throw error;
    if (!ctx.allowMirrors) {
      // Without the mirror there is nothing else to try, so report it as blocked for the retry logic.
      throw new ExtractError('blocked', `X embed endpoint failed (${error.kind}) and mirrors are off`);
    }
    return fromFxTwitter(ctx.http, id);
  }
};
