// Tests the GitHub extractor: repo URLs use the REST API, every other GitHub URL goes to the web extractor.
import { githubExtractor } from '@/extract/github';
import { fakeHttp, fixture } from '../helpers/fake-http';

const API = 'https://api.github.com/repos/ollama/ollama';

test('repo URL: title, description, stars, language, and README (max 4000 chars)', async () => {
  const { http, requests } = fakeHttp({ [API]: fixture('github-repo.json'), [`${API}/readme`]: fixture('github-readme.txt') });
  const result = await githubExtractor('https://github.com/ollama/ollama', { http, allowMirrors: true });
  const repo = JSON.parse(fixture('github-repo.json'));

  expect(result.title).toBe('ollama/ollama');
  expect(result.extra?.stars).toBe(repo.stargazers_count);
  expect(result.extra?.language).toBe(repo.language);
  expect(result.text!.startsWith(repo.description)).toBe(true);
  expect(result.text!.length).toBe(repo.description.length + 2 + 4000);
  expect(requests[1].headers.Accept).toBe('application/vnd.github.raw');
});

test('issue URL is read as a plain web page', async () => {
  const issueUrl = 'https://github.com/ollama/ollama/issues/1';
  const html = '<html><head><meta property="og:title" content="An issue"></head><body><p>Issue body</p></body></html>';
  const { http, requests } = fakeHttp({ [issueUrl]: html });
  const result = await githubExtractor(issueUrl, { http, allowMirrors: true });
  expect(result.title).toBe('An issue');
  expect(requests).toHaveLength(1);
});

test('a 403 (rate limit) raises a blocked error', async () => {
  const { http } = fakeHttp({ [API]: 403 });
  await expect(githubExtractor('https://github.com/ollama/ollama', { http, allowMirrors: true })).rejects.toMatchObject({
    kind: 'blocked',
  });
});

test.each(['orgs/ollama', 'topics/llm', 'sponsors/ollama', 'settings/profile', 'marketplace/actions'])(
  'reserved path %s is a web page, not a repo',
  async (path) => {
    const url = `https://github.com/${path}`;
    const { http, requests } = fakeHttp({ [url]: '<html><head><meta property="og:title" content="A page"></head></html>' });
    const result = await githubExtractor(url, { http, allowMirrors: true });
    expect(result.title).toBe('A page');
    expect(requests).toHaveLength(1);
  },
);

test('a ".git" suffix is stripped from the repo name', async () => {
  const { http, requests } = fakeHttp({ [API]: fixture('github-repo.json'), [`${API}/readme`]: fixture('github-readme.txt') });
  await githubExtractor('https://github.com/ollama/ollama.git', { http, allowMirrors: true });
  expect(requests[0].url).toBe(API);
});
