// Gemini subscription via Google's Code Assist API (what Gemini CLI uses with a Google sign-in).
// codeAssistSetup runs once after sign-in to find the project id; codeAssistProvider plugs into the pipeline as an AiProvider.
import { AiError, type AiProvider, type OAuthTokens } from '@/ai/types';
import type { Http } from '@/core/types';
import { postJson, requireText } from '@/ai/providers/errors';

const BASE_URL = 'https://cloudcode-pa.googleapis.com/v1internal';
const METADATA = { ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' };

function callCodeAssist(http: Http, method: string, accessToken: string, body: unknown): Promise<any> {
  return postJson(http, `${BASE_URL}:${method}`, { Authorization: `Bearer ${accessToken}` }, body);
}

// The project may arrive as a plain string or as {id}.
function projectIdOf(project: unknown): string | undefined {
  if (typeof project === 'string' && project !== '') return project;
  const id = (project as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

// Finds (or creates, for first-time accounts) the Google Cloud project that Code Assist bills requests to.
export async function codeAssistSetup(
  http: Http,
  accessToken: string,
  options: { sleep?: (ms: number) => Promise<void>; maxPolls?: number } = {},
): Promise<{ projectId: string; tier: string }> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxPolls = options.maxPolls ?? 15;

  const loaded = await callCodeAssist(http, 'loadCodeAssist', accessToken, { metadata: METADATA });
  const existingProject = projectIdOf(loaded?.cloudaicompanionProject);
  if (existingProject !== undefined) {
    return { projectId: existingProject, tier: loaded?.currentTier?.id ?? 'unknown' };
  }

  const tiers: { id?: string; isDefault?: boolean }[] = Array.isArray(loaded?.allowedTiers) ? loaded.allowedTiers : [];
  const tier = tiers.find((candidate) => candidate.isDefault) ?? tiers[0];
  if (tier?.id === undefined) throw new AiError('provider_error', 'Google account has no Gemini plan available');

  // onboardUser is a long-running operation: re-POSTing it returns its current state until `done`.
  for (let poll = 0; poll < maxPolls; poll++) {
    // No project is sent: the free tier creates one for us.
    const operation = await callCodeAssist(http, 'onboardUser', accessToken, { tierId: tier.id, metadata: METADATA });
    if (operation?.done) {
      const projectId = projectIdOf(operation.response?.cloudaicompanionProject);
      if (projectId === undefined) throw new AiError('bad_output', 'Google account setup returned no project');
      return { projectId, tier: tier.id };
    }
    await sleep(2000);
  }
  throw new AiError('provider_error', 'Google account setup did not finish — try again');
}

// Hermes may lack crypto.randomUUID, so fall back to random hex; the id only labels the prompt.
function randomPromptId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function codeAssistProvider(http: Http, getToken: () => Promise<OAuthTokens>): AiProvider {
  return {
    id: 'gemini-sub',
    async generateText({ system, user, model, maxTokens }) {
      const tokens = await getToken();
      if (!tokens.projectId) throw new AiError('not_connected', 'Finish Google sign-in again');
      const reply = await callCodeAssist(http, 'generateContent', tokens.accessToken, {
        model,
        project: tokens.projectId,
        user_prompt_id: randomPromptId(),
        request: {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        },
      });
      // Code Assist wraps the ordinary Gemini reply under `response`.
      const parts: { text?: string }[] = reply?.response?.candidates?.[0]?.content?.parts ?? [];
      return requireText(parts.map((part) => part.text ?? '').join(''));
    },
  };
}
