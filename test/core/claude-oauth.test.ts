// Tests Claude subscription sign-in: PKCE values, the authorize URL, code exchange, refresh,
// and the OAuth-flavoured Messages call. Covers src/ai/auth/* and the oauth branch of the anthropic provider.
import { createPkce, challengeFor } from '@/ai/auth/pkce';
import { claudeAuthUrl, claudeExchange, claudeRefresh, CLAUDE_CODE_VERSION } from '@/ai/auth/claudeOAuth';
import { anthropicMessages } from '@/ai/providers/anthropic';
import { mapHttpError } from '@/ai/providers/errors';
import { parseTokenResponse } from '@/ai/auth/tokens';
import type { Http } from '@/core/types';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

function recordingHttp(responses: Response[]) {
  const requests: { url: string; headers: Record<string, string>; body: any }[] = [];
  const http: Http = async (input, init) => {
    requests.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    return responses[requests.length - 1];
  };
  return { http, requests };
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const tokenResponse = { access_token: 'A', refresh_token: 'R', expires_in: 3600, account: { uuid: 'acct-1' } };

const pkce = { verifier: 'the-verifier', challenge: 'the-challenge', state: 'the-state' };

describe('createPkce', () => {
  it('matches the RFC 7636 Appendix B challenge', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('builds verifier, challenge and state as unpadded base64url', () => {
    let next = 0;
    const result = createPkce((count) => new Uint8Array(count).fill(next++));
    expect(result.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.state).not.toBe(result.verifier);
    expect(result.challenge).toBe(challengeFor(result.verifier));
  });
});

describe('claudeAuthUrl', () => {
  it('carries every OAuth parameter', () => {
    const url = claudeAuthUrl(pkce);
    expect(url.startsWith('https://claude.ai/oauth/authorize?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(Object.fromEntries(params)).toEqual({
      code: 'true',
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: 'https://console.anthropic.com/oauth/code/callback',
      scope: 'org:create_api_key user:profile user:inference',
      code_challenge: 'the-challenge',
      code_challenge_method: 'S256',
      state: 'the-state',
    });
  });
});

describe('claudeExchange', () => {
  it('splits code#state and posts the token request', async () => {
    const { http, requests } = recordingHttp([json(tokenResponse)]);
    const tokens = await claudeExchange(http, '  abc#the-state \n', pkce, 1_000);
    expect(tokens).toEqual({ accessToken: 'A', refreshToken: 'R', expiresAt: 1_000 + 3_600_000, accountId: 'acct-1' });
    expect(requests[0].url).toBe('https://platform.claude.com/v1/oauth/token');
    expect(requests[0].headers['User-Agent']).toBe('axios/1.7.9');
    expect(requests[0].body).toEqual({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: 'abc',
      state: 'the-state',
      redirect_uri: 'https://console.anthropic.com/oauth/code/callback',
      code_verifier: 'the-verifier',
    });
  });

  it('rejects a state mismatch or a missing # as auth_expired', async () => {
    const { http, requests } = recordingHttp([]);
    await expect(claudeExchange(http, 'abc#other', pkce)).rejects.toMatchObject({ kind: 'auth_expired' });
    await expect(claudeExchange(http, 'abc', pkce)).rejects.toMatchObject({ kind: 'auth_expired' });
    expect(requests).toHaveLength(0);
  });

  it('falls back to console.anthropic.com on 404', async () => {
    const { http, requests } = recordingHttp([json({}, 404), json(tokenResponse)]);
    await claudeExchange(http, 'abc#the-state', pkce, 0);
    expect(requests.map((request) => request.url)).toEqual([
      'https://platform.claude.com/v1/oauth/token',
      'https://console.anthropic.com/v1/oauth/token',
    ]);
  });

  it('maps other failures without retrying', async () => {
    const { http, requests } = recordingHttp([json({ error: 'bad' }, 401)]);
    await expect(claudeExchange(http, 'abc#the-state', pkce)).rejects.toMatchObject({ kind: 'auth_expired' });
    expect(requests).toHaveLength(1);
  });
});

describe('claudeRefresh', () => {
  it('posts the refresh grant', async () => {
    const { http, requests } = recordingHttp([json(tokenResponse)]);
    const tokens = await claudeRefresh(http, 'old-refresh', 5_000);
    expect(tokens.expiresAt).toBe(5_000 + 3_600_000);
    expect(requests[0].body).toEqual({ grant_type: 'refresh_token', refresh_token: 'old-refresh', client_id: CLIENT_ID });
  });
});

describe('token validation', () => {
  it('rejects a reply without access_token as bad_output', async () => {
    const { http } = recordingHttp([json({ refresh_token: 'R', expires_in: 60 })]);
    await expect(claudeExchange(http, 'abc#the-state', pkce)).rejects.toMatchObject({ kind: 'bad_output' });
  });

  it('keeps the old refresh token when a refresh reply omits one', async () => {
    const { http } = recordingHttp([json({ access_token: 'A2', expires_in: 60 })]);
    const tokens = await claudeRefresh(http, 'old-refresh', 0);
    expect(tokens).toMatchObject({ accessToken: 'A2', refreshToken: 'old-refresh', expiresAt: 60_000 });
  });

  it('maps invalid_grant on 400 or 401 to auth_expired', () => {
    expect(mapHttpError(400, '{"error":"invalid_grant"}', new Headers()).kind).toBe('auth_expired');
    expect(mapHttpError(401, 'invalid_grant', new Headers()).kind).toBe('auth_expired');
  });
});

describe('anthropicMessages (oauth)', () => {
  it('sends the Claude Code headers and system blocks, without x-api-key', async () => {
    const { http, requests } = recordingHttp([json({ content: [{ type: 'text', text: 'hi' }] })]);
    const provider = anthropicMessages(http, { kind: 'oauth', token: 'T', ccVersion: CLAUDE_CODE_VERSION });
    expect(provider.id).toBe('claude-sub');
    expect(await provider.generateText({ system: 'sys', user: 'usr', model: 'm1', maxTokens: 50 })).toBe('hi');
    expect(requests[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(requests[0].headers).toMatchObject({
      authorization: 'Bearer T',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219',
      'user-agent': `claude-code/${CLAUDE_CODE_VERSION} (external, cli)`,
      'x-app': 'cli',
    });
    expect(requests[0].headers).not.toHaveProperty('x-api-key');
    expect(requests[0].body.system).toEqual([
      { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
      { type: 'text', text: 'sys' },
    ]);
  });
});

describe('mapHttpError (extra usage)', () => {
  it('maps a 400 mentioning extra usage to quota_exceeded', () => {
    expect(mapHttpError(400, 'You are out of extra usage', new Headers())).toMatchObject({ kind: 'quota_exceeded' });
    expect(mapHttpError(400, 'bad request', new Headers())).toMatchObject({ kind: 'provider_error' });
  });
});

describe('parseTokenResponse without expires_in', () => {
  // The Codex CLI reads the expiry from the access token itself; its refresh replies can leave expires_in out.
  const jwtWithExp = (exp: number) => `x.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.y`;

  it('takes the expiry from the access token when it is a JWT', () => {
    const tokens = parseTokenResponse({ access_token: jwtWithExp(5000), refresh_token: 'r' }, 1_000_000);
    expect(tokens.expiresAt).toBe(5_000_000);
  });

  it('assumes one hour when the reply and the token say nothing', () => {
    const tokens = parseTokenResponse({ access_token: 'opaque', refresh_token: 'r' }, 1_000_000);
    expect(tokens.expiresAt).toBe(1_000_000 + 3600_000);
  });
});
