// Gemini subscription sign-in with the Gemini CLI's public installed-app OAuth client (Google account, Code Assist).
// Builds the authorize URL, trades the pasted code for tokens, and refreshes them; used by src/ai/providers/codeAssist.ts.
import { AiError, type OAuthTokens } from '@/ai/types';
import type { Http } from '@/core/types';
import { mapHttpError } from '@/ai/providers/errors';
import { parseTokenResponse } from '@/ai/auth/tokens';

const CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
// An installed-app secret: Google documents that these are not confidential.
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://codeassist.google.com/authcode';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

type Pkce = { verifier: string; challenge: string; state: string };

export function googleAuthUrl(pkce: Pkce): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    // offline + consent make Google hand back a refresh token every time.
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state: pkce.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function postForm(http: Http, form: Record<string, string>, now: number, previous?: { refreshToken: string }): Promise<OAuthTokens> {
  let response: Response;
  try {
    response = await http(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  } catch (error) {
    throw new AiError('network', error instanceof Error ? error.message : 'network request failed');
  }
  const text = await response.text();
  if (!response.ok) throw mapHttpError(response.status, text, response.headers);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AiError('bad_output', 'Sign-in returned a non-JSON response');
  }
  return parseTokenResponse(data, now, previous);
}

// Google's authcode page shows only the code (no "#state"), so there is no state to compare here;
// PKCE still binds the code to our verifier, which is what stops a stolen code being redeemed.
export function googleExchange(http: Http, pastedCode: string, pkce: Pkce, now = Date.now()): Promise<OAuthTokens> {
  return postForm(
    http,
    {
      code: pastedCode.trim(),
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: pkce.verifier,
    },
    now,
  );
}

// Google omits refresh_token on refresh, so the old one is carried over.
export function googleRefresh(http: Http, refreshToken: string, now = Date.now()): Promise<OAuthTokens> {
  return postForm(
    http,
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
    now,
    { refreshToken },
  );
}
