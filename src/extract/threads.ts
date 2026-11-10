// Extractor for Threads (Meta) posts, including threads.com/share/… links, which redirect to the post page.
// Browsers are served an empty app shell, but a client that names itself honestly gets the link-preview tags,
// so we ask as Smaran and read og:description (the post text). Third in the data flow, for source "threads".
import { fetchText } from './http';
import { parseMeta } from './html';
import { ExtractError, type Extractor } from './types';

const SMARAN_UA = 'Smaran/0.1 (Android; bookmark app)';

export const threadsExtractor: Extractor = async (url, ctx) => {
  const page = await fetchText(ctx.http, url, { ua: SMARAN_UA });
  const meta = parseMeta(page.text);
  // The app shell has no post text; summarising it would only ever say "a Threads post".
  if (!meta.description) throw new ExtractError('blocked', `Threads served no post text for ${url}`);

  // og:title looks like: Display Name (@handle) on Threads
  const author = meta.title?.match(/\(@([\w.]+)\) on Threads/)?.[1];
  return {
    title: meta.title,
    author,
    text: meta.description,
    imageUrl: meta.image,
  };
};
