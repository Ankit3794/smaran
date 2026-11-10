// Tests the AI enrichment contract: the prompt we build and the repairs/validation applied to the AI's reply.
// Sits between the extractors (input text) and the save pipeline (parsed Enrichment).
import { AiError } from '@/ai/types';
import { buildEnrichmentPrompt, enrich, parseEnrichment } from '@/ai/enrichment';
import type { AiProvider, EnrichInput } from '@/ai/types';

const GOOD = { summary: 'A short summary', brief: 'Two sentences here.', topic: 'Trading', tags: ['options', 'crypto'] };

function baseInput(overrides: Partial<EnrichInput> = {}): EnrichInput {
  return { source: 'web', text: 'hello', topics: [], tags: [], ...overrides };
}

function badOutputFrom(raw: string): AiError {
  try {
    parseEnrichment(raw);
  } catch (error) {
    return error as AiError;
  }
  throw new Error('expected parseEnrichment to throw');
}

describe('parseEnrichment', () => {
  test('parses plain JSON', () => {
    expect(parseEnrichment(JSON.stringify(GOOD))).toEqual(GOOD);
  });

  test('parses fenced output', () => {
    expect(parseEnrichment('```json\n' + JSON.stringify(GOOD) + '\n```')).toEqual(GOOD);
  });

  test('parses output with leading prose', () => {
    expect(parseEnrichment('Sure! Here you go:\n' + JSON.stringify(GOOD))).toEqual(GOOD);
  });

  test('cuts a 140-character summary at a word boundary with an ellipsis', () => {
    const summary = 'word '.repeat(28).trim();
    expect(summary.length).toBe(139);
    const result = parseEnrichment(JSON.stringify({ ...GOOD, summary }));
    expect(result.summary.length).toBeLessThanOrEqual(90);
    expect(result.summary.endsWith('…')).toBe(true);
    expect(result.summary.slice(0, -1).endsWith('word')).toBe(true);
  });

  test('puts a multi-line summary on one line', () => {
    expect(parseEnrichment(JSON.stringify({ ...GOOD, summary: ' a\nb ' })).summary).toBe('a b');
  });

  test('normalizes tags: trim, lowercase, dedupe, keep first 4', () => {
    const result = parseEnrichment(JSON.stringify({ ...GOOD, tags: ['Options', '  Crypto ', 'a', 'b', 'c'] }));
    expect(result.tags).toEqual(['options', 'crypto', 'a', 'b']);
  });

  test('accepts fewer than 2 tags', () => {
    expect(parseEnrichment(JSON.stringify({ ...GOOD, tags: ['one'] })).tags).toEqual(['one']);
  });

  test('missing topic raises bad_output', () => {
    const { topic, ...withoutTopic } = GOOD;
    expect(badOutputFrom(JSON.stringify(withoutTopic)).kind).toBe('bad_output');
  });

  test('not json raises bad_output', () => {
    const error = badOutputFrom('not json');
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe('bad_output');
  });
});

describe('buildEnrichmentPrompt', () => {
  test('truncates to 6000 characters without splitting a surrogate pair', () => {
    const text = 'a'.repeat(5999) + '😀' + 'tail';
    const { user } = buildEnrichmentPrompt(baseInput({ text }));
    const content = user.split('CONTENT:\n')[1];
    expect(Array.from(content).length).toBe(6000);
    expect(content.endsWith('😀')).toBe(true);
    expect(content).not.toMatch(/[\uD800-\uDBFF]$/);
    const emojiAtBoundary = buildEnrichmentPrompt(baseInput({ text: 'a'.repeat(5998) + '😀😀' })).user;
    expect(emojiAtBoundary).toContain('😀');
  });

  test('lists existing topics with counts and tags', () => {
    const { user } = buildEnrichmentPrompt(baseInput({ topics: [{ name: 'Trading', count: 24 }], tags: ['a', 'b'] }));
    expect(user).toContain('- Trading (24)');
    expect(user).toContain('EXISTING TAGS: a, b');
  });

  test('adds the strong-mismatch rule only with more than 15 topics', () => {
    const topics = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `T${i}`, count: 1 }));
    expect(buildEnrichmentPrompt(baseInput({ topics: topics(16) })).system).toContain('strong mismatch');
    expect(buildEnrichmentPrompt(baseInput({ topics: topics(15) })).system).not.toContain('strong mismatch');
  });
});

describe('enrich', () => {
  test('calls the provider with maxTokens 50,000 and parses the reply', async () => {
    const calls: { maxTokens: number; model: string }[] = [];
    const provider: AiProvider = {
      id: 'claude-key',
      generateText: async (req) => {
        calls.push(req);
        return JSON.stringify(GOOD);
      },
    };
    expect(await enrich(provider, 'm1', baseInput())).toEqual(GOOD);
    // Room for the model's thinking as well as the short JSON answer (thinking counts against the limit).
    expect(calls).toEqual([expect.objectContaining({ maxTokens: 50_000, model: 'm1' })]);
  });

  test('provider errors propagate unchanged', async () => {
    const failure = new AiError('quota_exceeded', 'limit', 123);
    const provider: AiProvider = { id: 'claude-key', generateText: async () => { throw failure; } };
    await expect(enrich(provider, 'm', baseInput())).rejects.toBe(failure);
  });
});
