// Tests the three API-key providers and the HTTP error mapping against a fake fetch that records requests.
// Covers the provider layer between the enrichment pipeline and the network.
import { anthropicMessages } from '@/ai/providers/anthropic';
import { openaiKeyProvider } from '@/ai/providers/openai';
import { geminiKeyProvider } from '@/ai/providers/gemini';
import { mapHttpError, DEFAULT_MODELS } from '@/ai/providers/errors';
import { AiError } from '@/ai/types';
import type { Http } from '@/core/types';

function recordingHttp(response: () => Response) {
  const requests: { url: string; headers: Record<string, string>; body: any }[] = [];
  const http: Http = async (input, init) => {
    requests.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    return response();
  };
  return { http, requests };
}

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers });
const request = { system: 'sys', user: 'usr', model: 'm1', maxTokens: 50 };

describe('anthropicMessages (key)', () => {
  it('posts the messages request and joins text blocks', async () => {
    const { http, requests } = recordingHttp(() =>
      json({ content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }] }),
    );
    const text = await anthropicMessages(http, { kind: 'key', key: 'K' }).generateText(request);
    expect(text).toBe('ab');
    expect(requests[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(requests[0].headers['x-api-key']).toBe('K');
    expect(requests[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(requests[0].body).toEqual({ model: 'm1', max_tokens: 50, system: 'sys', messages: [{ role: 'user', content: 'usr' }] });
  });

  it('rejects empty text as bad_output', async () => {
    const { http } = recordingHttp(() => json({ content: [] }));
    await expect(anthropicMessages(http, { kind: 'key', key: 'K' }).generateText(request)).rejects.toMatchObject({ kind: 'bad_output' });
  });

  it('maps a thrown fetch to network', async () => {
    const http: Http = async () => {
      throw new TypeError('offline');
    };
    await expect(anthropicMessages(http, { kind: 'key', key: 'K' }).generateText(request)).rejects.toMatchObject({ kind: 'network' });
  });

  it('maps 401, 429 usage limit and 503', async () => {
    const run = (status: number, body: string) =>
      anthropicMessages(recordingHttp(() => new Response(body, { status })).http, { kind: 'key', key: 'K' }).generateText(request);
    await expect(run(401, 'nope')).rejects.toMatchObject({ kind: 'auth_expired' });
    await expect(run(429, 'You hit your usage limit')).rejects.toMatchObject({ kind: 'quota_exceeded' });
    await expect(run(503, 'down')).rejects.toMatchObject({ kind: 'provider_error' });
  });
});

describe('openaiKeyProvider', () => {
  it('posts to /v1/responses and prefers output_text', async () => {
    const { http, requests } = recordingHttp(() => json({ output_text: 'hi' }));
    expect(await openaiKeyProvider(http, 'K').generateText(request)).toBe('hi');
    expect(requests[0].url).toBe('https://api.openai.com/v1/responses');
    expect(requests[0].headers.authorization).toBe('Bearer K');
    expect(requests[0].body).toEqual({ model: 'm1', instructions: 'sys', input: 'usr', max_output_tokens: 50 });
  });

  it('falls back to joining output[].content[].text', async () => {
    const { http } = recordingHttp(() => json({ output: [{ content: [{ text: 'x' }, { text: 'y' }] }] }));
    expect(await openaiKeyProvider(http, 'K').generateText(request)).toBe('xy');
  });
});

describe('geminiKeyProvider', () => {
  it('posts generateContent and joins the first candidate parts', async () => {
    const { http, requests } = recordingHttp(() => json({ candidates: [{ content: { parts: [{ text: 'p' }, { text: 'q' }] } }] }));
    expect(await geminiKeyProvider(http, 'K').generateText(request)).toBe('pq');
    expect(requests[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent');
    expect(requests[0].headers['x-goog-api-key']).toBe('K');
    expect(requests[0].body).toEqual({
      systemInstruction: { parts: [{ text: 'sys' }] },
      contents: [{ role: 'user', parts: [{ text: 'usr' }] }],
      generationConfig: { maxOutputTokens: 50, responseMimeType: 'application/json' },
    });
  });
});

describe('mapHttpError', () => {
  it('uses plain 429 as rate_limited and takes the latest reset among headers', () => {
    const headers = new Headers({
      'retry-after': '10',
      'anthropic-ratelimit-requests-reset': '2099-01-01T00:00:00Z',
      'anthropic-ratelimit-tokens-reset': '2098-01-01T00:00:00Z',
    });
    const error = mapHttpError(429, 'slow down', headers);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe('rate_limited');
    expect(error.resetAt).toBe(Date.parse('2099-01-01T00:00:00Z'));
  });

  it('reads retry-after as seconds and as an HTTP date', () => {
    const before = Date.now();
    const seconds = mapHttpError(429, 'quota exceeded', new Headers({ 'retry-after': '60' }));
    expect(seconds.kind).toBe('quota_exceeded');
    expect(seconds.resetAt).toBeGreaterThanOrEqual(before + 60000);
    const date = mapHttpError(429, '', new Headers({ 'retry-after': 'Wed, 21 Oct 2099 07:28:00 GMT' }));
    expect(date.resetAt).toBe(Date.parse('Wed, 21 Oct 2099 07:28:00 GMT'));
  });

  it('keeps 400 as provider_error', () => {
    expect(mapHttpError(400, 'extra usage', new Headers()).kind).toBe('provider_error');
  });
});

it('has a default model for every provider', () => {
  expect(DEFAULT_MODELS['claude-key']).toBe('claude-haiku-5-5');
  expect(Object.keys(DEFAULT_MODELS)).toHaveLength(6);
});
