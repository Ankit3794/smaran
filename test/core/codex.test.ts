// Tests ChatGPT subscription sign-in (device-code flow, refresh, account id from the JWT) and the Codex backend provider.
// Covers src/ai/auth/codexOAuth.ts and src/ai/providers/codex.ts with a recording fake of fetch.
import { codexStartDevice, codexPoll, codexRefresh, codexAccountId } from '@/ai/auth/codexOAuth';
import { codexProvider } from '@/ai/providers/codex';
import type { Http } from '@/core/types';
import type { OAuthTokens } from '@/ai/types';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

function recordingHttp(responses: Response[]) {
  const requests: { url: string; headers: Record<string, string>; body: string }[] = [];
  const http: Http = async (input, init) => {
    requests.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body) });
    return responses[requests.length - 1];
  };
  return { http, requests };
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const tokenBody = { access_token: 'A', refresh_token: 'R', expires_in: 3600 };
const device = { deviceAuthId: 'dev1', userCode: 'ABCD-1234', intervalSec: 5, verifyUrl: 'https://auth.openai.com/codex/device' };

function fakeJwt(payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

describe('codexStartDevice', () => {
  it('requests a user code and enforces a 3 second minimum interval', async () => {
    const { http, requests } = recordingHttp([json({ user_code: 'ABCD-1234', device_auth_id: 'dev1', interval: '1' })]);
    const result = await codexStartDevice(http);
    expect(requests[0].url).toBe('https://auth.openai.com/api/accounts/deviceauth/usercode');
    expect(JSON.parse(requests[0].body)).toEqual({ client_id: CLIENT_ID });
    expect(result).toEqual({ ...device, intervalSec: 3 });
  });

  it('defaults the interval to 5 seconds', async () => {
    const { http } = recordingHttp([json({ user_code: 'U', device_auth_id: 'D' })]);
    expect((await codexStartDevice(http)).intervalSec).toBe(5);
  });
});

describe('codexPoll', () => {
  it('keeps polling on 403/404, then exchanges the code with a form body', async () => {
    const sleeps: number[] = [];
    const { http, requests } = recordingHttp([
      json({}, 403),
      json({}, 404),
      json({ authorization_code: 'code1', code_verifier: 'ver1' }),
      json({ ...tokenBody, access_token: fakeJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-9' } }) }),
    ]);
    const tokens = await codexPoll(http, device, { sleep: async (ms) => void sleeps.push(ms), timeoutMs: 900_000, now: () => 1_000 });
    expect(sleeps).toEqual([5000, 5000]);
    expect(requests[0].url).toBe('https://auth.openai.com/api/accounts/deviceauth/token');
    expect(JSON.parse(requests[0].body)).toEqual({ device_auth_id: 'dev1', user_code: 'ABCD-1234' });
    expect(requests[3].url).toBe('https://auth.openai.com/oauth/token');
    expect(requests[3].headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(requests[3].body))).toEqual({
      grant_type: 'authorization_code',
      code: 'code1',
      redirect_uri: 'https://auth.openai.com/deviceauth/callback',
      client_id: CLIENT_ID,
      code_verifier: 'ver1',
    });
    expect(tokens).toMatchObject({ refreshToken: 'R', expiresAt: 1_000 + 3_600_000, accountId: 'acct-9' });
  });

  it('maps other failures', async () => {
    const { http } = recordingHttp([json({}, 500)]);
    await expect(codexPoll(http, device, { sleep: async () => {}, timeoutMs: 1000 })).rejects.toMatchObject({ kind: 'provider_error' });
  });

  it('times out as auth_expired', async () => {
    let clock = 0;
    const { http } = recordingHttp([json({}, 403), json({}, 403), json({}, 403)]);
    const sleep = async (ms: number) => void (clock += ms);
    await expect(codexPoll(http, device, { sleep, timeoutMs: 8000, now: () => clock })).rejects.toMatchObject({
      kind: 'auth_expired',
      message: 'Sign-in timed out — start again',
    });
  });

  it('rejects an exchange reply with no access_token', async () => {
    const { http } = recordingHttp([json({ authorization_code: 'c', code_verifier: 'v' }), json({ expires_in: 5 })]);
    await expect(codexPoll(http, device, { sleep: async () => {}, timeoutMs: 1000 })).rejects.toMatchObject({ kind: 'bad_output' });
  });
});

describe('codexRefresh', () => {
  it('posts the refresh grant as JSON and keeps the old refresh token if none returned', async () => {
    const { http, requests } = recordingHttp([json({ access_token: 'A2', expires_in: 60 })]);
    const tokens = await codexRefresh(http, 'old', 0);
    expect(requests[0].url).toBe('https://auth.openai.com/oauth/token');
    expect(JSON.parse(requests[0].body)).toEqual({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: 'old',
      scope: 'openid profile email',
    });
    expect(tokens).toMatchObject({ accessToken: 'A2', refreshToken: 'old', expiresAt: 60_000 });
  });

  it('maps invalid_grant to auth_expired', async () => {
    const { http } = recordingHttp([new Response('{"error":"invalid_grant"}', { status: 400 })]);
    await expect(codexRefresh(http, 'old')).rejects.toMatchObject({ kind: 'auth_expired' });
  });
});

describe('codexAccountId', () => {
  it('reads chatgpt_account_id from the JWT claim', () => {
    expect(codexAccountId(fakeJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1' } }))).toBe('acct-1');
  });

  it('returns undefined for tokens that are not usable JWTs', () => {
    expect(codexAccountId('not-a-jwt')).toBeUndefined();
    expect(codexAccountId('a.!!!.c')).toBeUndefined();
    expect(codexAccountId(fakeJwt({ other: 1 }))).toBeUndefined();
  });
});

describe('codexProvider', () => {
  const tokens: OAuthTokens = { accessToken: 'T', refreshToken: 'R', expiresAt: 0, accountId: 'acct-1' };
  const request = { system: 'sys', user: 'usr', model: 'm1', maxTokens: 50 };
  const sse = (...events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200 });

  it('sends the Codex request and reads the completed event', async () => {
    const { http, requests } = recordingHttp([
      sse(
        { type: 'response.output_text.delta', delta: 'ignored' },
        { type: 'response.completed', response: { output: [{ content: [{ type: 'output_text', text: 'hello' }] }] } },
      ),
    ]);
    const provider = codexProvider(http, async () => tokens);
    expect(provider.id).toBe('chatgpt-sub');
    expect(await provider.generateText(request)).toBe('hello');
    expect(requests[0].url).toBe('https://chatgpt.com/backend-api/codex/responses');
    expect(requests[0].headers).toMatchObject({
      Authorization: 'Bearer T',
      'ChatGPT-Account-ID': 'acct-1',
      originator: 'codex_cli_rs',
      'User-Agent': 'codex_cli_rs/0.0.0 (Smaran)',
      Accept: 'text/event-stream',
    });
    expect(JSON.parse(requests[0].body)).toEqual({
      model: 'm1',
      instructions: 'sys',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'usr' }] }],
      store: false,
      stream: true,
    });
  });

  it('falls back to joined deltas when there is no completed text', async () => {
    const { http } = recordingHttp([
      sse({ type: 'response.output_text.delta', delta: 'he' }, { type: 'response.output_text.delta', delta: 'llo' }, { type: 'response.completed', response: { output: [] } }),
    ]);
    expect(await codexProvider(http, async () => tokens).generateText(request)).toBe('hello');
  });

  it('throws bad_output when nothing came back', async () => {
    const { http } = recordingHttp([new Response('data: not json\n\ndata: [DONE]\n\n')]);
    await expect(codexProvider(http, async () => tokens).generateText(request)).rejects.toMatchObject({ kind: 'bad_output' });
  });

  it('maps non-2xx responses', async () => {
    const { http } = recordingHttp([new Response('nope', { status: 401 })]);
    await expect(codexProvider(http, async () => tokens).generateText(request)).rejects.toMatchObject({ kind: 'auth_expired' });
  });
});
