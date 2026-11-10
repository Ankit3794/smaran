// UI tests for "I have an API key instead": the key is tested before anything is stored or switched,
// so a typo never disconnects the provider that was working. Real SQLite; only secure storage, fetch and navigation are faked.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { removeCredential, saveCredential } from '@/ai/credentials';
import { DbContext } from '@/db/DbProvider';
import { migrate } from '@/db/migrate';
import { claimDue, createOrBumpSave, setStatus } from '@/db/saves';
import { getSetting, setSetting } from '@/db/settings';
import { ApiKeyForm } from '@/ui/signin/ApiKeyForm';
import { openTestDb } from '../helpers/sqlite';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/ai/credentials', () => ({ saveCredential: jest.fn(), removeCredential: jest.fn(), loadCredential: jest.fn() }));

const anthropicReply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

async function libraryOnClaudeSubscription() {
  const db = openTestDb();
  await migrate(db);
  await setSetting(db, 'activeProvider', 'claude-sub');
  // A save the subscription could no longer process.
  const url = 'https://example.com/a';
  const { id } = await createOrBumpSave(db, { inboxId: 1, url, canonicalUrl: url, source: 'web', sourceApp: null, sharedText: url, note: null, now: 1 });
  await setStatus(db, id, 'waiting_ai', 'auth_expired', 'HTTP 403', null, 1);
  await render(<DbContext.Provider value={db}><ApiKeyForm /></DbContext.Provider>);
  await fireEvent.changeText(screen.getByPlaceholderText(/key/i), '  sk-ant-test  ');
  return { db, id };
}

beforeEach(() => jest.clearAllMocks());

it('keeps the working provider and stores nothing when the key fails its test', async () => {
  global.fetch = jest.fn(anthropicReply(401, { error: { message: 'invalid x-api-key' } })) as typeof fetch;
  const { db } = await libraryOnClaudeSubscription();
  await fireEvent.press(screen.getByText(/save and test key/i));
  await screen.findByText(/HTTP 401/);
  expect(await getSetting(db, 'activeProvider', '')).toBe('claude-sub');
  expect(saveCredential).not.toHaveBeenCalled();
  expect(removeCredential).not.toHaveBeenCalled();
  expect(screen.getByText(/save and test key/i)).toBeTruthy();
});

it('stores a working key, switches to it and frees saves stuck on the old sign-in', async () => {
  global.fetch = jest.fn(anthropicReply(200, { content: [{ type: 'text', text: 'ok' }] })) as typeof fetch;
  const { db, id } = await libraryOnClaudeSubscription();
  await fireEvent.press(screen.getByText(/save and test key/i));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(saveCredential).toHaveBeenCalledWith('claude-key', { kind: 'apiKey', key: 'sk-ant-test' });
  expect(await getSetting(db, 'activeProvider', '')).toBe('claude-key');
  expect(await claimDue(db, 1000, 60_000, 10)).toEqual([id]);
});
