// Builds the enrichment prompt and repairs/validates the AI's JSON reply.
// Data flow: extracted text -> buildEnrichmentPrompt -> provider.generateText -> parseEnrichment -> Enrichment.
import { z } from 'zod';
import type { AiProvider, EnrichInput } from '@/ai/types';
import { AiError } from '@/ai/types';
import type { Enrichment } from '@/core/types';

const MAX_CONTENT_CHARACTERS = 6000;
const MAX_EXISTING_TAGS = 50;
const MANY_TOPICS_THRESHOLD = 15;
const MAX_SUMMARY_CHARACTERS = 90;
const MAX_TAGS = 4;

const SYSTEM_PROMPT = `You file things a person saved from the internet into their personal library.
Reply with ONLY a JSON object: {"summary": string, "brief": string, "topic": string, "tags": string[]}.
- summary: one plain line, max 90 characters, saying what the thing is or says. No clickbait, no emoji.
- brief: 2-3 sentences with the useful specifics (what, who, why it matters).
- topic: pick one of the EXISTING TOPICS if any reasonably fits. Only if none fits, create a broad 1-2 word Title Case area (e.g. "Trading", "Security", "Dev Tools", "Politics"), never a narrow subject.
- tags: 2-4 lowercase tags; reuse EXISTING TAGS when they fit.
- Write in English even if the content is not.`;

const MANY_TOPICS_RULE =
  '- There are already many topics: creating a new one requires a strong mismatch with every existing topic.';

// Cuts by code point so an emoji (a surrogate pair) is never split in half.
function truncateToCodePoints(text: string, limit: number): string {
  const codePoints = Array.from(text);
  return codePoints.length <= limit ? text : codePoints.slice(0, limit).join('');
}

export function buildEnrichmentPrompt(input: EnrichInput): { system: string; user: string } {
  const system = input.topics.length > MANY_TOPICS_THRESHOLD ? `${SYSTEM_PROMPT}\n${MANY_TOPICS_RULE}` : SYSTEM_PROMPT;
  const topicLines = input.topics.map((topic) => `- ${topic.name} (${topic.count})`).join('\n');
  const user = [
    `Source: ${input.source}`,
    `Author: ${input.author ?? ''}`,
    `Title: ${input.title ?? ''}`,
    `Note: ${input.note ?? ''}`,
    `EXISTING TOPICS:\n${topicLines}`,
    `EXISTING TAGS: ${input.tags.slice(0, MAX_EXISTING_TAGS).join(', ')}`,
    `CONTENT:\n${truncateToCodePoints(input.text, MAX_CONTENT_CHARACTERS)}`,
  ].join('\n');
  return { system, user };
}

const enrichmentSchema = z.object({
  summary: z.string().min(1),
  brief: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  // Fewer than 2 tags is accepted on purpose: a thin tag list should not fail the save.
  tags: z.array(z.string()).default([]),
});

function stripCodeFences(raw: string): string {
  return raw.replace(/```[a-zA-Z]*/g, '');
}

function oneLineSummary(summary: string): string {
  const line = summary.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (line.length <= MAX_SUMMARY_CHARACTERS) return line;
  // Leave room for the ellipsis, then back up to the last space so no word is cut in half.
  const room = line.slice(0, MAX_SUMMARY_CHARACTERS - 1);
  const lastSpace = room.lastIndexOf(' ');
  return `${(lastSpace > 0 ? room.slice(0, lastSpace) : room).trimEnd()}…`;
}

function cleanTags(tags: string[]): string[] {
  const cleaned = tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag !== '');
  return Array.from(new Set(cleaned)).slice(0, MAX_TAGS);
}

// Models often wrap JSON in fences or chatty prose, so repair first and validate after.
export function parseEnrichment(raw: string): Enrichment {
  const unfenced = stripCodeFences(raw);
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end < start) throw new AiError('bad_output', 'AI reply contained no JSON object');

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    throw new AiError('bad_output', 'AI reply was not valid JSON');
  }

  const checked = enrichmentSchema.safeParse(parsed);
  if (!checked.success) throw new AiError('bad_output', `AI reply had the wrong shape: ${checked.error.message}`);

  const summary = oneLineSummary(checked.data.summary);
  if (summary === '') throw new AiError('bad_output', 'AI reply had an empty summary');
  return {
    summary,
    brief: checked.data.brief,
    topic: checked.data.topic,
    tags: cleanTags(checked.data.tags),
  };
}

export async function enrich(provider: AiProvider, model: string, input: EnrichInput): Promise<Enrichment> {
  const { system, user } = buildEnrichmentPrompt(input);
  // The answer is ~100 tokens, but current models think first and that counts against the limit; only tokens
  // actually used are billed, so a generous limit (the owner chose 50k) costs nothing extra and avoids cut-off replies.
  const raw = await provider.generateText({ system, user, model, maxTokens: 50_000 });
  return parseEnrichment(raw);
}
