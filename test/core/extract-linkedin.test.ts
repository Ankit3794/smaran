// Tests the LinkedIn extractor with a recorded public post page (link-preview tags plus its schema.org data),
// a page with only the preview tags, and LinkedIn's login wall.
import { extractorFor } from '@/extract';
import { linkedinExtractor } from '@/extract/linkedin';
import type { Http } from '@/extract/types';
import { fakeHttp, fixture } from '../helpers/fake-http';

const POST = 'https://www.linkedin.com/posts/satyanadella_ai-is-the-defining-technology-of-our-time-activity-7369432203736305666-Nf9O';

test('public post: full text, author name, image and date, asking as Smaran rather than as a browser', async () => {
  const { http, requests } = fakeHttp({ [POST]: fixture('linkedin-post.html') });
  const result = await linkedinExtractor(POST, { http, allowMirrors: true });
  expect(requests[0].headers['User-Agent']).toMatch(/^Smaran\//);
  expect(result.author).toBe('Satya Nadella');
  expect(result.text).toMatch(/^AI is the defining technology of our time/);
  expect(result.text).toMatch(/create economic opportunity\.$/);
  expect(result.imageUrl).toMatch(/^https:\/\/dms\.licdn\.com\/playlist\/vid\/.*\?e=2147483647&v=beta&t=/);
  expect(result.publishedAt).toBe(Date.UTC(2025, 8, 4, 18, 12, 34, 780));
});

test('a page with only preview tags: the "| N comments on LinkedIn" tail is dropped, author comes from the link', async () => {
  const url = 'https://www.linkedin.com/posts/janedoe_my-tool-activity-1-ab';
  const html = `<html><head>
    <meta property="og:title" content="My tool | Jane Doe | 12 comments">
    <meta property="og:description" content="I built a small tool for traders. | 12 comments on LinkedIn">
  </head></html>`;
  const { http } = fakeHttp({ [url]: html });
  const result = await linkedinExtractor(url, { http, allowMirrors: true });
  expect(result.text).toBe('I built a small tool for traders.');
  expect(result.author).toBe('janedoe');
});

test('the login wall (no post text) raises blocked, so the save is kept as partial rather than summarised as "LinkedIn"', async () => {
  const html = '<html><head><title>Sign Up | LinkedIn</title><meta property="og:title" content="LinkedIn"></head></html>';
  const { http } = fakeHttp({ [POST]: html });
  await expect(linkedinExtractor(POST, { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'blocked' });
});

test('a redirect to the login wall raises blocked even though that page has its own description', async () => {
  const wall = '<html><head><meta property="og:description" content="1 billion members | Manage your professional identity."></head></html>';
  const http: Http = async () => {
    const response = new Response(wall, { status: 200 });
    Object.defineProperty(response, 'url', { value: 'https://www.linkedin.com/authwall?trk=x&sessionRedirect=y' });
    return response;
  };
  await expect(linkedinExtractor(POST, { http, allowMirrors: true })).rejects.toMatchObject({ kind: 'blocked' });
});

test('the registry picks this extractor for LinkedIn saves', () => {
  expect(extractorFor('linkedin')).toBe(linkedinExtractor);
});
