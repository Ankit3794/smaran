// Tests Gemini subscription sign-in (Google OAuth) and the Code Assist setup and generate calls.
// Covers src/ai/auth/googleOAuth.ts and src/ai/providers/codeAssist.ts with a recording fake Http.
import { googleAuthUrl, googleExchange, googleRefresh } from '@/ai/auth/googleOAuth';
import { codeAssistProvider, codeAssistSetup } from '@/ai/providers/codeAssist';
import type { Http } from '@/core/types';
import type { OAuthTokens } from '@/ai/types';

const CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const SECRET = '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';
const BASE = 'https://cloudcode-pa.googleapis.com/v1internal';
const METADATA = { ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' };

function recordingHttp(responses: Response[]) {
  const requests: { url: string; headers: Record<string, string>; text: string }[] = [];
  const http: Http = async (input, init) => {
    requests.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, text: String(init?.body) });
    return responses[requests.length - 1];
  };
  return { http, requests };
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const pkce = { verifier: 'the-verifier', challenge: 'the-challenge', state: 'the-state' };
const noSleep = async () => {};

describe('googleAuthUrl', () => {
  it('uses the Gemini CLI client, offline consent, S256 and state', () => {
    const url = new URL(googleAuthUrl(pkce));
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe(CLIENT_ID);
    expect(p.get('redirect_uri')).toBe('https://codeassist.google.com/authcode');
    expect(p.get('response_type')).toBe('code');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('prompt')).toBe('consent');
    expect(p.get('scope')).toBe(
      'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    );
    expect(p.get('code_challenge')).toBe('the-challenge');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('state')).toBe('the-state');
  });
});

describe('googleExchange / googleRefresh', () => {
  it('posts a form with secret and verifier, trimming the pasted code', async () => {
    const { http, requests } = recordingHttp([json({ access_token: 'A', refresh_token: 'R', expires_in: 3600 })]);
    const tokens = await googleExchange(http, '  4/abc  \n', pkce, 1000);
    expect(tokens).toEqual({ accessToken: 'A', refreshToken: 'R', expiresAt: 1000 + 3600_000 });
    expect(requests[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(requests[0].headers['content-type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(requests[0].text);
    expect(Object.fromEntries(form)).toEqual({
      code: '4/abc',
      client_id: CLIENT_ID,
      client_secret: SECRET,
      redirect_uri: 'https://codeassist.google.com/authcode',
      grant_type: 'authorization_code',
      code_verifier: 'the-verifier',
    });
  });

  it('refresh keeps the old refresh token when Google omits it', async () => {
    const { http, requests } = recordingHttp([json({ access_token: 'B', expires_in: 3600 })]);
    const tokens = await googleRefresh(http, 'old-refresh', 0);
    expect(tokens.refreshToken).toBe('old-refresh');
    expect(tokens.accessToken).toBe('B');
    expect(Object.fromEntries(new URLSearchParams(requests[0].text))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
      client_id: CLIENT_ID,
      client_secret: SECRET,
    });
  });

  it('maps a dead refresh token to auth_expired', async () => {
    const { http } = recordingHttp([json({ error: 'invalid_grant' }, 400)]);
    await expect(googleRefresh(http, 'dead')).rejects.toMatchObject({ kind: 'auth_expired' });
  });
});

describe('codeAssistSetup', () => {
  it('uses the project from loadCodeAssist when present (string)', async () => {
    const { http, requests } = recordingHttp([json({ cloudaicompanionProject: 'proj-1', currentTier: { id: 'standard-tier' } })]);
    const result = await codeAssistSetup(http, 'TOKEN', { sleep: noSleep });
    expect(result.projectId).toBe('proj-1');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE}:loadCodeAssist`);
    expect(requests[0].headers.Authorization).toBe('Bearer TOKEN');
    expect(JSON.parse(requests[0].text)).toEqual({ metadata: METADATA });
  });

  it('accepts a project object with an id', async () => {
    const { http } = recordingHttp([json({ cloudaicompanionProject: { id: 'proj-2' } })]);
    expect((await codeAssistSetup(http, 'T', { sleep: noSleep })).projectId).toBe('proj-2');
  });

  it('onboards the default tier and polls until done', async () => {
    const { http, requests } = recordingHttp([
      json({ allowedTiers: [{ id: 'standard-tier' }, { id: 'free-tier', isDefault: true }] }),
      json({ done: false }),
      json({ done: true, response: { cloudaicompanionProject: { id: 'new-proj' } } }),
    ]);
    const sleeps: number[] = [];
    const result = await codeAssistSetup(http, 'T', { sleep: async (ms) => void sleeps.push(ms) });
    expect(result).toEqual({ projectId: 'new-proj', tier: 'free-tier' });
    expect(requests.map((r) => r.url)).toEqual([`${BASE}:loadCodeAssist`, `${BASE}:onboardUser`, `${BASE}:onboardUser`]);
    expect(JSON.parse(requests[1].text)).toEqual({ tierId: 'free-tier', metadata: METADATA });
    expect(sleeps).toEqual([2000]);
  });

  it('gives up after maxPolls', async () => {
    const { http } = recordingHttp([json({ allowedTiers: [{ id: 'free-tier', isDefault: true }] }), ...Array.from({ length: 5 }, () => json({ done: false }))]);
    await expect(codeAssistSetup(http, 'T', { sleep: noSleep, maxPolls: 3 })).rejects.toMatchObject({
      kind: 'provider_error',
      message: 'Google account setup did not finish — try again',
    });
  });
});

describe('codeAssistProvider', () => {
  const tokens: OAuthTokens = { accessToken: 'TOKEN', refreshToken: 'R', expiresAt: 0, projectId: 'proj-1' };
  const request = { system: 'be brief', user: 'hello', model: 'gemini-3.5-flash-lite', maxTokens: 123 };

  it('wraps the request and joins the candidate text parts', async () => {
    const { http, requests } = recordingHttp([
      json({ response: { candidates: [{ content: { parts: [{ text: 'Hel' }, { text: 'lo' }] } }] } }),
    ]);
    const text = await codeAssistProvider(http, async () => tokens).generateText(request);
    expect(text).toBe('Hello');
    expect(requests[0].url).toBe(`${BASE}:generateContent`);
    expect(requests[0].headers.Authorization).toBe('Bearer TOKEN');
    const body = JSON.parse(requests[0].text);
    expect(body.user_prompt_id).toEqual(expect.any(String));
    expect(body.user_prompt_id.length).toBeGreaterThan(8);
    expect(body).toMatchObject({
      model: 'gemini-3.5-flash-lite',
      project: 'proj-1',
      request: {
        systemInstruction: { parts: [{ text: 'be brief' }] },
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        generationConfig: { maxOutputTokens: 123 },
      },
    });
  });

  it('needs a project id', async () => {
    const { http } = recordingHttp([]);
    const provider = codeAssistProvider(http, async () => ({ ...tokens, projectId: undefined }));
    await expect(provider.generateText(request)).rejects.toMatchObject({ kind: 'not_connected', message: 'Finish Google sign-in again' });
  });

  it('maps HTTP errors and empty text', async () => {
    const failing = recordingHttp([json({ error: 'x' }, 401)]);
    await expect(codeAssistProvider(failing.http, async () => tokens).generateText(request)).rejects.toMatchObject({ kind: 'auth_expired' });
    const empty = recordingHttp([json({ response: { candidates: [] } })]);
    await expect(codeAssistProvider(empty.http, async () => tokens).generateText(request)).rejects.toMatchObject({ kind: 'bad_output' });
  });
});
