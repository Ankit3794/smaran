// The Search tab: type a keyword, narrow it by time / source / topic, and see results grouped by topic.
// Results come from useSearch (FTS5 via searchSaves); tapping a result opens the same SaveSheet as the Timeline.
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Source } from '@/core/types';
import { ChoiceModal } from '@/ui/components/ChoiceModal';
import { DayHeader } from '@/ui/components/DayHeader';
import { SaveCard } from '@/ui/components/SaveCard';
import { SaveSheet } from '@/ui/components/SaveSheet';
import { SwipeToDelete } from '@/ui/components/SwipeToDelete';
import { UndoBar } from '@/ui/components/UndoBar';
import { useSearch } from '@/ui/hooks/useSearch';
import { useTopics } from '@/ui/hooks/useTopics';
import { useUndoableDelete } from '@/ui/hooks/useUndoableDelete';
import { colors, fonts, radius } from '@/ui/theme';

const DAY_MS = 24 * 60 * 60 * 1000;

type TimeChoice = { label: string; since?: number };

// `since` is fixed when the user picks the range; computing it on every render would change the search
// on every render and re-run it forever.
function timeChoices(now: number): TimeChoice[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  return [
    { label: 'Any time' },
    { label: 'Today', since: startOfToday },
    { label: '7 days', since: now - 7 * DAY_MS },
    { label: '30 days', since: now - 30 * DAY_MS },
  ];
}

const SOURCE_CHOICES: Array<{ label: string; source?: Source }> = [
  { label: 'All sources' },
  { label: 'X', source: 'x' },
  { label: 'Reddit', source: 'reddit' },
  { label: 'GitHub', source: 'github' },
  { label: 'Instagram', source: 'instagram' },
  { label: 'Threads', source: 'threads' },
  { label: 'YouTube', source: 'youtube' },
  { label: 'LinkedIn', source: 'linkedin' },
  { label: 'Hacker News', source: 'hackernews' },
  { label: 'Web', source: 'web' },
  { label: 'Text', source: 'text' },
];

// A chip showing the current choice ("Any time ▾"); tapping it opens a small list of the other choices.
function FilterChip<T extends { label: string }>({ current, choices, onPick }: { current: string; choices: () => T[]; onPick: (choice: T) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', gap: 4, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: colors.chip }}
      >
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink }}>{current}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>▾</Text>
      </Pressable>
      {open && <ChoiceModal choices={choices()} current={current} onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [time, setTime] = useState<TimeChoice>({ label: 'Any time' });
  const [sourceChoice, setSourceChoice] = useState(SOURCE_CHOICES[0]);
  const [topicChoice, setTopicChoice] = useState<{ label: string; topicId?: number }>({ label: 'All topics' });
  const [openSaveId, setOpenSaveId] = useState<number | null>(null);
  const { topics } = useTopics();
  const { pendingIds, remove, undo } = useUndoableDelete();
  const { groups, searchedQuery } = useSearch(query, { since: time.since, source: sourceChoice.source, topicId: topicChoice.topicId });

  const hasQuery = query.trim() !== '';
  const topicChoices = () => [{ label: 'All topics' }, ...topics.map((topic) => ({ label: topic.name, topicId: topic.id }))];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: hasQuery ? colors.accent : colors.line }}>
        <Text style={{ fontSize: 15, color: colors.muted }}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your saves"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, paddingVertical: 11, fontFamily: fonts.body, fontSize: 14, color: colors.ink }}
        />
        {hasQuery && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={8}>
            <Text style={{ fontSize: 14, color: colors.muted }}>✕</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <FilterChip current={time.label} choices={() => timeChoices(Date.now())} onPick={setTime} />
        <FilterChip current={sourceChoice.label} choices={() => SOURCE_CHOICES} onPick={setSourceChoice} />
        <FilterChip current={topicChoice.label} choices={topicChoices} onPick={setTopicChoice} />
      </View>

      {/* Results are capped by what one keyword matches, so a plain ScrollView is enough here (no virtualised list). */}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        {groups.map((group) => (
          <View key={group.topicId ?? 'unsorted'}>
            <DayHeader title={group.topicName} sub={group.saves.length === 1 ? '1 result' : `${group.saves.length} results`} />
            {group.saves
              .filter((save) => !pendingIds.includes(save.id))
              .map((save) => (
                <SwipeToDelete key={save.id} testID={`swipe-${save.id}`} onDelete={() => remove(save.id)}>
                  <SaveCard save={save} query={searchedQuery} showTopic={false} onPress={() => setOpenSaveId(save.id)} />
                </SwipeToDelete>
              ))}
          </View>
        ))}
        {hasQuery && searchedQuery === query && groups.length === 0 && (
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted, paddingHorizontal: 16, paddingTop: 16 }}>No saves match "{query.trim()}".</Text>
        )}
        <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, paddingHorizontal: 16, paddingTop: 8 }}>
          Searches summaries, tags, titles, authors and post text.
        </Text>
      </ScrollView>

      <UndoBar count={pendingIds.length} onUndo={undo} />
      {openSaveId !== null && <SaveSheet saveId={openSaveId} onClose={() => setOpenSaveId(null)} />}
    </SafeAreaView>
  );
}
