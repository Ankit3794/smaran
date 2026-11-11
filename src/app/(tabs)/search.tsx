// The Search tab: type a keyword, narrow it by time / source / topic, and see results grouped by topic.
// Before anything is typed or picked it shows SearchBrowse (recent searches, platforms, popular tags); a filter on its
// own also lists saves. Results come from useSearch (FTS5 via searchSaves); tapping one opens the same SaveSheet as the Timeline.
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Source } from '@/core/types';
import { useDb } from '@/db/DbProvider';
import { clearRecentSearches, rememberSearch } from '@/db/search';
import { ChoiceModal } from '@/ui/components/ChoiceModal';
import { DayHeader } from '@/ui/components/DayHeader';
import { SaveCard } from '@/ui/components/SaveCard';
import { SaveSheet } from '@/ui/components/SaveSheet';
import { SearchBrowse } from '@/ui/components/SearchBrowse';
import { SwipeToDelete } from '@/ui/components/SwipeToDelete';
import { UndoBar } from '@/ui/components/UndoBar';
import { useBrowse } from '@/ui/hooks/useBrowse';
import { useSearch } from '@/ui/hooks/useSearch';
import { useTopics } from '@/ui/hooks/useTopics';
import { useUndoableDelete } from '@/ui/hooks/useUndoableDelete';
import { ALL_SOURCES, SOURCE_NAMES } from '@/ui/sources';
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
  ...ALL_SOURCES.map((source) => ({ label: SOURCE_NAMES[source], source })),
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

const ANY_TIME: TimeChoice = { label: 'Any time' };
const ALL_TOPICS: { label: string; topicId?: number } = { label: 'All topics' };

export default function SearchScreen() {
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [time, setTime] = useState<TimeChoice>(ANY_TIME);
  const [sourceChoice, setSourceChoice] = useState(SOURCE_CHOICES[0]);
  const [topicChoice, setTopicChoice] = useState(ALL_TOPICS);
  const [openSaveId, setOpenSaveId] = useState<number | null>(null);
  const { topics } = useTopics();
  const { pendingIds, remove, undo } = useUndoableDelete();
  const { groups, searchedQuery, settled } = useSearch(query, { since: time.since, source: sourceChoice.source, topicId: topicChoice.topicId });
  const browse = useBrowse();

  const hasQuery = query.trim() !== '';
  const hasFilter = time.since !== undefined || sourceChoice.source !== undefined || topicChoice.topicId !== undefined;
  const topicChoices = () => [ALL_TOPICS, ...topics.map((topic) => ({ label: topic.name, topicId: topic.id }))];

  // A search counts as "made" when it is submitted or one of its results is opened.
  function remember(searched: string) {
    rememberSearch(db, searched).then(browse.reload, () => {});
  }

  function clearFilters() {
    setTime(ANY_TIME);
    setSourceChoice(SOURCE_CHOICES[0]);
    setTopicChoice(ALL_TOPICS);
  }

  function openSave(id: number) {
    if (hasQuery) remember(query);
    setOpenSaveId(id);
  }

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
          onSubmitEditing={() => remember(query)}
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
        {hasFilter && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" onPress={clearFilters} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.accent }}>✕ Clear</Text>
          </Pressable>
        )}
      </View>

      {/* Results are capped (by what one keyword matches, or 200 when browsing by filter), so a plain ScrollView is enough. */}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        {!hasQuery && !hasFilter && (
          <SearchBrowse
            {...browse}
            onSearch={setQuery}
            onPickSource={(source) => setSourceChoice({ label: SOURCE_NAMES[source], source })}
            onClearRecent={() => clearRecentSearches(db).then(browse.reload, () => {})}
            onOpenInsights={() => router.push('/insights')}
          />
        )}
        {groups.map((group) => (
          <View key={group.topicId ?? 'unsorted'}>
            <DayHeader title={group.topicName} sub={group.saves.length === 1 ? '1 result' : `${group.saves.length} results`} />
            {group.saves
              .filter((save) => !pendingIds.includes(save.id))
              .map((save) => (
                <SwipeToDelete key={save.id} testID={`swipe-${save.id}`} onDelete={() => remove(save.id)}>
                  <SaveCard save={save} query={searchedQuery} showTopic={false} onPress={() => openSave(save.id)} />
                </SwipeToDelete>
              ))}
          </View>
        ))}
        {hasQuery && searchedQuery === query && groups.length === 0 && (
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted, paddingHorizontal: 16, paddingTop: 16 }}>No saves match "{query.trim()}".</Text>
        )}
        {!hasQuery && hasFilter && settled && groups.length === 0 && (
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted, paddingHorizontal: 16, paddingTop: 16 }}>No saves match these filters.</Text>
        )}
        <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, paddingHorizontal: 16, paddingTop: 16 }}>
          Searches summaries, tags, titles, authors and post text.
        </Text>
      </ScrollView>

      <UndoBar count={pendingIds.length} onUndo={undo} />
      {openSaveId !== null && <SaveSheet saveId={openSaveId} onClose={() => setOpenSaveId(null)} />}
    </SafeAreaView>
  );
}
