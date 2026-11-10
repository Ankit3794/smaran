// UI tests for Gmail-style swipe-to-delete on the Timeline: swiping a card left reveals a Delete button; tapping it
// hides the card at once, Undo brings it back, and the save is only deleted from the database once the undo window
// has passed. Real SQLite; Jest cannot swipe, so the revealed button is always rendered (see test/ui/setup.ts).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@shopify/flash-list/jestSetup';
import TimelineScreen from '@/app/(tabs)/index';
import { DbContext } from '@/db/DbProvider';
import { migrate } from '@/db/migrate';
import { applyEnrichment, createOrBumpSave } from '@/db/saves';
import { UNDO_WINDOW_MS } from '@/ui/hooks/useUndoableDelete';
import type { Db } from '@/db/db';
import { openTestDb } from '../helpers/sqlite';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));
jest.mock('@/pipeline/runNow', () => ({ runQueueNow: jest.fn().mockResolvedValue({ processed: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

async function libraryWithOneSave() {
  const db = openTestDb();
  await migrate(db);
  const url = 'https://example.com/a';
  const { id } = await createOrBumpSave(db, { inboxId: 1, url, canonicalUrl: url, source: 'web', sourceApp: null, sharedText: url, note: null, now: Date.now() });
  await applyEnrichment(db, id, { summary: 'Options flow scanner', brief: 'b', topic: 'Trading', tags: [] }, Date.now());
  await render(<DbContext.Provider value={db}><TimelineScreen /></DbContext.Provider>);
  await screen.findByText('Options flow scanner');
  return { db, id };
}

async function tapRevealedDelete() {
  await fireEvent.press(screen.getByLabelText('Delete save'));
}

const saveCount = async (db: Db) => (await db.getAllAsync('SELECT id FROM saves')).length;

afterEach(() => jest.useRealTimers());

it('opening the swipe alone deletes nothing', async () => {
  const { db, id } = await libraryWithOneSave();
  await act(async () => screen.getByTestId(`swipe-${id}`).props.onSwipeableOpen?.('right'));
  expect(screen.getByText('Options flow scanner')).toBeTruthy();
  expect(await saveCount(db)).toBe(1);
});

it('tapping the revealed Delete hides the card at once and deletes it after the undo window', async () => {
  const { db } = await libraryWithOneSave();
  jest.useFakeTimers();
  await tapRevealedDelete();
  expect(screen.queryByText('Options flow scanner')).toBeNull();
  expect(screen.getByText('Save deleted')).toBeTruthy();
  expect(await saveCount(db)).toBe(1);

  await act(async () => jest.advanceTimersByTime(UNDO_WINDOW_MS));
  expect(await saveCount(db)).toBe(0);
  expect(screen.queryByText('Save deleted')).toBeNull();
});

it('Undo brings the card back and nothing is deleted', async () => {
  const { db } = await libraryWithOneSave();
  jest.useFakeTimers();
  await tapRevealedDelete();
  await fireEvent.press(screen.getByText('Undo'));
  expect(screen.getByText('Options flow scanner')).toBeTruthy();
  await act(async () => jest.advanceTimersByTime(UNDO_WINDOW_MS));
  expect(await saveCount(db)).toBe(1);
});
