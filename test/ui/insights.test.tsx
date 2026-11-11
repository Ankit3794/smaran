// UI tests for the Insights screen, run against a real (node:sqlite) database.
// Navigation, the SQLite change listener and file sizes (thumbnails) are faked; the numbers are computed for real.
import { fireEvent, render, screen } from '@testing-library/react-native';
import InsightsScreen from '@/app/insights';
import type { Source } from '@/core/types';
import type { Db } from '@/db/db';
import { DbContext } from '@/db/DbProvider';
import { migrate } from '@/db/migrate';
import { createOrBumpSave, markOpened } from '@/db/saves';
import { openTestDb } from '../helpers/sqlite';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));
// Every thumbnail file is 100 KB; the thumbs folder as a whole is 1 MB.
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///doc/' },
  Directory: jest.fn(() => ({ size: 1024 * 1024 })),
  File: jest.fn(() => ({ exists: true, size: 100 * 1024 })),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

let nextInboxId = 1;
async function save(db: Db, source: Source, createdAt: number) {
  const { id } = await createOrBumpSave(db, {
    inboxId: nextInboxId++, url: null, canonicalUrl: null, source, sourceApp: null, sharedText: 'x', note: null, now: createdAt,
  });
  return id;
}

async function renderInsights(seed: (db: Db) => Promise<void>) {
  const db = openTestDb();
  await migrate(db);
  await seed(db);
  await render(
    <DbContext.Provider value={db}>
      <InsightsScreen />
    </DbContext.Provider>,
  );
}

async function library(db: Db) {
  const opened = await save(db, 'youtube', now - 1000);
  await save(db, 'youtube', now - 2 * DAY_MS);
  await save(db, 'youtube', now - 9 * DAY_MS);
  await save(db, 'x', now - 30 * DAY_MS);
  await markOpened(db, opened, now);
}

describe('Insights screen', () => {
  it('shows the totals: saves, this week against last week, and how many were opened', async () => {
    await renderInsights(library);
    expect(await screen.findByLabelText('Saves: 4')).toBeTruthy();
    expect(screen.getByLabelText('This week: 2, 1 more than last week')).toBeTruthy();
    expect(screen.getByLabelText('Opened: 25%, 1 of 4')).toBeTruthy();
  });

  it('lists each platform, biggest first, with its count, share, storage and opened count', async () => {
    await renderInsights(library);
    const rows = await screen.findAllByTestId('platform-row');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      // 3 thumbnails at 100 KB plus a few bytes of text.
      'YouTube: 3 saves, 75%, about 300 KB, 1 opened',
      'X: 1 save, 25%, about 100 KB, 0 opened',
    ]);
  });

  it('charts the last 12 weeks; tapping a week shows its count', async () => {
    await renderInsights(library);
    const bars = await screen.findAllByTestId('week-bar');
    expect(bars).toHaveLength(12);
    // Oldest first: the save from 30 days ago is in week 5 of 12 (4 weeks back), this week has 2.
    expect(bars[11].props.accessibilityLabel).toBe('This week: 2 saves');
    expect(bars[10].props.accessibilityLabel).toBe('1 week ago: 1 save');
    expect(bars[7].props.accessibilityLabel).toBe('4 weeks ago: 1 save');
    await fireEvent.press(bars[10]);
    expect(screen.getByText('1 week ago · 1 save')).toBeTruthy();
  });

  it('an empty library says so instead of drawing empty charts', async () => {
    await renderInsights(async () => {});
    expect(await screen.findByText('Nothing saved yet. Share a link to Smaran and it will show up here.')).toBeTruthy();
    expect(screen.queryAllByTestId('week-bar')).toHaveLength(0);
  });

  it('the back arrow goes back', async () => {
    await renderInsights(library);
    await fireEvent.press(await screen.findByRole('button', { name: 'Back' }));
    expect(mockBack).toHaveBeenCalled();
  });
});
