// Claude subscription sign-in: builds the authorize URL, trades the pasted code for tokens, and refreshes them.
// Uses Claude Code's public OAuth client; tokens it returns are stored by the settings flow and used by anthropic.ts.
import { AiError, type OAuthTokens } from '@/ai/types';
import type { Http } from '@/core/types';
import { mapHttpError } from '@/ai/providers/errors';

// Claude Code release current on 2026-11-10 (npm @anthropic-ai/claude-code). Sent in the user-agent so requests look like Claude Code.
export const CLAUDE_CODE_VERSION = '2.1.322';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const TOKEN_URLS = ['https://platform.claude.com/v1/oauth/token', 'https://console.anthropic.com/v1/oauth/token'];

type Pkce = { verifier: string; challenge: string; state: string };
type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; account?: { uuid?: string } };

export function claudeAuthUrl(pkce: Pkce): string {
  const params = new URLSearchParams({
    code: 'true',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'org:create_api_key user:profile user:inference',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state: pkce.state,
  });
  return `https://claude.ai/oauth/authorize?${params.toString()}`;
}

// Tries each token URL in turn, moving on only when the URL does not exist (404): the endpoint has moved before.
async function postTokenRequest(http: Http, body: unknown, now: number): Promise<OAuthTokens> {
  for (const url of TOKEN_URLS) {
    let response: Response;
    try {
      response = await http(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'User-Agent': 'axios/1.7.9' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new AiError('network', error instanceof Error ? error.message : 'network request failed');
    }
    if (response.status === 404 && url !== TOKEN_URLS[TOKEN_URLS.length - 1]) continue;
    const text = await response.text();
    if (!response.ok) throw mapHttpError(response.status, text, response.headers);
    let data: TokenResponse;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AiError('bad_output', 'Sign-in returned a non-JSON response');
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now + data.expires_in * 1000,
      accountId: data.account?.uuid,
    };
  }
  throw new AiError('provider_error', 'No token endpoint answered');
}

// The sign-in page shows "code#state"; the user pastes it back into the app.
export async function claudeExchange(http: Http, pastedCode: string, pkce: Pkce, now = Date.now()): Promise<OAuthTokens> {
  const [code, state] = pastedCode.trim().split('#');
  if (!code || state !== pkce.state) {
    throw new AiError('auth_expired', "The code didn't match — start sign-in again");
  }
  return postTokenRequest(
    http,
    {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      state,
      redirect_uri: REDIRECT_URI,
      code_verifier: pkce.verifier,
    },
    now,
  );
}

export function claudeRefresh(http: Http, refreshToken: string, now = Date.now()): Promise<OAuthTokens> {
  return postTokenRequest(http, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID }, now);
}
