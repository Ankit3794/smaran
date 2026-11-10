// Horizontal row of filter chips on the Timeline: "All" plus one chip per topic with its save count.
// Tapping the selected chip again is not needed: "All" clears the filter.
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { TopicSummary } from '@/db/topics';
import { colors, fonts } from '@/ui/theme';

type Props = { topics: TopicSummary[]; selectedTopicId: number | undefined; onSelect: (topicId: number | undefined) => void };

function Chip({ label, count, dotColor, selected, onPress }: { label: string; count?: number; dotColor?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: selected ? colors.ink : colors.chip }}
    >
      {dotColor !== undefined && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }} />}
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: selected ? colors.background : colors.ink }}>{label}</Text>
      {count !== undefined && <Text style={{ fontFamily: fonts.body, fontSize: 12, color: selected ? colors.background : colors.ink, opacity: 0.6 }}>{count}</Text>}
    </Pressable>
  );
}

export function TopicChips({ topics, selectedTopicId, onSelect }: Props) {
  return (
    <View style={{ flexGrow: 0 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
        <Chip label="All" selected={selectedTopicId === undefined} onPress={() => onSelect(undefined)} />
        {topics.map((topic) => (
          <Chip key={topic.id} label={topic.name} count={topic.count} dotColor={topic.color} selected={selectedTopicId === topic.id} onPress={() => onSelect(topic.id)} />
        ))}
      </ScrollView>
    </View>
  );
}
