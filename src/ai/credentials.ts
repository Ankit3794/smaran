// Saves provider credentials (API keys, OAuth tokens) in Android's encrypted storage via expo-secure-store,
// and hands out OAuth tokens that are fresh enough to use. Read by src/ai/registry.ts when it builds the provider.
import * as SecureStore from 'expo-secure-store';
import { AiError, type OAuthTokens, type ProviderId } from '@/ai/types';

export type Credential = { kind: 'oauth'; tokens: OAuthTokens } | { kind: 'apiKey'; key: string };

// Refresh this long before expiry so a request never starts with a token about to die.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// SecureStore keys may only contain letters, digits, ".", "-" and "_"; provider ids fit.
const storageKey = (id: ProviderId) => `cred.${id}`;

export async function loadCredential(id: ProviderId): Promise<Credential | null> {
  const stored = await SecureStore.getItemAsync(storageKey(id));
  return stored === null ? null : (JSON.parse(stored) as Credential);
}

export async function saveCredential(id: ProviderId, credential: Credential): Promise<void> {
  await SecureStore.setItemAsync(storageKey(id), JSON.stringify(credential));
}

export async function removeCredential(id: ProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(id));
}

// Refresh tokens are often single-use, so two simultaneous refreshes would kill the login.
// Callers that arrive while a refresh is running share its promise instead of starting another.
const refreshesInFlight = new Map<ProviderId, Promise<OAuthTokens>>();

export async function freshTokens(
  id: ProviderId,
  refresher: (refreshToken: string) => Promise<OAuthTokens>,
  now = Date.now(),
): Promise<OAuthTokens> {
  const inFlight = refreshesInFlight.get(id);
  if (inFlight) return inFlight;

  const credential = await loadCredential(id);
  if (credential?.kind !== 'oauth') throw new AiError('not_connected', 'Not signed in');
  const old = credential.tokens;
  if (old.expiresAt - now >= REFRESH_MARGIN_MS) return old;

  // Another caller may have started a refresh while we were loading.
  const racing = refreshesInFlight.get(id);
  if (racing) return racing;

  const refresh = (async () => {
    const result = await refresher(old.refreshToken);
    // The refresh response often omits account/project ids; keep the ones we already know.
    const merged = { ...old, ...result, accountId: result.accountId ?? old.accountId, projectId: result.projectId ?? old.projectId };
    // Save before resolving so the next caller (or app restart) never sees the already-used refresh token.
    await saveCredential(id, { kind: 'oauth', tokens: merged });
    return merged;
  })();
  refreshesInFlight.set(id, refresh);
  try {
    return await refresh;
  } finally {
    refreshesInFlight.delete(id);
  }
}
