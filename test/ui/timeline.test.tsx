// UI tests for the Timeline screen: day groups, the queue banner sentence, "Retry now" and topic chip filtering.
// The database layer (saves, topics, settings), the queue runner and expo-sqlite's change listener are mocked.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// FlashList measures its container natively; this file fakes a 400x900 screen so rows render in Jest.
import '@shopify/flash-list/jestSetup';
import TimelineScreen from '@/app/(tabs)/index';
import { DbContext } from '@/db/DbProvider';
import { listTimeline, queueSummary, retryNow } from '@/db/saves';
import { runQueueNow } from '@/pipeline/runNow';
import type { Save } from '@/core/types';
import type { Db } from '@/db/db';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));
jest.mock('@/db/saves', () => ({ listTimeline: jest.fn(), queueSummary: jest.fn(), retryNow: jest.fn() }));
jest.mock('@/db/topics', () => ({
  listTopics: jest.fn().mockResolvedValue([
    { id: 1, name: 'Trading', color: '#2F7D5B', count: 1, newThisWeek: 1, last7: [] },
    { id: 2, name: 'Security', color: '#B4443A', count: 1, newThisWeek: 0, last7: [] },
  ]),
}));
jest.mock('@/db/settings', () => ({ getSetting: jest.fn().mockResolvedValue('claude-sub') }));
jest.mock('@/pipeline/runNow', () => ({ runQueueNow: jest.fn().mockResolvedValue({ processed: 0 }) }));

const today = new Date();
const atHour = (daysAgo: number, hour: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, hour).getTime();

function makeSave(id: number, topicId: number, topicName: string, summary: string, lastSavedAt: number): Save {
  return {
    id, url: `https://example.com/${id}`, canonicalUrl: null, source: 'web', sourceApp: null, sharedText: '', title: null, author: null,
    extractedText: null, imageUrl: null, thumbPath: null, summary, brief: null, topicId, topicName, topicColor: '#2F7D5B', tags: [],
    note: null, status: 'done', statusReason: null, statusDetail: null, attempts: 0, nextRetryAt: null,
    createdAt: lastSavedAt, lastSavedAt, openedAt: null, extra: {},
  };
}

const allSaves = [makeSave(1, 1, 'Trading', 'Options flow scanner', atHour(0, 9)), makeSave(2, 2, 'Security', 'TLS cipher mapper', atHour(1, 9))];

beforeEach(() => {
  jest.clearAllMocks();
  (listTimeline as jest.Mock).mockImplementation(async (_db, filter) => allSaves.filter((save) => filter.topicId === undefined || save.topicId === filter.topicId));
  (queueSummary as jest.Mock).mockResolvedValue({ waiting: 0, reason: null, nextRetryAt: null });
});

async function renderTimeline() {
  return await render(
    <DbContext.Provider value={{} as Db}>
      <TimelineScreen />
    </DbContext.Provider>,
  );
}

describe('Timeline', () => {
  it('shows saves under Today and Yesterday headings and no banner when nothing is queued', async () => {
    await renderTimeline();
    expect(await screen.findByText('Options flow scanner')).toBeOnTheScreen();
    // FlashList draws the pinned (sticky) heading as an extra copy, so a heading can match more than once.
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Yesterday').length).toBeGreaterThan(0);
    expect(screen.getByText('TLS cipher mapper')).toBeOnTheScreen();
    expect(screen.queryByText('Retry now')).toBeNull();
  });

  it('starts a queue run when it opens', async () => {
    await renderTimeline();
    await waitFor(() => expect(runQueueNow).toHaveBeenCalledTimes(1));
  });

  it('explains a quota wait and retries on demand', async () => {
    (queueSummary as jest.Mock).mockResolvedValue({ waiting: 2, reason: 'quota', nextRetryAt: new Date(2026, 10, 10, 18, 0).getTime() });
    await renderTimeline();
    expect(await screen.findByText(/2 saves are waiting for the AI\./)).toBeOnTheScreen();
    expect(screen.getByText(/Claude's usage limit was reached, so we'll retry at 6:00 PM\./)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Retry now'));
    await waitFor(() => expect(retryNow).toHaveBeenCalledTimes(1));
    // Once on open, once from the button.
    await waitFor(() => expect(runQueueNow).toHaveBeenCalledTimes(2));
  });

  it('filters the list when a topic chip is tapped', async () => {
    await renderTimeline();
    await screen.findByText('TLS cipher mapper');
    // The chip comes before the cards in the tree, and the cards also print their topic name.
    await fireEvent.press(screen.getAllByText('Trading')[0]);
    await waitFor(() => expect(screen.queryByText('TLS cipher mapper')).toBeNull());
    expect(screen.getByText('Options flow scanner')).toBeOnTheScreen();
    expect(listTimeline).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ topicId: 1 }));

    await fireEvent.press(screen.getByText('All'));
    expect(await screen.findByText('TLS cipher mapper')).toBeOnTheScreen();
  });
});
