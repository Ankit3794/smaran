// Extractor for GitHub repositories, using the public REST API (repo details plus README).
// Any other GitHub page (issues, pulls, gists, files) is just a web page, so it goes to webExtractor.
import { fetchText } from './http';
import { ExtractError, type Extractor } from './types';
import { webExtractor } from './web';

const README_MAX_CHARS = 4000;

export const githubExtractor: Extractor = async (url, ctx) => {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  if (segments.length !== 2) return webExtractor(url, ctx);

  const [owner, repo] = segments;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const repoResponse = await fetchText(ctx.http, apiUrl);
  const readmeResponse = await fetchText(ctx.http, `${apiUrl}/readme`, {
    headers: { Accept: 'application/vnd.github.raw' },
  }).catch((error) => {
    // A repo without a README is still worth saving.
    if (error instanceof ExtractError && error.kind === 'not_found') return null;
    throw error;
  });

  let repoInfo: Record<string, any>;
  try {
    repoInfo = JSON.parse(repoResponse.text);
  } catch {
    throw new ExtractError('parse', `Unexpected GitHub response for ${url}`);
  }

  const description: string = repoInfo.description ?? '';
  const readme = readmeResponse ? readmeResponse.text.slice(0, README_MAX_CHARS) : '';
  return {
    title: repoInfo.full_name,
    author: repoInfo.owner?.login,
    text: [description, readme].filter(Boolean).join('\n\n'),
    imageUrl: repoInfo.owner?.avatar_url,
    extra: { stars: repoInfo.stargazers_count, language: repoInfo.language },
  };
};
