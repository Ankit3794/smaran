// ChatGPT subscription sign-in via the Codex CLI's public client and device-code flow:
// show the user a code, poll until they approve it in a browser, exchange for tokens, refresh later.
// Tokens go to the settings flow's secure storage and are used by src/ai/providers/codex.ts.
import { AiError, type OAuthTokens } from '@/ai/types';
import type { Http } from '@/core/types';
import { mapHttpError } from '@/ai/providers/errors';
import { jwtClaims, parseTokenResponse } from '@/ai/auth/tokens';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTH_BASE = 'https://auth.openai.com';
const TOKEN_URL = `${AUTH_BASE}/oauth/token`;
const REDIRECT_URI = `${AUTH_BASE}/deviceauth/callback`;
const VERIFY_URL = `${AUTH_BASE}/codex/device`;

type DeviceCode = { deviceAuthId: string; userCode: string; intervalSec: number; verifyUrl: string };

async function send(http: Http, url: string, headers: Record<string, string>, body: string): Promise<Response> {
  try {
    return await http(url, { method: 'POST', headers, body });
  } catch (error) {
    throw new AiError('network', error instanceof Error ? error.message : 'network request failed');
  }
}

// Reads a reply as JSON; a non-2xx becomes the shared AiError mapping.
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) throw mapHttpError(response.status, text, response.headers);
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('bad_output', 'Sign-in server sent an unexpected reply');
  }
}

// The Codex JWT carries the ChatGPT account id that the backend wants in a header.
export function codexAccountId(accessToken: string): string | undefined {
  const auth = jwtClaims(accessToken)?.['https://api.openai.com/auth'] as { chatgpt_account_id?: unknown } | undefined;
  return typeof auth?.chatgpt_account_id === 'string' ? auth.chatgpt_account_id : undefined;
}

function withAccountId(tokens: OAuthTokens): OAuthTokens {
  return { ...tokens, accountId: codexAccountId(tokens.accessToken) };
}

export async function codexStartDevice(http: Http): Promise<DeviceCode> {
  const response = await send(
    http,
    `${AUTH_BASE}/api/accounts/deviceauth/usercode`,
    { 'content-type': 'application/json' },
    JSON.stringify({ client_id: CLIENT_ID }),
  );
  const data = (await readJson(response)) as Record<string, unknown>;
  if (typeof data.user_code !== 'string' || typeof data.device_auth_id !== 'string') {
    throw new AiError('bad_output', 'Sign-in server sent an unexpected reply');
  }
  // Polling faster than 3 seconds is rude to the server, whatever it suggests.
  const intervalSec = Math.max(3, Number(data.interval) || 5);
  return { deviceAuthId: data.device_auth_id, userCode: data.user_code, intervalSec, verifyUrl: VERIFY_URL };
}

// Waits for the user to approve the code, then trades the resulting authorization code for tokens.
export async function codexPoll(
  http: Http,
  device: DeviceCode,
  options: { sleep: (ms: number) => Promise<void>; timeoutMs: number; now?: () => number },
): Promise<OAuthTokens> {
  const now = options.now ?? Date.now;
  const deadline = now() + options.timeoutMs;
  while (now() < deadline) {
    const response = await send(
      http,
      `${AUTH_BASE}/api/accounts/deviceauth/token`,
      { 'content-type': 'application/json' },
      JSON.stringify({ device_auth_id: device.deviceAuthId, user_code: device.userCode }),
    );
    // 403/404 just mean "not approved yet".
    if (response.status === 403 || response.status === 404) {
      await options.sleep(device.intervalSec * 1000);
      continue;
    }
    const approved = (await readJson(response)) as Record<string, unknown>;
    if (typeof approved.authorization_code !== 'string' || typeof approved.code_verifier !== 'string') {
      throw new AiError('bad_output', 'Sign-in server sent an unexpected reply');
    }
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: approved.authorization_code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: approved.code_verifier,
    });
    const exchange = await send(http, TOKEN_URL, { 'content-type': 'application/x-www-form-urlencoded' }, form.toString());
    return withAccountId(parseTokenResponse(await readJson(exchange), now()));
  }
  throw new AiError('auth_expired', 'Sign-in timed out — start again');
}

export async function codexRefresh(http: Http, refreshToken: string, now = Date.now()): Promise<OAuthTokens> {
  const response = await send(
    http,
    TOKEN_URL,
    { 'content-type': 'application/json' },
    JSON.stringify({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'openid profile email' }),
  );
  return withAccountId(parseTokenResponse(await readJson(response), now, { refreshToken }));
}
