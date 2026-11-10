// Turns a sign-in server's token reply into our OAuthTokens, rejecting replies that lack the essentials.
// Shared by the Claude and ChatGPT sign-in modules so both validate the same way.
import { AiError, type OAuthTokens } from '@/ai/types';

// A refresh reply may omit refresh_token; then the old one stays valid, so `previous` carries it over.
export function parseTokenResponse(json: unknown, now: number, previous?: { refreshToken: string }): OAuthTokens {
  const data = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
  const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : previous?.refreshToken;
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number' || refreshToken === undefined) {
    throw new AiError('bad_output', 'Sign-in server sent an unexpected reply');
  }
  return { accessToken: data.access_token, refreshToken, expiresAt: now + data.expires_in * 1000 };
}
