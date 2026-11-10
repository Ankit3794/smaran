// UI tests for SaveCard: what text it shows for each stage of a save, and when the unread dot appears.
// Pure rendering of a Save object, so nothing is mocked except the gradient native view.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { clockTime } from '@/core/dates';
import type { Save } from '@/core/types';
import { SaveCard } from '@/ui/components/SaveCard';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));

function makeSave(overrides: Partial<Save> = {}): Save {
  return {
    id: 1, url: 'https://x.com/quantdesk/status/1', canonicalUrl: null, source: 'x', sourceApp: null, sharedText: 'shared words',
    title: 'Options flow scanner', author: 'quantdesk', extractedText: null, imageUrl: null, thumbPath: null,
    summary: 'A scanner that spots unusual options flow', brief: null, topicId: 1, topicName: 'Trading', topicColor: '#2F7D5B', tags: [],
    note: null, status: 'done', statusReason: null, statusDetail: null, attempts: 0, nextRetryAt: null,
    createdAt: 0, lastSavedAt: new Date(2026, 10, 10, 18, 5).getTime(), openedAt: null, extra: {}, ...overrides,
  };
}

describe('SaveCard', () => {
  it('shows summary, author, time and topic', async () => {
    await render(<SaveCard save={makeSave()} onPress={() => {}} />);
    expect(screen.getByText('A scanner that spots unusual options flow')).toBeOnTheScreen();
    expect(screen.getByText('@quantdesk')).toBeOnTheScreen();
    expect(screen.getByText(clockTime(new Date(2026, 10, 10, 18, 5).getTime()))).toBeOnTheScreen();
    expect(screen.getByText('Trading')).toBeOnTheScreen();
  });

  it('falls back from summary to title to url to shared text', async () => {
    const { rerender } = await render(<SaveCard save={makeSave({ summary: null })} onPress={() => {}} />);
    expect(screen.getByText('Options flow scanner')).toBeOnTheScreen();
    await rerender(<SaveCard save={makeSave({ summary: null, title: null })} onPress={() => {}} />);
    expect(screen.getByText('https://x.com/quantdesk/status/1')).toBeOnTheScreen();
    await rerender(<SaveCard save={makeSave({ summary: null, title: null, url: null })} onPress={() => {}} />);
    expect(screen.getByText('shared words')).toBeOnTheScreen();
  });

  it('shows the unread dot only when the save has never been opened', async () => {
    const { rerender } = await render(<SaveCard save={makeSave({ openedAt: null })} onPress={() => {}} />);
    expect(screen.getByTestId('unread-dot')).toBeOnTheScreen();
    await rerender(<SaveCard save={makeSave({ openedAt: 123 })} onPress={() => {}} />);
    expect(screen.queryByTestId('unread-dot')).toBeNull();
  });

  it('replaces the topic with a status while the save is not finished', async () => {
    const { rerender } = await render(<SaveCard save={makeSave({ status: 'waiting_ai' })} onPress={() => {}} />);
    expect(screen.getByText('Waiting for AI')).toBeOnTheScreen();
    expect(screen.queryByText('Trading')).toBeNull();
    await rerender(<SaveCard save={makeSave({ status: 'fetching' })} onPress={() => {}} />);
    expect(screen.getByText('Reading…')).toBeOnTheScreen();
  });

  it('hides the topic when showTopic is false, and reports presses', async () => {
    const onPress = jest.fn();
    await render(<SaveCard save={makeSave()} onPress={onPress} showTopic={false} />);
    expect(screen.queryByText('Trading')).toBeNull();
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
