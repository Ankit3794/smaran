// Shared plumbing for every provider in src/ai/providers: the default model per provider, HTTP error mapping
// (mapHttpError), the JSON POST helper (postJson) and the empty-text check (requireText).
// Keeps the background pipeline seeing one error vocabulary no matter which provider answered.
import { AiError, type ProviderId } from '@/ai/types';

// Cheapest fast model of each provider, checked against official docs on 2026-11-10.
// Claude: Haiku class (docs.claude.com/en/docs/about-claude/models).
// OpenAI: gpt-6-luna, "most efficient model" (developers.openai.com/api/docs/models).
// Gemini: gemini-3.5-flash-lite, fastest/cheapest 3.5 model (aistudio.google.com/docs/models).
const CLAUDE_MODEL = 'claude-haiku-5-5';
const OPENAI_MODEL = 'gpt-6-luna';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  'claude-key': CLAUDE_MODEL,
  'claude-sub': CLAUDE_MODEL,
  'openai-key': OPENAI_MODEL,
  // Codex docs (learn.chatgpt.com/docs/models) list gpt-6-luna as usable with ChatGPT sign-in;
  // verify in the device spike.
  'chatgpt-sub': OPENAI_MODEL,
  'gemini-key': GEMINI_MODEL,
  'gemini-sub': GEMINI_MODEL,
};

// The models offered by the Settings model picker, per provider family. The first entry is the default above.
// Only models checked against each provider's docs are listed; adding one is a one-line change here.
const CLAUDE_CHOICES = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 · fast' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5 · slowest' },
];
const OPENAI_CHOICES = [{ id: OPENAI_MODEL, label: 'GPT-6 Luna · fast' }];
const GEMINI_CHOICES = [{ id: GEMINI_MODEL, label: 'Gemini 3.5 Flash-Lite · fast' }];

export const MODEL_CHOICES: Record<ProviderId, Array<{ id: string; label: string }>> = {
  'claude-key': CLAUDE_CHOICES,
  'claude-sub': CLAUDE_CHOICES,
  'openai-key': OPENAI_CHOICES,
  'chatgpt-sub': OPENAI_CHOICES,
  'gemini-key': GEMINI_CHOICES,
  'gemini-sub': GEMINI_CHOICES,
};

// The latest reset time (epoch ms) the provider told us about, or undefined.
function latestResetAt(headers: Headers): number | undefined {
  const times: number[] = [];

  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const time = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
    if (!Number.isNaN(time)) times.push(time);
  }

  headers.forEach((value, name) => {
    if (name.startsWith('anthropic-ratelimit-') && name.endsWith('-reset')) {
      const time = Date.parse(value);
      if (!Number.isNaN(time)) times.push(time);
    }
  });

  return times.length > 0 ? Math.max(...times) : undefined;
}

export function mapHttpError(status: number, body: string, headers: Headers): AiError {
  const message = `HTTP ${status}: ${body.slice(0, 200)}`;
  // A dead refresh token comes back as 400 or 401 with invalid_grant: the user must sign in again.
  if ((status === 400 || status === 401) && body.includes('invalid_grant')) return new AiError('auth_expired', message);
  if (status === 401) return new AiError('auth_expired', message);
  // Claude subscriptions report an exhausted plan as a 400 rather than a 429.
  if (status === 400 && /extra usage/i.test(body)) return new AiError('quota_exceeded', message);
  if (status === 429) {
    const resetAt = latestResetAt(headers);
    const isQuota = /quota|usage limit/i.test(body);
    return new AiError(isQuota ? 'quota_exceeded' : 'rate_limited', message, resetAt);
  }
  return new AiError('provider_error', message);
}

// Shared by all providers: a network failure becomes AiError('network'), a non-2xx becomes mapHttpError.
export async function postJson(
  http: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await http(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new AiError('network', error instanceof Error ? error.message : 'network request failed');
  }
  const text = await response.text();
  if (!response.ok) throw mapHttpError(response.status, text, response.headers);
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('bad_output', 'Provider returned a non-JSON response');
  }
}

export function requireText(text: string): string {
  if (text.trim() === '') throw new AiError('bad_output', 'Provider returned no text');
  return text;
}
