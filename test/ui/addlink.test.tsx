// UI tests for adding a link from inside the app (someone sent it to you in a chat): the "+" on the Timeline opens
// a sheet, a link on the clipboard is offered, and Save hands it to the same pipeline as the share menu.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@shopify/flash-list/jestSetup';
import * as Clipboard from 'expo-clipboard';
import TimelineScreen from '@/app/(tabs)/index';
import { DbContext } from '@/db/DbProvider';
import { migrate } from '@/db/migrate';
import { runQueueNow } from '@/pipeline/runNow';
import { openTestDb } from '../helpers/sqlite';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(), setStringAsync: jest.fn() }));
jest.mock('@/pipeline/runNow', () => ({ runQueueNow: jest.fn().mockResolvedValue({ processed: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

async function openAddLink(clipboard: string) {
  jest.mocked(Clipboard.getStringAsync).mockResolvedValue(clipboard);
  const db = openTestDb();
  await migrate(db);
  await render(<DbContext.Provider value={db}><TimelineScreen /></DbContext.Provider>);
  await fireEvent.press(screen.getByLabelText('Add a link'));
  return db;
}

beforeEach(() => jest.clearAllMocks());

it('offers the link on the clipboard and saves it with a note through the share pipeline', async () => {
  const db = await openAddLink('look at this https://example.com/from-a-friend');
  const linkBox = await screen.findByDisplayValue('https://example.com/from-a-friend');
  expect(linkBox).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('Add a note (optional)'), 'from Priya');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(runQueueNow).toHaveBeenCalled());
  expect(await db.getAllAsync('SELECT shared_text, note, source_app FROM share_inbox')).toEqual([
    { shared_text: 'https://example.com/from-a-friend', note: 'from Priya', source_app: 'smaran' },
  ]);
  expect(screen.queryByPlaceholderText('Add a note (optional)')).toBeNull();
});

it('starts empty when the clipboard has no link, and Save waits for one', async () => {
  await openAddLink('just some words');
  const linkBox = await screen.findByPlaceholderText('Paste a link');
  expect(linkBox.props.value).toBe('');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
