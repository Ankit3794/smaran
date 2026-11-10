// Claude via the Messages API, using an API key or a subscription OAuth token.
// Plugged into the pipeline as an AiProvider; text goes on to src/ai/enrichment.ts.
import { AiError, type AiProvider } from '@/ai/types';
import type { Http } from '@/core/types';
import { postJson, requireText } from '@/ai/providers/errors';

type AnthropicAuth = { kind: 'key'; key: string } | { kind: 'oauth'; token: string; ccVersion: string };

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

type MessagesResponse = { content?: { type: string; text?: string }[]; stop_reason?: string };

// Claude 5.x models think before answering by default, and that thinking counts against max_tokens. A one-line
// summary needs little of it, so ask for low effort: faster, cheaper, and the answer fits in the reply budget.
const OUTPUT_CONFIG = { effort: 'low' };

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
            { model, max_tokens: maxTokens, system, messages, output_config: OUTPUT_CONFIG },
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
              output_config: OUTPUT_CONFIG,
            },
          ))) as MessagesResponse;
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      // Without this, a reply that used its whole budget on thinking would only say "no text", hiding the cause.
      if (text.trim() === '' && data.stop_reason === 'max_tokens') {
        throw new AiError('bad_output', 'Claude ran out of reply space before answering (max_tokens)');
      }
      return requireText(text);
    },
  };
}
