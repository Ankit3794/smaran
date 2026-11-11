// Tests the Hacker News extractor with recorded replies from HN's official API: a link post (whose linked article is
// read too) and an Ask HN post (whose text is HTML), plus missing items and non-item pages.
import { extractorFor } from '@/extract';
import { hackerNewsExtractor } from '@/extract/hackernews';
import { fakeHttp, fixture } from '../helpers/fake-http';

const LINK_POST = 'https://news.ycombinator.com/item?id=8863';
const LINK_API = 'https://hacker-news.firebaseio.com/v0/item/8863.json';
const ARTICLE = 'http://www.getdropbox.com/u/2/screencast.html';
const ASK_POST = 'https://news.ycombinator.com/item?id=121003';
const ASK_API = 'https://hacker-news.firebaseio.com/v0/item/121003.json';

test('link post: HN title, poster and score, plus the linked article text and image', async () => {
  const { http } = fakeHttp({ [LINK_API]: fixture('hn-link.json'), [ARTICLE]: fixture('web-article.html') });
  const result = await hackerNewsExtractor(LINK_POST, { http, allowMirrors: true });
  expect(result.title).toBe('My YC app: Dropbox - Throw away your USB drive');
  expect(result.author).toBe('dhouston');
  expect(result.publishedAt).toBe(1175714200 * 1000);
  expect(result.extra).toMatchObject({ score: 104, numComments: 71, linkedUrl: ARTICLE });
  // The summary should be about the thing linked, so its text goes to the AI.
  expect(result.text).toContain('http://www.getdropbox.com/u/2/screencast.html');
  expect(result.text).toContain('The Rust team is happy to announce');
  expect(result.imageUrl).toBe('https://www.rust-lang.org/static/images/rust-social-wide.jpg');
});

test('link post whose article cannot be read still saves the HN facts', async () => {
  const { http } = fakeHttp({ [LINK_API]: fixture('hn-link.json'), [ARTICLE]: 403 });
  const result = await hackerNewsExtractor(LINK_POST, { http, allowMirrors: true });
  expect(result.title).toBe('My YC app: Dropbox - Throw away your USB drive');
  expect(result.text).toContain(ARTICLE);
  expect(result.imageUrl).toBeUndefined();
});

test('Ask HN: the post text becomes plain text, with paragraphs and characters decoded', async () => {
  const { http, requests } = fakeHttp({ [ASK_API]: fixture('hn-ask.json') });
  const result = await hackerNewsExtractor(ASK_POST, { http, allowMirrors: true });
  expect(result.title).toBe('Ask HN: The Arc Effect');
  expect(result.text).toMatch(/^or HN: the Next Iteration\n\nI get the impression that with Arc being released/);
  expect(result.text).not.toContain('<');
  expect(result.text).toContain("Not to say that isn't great");
  expect(requests).toHaveLength(1);
});

test('a deleted or unknown item (API answers "null") is not_found', async () => {
  const { http } = fakeHttp({ [LINK_API]: 'null' });
  await expect(hackerNewsExtractor(LINK_POST, { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'not_found' });
});

test('an HN page that is not an item is read as a plain web page', async () => {
  const url = 'https://news.ycombinator.com/show';
  const { http, requests } = fakeHttp({ [url]: '<html><head><title>Show | Hacker News</title></head></html>' });
  const result = await hackerNewsExtractor(url, { http, allowMirrors: true });
  expect(result.title).toBe('Show | Hacker News');
  expect(requests).toHaveLength(1);
});

test('the registry picks this extractor for Hacker News saves', () => {
  expect(extractorFor('hackernews')).toBe(hackerNewsExtractor);
});

test('HN text: entities decoded, links and line breaks kept readable', async () => {
  const item = JSON.stringify({
    id: 1, type: 'story', by: 'pg', time: 1, title: 'Show HN: x',
    text: 'It&#x27;s at <a href="https:&#x2F;&#x2F;x.dev">https:&#x2F;&#x2F;x.dev</a> &amp; free.<p>Second para.',
  });
  const { http } = fakeHttp({ 'https://hacker-news.firebaseio.com/v0/item/1.json': item });
  const result = await hackerNewsExtractor('https://news.ycombinator.com/item?id=1', { http, allowMirrors: true });
  expect(result.text).toBe("It's at https://x.dev & free.\n\nSecond para.");
});
