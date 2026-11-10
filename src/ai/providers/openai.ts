// ChatGPT models via the OpenAI Responses API with a platform API key.
// Plugged into the pipeline as an AiProvider; text goes on to src/ai/enrichment.ts.
import type { AiProvider } from '@/ai/types';
import type { Http } from '@/core/types';
import { postJson, requireText } from '@/ai/providers/errors';

type ResponsesResult = {
  output_text?: string;
  output?: { content?: { text?: string }[] }[];
};

export function openaiKeyProvider(http: Http, key: string): AiProvider {
  return {
    id: 'openai-key',
    async generateText({ system, user, model, maxTokens }) {
      const data = (await postJson(
        http,
        'https://api.openai.com/v1/responses',
        { authorization: `Bearer ${key}` },
        { model, instructions: system, input: user, max_output_tokens: maxTokens },
      )) as ResponsesResult;
      // `output_text` is a convenience some responses carry; otherwise assemble it from the output items.
      const text =
        data.output_text ??
        (data.output ?? []).flatMap((item) => item.content ?? []).map((part) => part.text ?? '').join('');
      return requireText(text);
    },
  };
}
