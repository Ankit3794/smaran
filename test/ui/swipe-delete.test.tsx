// UI tests for swipe-left-to-delete on the Timeline: the card disappears at once, Undo brings it back, and the
// save is only deleted from the database once the undo window has passed. Real SQLite; the swipe is simulated
// by calling the row's "opened" callback (see test/ui/setup.ts), since Jest cannot drive a native gesture.
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

async function swipeLeft(id: number) {
  const row = screen.getByTestId(`swipe-${id}`);
  await act(async () => row.props.onSwipeableOpen('right'));
}

const saveCount = async (db: Db) => (await db.getAllAsync('SELECT id FROM saves')).length;

afterEach(() => jest.useRealTimers());

it('hides a swiped card at once and deletes it after the undo window', async () => {
  const { db, id } = await libraryWithOneSave();
  jest.useFakeTimers();
  await swipeLeft(id);
  expect(screen.queryByText('Options flow scanner')).toBeNull();
  expect(screen.getByText('Save deleted')).toBeTruthy();
  expect(await saveCount(db)).toBe(1);

  await act(async () => jest.advanceTimersByTime(UNDO_WINDOW_MS));
  expect(await saveCount(db)).toBe(0);
  expect(screen.queryByText('Save deleted')).toBeNull();
});

it('Undo brings the card back and nothing is deleted', async () => {
  const { db, id } = await libraryWithOneSave();
  jest.useFakeTimers();
  await swipeLeft(id);
  await fireEvent.press(screen.getByText('Undo'));
  expect(screen.getByText('Options flow scanner')).toBeTruthy();
  await act(async () => jest.advanceTimersByTime(UNDO_WINDOW_MS));
  expect(await saveCount(db)).toBe(1);
});
