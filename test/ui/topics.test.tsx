// UI tests for the Topics tab and the topic detail screen, run against a real (node:sqlite) database.
// Only navigation, the SQLite change listener and Alert are faked; queries, edits and screen logic run for real.
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import TopicsScreen from '@/app/(tabs)/topics';
import TopicDetailScreen from '@/app/topic/[id]';
import { DbContext } from '@/db/DbProvider';
import { migrate } from '@/db/migrate';
import { applyEnrichment, createOrBumpSave } from '@/db/saves';
import { listTopics } from '@/db/topics';
import { openTestDb } from '../helpers/sqlite';
import type { Db } from '@/db/db';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockTopicId = '1';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: mockTopicId }),
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));

const today = new Date();
const daysAgoAt = (daysAgo: number, hour: number, minute = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, hour, minute).getTime();

let nextInboxId = 1;
async function saveWithTopic(db: Db, summary: string, topic: string, tags: string[], savedAt: number) {
  const { id } = await createOrBumpSave(db, {
    inboxId: nextInboxId, url: `https://example.com/${nextInboxId}`, canonicalUrl: `https://example.com/${nextInboxId}`,
    source: 'web', sourceApp: null, sharedText: '', note: null, now: savedAt,
  });
  nextInboxId += 1;
  await applyEnrichment(db, id, { summary, brief: 'brief', topic, tags }, savedAt);
  return id;
}

async function seed() {
  const db = openTestDb();
  await migrate(db);
  // Trading is topic 1 with three saves (latest: yesterday 11:42 PM); Security is topic 2 with one.
  await saveWithTopic(db, 'Options flow scanner', 'Trading', ['options', 'tools'], daysAgoAt(1, 23, 42));
  await saveWithTopic(db, 'Crypto funding rates', 'Trading', ['crypto', 'options'], daysAgoAt(3, 10));
  await saveWithTopic(db, 'Old risk essay', 'Trading', ['risk'], daysAgoAt(20, 10));
  await saveWithTopic(db, 'TLS cipher mapper', 'Security', ['tls'], daysAgoAt(2, 9));
  return db;
}

function renderWithDb(db: Db, screenElement: React.ReactElement) {
  return render(<DbContext.Provider value={db}>{screenElement}</DbContext.Provider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTopicId = '1';
});

describe('Topics tab', () => {
  it('lists each topic with its count, new-this-week count and seven activity bars', async () => {
    const db = await seed();
    await renderWithDb(db, <TopicsScreen />);
    expect(await screen.findByText('Trading')).toBeOnTheScreen();
    expect(screen.getByText('3 saves · 2 new this week')).toBeOnTheScreen();
    expect(screen.getByText('1 save · 1 new this week')).toBeOnTheScreen();
    // Two topic rows, seven bars each.
    expect(screen.getAllByTestId('activity-bar')).toHaveLength(14);
  });

  it('draws taller bars for busier days', async () => {
    const db = await seed();
    await saveWithTopic(db, 'Another today', 'Trading', [], daysAgoAt(0, 8));
    await saveWithTopic(db, 'And another today', 'Trading', [], daysAgoAt(0, 9));
    await renderWithDb(db, <TopicsScreen />);
    await screen.findByText('Trading');
    const heights = within(screen.getAllByTestId('activity-bars')[0])
      .getAllByTestId('activity-bar')
      .map((bar) => (Array.isArray(bar.props.style) ? Object.assign({}, ...bar.props.style) : bar.props.style).height);
    // Today (last bar) has 2 saves, three days ago has 1, a quiet day has 0.
    expect(heights[6]).toBeGreaterThan(heights[3]);
    expect(heights[3]).toBeGreaterThan(heights[0]);
  });

  it('shows Unsorted only when saves without a topic exist', async () => {
    const db = await seed();
    const view = await renderWithDb(db, <TopicsScreen />);
    await screen.findByText('Trading');
    expect(screen.queryByText('Unsorted')).toBeNull();
    view.unmount();

    await createOrBumpSave(db, { inboxId: 99, url: null, canonicalUrl: null, source: 'text', sourceApp: null, sharedText: 'waiting', note: null, now: daysAgoAt(0, 8) });
    await renderWithDb(db, <TopicsScreen />);
    expect(await screen.findByText('Unsorted')).toBeOnTheScreen();
    expect(screen.getByText('1 waiting for the AI')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Unsorted'));
    expect(mockPush).toHaveBeenCalledWith('/topic/unsorted');
  });

  it('opens a topic on tap', async () => {
    const db = await seed();
    await renderWithDb(db, <TopicsScreen />);
    await fireEvent.press(await screen.findByText('Trading'));
    expect(mockPush).toHaveBeenCalledWith('/topic/1');
  });

  it('renames a topic from the long-press menu', async () => {
    const db = await seed();
    await renderWithDb(db, <TopicsScreen />);
    await fireEvent(await screen.findByText('Trading'), 'longPress');
    await fireEvent.press(screen.getByText('Rename'));
    await fireEvent.changeText(screen.getByDisplayValue('Trading'), 'Markets');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(async () => expect((await listTopics(db, Date.now())).map((topic) => topic.name).sort()).toEqual(['Markets', 'Security']));
  });

  it('changes a topic colour from the fixed palette', async () => {
    const db = await seed();
    await renderWithDb(db, <TopicsScreen />);
    await fireEvent(await screen.findByText('Trading'), 'longPress');
    await fireEvent.press(screen.getByText('Change colour'));
    await fireEvent.press(screen.getByLabelText('Colour #3C5FA8'));
    await waitFor(async () => expect((await listTopics(db, Date.now())).find((topic) => topic.name === 'Trading')?.color).toBe('#3C5FA8'));
  });

  it('merges a topic into another after confirming', async () => {
    const db = await seed();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.text === 'Merge')?.onPress?.());
    await renderWithDb(db, <TopicsScreen />);
    await fireEvent(await screen.findByText('Security'), 'longPress');
    await fireEvent.press(screen.getByText('Merge into another topic'));
    await fireEvent.press(screen.getByLabelText('Merge into Trading'));
    await waitFor(async () => {
      const topics = await listTopics(db, Date.now());
      expect(topics.map((topic) => topic.name)).toEqual(['Trading']);
      expect(topics[0].count).toBe(4);
    });
    expect(alert).toHaveBeenCalled();
  });
});

