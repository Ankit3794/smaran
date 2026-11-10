// The contract every AI provider (Claude, ChatGPT, Gemini) fulfils, plus the one error type they all throw.
// Providers turn a prompt into text; src/ai/enrichment.ts turns that text into a validated Enrichment.
import type { Source } from '@/core/types';

export type { Enrichment } from '@/core/types';

export type ProviderId = 'claude-sub' | 'claude-key' | 'chatgpt-sub' | 'openai-key' | 'gemini-sub' | 'gemini-key';

export type AiErrorKind =
  | 'auth_expired'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'network'
  | 'bad_output'
  | 'provider_error'
  | 'not_connected';

// `kind` lets the pipeline decide whether to retry, wait or ask the user to reconnect;
// `resetAt` (epoch ms) says when a quota or rate limit lifts, when the provider told us.
export class AiError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
    public readonly resetAt?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

// What a subscription sign-in gives us; `expiresAt` is epoch ms. Stored in secure storage, never in the database.
export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
  projectId?: string;
};

export interface AiProvider {
  id: ProviderId;
  generateText(request: { system: string; user: string; model: string; maxTokens: number }): Promise<string>;
}

export interface EnrichInput {
  source: Source;
  author?: string;
  title?: string;
  text: string;
  note?: string;
  topics: { name: string; count: number }[];
  tags: string[];
}
