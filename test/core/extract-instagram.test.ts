// Tests the Instagram extractor with a real recorded page head (fetched as facebookexternalhit)
// and a hand-written login-wall page, plus the registry that picks extractors by source.
import { extractorFor } from '@/extract';
import { instagramExtractor } from '@/extract/instagram';
import { fakeHttp, fixture } from '../helpers/fake-http';

const POST_URL = 'https://www.instagram.com/p/CuE2WNQs6vH/';

test('reads caption, image and author from the social-card tags using the bot user agent', async () => {
  const { http, requests } = fakeHttp({ [POST_URL]: fixture('instagram-post.html') });
  const result = await instagramExtractor(POST_URL, { http, allowMirrors: true });
  expect(requests[0].headers['User-Agent']).toBe('facebookexternalhit/1.1');
  expect(result.author).toBe('Google');
  expect(result.text).toContain('Ballroom in Focus');
  expect(result.imageUrl).toMatch(/^https:\/\/scontent\.cdninstagram\.com\//);
});

test('a login wall without og:description raises blocked', async () => {
  const { http } = fakeHttp({ [POST_URL]: fixture('instagram-login-wall.html') });
  await expect(instagramExtractor(POST_URL, { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'blocked' });
});

test('extractorFor returns an extractor per fetchable source and null for text', () => {
  for (const source of ['x', 'reddit', 'github', 'instagram', 'web'] as const) {
    expect(extractorFor(source)).toBeInstanceOf(Function);
  }
  expect(extractorFor('text')).toBeNull();
});
