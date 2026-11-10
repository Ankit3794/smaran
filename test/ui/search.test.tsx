// UI tests for the Search tab, run against a real (node:sqlite) database with the FTS5 index.
// Only navigation and the SQLite change listener are faked; the query, filters and grouping run for real.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SearchScreen from '@/app/(tabs)/search';
import { DbContext } from '@/db/DbProvider';
import { migrate } from '@/db/migrate';
import { applyEnrichment, createOrBumpSave } from '@/db/saves';
import type { Source } from '@/core/types';
import type { Db } from '@/db/db';
import { openTestDb } from '../helpers/sqlite';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

let nextInboxId = 1;
async function save(db: Db, summary: string, topic: string, source: Source, savedAt: number) {
  const url = `https://example.com/${nextInboxId}`;
  const { id } = await createOrBumpSave(db, {
    inboxId: nextInboxId, url, canonicalUrl: url, source, sourceApp: null, sharedText: '', note: null, now: savedAt,
  });
  nextInboxId += 1;
  await applyEnrichment(db, id, { summary, brief: 'brief', topic, tags: [] }, savedAt);
}

async function seed() {
  const db = openTestDb();
  await migrate(db);
  await save(db, 'Options flow scanner for unusual activity', 'Trading', 'x', now - 1000);
  await save(db, 'Momentum scanner for crypto pairs', 'Trading', 'github', now - 20 * DAY_MS);
  await save(db, 'Fast open-source TLS scanner', 'Security', 'reddit', now - 2 * DAY_MS);
  await save(db, 'A recipe for sourdough', 'Cooking', 'web', now - 1000);
  return db;
}

async function renderSearch() {
  const db = await seed();
  await render(
    <DbContext.Provider value={db}>
      <SearchScreen />
    </DbContext.Provider>,
  );
}

async function pickFilter(chipLabel: string, option: string) {
  await fireEvent.press(screen.getByText(chipLabel));
  // By role: an option such as "Trading" is also a group heading on the screen behind the picker.
  await fireEvent.press(await screen.findByRole('button', { name: option }));
}

describe('Search tab', () => {
  it('shows a hint before anything is typed', async () => {
    await renderSearch();
    expect(screen.getByText('Searches summaries, tags, titles, authors and post text.')).toBeTruthy();
  });

  it('groups results by topic with counts and highlights the matched word', async () => {
    await renderSearch();
    await fireEvent.changeText(screen.getByPlaceholderText('Search your saves'), 'scanner');
    expect(await screen.findByText('Trading')).toBeTruthy();
    expect(screen.getByText('2 results')).toBeTruthy();
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('1 result')).toBeTruthy();
    expect(screen.queryByText('Cooking')).toBeNull();
    const highlights = screen.getAllByTestId('highlight');
    expect(highlights).toHaveLength(3);
    expect(highlights.every((node) => node.props.children === 'scanner')).toBe(true);
  });

  it('narrows results by time, source and topic', async () => {
    await renderSearch();
    await fireEvent.changeText(screen.getByPlaceholderText('Search your saves'), 'scan');
    await screen.findByText('2 results');

    await pickFilter('Any time', '7 days');
    await waitFor(() => expect(screen.queryByText('2 results')).toBeNull());
    expect(screen.getAllByText('1 result')).toHaveLength(2);

    await pickFilter('7 days', 'Any time');
    await screen.findByText('2 results');
    await pickFilter('All sources', 'Reddit');
    await waitFor(() => expect(screen.queryByText('Trading')).toBeNull());
    expect(screen.getByText('Security')).toBeTruthy();

    await pickFilter('Reddit', 'All sources');
    await screen.findByText('2 results');
    await pickFilter('All topics', 'Trading');
    await waitFor(() => expect(screen.queryByText('Security')).toBeNull());
    expect(screen.getByText('2 results')).toBeTruthy();
  });

  it('says so when nothing matches', async () => {
    await renderSearch();
    await fireEvent.changeText(screen.getByPlaceholderText('Search your saves'), 'zebra');
    expect(await screen.findByText('No saves match "zebra".')).toBeTruthy();
  });
});
