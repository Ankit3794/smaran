// Claude via the Messages API, using an API key or a subscription OAuth token.
// Plugged into the pipeline as an AiProvider; text goes on to src/ai/enrichment.ts.
import type { AiProvider } from '@/ai/types';
import type { Http } from '@/core/types';
import { postJson, requireText } from '@/ai/providers/errors';

type AnthropicAuth = { kind: 'key'; key: string } | { kind: 'oauth'; token: string; ccVersion: string };

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

type MessagesResponse = { content?: { type: string; text?: string }[] };

export function anthropicMessages(http: Http, auth: AnthropicAuth): AiProvider {
  return {
    id: auth.kind === 'key' ? 'claude-key' : 'claude-sub',
    async generateText({ system, user, model, maxTokens }) {
      const messages = [{ role: 'user', content: user }];
      // Subscription tokens are only accepted for requests that identify as Claude Code,
      // hence the extra system block, the beta flags and the user-agent.
      const data = (await (auth.kind === 'key'
        ? postJson(
            http,
            MESSAGES_URL,
            { 'x-api-key': auth.key, 'anthropic-version': '2023-06-01' },
            { model, max_tokens: maxTokens, system, messages },
          )
        : postJson(
            http,
            MESSAGES_URL,
            {
              authorization: `Bearer ${auth.token}`,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219',
              'user-agent': `claude-code/${auth.ccVersion} (external, cli)`,
              'x-app': 'cli',
            },
            {
              model,
              max_tokens: maxTokens,
              system: [{ type: 'text', text: CLAUDE_CODE_IDENTITY }, { type: 'text', text: system }],
              messages,
            },
          ))) as MessagesResponse;
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      return requireText(text);
    },
  };
}
