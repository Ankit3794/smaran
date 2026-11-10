// Tests the X extractor: the embed endpoint (real recorded fixture plus a photo variant),
// the fxtwitter mirror fallback, and the no-mirror failure. Fixtures mix real and hand-edited, see names.
import { xExtractor, xSyndicationToken } from '@/extract/x';
import { fakeHttp, fixture } from '../helpers/fake-http';

const POST_ID = '1585841080431321088';
const POST_URL = `https://x.com/elonmusk/status/${POST_ID}`;
const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${POST_ID}&token=${xSyndicationToken(POST_ID)}`;
const fxTwitterUrl = `https://api.fxtwitter.com/status/${POST_ID}`;

test('token follows the react-tweet formula', () => {
  const id = '1855000000000000000';
  const expected = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  expect(xSyndicationToken(id)).toBe(expected);
});

test('embed endpoint: text and @author from a real recorded post', async () => {
  const { http, requests } = fakeHttp({ [syndicationUrl]: fixture('x-syndication-text.json') });
  const result = await xExtractor(POST_URL, { http, allowMirrors: true });
  expect(requests[0].url).toBe(syndicationUrl);
  expect(result.text).toBe('the bird is freed');
  expect(result.author).toBe('@elonmusk');
  expect(result.publishedAt).toBe(Date.parse('2022-10-28T03:49:11.000Z'));
});

test('twitter.com URLs work and the photo becomes imageUrl', async () => {
  const { http } = fakeHttp({ [syndicationUrl]: fixture('x-syndication-photo.json') });
  const result = await xExtractor(`https://twitter.com/elonmusk/status/${POST_ID}?s=20`, { http, allowMirrors: true });
  expect(result.imageUrl).toBe('https://pbs.twimg.com/media/photo-one.jpg');
});

test('long posts prefer the note_tweet text', async () => {
  const post = JSON.parse(fixture('x-syndication-text.json'));
  post.note_tweet = { note_tweet_results: { result: { text: 'the full long text' } } };
  const { http } = fakeHttp({ [syndicationUrl]: JSON.stringify(post) });
  expect((await xExtractor(POST_URL, { http, allowMirrors: true })).text).toBe('the full long text');
});

test('falls back to fxtwitter when the embed endpoint fails and mirrors are allowed', async () => {
  const { http, requests } = fakeHttp({ [syndicationUrl]: 404, [fxTwitterUrl]: fixture('x-fxtwitter-photo.json') });
  const result = await xExtractor(POST_URL, { http, allowMirrors: true });
  expect(requests.map((request) => request.url)).toEqual([syndicationUrl, fxTwitterUrl]);
  expect(result.text).toBe('the bird is freed');
  expect(result.author).toBe('@elonmusk');
  expect(result.imageUrl).toBe('https://pbs.twimg.com/media/photo-two.jpg');
});

test('raises blocked when the embed endpoint fails and mirrors are off', async () => {
  const { http, requests } = fakeHttp({ [syndicationUrl]: 404, [fxTwitterUrl]: fixture('x-fxtwitter-text.json') });
  await expect(xExtractor(POST_URL, { http, allowMirrors: false })).rejects.toMatchObject({ kind: 'blocked' });
  expect(requests).toHaveLength(1);
});
