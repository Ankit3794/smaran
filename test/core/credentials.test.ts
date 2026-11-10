// Tests for the credential store and single-flight token refresh (src/ai/credentials.ts).
// expo-secure-store is replaced by an in-memory Map so no device is needed.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockStore.set(key, value),
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));

import { freshTokens, loadCredential, removeCredential, saveCredential } from '@/ai/credentials';
import { AiError, type OAuthTokens } from '@/ai/types';

const NOW = 1_000_000;
const expired: OAuthTokens = { accessToken: 'old', refreshToken: 'r1', expiresAt: NOW + 60_000, accountId: 'acct' };
const renewed: OAuthTokens = { accessToken: 'new', refreshToken: 'r2', expiresAt: NOW + 3_600_000 };

beforeEach(() => mockStore.clear());

describe('credential storage', () => {
  it('round-trips and removes a credential under cred.<id>', async () => {
    await saveCredential('claude-key', { kind: 'apiKey', key: 'k' });
    expect(mockStore.has('cred.claude-key')).toBe(true);
    expect(await loadCredential('claude-key')).toEqual({ kind: 'apiKey', key: 'k' });
    await removeCredential('claude-key');
    expect(await loadCredential('claude-key')).toBeNull();
  });
});

describe('freshTokens', () => {
  it('shares one refresh between concurrent callers and stores the new tokens', async () => {
    await saveCredential('chatgpt-sub', { kind: 'oauth', tokens: expired });
    const refresher = jest.fn(async () => renewed);
    const [a, b] = await Promise.all([
      freshTokens('chatgpt-sub', refresher, NOW),
      freshTokens('chatgpt-sub', refresher, NOW),
    ]);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(a.accessToken).toBe('new');
    expect(b.accessToken).toBe('new');
    const saved = await loadCredential('chatgpt-sub');
    expect(saved).toEqual({ kind: 'oauth', tokens: { ...renewed, accountId: 'acct' } });
  });

  it('does not refresh a token that is still valid', async () => {
    const valid = { ...expired, expiresAt: NOW + 10 * 60_000 };
    await saveCredential('claude-sub', { kind: 'oauth', tokens: valid });
    const refresher = jest.fn(async () => renewed);
    expect(await freshTokens('claude-sub', refresher, NOW)).toEqual(valid);
    expect(refresher).not.toHaveBeenCalled();
  });

  it('throws not_connected without an oauth credential', async () => {
    await expect(freshTokens('claude-sub', jest.fn(), NOW)).rejects.toMatchObject({ kind: 'not_connected' });
    await saveCredential('claude-sub', { kind: 'apiKey', key: 'k' });
    await expect(freshTokens('claude-sub', jest.fn(), NOW)).rejects.toBeInstanceOf(AiError);
  });

  it('propagates a refresh failure and allows a later retry', async () => {
    await saveCredential('gemini-sub', { kind: 'oauth', tokens: expired });
    const failing = jest.fn(async () => { throw new AiError('auth_expired', 'invalid_grant'); });
    await expect(freshTokens('gemini-sub', failing, NOW)).rejects.toMatchObject({ kind: 'auth_expired' });
    const working = jest.fn(async () => renewed);
    await expect(freshTokens('gemini-sub', working, NOW)).resolves.toMatchObject({ accessToken: 'new' });
  });
});
