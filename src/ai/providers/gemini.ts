// Gemini via the generateContent API with a Google AI Studio API key.
// Plugged into the pipeline as an AiProvider; text goes on to src/ai/enrichment.ts.
import type { AiProvider } from '@/ai/types';
import type { Http } from '@/core/types';
import { postJson, requireText } from '@/ai/providers/errors';

type GenerateContentResult = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

export function geminiKeyProvider(http: Http, key: string): AiProvider {
  return {
    id: 'gemini-key',
    async generateText({ system, user, model, maxTokens }) {
      const data = (await postJson(
        http,
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { 'x-goog-api-key': key },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
        },
      )) as GenerateContentResult;
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      return requireText(parts.map((part) => part.text ?? '').join(''));
    },
  };
}
