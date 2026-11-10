// Tests the Reddit extractor against a self post and a link post (hand-written fixtures in Reddit's
// real listing shape, because Reddit blocks anonymous curl).
import { redditExtractor } from '@/extract/reddit';
import { fakeHttp, fixture } from '../helpers/fake-http';

test('self post: requests the .json URL and appends the top 5 comments', async () => {
  const { http, requests } = fakeHttp({
    'https://reddit.com/r/algotrading/comments/abc/x.json': fixture('reddit-self.json'),
  });
  const result = await redditExtractor('https://reddit.com/r/algotrading/comments/abc/x', { http, allowMirrors: true });

  expect(requests[0].url).toBe('https://reddit.com/r/algotrading/comments/abc/x.json');
  expect(requests[0].headers['User-Agent']).toBe('Smaran/1.0 (Android)');
  expect(result.title).toBe('Modeling slippage in a mean reversion backtest');
  expect(result.author).toBe('u/quant_dev42');
  expect(result.extra?.subreddit).toBe('algotrading');
  expect(result.text).toContain('Sharpe drops from 2.1 to 0.6');
  expect(result.text).toContain('Top comments:');
  const commentLines = result.text!.split('Top comments:\n')[1].split('\n');
  expect(commentLines).toHaveLength(5); // 6 comments plus a "more" stub in the fixture
  expect(commentLines[0]).toBe('- Comment number 1: I ran a similar backtest and slippage ate most of the edge.');
  expect(result.imageUrl).toBe('https://preview.redd.it/abc.png?width=640&crop=smart&auto=webp&s=123');
});

test('long comments are trimmed to 500 characters', async () => {
  const listings = JSON.parse(fixture('reddit-self.json'));
  listings[1].data.children[0].data.body = 'x'.repeat(2000);
  const { http } = fakeHttp({ 'https://reddit.com/r/a/comments/1/y.json': JSON.stringify(listings) });
  const result = await redditExtractor('https://reddit.com/r/a/comments/1/y', { http, allowMirrors: true });
  const firstComment = result.text!.split('Top comments:\n')[1].split('\n')[0];
  expect(firstComment).toBe('- ' + 'x'.repeat(500));
});

test('link post without selftext uses title and linked URL', async () => {
  const { http } = fakeHttp({
    'https://www.reddit.com/r/algotrading/comments/def/y.json': fixture('reddit-link.json'),
  });
  const result = await redditExtractor('https://www.reddit.com/r/algotrading/comments/def/y/?utm=1', { http, allowMirrors: true });
  expect(result.text).toContain('Interesting paper on market microstructure\nhttps://arxiv.org/abs/2401.00001');
  expect(result.author).toBe('u/paper_reader');
});

test('a 403 raises a blocked error', async () => {
  const { http } = fakeHttp({ 'https://reddit.com/r/a/comments/1/y.json': 403 });
  await expect(redditExtractor('https://reddit.com/r/a/comments/1/y', { http, allowMirrors: true })).rejects.toMatchObject({
    kind: 'blocked',
  });
});
