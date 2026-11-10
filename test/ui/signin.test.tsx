// UI tests for the sign-in screen: clipboard detection, the Claude code exchange, and the ChatGPT device-code wait.
// Browser, clipboard, secure storage and the network-facing auth functions are mocked; the screen's own logic runs for real.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import SignInScreen from '@/app/onboarding/signin';
import { DbContext } from '@/db/DbProvider';
import { claudeExchange } from '@/ai/auth/claudeOAuth';
import { codexPoll, codexStartDevice } from '@/ai/auth/codexOAuth';
import { saveCredential } from '@/ai/credentials';
import { setSetting } from '@/db/settings';
import { rearmWaitingAi } from '@/db/saves';
import type { Db } from '@/db/db';

const mockReplace = jest.fn();
let mockProvider = 'claude-sub';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ provider: mockProvider }),
}));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(), setStringAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn().mockResolvedValue({ type: 'opened' }) }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(), getItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (count: number) => new Uint8Array(count) }));
jest.mock('@/ai/auth/pkce', () => ({ createPkce: () => ({ verifier: 'verifier', challenge: 'challenge', state: 'state123' }) }));
jest.mock('@/ai/auth/claudeOAuth', () => ({ claudeAuthUrl: () => 'https://claude.ai/oauth/authorize', claudeExchange: jest.fn() }));
jest.mock('@/ai/auth/codexOAuth', () => ({ codexStartDevice: jest.fn(), codexPoll: jest.fn() }));
jest.mock('@/ai/auth/googleOAuth', () => ({ googleAuthUrl: () => 'https://accounts.google.com', googleExchange: jest.fn() }));
jest.mock('@/ai/providers/codeAssist', () => ({ codeAssistSetup: jest.fn() }));
jest.mock('@/ai/credentials', () => ({ saveCredential: jest.fn() }));
jest.mock('@/db/settings', () => ({ setSetting: jest.fn() }));
jest.mock('@/db/saves', () => ({ rearmWaitingAi: jest.fn() }));

const fakeDb = {} as Db;
const tokens = { accessToken: 'access', refreshToken: 'refresh', expiresAt: 1 };

async function renderScreen() {
  return await render(
    <DbContext.Provider value={fakeDb}>
      <SignInScreen />
    </DbContext.Provider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProvider = 'claude-sub';
});

test('claude: prefills the code found on the clipboard', async () => {
  (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('abc#state123');
  await renderScreen();

  expect(screen.getByText('Paste it here')).toBeTruthy();
  await waitFor(() => expect(screen.getByDisplayValue('abc#state123')).toBeTruthy());
});

test('claude: Connect exchanges the code, stores the credential and goes home', async () => {
  (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('abc#state123');
  (claudeExchange as jest.Mock).mockResolvedValue(tokens);
  await renderScreen();
  await waitFor(() => screen.getByDisplayValue('abc#state123'));

  fireEvent.press(screen.getByText('Connect'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(claudeExchange).toHaveBeenCalledWith(expect.anything(), 'abc#state123', expect.objectContaining({ state: 'state123' }));
  expect(saveCredential).toHaveBeenCalledWith('claude-sub', { kind: 'oauth', tokens });
  expect(setSetting).toHaveBeenCalledWith(fakeDb, 'activeProvider', 'claude-sub');
  expect(rearmWaitingAi).toHaveBeenCalledWith(fakeDb, ['not_connected', 'auth_expired']);
});

test('chatgpt: shows the device code and a waiting state', async () => {
  mockProvider = 'chatgpt-sub';
  (codexStartDevice as jest.Mock).mockResolvedValue({ deviceAuthId: 'id', userCode: 'ABCD-1234', intervalSec: 5, verifyUrl: 'https://auth.openai.com/codex/device' });
  (codexPoll as jest.Mock).mockReturnValue(new Promise(() => {})); // never approved during this test
  await renderScreen();

  await waitFor(() => expect(screen.getByText('ABCD-1234')).toBeTruthy());
  expect(screen.getByText('Waiting for you to approve…')).toBeTruthy();
});
