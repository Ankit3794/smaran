// Tests for the useTimeline hook's filter handling: slow answers for an old filter must be ignored,
// and a new filter starts from the first page again. The database calls are mocked so timing is controlled.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { DbContext } from '@/db/DbProvider';
import { listTimeline } from '@/db/saves';
import { useTimeline } from '@/ui/hooks/useTimeline';
import type { Save } from '@/core/types';
import type { Db } from '@/db/db';

jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: jest.fn() }) }));
jest.mock('@/db/saves', () => ({ listTimeline: jest.fn() }));
jest.mock('@/db/topics', () => ({ listTopics: jest.fn().mockResolvedValue([]) }));

const fakeSave = (id: number) => ({ id }) as Save;
const wrapper = ({ children }: { children: React.ReactNode }) => <DbContext.Provider value={{} as Db}>{children}</DbContext.Provider>;

beforeEach(() => jest.clearAllMocks());

describe('useTimeline', () => {
  it('ignores a slow answer for a filter that is no longer selected', async () => {
    let answerFirstFilter: (saves: Save[]) => void = () => {};
    (listTimeline as jest.Mock).mockImplementation((_db, filter) =>
      filter.topicId === 1 ? new Promise((resolve) => (answerFirstFilter = resolve)) : Promise.resolve([fakeSave(2)]),
    );
    const { result, rerender } = await renderHook((props: { topicId: number }) => useTimeline(props), { wrapper, initialProps: { topicId: 1 } });
    await rerender({ topicId: 2 });
    await waitFor(() => expect(result.current.saves.map((save) => save.id)).toEqual([2]));

    await act(async () => answerFirstFilter([fakeSave(1)]));
    expect(result.current.saves.map((save) => save.id)).toEqual([2]);
  });

  it('starts from the first page again when the filter changes', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => fakeSave(index + 1));
    (listTimeline as jest.Mock).mockResolvedValue(fullPage);
    const { result, rerender } = await renderHook((props: { tag?: string }) => useTimeline(props), { wrapper, initialProps: {} });
    await waitFor(() => expect(result.current.saves).toHaveLength(100));

    await act(async () => result.current.loadMore());
    await waitFor(() => expect(listTimeline).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ limit: 200 })));

    await rerender({ tag: 'options' });
    await waitFor(() => expect(listTimeline).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ tag: 'options', limit: 100 })));
    expect(listTimeline).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tag: 'options', limit: 200 }));
  });
});
