// ChatGPT subscription via the Codex backend (Responses API over server-sent events).
// Plugged into the pipeline as an AiProvider; text goes on to src/ai/enrichment.ts.
import { AiError, type AiProvider, type OAuthTokens } from '@/ai/types';
import type { Http } from '@/core/types';
import { mapHttpError, requireText } from '@/ai/providers/errors';

const RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';

type StreamEvent = {
  type?: string;
  delta?: string;
  response?: { output?: { content?: { type?: string; text?: string }[] }[] };
};

// React Native's fetch can't stream, so the whole body is read first. Events are separated by blank lines,
// and each carries its JSON on a `data:` line.
function parseEvents(body: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try {
        events.push(JSON.parse(line.slice(5).trim()));
      } catch {
        // Non-JSON data such as "[DONE]" carries no text.
      }
    }
  }
  return events;
}

// Prefer the final text in response.completed; fall back to the streamed deltas.
function extractText(events: StreamEvent[]): string {
  const completed = events.find((event) => event.type === 'response.completed');
  const finalText = (completed?.response?.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('');
  if (finalText !== '') return finalText;
  return events
    .filter((event) => event.type === 'response.output_text.delta')
    .map((event) => event.delta ?? '')
    .join('');
}

export function codexProvider(http: Http, getToken: () => Promise<OAuthTokens>): AiProvider {
  return {
    id: 'chatgpt-sub',
    async generateText({ system, user, model }) {
      const tokens = await getToken();
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
        originator: 'codex_cli_rs',
        'User-Agent': 'codex_cli_rs/0.0.0 (Smaran)',
        Accept: 'text/event-stream',
      };
      if (tokens.accountId) headers['ChatGPT-Account-ID'] = tokens.accountId;
      let response: Response;
      try {
        response = await http(RESPONSES_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            instructions: system,
            input: [{ role: 'user', content: [{ type: 'input_text', text: user }] }],
            store: false,
            stream: true,
          }),
        });
      } catch (error) {
        throw new AiError('network', error instanceof Error ? error.message : 'network request failed');
      }
      const body = await response.text();
      if (!response.ok) throw mapHttpError(response.status, body, response.headers);
      return requireText(extractText(parseEvents(body)));
    },
  };
}
