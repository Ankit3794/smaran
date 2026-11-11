// Extractor for LinkedIn posts, articles and job pages. Third in the data flow, for source "linkedin".
// Public pages carry link-preview tags and schema.org data (JSON-LD) with the full post text and author, but only
// for a client that names itself honestly; browsers are pushed to the login wall. When LinkedIn shows the wall
// anyway we raise "blocked", and the save keeps its link and shared text.
import { Parser } from 'htmlparser2';
import { fetchText } from './http';
import { parseMeta } from './html';
import { ExtractError, type Extractor } from './types';

const SMARAN_UA = 'Smaran/0.1 (Android; bookmark app)';
const LOGIN_WALL_PATHS = /^\/(authwall|login|signup|uas\/login|checkpoint)/;

interface LinkedInJsonLd {
  articleBody?: string;
  description?: string;
  datePublished?: string;
  author?: { name?: string };
  creator?: { name?: string };
}

// The first JSON-LD block on the page, or {} when there is none or it isn't valid JSON.
function readJsonLd(html: string): LinkedInJsonLd {
  let insideJsonLd = false;
  let json = '';
  let done = false;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (!done && name === 'script' && attributes.type === 'application/ld+json') insideJsonLd = true;
    },
    ontext(text) {
      if (insideJsonLd) json += text;
    },
    onclosetag(name) {
      if (name === 'script' && insideJsonLd) {
        insideJsonLd = false;
        done = true;
      }
    },
  });
  parser.write(html);
  parser.end();
  try {
    const data = JSON.parse(json);
    return (Array.isArray(data) ? data[0] : data) ?? {};
  } catch {
    return {};
  }
}

export const linkedinExtractor: Extractor = async (url, ctx) => {
  const page = await fetchText(ctx.http, url, { ua: SMARAN_UA });
  if (LOGIN_WALL_PATHS.test(new URL(page.url).pathname)) throw new ExtractError('blocked', `LinkedIn login wall for ${url}`);

  const meta = parseMeta(page.text);
  const data = readJsonLd(page.text);
  // og:description ends with " | 12 comments on LinkedIn"; the JSON-LD text doesn't.
  const previewText = meta.description?.replace(/\s*\|\s*[\d,.]+[KM]?\s+comments? on LinkedIn$/, '');
  const text = data.articleBody || data.description || previewText;
  // Without the post text, the AI could only ever say "a LinkedIn post".
  if (!text) throw new ExtractError('blocked', `LinkedIn served no post text for ${url}`);

  // Post links look like /posts/<handle>_<words>-activity-<id>-<code>.
  const handle = new URL(url).pathname.match(/^\/posts\/([^_/]+)_/)?.[1];
  const published = Date.parse(data.datePublished ?? '');
  return {
    title: meta.title,
    author: data.author?.name ?? data.creator?.name ?? handle,
    text,
    imageUrl: meta.image,
    publishedAt: Number.isNaN(published) ? meta.publishedAt : published,
  };
};
