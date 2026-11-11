// Pulls the facts we need out of an HTML page: social-card meta tags and the readable text.
// Used by the web extractor; htmlparser2 is a small pure-JS parser that also runs on Android.
import { Parser } from 'htmlparser2';

export interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  author?: string;
  siteName?: string;
  publishedAt?: number;
}

export function parseMeta(html: string): PageMeta {
  const tags: Record<string, string> = {};
  let titleText = '';
  let insideTitle = false;

  // decodeEntities (on by default) turns "&amp;" and "&#39;" into real characters.
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === 'title') insideTitle = true;
        if (name !== 'meta') return;
        const key = attributes.property || attributes.name;
        // First tag wins: pages sometimes repeat a key further down.
        if (key && attributes.content && !(key in tags)) tags[key] = attributes.content;
      },
      ontext(text) {
        if (insideTitle) titleText += text;
      },
      onclosetag(name) {
        if (name === 'title') insideTitle = false;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();

  const published = Date.parse(tags['article:published_time'] ?? '');
  return {
    title: tags['og:title'] ?? tags['twitter:title'] ?? (titleText.trim() || undefined),
    description: tags['og:description'] ?? tags['twitter:description'] ?? tags.description,
    image: tags['og:image'] ?? tags['twitter:image'],
    author: tags.author ?? tags['article:author'],
    siteName: tags['og:site_name'],
    publishedAt: Number.isNaN(published) ? undefined : published,
  };
}

// Tags whose text is page chrome, not content.
const IGNORED_TAGS = new Set(['script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside', 'template']);

export function mainText(html: string): string {
  let ignoredDepth = 0;
  let mainContainerDepth = 0; // inside <article> or <main>
  let paragraphDepth = 0;
  let containerText = '';
  let paragraphText = '';

  const parser = new Parser({
    onopentag(name) {
      if (IGNORED_TAGS.has(name)) ignoredDepth++;
      if (name === 'article' || name === 'main') mainContainerDepth++;
      if (name === 'p') paragraphDepth++;
    },
    ontext(text) {
      if (ignoredDepth > 0) return;
      if (mainContainerDepth > 0) containerText += ' ' + text;
      if (paragraphDepth > 0) paragraphText += ' ' + text;
    },
    onclosetag(name) {
      if (IGNORED_TAGS.has(name)) ignoredDepth--;
      if (name === 'article' || name === 'main') mainContainerDepth--;
      if (name === 'p') {
        paragraphDepth--;
        paragraphText += '\n';
      }
    },
  });
  parser.write(html);
  parser.end();

  // Prefer the article body; fall back to paragraphs for pages without <article>/<main>.
  const chosen = containerText.trim() ? containerText : paragraphText;
  return chosen.replace(/\s+/g, ' ').trim();
}

// Turns a short HTML fragment (a Hacker News post or comment) into plain text: tags dropped, entities decoded,
// <p> as a blank line and <br> as a line break. Links keep their visible text, which on HN is the URL itself.
export function htmlToText(html: string): string {
  let text = '';
  const parser = new Parser(
    {
      onopentag(name) {
        if (name === 'p') text += '\n\n';
        if (name === 'br') text += '\n';
      },
      ontext(chunk) {
        text += chunk;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
