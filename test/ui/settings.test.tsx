// UI tests for the Settings tab and the first-run screens (welcome, pin tip, and the redirect until onboarded).
// Runs against a real (node:sqlite) database; secure storage, files, sharing, navigation and Alert are faked.
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SettingsScreen from '@/app/(tabs)/settings';
import TabsLayout from '@/app/(tabs)/_layout';
import WelcomeScreen from '@/app/onboarding/welcome';
import PinTipScreen from '@/app/onboarding/pin';
import { loadCredential, removeCredential } from '@/ai/credentials';
import { exportBackupFile, importBackupFile } from '@/backup/backupFiles';
import { DbContext } from '@/db/DbProvider';
import { migrate } from '@/db/migrate';
import { createOrBumpSave } from '@/db/saves';
import { getSetting, setSetting } from '@/db/settings';
import type { Db } from '@/db/db';
import { openTestDb } from '../helpers/sqlite';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRedirect = jest.fn();
jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: React.ReactNode }) => children;
  Tabs.Screen = () => null;
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
    Redirect: ({ href }: { href: string }) => {
      mockRedirect(href);
      return null;
    },
    Tabs,
  };
});
// The real Switch sends a native command after rendering, which the test renderer cannot run (it logs an error);
// a plain host "Switch" element keeps the same props (value, onValueChange).
jest.mock('react-native/Libraries/Components/Switch/Switch', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { __esModule: true, default: (props: object) => React.createElement('Switch', props) };
});
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0', extra: { sourceUrl: 'https://github.com/example/smaran' } } }));
jest.mock('expo-file-system', () => ({ Paths: { document: 'file:///doc/' }, Directory: jest.fn(() => ({ size: 2_500_000 })) }));
jest.mock('@/ai/credentials', () => ({ loadCredential: jest.fn(), removeCredential: jest.fn() }));
jest.mock('@/backup/backupFiles', () => ({ exportBackupFile: jest.fn(), importBackupFile: jest.fn() }));

async function libraryWithSaves(count: number) {
  const db = openTestDb();
  await migrate(db);
  for (let n = 1; n <= count; n++) {
    const url = `https://example.com/${n}`;
    await createOrBumpSave(db, { inboxId: n, url, canonicalUrl: url, source: 'web', sourceApp: null, sharedText: url, note: null, now: n });
  }
  return db;
}

async function renderWithDb(db: Db, element: React.ReactElement) {
  return render(<DbContext.Provider value={db}>{element}</DbContext.Provider>);
}

// Presses the destructive button of the most recent Alert.alert call.
function confirmAlert(buttonText: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  buttons.find((button) => button.text === buttonText)?.onPress?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert');
  jest.mocked(loadCredential).mockResolvedValue({ kind: 'oauth', tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: 0 } });
});

