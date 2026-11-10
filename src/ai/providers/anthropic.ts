// Claude via the Messages API, using an API key (or, from Task 9/10, a subscription OAuth token).
// Plugged into the pipeline as an AiProvider; text goes on to src/ai/enrichment.ts.
import { AiError, type AiProvider } from '@/ai/types';
import type { Http } from '@/core/types';
import { postJson, requireText } from '@/ai/providers/errors';

type AnthropicAuth = { kind: 'key'; key: string } | { kind: 'oauth'; token: string; ccVersion: string };

type MessagesResponse = { content?: { type: string; text?: string }[] };

export function anthropicMessages(http: Http, auth: AnthropicAuth): AiProvider {
  return {
    id: auth.kind === 'key' ? 'claude-key' : 'claude-sub',
    async generateText({ system, user, model, maxTokens }) {
      if (auth.kind === 'oauth') {
        throw new AiError('not_connected', 'Claude subscription sign-in is added in a later step');
      }
      const data = (await postJson(
        http,
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': auth.key, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] },
      )) as MessagesResponse;
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      return requireText(text);
    },
  };
}
