// UI tests for the detail sheet: what it shows, and that each action writes to a real (node:sqlite) database.
// Linking, Alert, the clipboard and the queue runner are mocked; the SQL and the sheet's own logic run for real.
import { Alert, Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { DbContext } from '@/db/DbProvider';
import { migrate } from '@/db/migrate';
import { applyEnrichment, createOrBumpSave, getSave, setStatus } from '@/db/saves';
import { runQueueNow } from '@/pipeline/runNow';
import { SaveSheet } from '@/ui/components/SaveSheet';
import { savedAtLabel } from '@/core/dates';
import { openTestDb } from '../helpers/sqlite';
import type { Db } from '@/db/db';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/pipeline/runNow', () => ({ runQueueNow: jest.fn() }));

const savedAt = new Date(2026, 10, 9, 23, 42).getTime();

async function seed(source: 'x' | 'web' = 'x') {
  const db = openTestDb();
  await migrate(db);
  const { id } = await createOrBumpSave(db, {
    inboxId: 1, url: 'https://x.com/quantdesk/status/1', canonicalUrl: 'https://x.com/quantdesk/status/1', source,
    sourceApp: null, sharedText: '', note: null, now: savedAt,
  });
  await applyEnrichment(db, id, { summary: 'Options flow scanner', brief: 'A scanner for unusual flow.', topic: 'Trading', tags: ['options', 'tools'] }, savedAt);
  return { db, id };
}

async function renderSheet(db: Db, id: number, onClose = jest.fn()) {
  await render(
    <DbContext.Provider value={db}>
      <SaveSheet saveId={id} onClose={onClose} />
    </DbContext.Provider>,
  );
  await screen.findByText('Options flow scanner');
  return onClose;
}

beforeEach(() => {
  jest.clearAllMocks();
  (runQueueNow as jest.Mock).mockResolvedValue({ processed: 0 });
  jest.spyOn(Linking, 'openURL').mockResolvedValue();
});

it('shows summary, brief, time line, topic and tags', async () => {
  const { db, id } = await seed();
  await renderSheet(db, id);
  expect(screen.getByText('A scanner for unusual flow.')).toBeOnTheScreen();
  expect(screen.getByText(`saved ${savedAtLabel(savedAt, Date.now())}`)).toBeOnTheScreen();
  expect(screen.getByText('● Trading')).toBeOnTheScreen();
  expect(screen.getByText('options')).toBeOnTheScreen();
  expect(screen.getByText('tools')).toBeOnTheScreen();
});

it('opens the link in the native app and records that it was opened', async () => {
  const { db, id } = await seed();
  await renderSheet(db, id);
  await fireEvent.press(screen.getByText('Open on X ↗'));
  await waitFor(async () => expect((await getSave(db, id))?.openedAt).not.toBeNull());
  expect(Linking.openURL).toHaveBeenCalledWith('https://x.com/quantdesk/status/1');
});

it('labels other sources "Open link"', async () => {
  const { db, id } = await seed('web');
  await renderSheet(db, id);
  expect(screen.getByText('Open link ↗')).toBeOnTheScreen();
});

it('copies the link', async () => {
  const { db, id } = await seed();
  await renderSheet(db, id);
  await fireEvent.press(screen.getByText('Copy link'));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://x.com/quantdesk/status/1');
});

it('removes a tag and adds a normalised one', async () => {
  const { db, id } = await seed();
  await renderSheet(db, id);
  await fireEvent.press(screen.getByLabelText('Remove tag tools'));
  await waitFor(async () => expect((await getSave(db, id))?.tags).toEqual(['options']));
  await waitFor(() => expect(screen.queryByText('tools')).toBeNull());

  await fireEvent.press(screen.getByText('+ tag'));
  const input = screen.getByPlaceholderText('new tag');
  await fireEvent.changeText(input, '  Options ');
  await fireEvent(input, 'submitEditing');
  await fireEvent.press(screen.getByText('+ tag'));
  await fireEvent.changeText(screen.getByPlaceholderText('new tag'), ' Fresh ');
  await fireEvent(screen.getByPlaceholderText('new tag'), 'submitEditing');
  await waitFor(async () => expect((await getSave(db, id))?.tags.sort()).toEqual(['fresh', 'options']));
});

it('saves the note on blur', async () => {
  const { db, id } = await seed();
  await renderSheet(db, id);
  const box = screen.getByPlaceholderText('Add a note');
  await fireEvent.changeText(box, 'check later');
  await fireEvent(box, 'blur');
  await waitFor(async () => expect((await getSave(db, id))?.note).toBe('check later'));
});

it('changes the topic to an existing one and to a new one', async () => {
  const { db, id } = await seed();
  await db.runAsync("INSERT INTO topics (name, color, created_at) VALUES ('Security', '#B4443A', 1)");
  await renderSheet(db, id);
  await fireEvent.press(screen.getByText('● Trading'));
  await fireEvent.press(await screen.findByText('Security'));
  await waitFor(async () => expect((await getSave(db, id))?.topicName).toBe('Security'));
  expect(await screen.findByText('● Security')).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('● Security'));
  const input = screen.getByPlaceholderText('new topic');
  await fireEvent.changeText(input, 'Cooking');
  await fireEvent(input, 'submitEditing');
  await waitFor(async () => expect((await getSave(db, id))?.topicName).toBe('Cooking'));
});

it('asks before deleting, then deletes and closes', async () => {
  const { db, id } = await seed();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onClose = await renderSheet(db, id);
  await fireEvent.press(screen.getByText('Delete'));
  expect(await getSave(db, id)).not.toBeNull();
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Delete']);
  await buttons[1].onPress!();
  expect(await getSave(db, id)).toBeNull();
  expect(onClose).toHaveBeenCalled();
});

it('offers Retry AI only for a failed save, and it resets the retry time and runs the queue', async () => {
  const { db, id } = await seed();
  await renderSheet(db, id);
  expect(screen.queryByText('Retry AI')).toBeNull();
});

it('Retry AI clears the backoff and runs the queue, even if the run rejects', async () => {
  const { db, id } = await seed();
  await setStatus(db, id, 'partial', 'provider_error', null, Date.now() + 1e9, 2);
  (runQueueNow as jest.Mock).mockRejectedValue(new Error('offline'));
  await renderSheet(db, id);
  await fireEvent.press(screen.getByText('Retry AI'));
  await waitFor(() => expect(runQueueNow).toHaveBeenCalledWith(db));
  expect(await getSave(db, id)).toMatchObject({ nextRetryAt: null, attempts: 0 });
});
