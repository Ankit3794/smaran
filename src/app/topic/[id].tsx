// Topic detail: the topic's name, count and last save time, its top tags as filter chips, and its saves
// on a journal line grouped by day. A stack route above the tabs, opened from the Topics tab.
// The id "unsorted" is the route for saves with no topic yet; any other id is a topics table id.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { groupByDay, lastSaveLabel } from '@/core/dates';
import { useDb } from '@/db/DbProvider';
import { topTags } from '@/db/topics';
import { JournalLine } from '@/ui/components/JournalLine';
import { SaveCard } from '@/ui/components/SaveCard';
import { SaveSheet } from '@/ui/components/SaveSheet';
import { TopicActions } from '@/ui/components/TopicActions';
import { useReloadOnChange } from '@/ui/hooks/useReloadOnChange';
import { useTimeline } from '@/ui/hooks/useTimeline';
import { useTopics } from '@/ui/hooks/useTopics';
import { colors, fonts } from '@/ui/theme';

const TOP_TAG_COUNT = 8;

type TagCount = { name: string; count: number };

function TagChip({ label, count, selected, onPress }: { label: string; count?: number; selected: boolean; onPress: () => void }) {
  const textColor = selected ? colors.background : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count === undefined ? undefined : `Filter by ${label}, ${count} ${count === 1 ? 'save' : 'saves'}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: selected ? colors.ink : colors.chip }}
    >
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: textColor }}>{label}</Text>
      {count !== undefined && <Text style={{ fontFamily: fonts.body, fontSize: 12, color: textColor, opacity: 0.6 }}>{count}</Text>}
    </Pressable>
  );
}

export default function TopicDetailScreen() {
  const db = useDb();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // null is how the data layer says "saves with no topic".
  const topicId = id === 'unsorted' ? null : Number(id);

  const { topics, unsorted } = useTopics();
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [openSaveId, setOpenSaveId] = useState<number | null>(null);
  const [showActions, setShowActions] = useState(false);
  const { saves, loadMore } = useTimeline({ topicId, tag });

  const reloadTags = useCallback(() => {
    if (topicId === null) return;
    topTags(db, topicId, TOP_TAG_COUNT).then(setTags, () => {});
  }, [db, topicId]);
  useEffect(reloadTags, [reloadTags]);
  useReloadOnChange(reloadTags, ['saves', 'save_tags']);

  const topic = topicId === null ? undefined : topics.find((candidate) => candidate.id === topicId);
  const summary = topicId === null ? unsorted : topic;
  const title = topicId === null ? 'Unsorted' : (topic?.name ?? '');
  const subtitle =
    summary === undefined
      ? ''
      : `${summary.count} ${summary.count === 1 ? 'save' : 'saves'}${summary.lastSavedAt === null ? '' : ` · last one ${lastSaveLabel(summary.lastSavedAt, Date.now())}`}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        scrollEventThrottle={200}
        // Near the bottom, ask for the next page of older saves.
        onScroll={({ nativeEvent }) => {
          const distanceFromEnd = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
          if (distanceFromEnd < 400) loadMore();
        }}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()}>
              <Text style={{ fontSize: 20, color: colors.ink }}>←</Text>
            </Pressable>
            {topic !== undefined && (
              <Pressable accessibilityRole="button" accessibilityLabel="Topic actions" hitSlop={12} onPress={() => setShowActions(true)}>
                <Text style={{ fontSize: 20, color: colors.ink }}>⋯</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: topic?.color ?? colors.line }} />
            <Text style={{ fontFamily: fonts.heading, fontSize: 26, color: colors.ink }}>{title}</Text>
          </View>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 }}>{subtitle}</Text>
        </View>

        {tags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
            <TagChip label="All tags" selected={tag === undefined} onPress={() => setTag(undefined)} />
            {tags.map((tagCount) => (
              <TagChip key={tagCount.name} label={tagCount.name} count={tagCount.count} selected={tag === tagCount.name} onPress={() => setTag(tagCount.name)} />
            ))}
          </ScrollView>
        )}

        <JournalLine
          groups={groupByDay(saves, Date.now())}
          renderSave={(save) => <SaveCard save={save} showTopic={false} onPress={() => setOpenSaveId(save.id)} />}
        />
      </ScrollView>

      {openSaveId !== null && <SaveSheet saveId={openSaveId} onClose={() => setOpenSaveId(null)} />}
      {showActions && topic !== undefined && (
        <TopicActions
          topic={topic}
          otherTopics={topics.filter((candidate) => candidate.id !== topic.id)}
          onClose={() => setShowActions(false)}
          onMerged={() => router.back()}
        />
      )}
    </SafeAreaView>
  );
}
