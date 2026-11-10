// URL helpers for the share flow: find a link in shared text, clean it, and classify it.
// Runs first in the data flow so the same page always ends up as the same saved URL.
import type { Source } from './types';

// Characters that commonly trail a link in prose, e.g. "see https://a.com)."
const TRAILING_PUNCTUATION = /[).,;:!?'"\]>]+$/;

const TRACKING_PARAMS = ['igsh', 'igshid', 'si', 'fbclid', 'gclid', 'ref_src', 'ref_url'];

// Hosts whose links only redirect to the real page and must be resolved before fetching.
const SHORT_LINK_HOSTS = ['t.co', 'bit.ly', 'instagr.am'];

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) return null;
  return match[0].replace(TRAILING_PUNCTUATION, '');
}

// Lowercases the host, drops the "www." / "m." / "mobile." prefixes and maps
// twitter.com to x.com, so one page never gets two different saved URLs.
function cleanHost(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  return host === 'twitter.com' ? 'x.com' : host;
}

export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  const host = cleanHost(parsed.hostname);

  for (const name of [...parsed.searchParams.keys()]) {
    const isTracker = name.startsWith('utm_') || TRACKING_PARAMS.includes(name);
    // "s" and "t" are tracking on x.com but meaningful on other sites.
    const isXTracker = host === 'x.com' && (name === 's' || name === 't');
    if (isTracker || isXTracker) parsed.searchParams.delete(name);
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  const query = parsed.searchParams.toString();
  return `${parsed.protocol}//${host}${path}${query ? `?${query}` : ''}`;
}

export function detectSource(url: string | null): Source {
  if (url === null) return 'text';
  const host = cleanHost(new URL(url).hostname);
  if (host === 'x.com') return 'x';
  if (host.endsWith('reddit.com')) return 'reddit';
  if (host === 'github.com') return 'github';
  if (host.endsWith('instagram.com')) return 'instagram';
  // Threads moved from threads.net to threads.com; old links still work.
  if (host === 'threads.com' || host === 'threads.net') return 'threads';
  return 'web';
}

export function isShortLink(url: string): boolean {
  const parsed = new URL(url);
  const host = cleanHost(parsed.hostname);
  if (SHORT_LINK_HOSTS.includes(host)) return true;
  // Reddit's share-sheet links look like reddit.com/r/<sub>/s/<code>.
  return host.endsWith('reddit.com') && /\/s\/[^/]+$/.test(parsed.pathname);
}