describe('Settings tab', () => {
  it('shows the connected provider, its model and the ways to change it', async () => {
    const db = await libraryWithSaves(0);
    await setSetting(db, 'activeProvider', 'claude-sub');
    await renderWithDb(db, <SettingsScreen />);
    expect(await screen.findByText('Claude')).toBeTruthy();
    expect(screen.getByText('Pro subscription · connected')).toBeTruthy();
    expect(screen.getByText('Model')).toBeTruthy();
    expect(screen.getByText('Haiku 5.5 · fast')).toBeTruthy();
    await fireEvent.press(screen.getByText('Switch provider or use API key'));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/connect');
  });

  it('says "API key" for a key-based provider', async () => {
    const db = await libraryWithSaves(0);
    await setSetting(db, 'activeProvider', 'gemini-key');
    jest.mocked(loadCredential).mockResolvedValue({ kind: 'apiKey', key: 'k' });
    await renderWithDb(db, <SettingsScreen />);
    expect(await screen.findByText('Gemini')).toBeTruthy();
    expect(screen.getByText('API key · connected')).toBeTruthy();
  });

  it('changes the model for the active provider', async () => {
    const db = await libraryWithSaves(0);
    await setSetting(db, 'activeProvider', 'claude-key');
    await renderWithDb(db, <SettingsScreen />);
    await fireEvent.press(await screen.findByText('Haiku 5.5 · fast'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sonnet 5.5' }));
    await waitFor(async () => expect(await getSetting(db, 'model.claude-key', '')).toBe('claude-sonnet-5-5'));
  });

  it('disconnects: removes the credential and clears the active provider', async () => {
    const db = await libraryWithSaves(0);
    await setSetting(db, 'activeProvider', 'claude-sub');
    await renderWithDb(db, <SettingsScreen />);
    await fireEvent.press(await screen.findByText('Disconnect'));
    confirmAlert('Disconnect');
    await waitFor(async () => expect(await getSetting(db, 'activeProvider', 'unset')).toBe(''));
    expect(removeCredential).toHaveBeenCalledWith('claude-sub');
    expect(await screen.findByText('No AI connected')).toBeTruthy();
  });

  it('shows the library size and its actions', async () => {
    const db = await libraryWithSaves(3);
    await renderWithDb(db, <SettingsScreen />);
    expect(await screen.findByText(/^3 · \d+(\.\d)? MB$/)).toBeTruthy();
    expect(screen.getByText('Saves on this phone')).toBeTruthy();
    await fireEvent.press(screen.getByText('Rename & merge topics'));
    expect(mockPush).toHaveBeenCalledWith('/topics');

    await fireEvent.press(screen.getByText('Export backup (.zip)'));
    expect(exportBackupFile).toHaveBeenCalledWith(db);

    jest.mocked(importBackupFile).mockResolvedValue({ added: 4, skipped: 1 });
    await fireEvent.press(screen.getByText('Import backup'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Backup imported', 'Added 4 saves. 1 was already here.'));
  });

  it('has the public mirrors switch, on by default', async () => {
    const db = await libraryWithSaves(0);
    await renderWithDb(db, <SettingsScreen />);
    const toggle = await screen.findByLabelText('Use public mirrors when a source blocks reading');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'valueChange', false);
    await waitFor(async () => expect(await getSetting(db, 'allowMirrors', '1')).toBe('0'));
  });

  it('lists features coming later as disabled, and the about details', async () => {
    const db = await libraryWithSaves(0);
    await renderWithDb(db, <SettingsScreen />);
    expect(await screen.findByText('Reminders for unopened saves')).toBeTruthy();
    expect(screen.getByText('On-device AI (no internet)')).toBeTruthy();
    expect(screen.getByText('Smaran 1.0.0')).toBeTruthy();
    expect(screen.getByText('MIT licence')).toBeTruthy();
    expect(screen.getByText('https://github.com/example/smaran')).toBeTruthy();
  });
});

describe('first run', () => {
  it('sends the tabs to the welcome screen until onboarding is finished', async () => {
    const db = await libraryWithSaves(0);
    await renderWithDb(db, <TabsLayout />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/onboarding/welcome'));

    mockRedirect.mockClear();
    await setSetting(db, 'onboarded', '1');
    await renderWithDb(db, <TabsLayout />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('welcome explains the app and leads to the pin tip, which finishes onboarding and opens Connect', async () => {
    const db = await libraryWithSaves(0);
    await renderWithDb(db, <WelcomeScreen />);
    expect(screen.getByText(/Smaran remembers what you save\./)).toBeTruthy();
    await fireEvent.press(screen.getByText('Get started'));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/pin');

    await renderWithDb(db, <PinTipScreen />);
    expect(screen.getByText("Long-press Smaran in the share menu and tap Pin, so it's always first.")).toBeTruthy();
    await fireEvent.press(screen.getByText('Got it'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding/connect'));
    expect(await getSetting(db, 'onboarded', '0')).toBe('1');
  });
});
