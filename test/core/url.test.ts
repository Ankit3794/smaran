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
