// Tests the Threads extractor with a recorded post page (meta tags only) and an app-shell page without them,
// plus source detection for Threads links and the registry that picks the extractor.
import { detectSource } from '@/core/url';
import { extractorFor } from '@/extract';
import { threadsExtractor } from '@/extract/threads';
import { fakeHttp, fixture } from '../helpers/fake-http';

const SHARE_URL = 'https://www.threads.com/share/BATN0g7hYq';

test('reads the post text, author handle and image, asking as Smaran rather than as a browser', async () => {
  const { http, requests } = fakeHttp({ [SHARE_URL]: fixture('threads-post.html') });
  const result = await threadsExtractor(SHARE_URL, { http, allowMirrors: true });
  // Browsers get an empty app shell; an honest app user agent gets the post's preview tags.
  expect(requests[0].headers['User-Agent']).toMatch(/^Smaran\//);
  expect(result.author).toBe('louis_rlee');
  expect(result.text).toMatch(/^My Instagram runs on a Claude setup now\./);
  expect(result.text).toContain('I’ll send you how it’s built');
  expect(result.imageUrl).toMatch(/^https:\/\/scontent\.cdninstagram\.com\//);
});

test('an app shell without the post text raises blocked, so it is retried rather than summarised as "Threads"', async () => {
  const shell = '<html><head><title>Threads</title><meta property="og:title" content="Threads" /></head><body></body></html>';
  const { http } = fakeHttp({ [SHARE_URL]: shell });
  await expect(threadsExtractor(SHARE_URL, { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'blocked' });
});

test('Threads links are their own source, on both domains', () => {
  expect(detectSource(SHARE_URL)).toBe('threads');
  expect(detectSource('https://www.threads.net/@zuck/post/C1')).toBe('threads');
  expect(extractorFor('threads')).toBe(threadsExtractor);
});
