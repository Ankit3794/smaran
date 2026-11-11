// Tests the YouTube extractor with a recorded oEmbed reply and a trimmed watch page (meta tags plus the player data
// that holds the full description), and what it keeps when either request fails.
import { extractorFor } from '@/extract';
import { youtubeExtractor } from '@/extract/youtube';
import { fakeHttp, fixture } from '../helpers/fake-http';

const OEMBED = 'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DkCc8FmEb1nY&format=json';
const WATCH = 'https://www.youtube.com/watch?v=kCc8FmEb1nY';
const SHARED = 'https://youtu.be/kCc8FmEb1nY?si=abc&t=42';

test('reads title, channel and thumbnail from oEmbed, and the full description from the watch page', async () => {
  const { http } = fakeHttp({ [OEMBED]: fixture('youtube-oembed.json'), [WATCH]: fixture('youtube-watch.html') });
  const result = await youtubeExtractor(SHARED, { http, allowMirrors: true });
  expect(result.title).toBe("Let's build GPT: from scratch, in code, spelled out.");
  expect(result.author).toBe('Andrej Karpathy');
  expect(result.imageUrl).toBe('https://i.ytimg.com/vi/kCc8FmEb1nY/hqdefault.jpg');
  // og:description stops near 160 characters; the player data has the whole thing.
  expect(result.text).toMatch(/^We build a Generatively Pretrained Transformer \(GPT\), following the paper "Attention is All You Need"/);
  expect(result.text!.length).toBe(4928);
});

test('when the watch page fails, the oEmbed facts are still saved', async () => {
  const { http } = fakeHttp({ [OEMBED]: fixture('youtube-oembed.json'), [WATCH]: 429 });
  const result = await youtubeExtractor(SHARED, { http, allowMirrors: true });
  expect(result.author).toBe('Andrej Karpathy');
  expect(result.imageUrl).toBe('https://i.ytimg.com/vi/kCc8FmEb1nY/hqdefault.jpg');
  expect(result.text).toBeUndefined();
});

test('when oEmbed refuses (embedding turned off), the watch page meta is used instead', async () => {
  const { http } = fakeHttp({ [OEMBED]: 401, [WATCH]: fixture('youtube-watch.html') });
  const result = await youtubeExtractor(SHARED, { http, allowMirrors: true });
  expect(result.title).toBe("Let's build GPT: from scratch, in code, spelled out.");
  expect(result.imageUrl).toBe('https://i.ytimg.com/vi/kCc8FmEb1nY/maxresdefault.jpg');
  expect(result.text!.length).toBe(4928);
});

test('when both requests fail, the error is raised so the save is retried', async () => {
  const { http } = fakeHttp({ [OEMBED]: 500, [WATCH]: 500 });
  await expect(youtubeExtractor(SHARED, { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'network' });
});

test('a removed video (oEmbed 400 and a page with no title) is not_found, not retried forever', async () => {
  const { http } = fakeHttp({ [OEMBED]: 400, [WATCH]: '<html><head><title> - YouTube</title></head></html>' });
  await expect(youtubeExtractor(SHARED, { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'not_found' });
});

test('a channel page is read as a plain web page', async () => {
  const url = 'https://www.youtube.com/@AndrejKarpathy';
  const { http, requests } = fakeHttp({ [url]: '<html><head><meta property="og:title" content="Andrej Karpathy"></head></html>' });
  const result = await youtubeExtractor(url, { http, allowMirrors: true });
  expect(result.title).toBe('Andrej Karpathy');
  expect(requests).toHaveLength(1);
});

test('the registry picks this extractor for YouTube saves', () => {
  expect(extractorFor('youtube')).toBe(youtubeExtractor);
});
