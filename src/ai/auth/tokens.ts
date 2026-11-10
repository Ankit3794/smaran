// Turns a sign-in server's token reply into our OAuthTokens, rejecting replies that lack the essentials.
// Shared by the Claude and ChatGPT sign-in modules so both validate the same way.
import { decodeBase64url } from '@/ai/auth/pkce';
import { AiError, type OAuthTokens } from '@/ai/types';

// Used when a reply says nothing about expiry; refreshing a little early is harmless.
const ASSUMED_LIFETIME_MS = 3600 * 1000;

// Reads the claims of a JWT access token, or null for an opaque token. The claims we read (exp, account id) are
// ASCII, so the bytes are turned into text directly; TextDecoder is not available on every React Native engine.
export function jwtClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  const bytes = payload === undefined ? undefined : decodeBase64url(payload);
  if (bytes === undefined) return null;
  try {
    const claims = JSON.parse(String.fromCharCode(...bytes));
    return typeof claims === 'object' && claims !== null ? claims : null;
  } catch {
    return null;
  }
}

// expires_in if the server sent it; otherwise the token's own exp claim (the Codex CLI does the same); else a guess.
function expiryOf(data: Record<string, unknown>, accessToken: string, now: number): number {
  if (typeof data.expires_in === 'number') return now + data.expires_in * 1000;
  const exp = jwtClaims(accessToken)?.exp;
  return typeof exp === 'number' ? exp * 1000 : now + ASSUMED_LIFETIME_MS;
}

// A refresh reply may omit refresh_token; then the old one stays valid, so `previous` carries it over.
export function parseTokenResponse(json: unknown, now: number, previous?: { refreshToken: string }): OAuthTokens {
  const data = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
  const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : previous?.refreshToken;
  if (typeof data.access_token !== 'string' || refreshToken === undefined) {
    throw new AiError('bad_output', 'Sign-in server sent an unexpected reply');
  }
  return { accessToken: data.access_token, refreshToken, expiresAt: expiryOf(data, data.access_token, now) };
}
