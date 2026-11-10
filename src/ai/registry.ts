// Builds the AI provider the user picked in Settings (setting `activeProvider`) from its stored credential.
// The background pipeline calls getActiveProvider; the sign-in screens call keyProvider, testConnection and activateProvider.
import { AiError, type AiProvider, type ProviderId } from '@/ai/types';
import type { Http } from '@/core/types';
import type { Db } from '@/db/db';
import { rearmWaitingAi } from '@/db/saves';
import { getSetting, setSetting } from '@/db/settings';
import { freshTokens, loadCredential } from '@/ai/credentials';
import { DEFAULT_MODELS, withTimeout } from '@/ai/providers/errors';
import { anthropicMessages } from '@/ai/providers/anthropic';
import { openaiKeyProvider } from '@/ai/providers/openai';
import { geminiKeyProvider } from '@/ai/providers/gemini';
import { codexProvider } from '@/ai/providers/codex';
import { codeAssistProvider } from '@/ai/providers/codeAssist';
import { CLAUDE_CODE_VERSION, claudeRefresh } from '@/ai/auth/claudeOAuth';
import { codexRefresh } from '@/ai/auth/codexOAuth';
import { googleRefresh } from '@/ai/auth/googleOAuth';

// Claude subscription tokens expire often, so refresh (if needed) right before each request.
function claudeSubscriptionProvider(http: Http): AiProvider {
  return {
    id: 'claude-sub',
    async generateText(request) {
      const tokens = await freshTokens('claude-sub', (refreshToken) => claudeRefresh(http, refreshToken));
      const provider = anthropicMessages(http, { kind: 'oauth', token: tokens.accessToken, ccVersion: CLAUDE_CODE_VERSION });
      return provider.generateText(request);
    },
  };
}

// Generous for a one-line summary, short enough that one dead connection cannot hold up the queue for long.
const AI_TIMEOUT_MS = 90_000;

// An API-key provider from a key in hand. ApiKeyForm uses it to test a pasted key before storing anything.
export function keyProvider(id: 'claude-key' | 'openai-key' | 'gemini-key', http: Http, key: string): AiProvider {
  switch (id) {
    case 'claude-key':
      return anthropicMessages(http, { kind: 'key', key });
    case 'openai-key':
      return openaiKeyProvider(http, key);
    case 'gemini-key':
      return geminiKeyProvider(http, key);
  }
}

async function buildProvider(id: ProviderId, http: Http): Promise<AiProvider | null> {
  const credential = await loadCredential(id);
  if (credential === null) return null;

  switch (id) {
    case 'claude-key':
    case 'openai-key':
    case 'gemini-key':
      return credential.kind === 'apiKey' ? keyProvider(id, http, credential.key) : null;
    case 'claude-sub':
      return credential.kind === 'oauth' ? claudeSubscriptionProvider(http) : null;
    case 'chatgpt-sub':
      return credential.kind === 'oauth'
        ? codexProvider(http, () => freshTokens('chatgpt-sub', (refreshToken) => codexRefresh(http, refreshToken)))
        : null;
    case 'gemini-sub':
      return credential.kind === 'oauth'
        ? codeAssistProvider(http, () => freshTokens('gemini-sub', (refreshToken) => googleRefresh(http, refreshToken)))
        : null;
  }
}

// The last step of connecting any provider (subscription sign-in or API key), once its credential is stored:
// make it the active one, and let saves that were waiting for a provider or for a working sign-in run again.
export async function activateProvider(db: Db, id: ProviderId): Promise<void> {
  await setSetting(db, 'activeProvider', id);
  await rearmWaitingAi(db, ['not_connected', 'auth_expired']);
}

// null means "nothing usable yet"; the pipeline treats that as not_connected.
export async function getActiveProvider(db: Db, http: Http): Promise<{ provider: AiProvider; model: string } | null> {
  const id = await getSetting(db, 'activeProvider', '');
  if (id === '') return null;
  const providerId = id as ProviderId;

  // Every AI and token-refresh request of the background pipeline goes through this http, so one limit covers them all.
  const provider = await buildProvider(providerId, withTimeout(http, AI_TIMEOUT_MS));
  if (provider === null) return null;
  const model = await getSetting(db, `model.${providerId}`, DEFAULT_MODELS[providerId]);
  return { provider, model };
}

// A one-word round trip proves the credential and model work before the user relies on them.
export async function testConnection(provider: AiProvider, model: string): Promise<void> {
  const reply = await provider.generateText({ system: 'Reply with the single word ok.', user: 'ok', model, maxTokens: 5 });
  if (!reply.trim().toLowerCase().includes('ok')) throw new AiError('bad_output', 'The AI did not answer the test message');
}
