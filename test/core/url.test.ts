import { detectSource, extractFirstUrl, isShortLink, normalizeUrl } from '../../src/core/url';

test('first url wins, trailing punctuation stripped', () => {
  expect(extractFirstUrl('Check this out: Cool tool https://x.com/a/status/1?s=20). and https://b.com'))
    .toBe('https://x.com/a/status/1?s=20');
});
test('no url', () => expect(extractFirstUrl('just a thought')).toBeNull());
test('normalize strips trackers', () => {
  expect(normalizeUrl('https://www.Example.com/a?utm_source=x&id=3#frag')).toBe('https://example.com/a?id=3');
  expect(normalizeUrl('https://x.com/q/status/18?s=20&t=abc')).toBe('https://x.com/q/status/18');
  expect(normalizeUrl('https://www.instagram.com/reel/C1/?igsh=zz')).toBe('https://instagram.com/reel/C1');
  expect(normalizeUrl('https://twitter.com/q/status/18')).toBe('https://x.com/q/status/18');
});
test.each([
  ['https://x.com/a/status/1', 'x'], ['https://mobile.twitter.com/a/status/1', 'x'],
  ['https://old.reddit.com/r/a/comments/b/c', 'reddit'], ['https://github.com/o/r', 'github'],
  ['https://www.instagram.com/reel/C1', 'instagram'], ['https://example.com', 'web'], [null, 'text'],
])('detectSource %s', (url, source) => expect(detectSource(url)).toBe(source));
test('short links', () => {
  expect(isShortLink('https://t.co/abc')).toBe(true);
  expect(isShortLink('https://www.reddit.com/r/x/s/AbC')).toBe(true);
  expect(isShortLink('https://x.com/a/status/1')).toBe(false);
});

test.each([
  ['https://www.youtube.com/watch?v=kCc8FmEb1nY', 'youtube'],
  ['https://m.youtube.com/watch?v=kCc8FmEb1nY', 'youtube'],
  ['https://youtu.be/kCc8FmEb1nY', 'youtube'],
  ['https://www.linkedin.com/posts/someone_hello-activity-1-ab', 'linkedin'],
  ['https://in.linkedin.com/posts/someone_hello-activity-1-ab', 'linkedin'],
  ['https://news.ycombinator.com/item?id=8863', 'hackernews'],
])('detectSource %s', (url, source) => expect(detectSource(url)).toBe(source));

// Sharing the same video twice must not make two saves, whatever form the link takes.
test.each([
  'https://youtu.be/kCc8FmEb1nY?si=abc&t=42',
  'https://www.youtube.com/watch?v=kCc8FmEb1nY&feature=share&pp=x',
  'https://m.youtube.com/watch?t=42s&v=kCc8FmEb1nY&list=PL1&index=3',
  'https://youtube.com/shorts/kCc8FmEb1nY?feature=share',
  'https://www.youtube.com/live/kCc8FmEb1nY',
])('every link to one YouTube video normalizes to the same URL: %s', (url) => {
  expect(normalizeUrl(url)).toBe('https://youtube.com/watch?v=kCc8FmEb1nY');
});

test('YouTube pages that are not a single video keep their path and query', () => {
  expect(normalizeUrl('https://www.youtube.com/playlist?list=PL1&si=abc')).toBe('https://youtube.com/playlist?list=PL1');
  expect(normalizeUrl('https://www.youtube.com/@AndrejKarpathy')).toBe('https://youtube.com/@AndrejKarpathy');
});

test('LinkedIn tracking params are dropped, its other params kept', () => {
  expect(normalizeUrl('https://www.linkedin.com/posts/someone_hello-activity-1-ab?utm_source=share&rcm=X&trk=Y&lipi=Z&trackingId=Q'))
    .toBe('https://linkedin.com/posts/someone_hello-activity-1-ab');
  expect(normalizeUrl('https://www.linkedin.com/jobs/view/123?currentJobId=123&trk=x')).toBe('https://linkedin.com/jobs/view/123?currentJobId=123');
});

test('"rcm" is only a tracker on LinkedIn', () => {
  expect(normalizeUrl('https://example.com/a?rcm=1')).toBe('https://example.com/a?rcm=1');
});

test('Hacker News item links keep their id', () => {
  expect(normalizeUrl('https://news.ycombinator.com/item?id=8863')).toBe('https://news.ycombinator.com/item?id=8863');
});
