// Tests for building the active AI provider from settings + stored credentials (src/ai/registry.ts).
// Uses a real SQLite schema for settings and an in-memory secure store.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockStore.set(key, value),
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));

import { openTestDb } from '../helpers/sqlite';
import { migrate } from '@/db/migrate';
import { setSetting } from '@/db/settings';
import { saveCredential } from '@/ai/credentials';
import { getActiveProvider, testConnection } from '@/ai/registry';
import { DEFAULT_MODELS } from '@/ai/providers/errors';
import { AiError, type AiProvider } from '@/ai/types';

const http = jest.fn() as unknown as typeof fetch;

async function freshDb() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

beforeEach(() => mockStore.clear());

describe('getActiveProvider', () => {
  it('returns null when no provider is chosen', async () => {
    expect(await getActiveProvider(await freshDb(), http)).toBeNull();
  });

  it('builds the Claude key provider with the default model', async () => {
    const db = await freshDb();
    await setSetting(db, 'activeProvider', 'claude-key');
    await saveCredential('claude-key', { kind: 'apiKey', key: 'sk' });
    const active = await getActiveProvider(db, http);
    expect(active?.provider.id).toBe('claude-key');
    expect(active?.model).toBe(DEFAULT_MODELS['claude-key']);
  });

  it('uses the model chosen in settings', async () => {
    const db = await freshDb();
    await setSetting(db, 'activeProvider', 'gemini-key');
    await setSetting(db, 'model.gemini-key', 'custom-model');
    await saveCredential('gemini-key', { kind: 'apiKey', key: 'g' });
    expect((await getActiveProvider(db, http))?.model).toBe('custom-model');
  });

  it('returns null when the active provider has no credential', async () => {
    const db = await freshDb();
    await setSetting(db, 'activeProvider', 'chatgpt-sub');
    expect(await getActiveProvider(db, http)).toBeNull();
  });
});

describe('testConnection', () => {
  const replying = (text: string): AiProvider => ({ id: 'claude-key', generateText: async () => text });

  it('passes when the reply contains ok', async () => {
    await expect(testConnection(replying(' OK. '), 'm')).resolves.toBeUndefined();
  });

  it('leaves room for the model to think before answering', async () => {
    const generateText = jest.fn(async () => 'ok');
    await testConnection({ id: 'claude-key', generateText }, 'm');
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 1024 }));
  });

  it('fails with bad_output otherwise', async () => {
    await expect(testConnection(replying('hello'), 'm')).rejects.toMatchObject({ kind: 'bad_output' });
    await expect(testConnection(replying('hello'), 'm')).rejects.toBeInstanceOf(AiError);
  });
});
