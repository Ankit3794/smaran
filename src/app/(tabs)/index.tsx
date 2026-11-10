// The Timeline (home): saves grouped by day, topic filter chips, and the queue banner.
// Data comes from useTimeline / useQueue; tapping a card opens the SaveSheet, "+" opens AddLinkSheet. This file only lays it out.
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { groupByDay } from '@/core/dates';
import type { Save } from '@/core/types';
import { AddLinkSheet } from '@/ui/components/AddLinkSheet';
import { DayHeader } from '@/ui/components/DayHeader';
import { QueueBanner } from '@/ui/components/QueueBanner';
import { SaveCard } from '@/ui/components/SaveCard';
import { SaveSheet } from '@/ui/components/SaveSheet';
import { SwipeToDelete } from '@/ui/components/SwipeToDelete';
import { TopicChips } from '@/ui/components/TopicChips';
import { UndoBar } from '@/ui/components/UndoBar';
import { useQueue } from '@/ui/hooks/useQueue';
import { useTimeline } from '@/ui/hooks/useTimeline';
import { useUndoableDelete } from '@/ui/hooks/useUndoableDelete';
import { colors, fonts } from '@/ui/theme';

// FlashList wants one flat list, so day headings and cards are rows of the same list.
type Row = { kind: 'header'; key: string; title: string; sub: string } | { kind: 'save'; key: string; save: Save };

export default function TimelineScreen() {
  const [topicId, setTopicId] = useState<number | undefined>(undefined);
  const [openSaveId, setOpenSaveId] = useState<number | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const { saves, topics, loadMore } = useTimeline({ topicId });
  const { queue, retry } = useQueue();
  const { pendingIds, remove, undo } = useUndoableDelete();

  const rows = useMemo<Row[]>(
    () =>
      // Swiped-away saves disappear at once, while their Undo is still on offer.
      groupByDay(saves.filter((save) => !pendingIds.includes(save.id)), Date.now()).flatMap((group) => [
        { kind: 'header' as const, key: `day-${group.key}`, title: group.title, sub: group.sub },
        ...group.saves.map((save) => ({ kind: 'save' as const, key: `save-${save.id}`, save })),
      ]),
    [saves, pendingIds],
  );
  // Sticky headers need to know which rows are headings.
  const headerIndices = rows.flatMap((row, index) => (row.kind === 'header' ? [index] : []));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ flex: 1, fontFamily: fonts.heading, fontSize: 24, color: colors.ink }}>Smaran</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a link"
          onPress={() => setAddingLink(true)}
          hitSlop={8}
          style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}
        >
          <Text style={{ fontSize: 20, lineHeight: 22, color: colors.accentInk }}>+</Text>
        </Pressable>
      </View>
      <TopicChips topics={topics} selectedTopicId={topicId} onSelect={setTopicId} />
      <QueueBanner queue={queue} onRetry={retry} />
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        stickyHeaderIndices={headerIndices}
        onEndReached={loadMore}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <DayHeader title={item.title} sub={item.sub} />
          ) : (
            <SwipeToDelete testID={`swipe-${item.save.id}`} onDelete={() => remove(item.save.id)}>
              <SaveCard save={item.save} onPress={() => setOpenSaveId(item.save.id)} />
            </SwipeToDelete>
          )
        }
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' }}>
              Nothing saved yet. Share a link from any app and choose Smaran.
            </Text>
          </View>
        }
      />
      <UndoBar count={pendingIds.length} onUndo={undo} />
      {addingLink && <AddLinkSheet onClose={() => setAddingLink(false)} />}
      {openSaveId !== null && <SaveSheet saveId={openSaveId} onClose={() => setOpenSaveId(null)} />}
    </SafeAreaView>
  );
}
