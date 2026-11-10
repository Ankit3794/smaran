// Tests the generic web extractor and the shared HTTP error mapping against a recorded article page.
import { resolveShortLink } from '@/extract/http';
import { webExtractor } from '@/extract/web';
import { ExtractError } from '@/extract/types';
import { fakeHttp, fixture } from '../helpers/fake-http';

const ARTICLE_URL = 'https://blog.rust-lang.org/2024/05/02/Rust-1.78.0/';

test('reads OG title, image, and body text', async () => {
  const { http } = fakeHttp({ [ARTICLE_URL]: fixture('web-article.html') });
  const result = await webExtractor(ARTICLE_URL, { http, allowMirrors: true });
  expect(result.title).toBe('Announcing Rust 1.78.0 | Rust Blog');
  expect(result.imageUrl).toBe('https://www.rust-lang.org/static/images/rust-social-wide.jpg');
  expect(result.text!.length).toBeGreaterThan(200);
});

test('a 403 raises a blocked error', async () => {
  const { http } = fakeHttp({ [ARTICLE_URL]: 403 });
  await expect(webExtractor(ARTICLE_URL, { http, allowMirrors: true })).rejects.toMatchObject({
    kind: 'blocked',
  });
  await expect(webExtractor(ARTICLE_URL, { http, allowMirrors: true })).rejects.toBeInstanceOf(ExtractError);
});

test('a 404 raises not_found', async () => {
  const { http } = fakeHttp({});
  await expect(webExtractor(ARTICLE_URL, { http, allowMirrors: true })).rejects.toMatchObject({
    kind: 'not_found',
  });
});

test('decodes HTML entities in meta content', async () => {
  const html = '<head><meta property="og:title" content="Tom &amp; Jerry&#39;s"></head><body><p>hi</p></body>';
  const { http } = fakeHttp({ 'https://a.com/x': html });
  const result = await webExtractor('https://a.com/x', { http, allowMirrors: true });
  expect(result.title).toBe("Tom & Jerry's");
});

test('resolveShortLink aborts a request that hangs past the timeout', async () => {
  jest.useFakeTimers();
  try {
    const hangingHttp: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const outcome = expect(resolveShortLink(hangingHttp, 'https://t.co/slow')).rejects.toMatchObject({ kind: 'network' });
    await jest.advanceTimersByTimeAsync(15000);
    await outcome;
  } finally {
    jest.useRealTimers();
  }
});

test('resolveShortLink sends the default user agent and returns the final URL', async () => {
  const { http, requests } = fakeHttp({ 'https://t.co/abc': 'ok' });
  expect(await resolveShortLink(http, 'https://t.co/abc')).toBe('https://t.co/abc');
  expect(requests[0].headers['User-Agent']).toContain('Mozilla/5.0');
});

test('does not download a link that is not a web page (a video file)', async () => {
  const text = jest.fn();
  const http = async () => ({ ok: true, status: 200, url: 'https://example.com/movie.mp4', headers: new Headers({ 'content-type': 'video/mp4' }), text }) as unknown as Response;
  await expect(webExtractor('https://example.com/movie.mp4', { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'not_found' });
  expect(text).not.toHaveBeenCalled();
});

test('does not download a page larger than 5 MB', async () => {
  const text = jest.fn();
  const headers = new Headers({ 'content-type': 'text/html', 'content-length': String(50 * 1024 * 1024) });
  const http = async () => ({ ok: true, status: 200, url: 'https://example.com/huge', headers, text }) as unknown as Response;
  await expect(webExtractor('https://example.com/huge', { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'not_found' });
  expect(text).not.toHaveBeenCalled();
});