describe('Topic detail', () => {
  it('shows the name, count, last save time and the top tags with counts', async () => {
    const db = await seed();
    await renderWithDb(db, <TopicDetailScreen />);
    expect(await screen.findByText('3 saves · last one yesterday at 11:42 PM')).toBeOnTheScreen();
    expect(screen.getByText('Trading')).toBeOnTheScreen();
    expect(screen.getByText('options')).toBeOnTheScreen();
    expect(screen.getByLabelText('Filter by options, 2 saves')).toBeOnTheScreen();
  });

  it('groups saves by day and filters them when a tag chip is tapped', async () => {
    const db = await seed();
    await renderWithDb(db, <TopicDetailScreen />);
    expect(await screen.findByText('Options flow scanner')).toBeOnTheScreen();
    expect(screen.getByText('Yesterday')).toBeOnTheScreen();
    expect(screen.getByText('Crypto funding rates')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Filter by risk, 1 save'));
    await waitFor(() => expect(screen.queryByText('Options flow scanner')).toBeNull());
    expect(screen.getByText('Old risk essay')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('All tags'));
    expect(await screen.findByText('Options flow scanner')).toBeOnTheScreen();
  });

  it('opens the save sheet when a card is tapped', async () => {
    const db = await seed();
    await renderWithDb(db, <TopicDetailScreen />);
    await fireEvent.press(await screen.findByText('Options flow scanner'));
    // The sheet shows the brief, which the card does not.
    expect(await screen.findAllByText('brief')).not.toHaveLength(0);
    expect(screen.getByLabelText('Close details')).toBeOnTheScreen();
  });

  it('lists the saves with no topic under the unsorted id', async () => {
    const db = await seed();
    await createOrBumpSave(db, { inboxId: 99, url: null, canonicalUrl: null, source: 'text', sourceApp: null, sharedText: 'still waiting', note: null, now: daysAgoAt(0, 8) });
    mockTopicId = 'unsorted';
    await renderWithDb(db, <TopicDetailScreen />);
    expect(await screen.findByText('still waiting')).toBeOnTheScreen();
    expect(screen.getByText('Unsorted')).toBeOnTheScreen();
    expect(screen.queryByText('Options flow scanner')).toBeNull();
  });

  it('goes back after the topic is merged away', async () => {
    const db = await seed();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.text === 'Merge')?.onPress?.());
    await renderWithDb(db, <TopicDetailScreen />);
    await screen.findByText('Trading');
    await fireEvent.press(screen.getByLabelText('Topic actions'));
    await fireEvent.press(screen.getByText('Merge into another topic'));
    await fireEvent.press(screen.getByLabelText('Merge into Security'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
