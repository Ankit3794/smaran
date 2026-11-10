// The Topics tab: one row per topic with its save count, "new this week" and a 7-day activity bar,
// plus an "Unsorted" row for saves the AI hasn't processed yet. Tap opens the topic; long-press opens rename / merge / colour.
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TopicSummary } from '@/db/topics';
import { ActivityBars } from '@/ui/components/ActivityBars';
import { TopicActions } from '@/ui/components/TopicActions';
import { useTopics } from '@/ui/hooks/useTopics';
import { colors, fonts, radius } from '@/ui/theme';

const savesLabel = (count: number) => `${count} ${count === 1 ? 'save' : 'saves'}`;

type RowProps = { color: string; name: string; detail: string; dashed?: boolean; bars?: number[]; onPress: () => void; onLongPress?: () => void };

function TopicRow({ color, name, detail, dashed = false, bars, onPress, onLongPress }: RowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginHorizontal: 10, marginBottom: 7, borderRadius: radius, borderWidth: 1, borderColor: colors.line, borderStyle: dashed ? 'dashed' : 'solid', backgroundColor: dashed ? 'transparent' : colors.card }}
    >
      <View style={{ width: 10, height: 38, borderRadius: 5, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.ink }}>{name}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, marginTop: 2 }}>{detail}</Text>
      </View>
      {bars !== undefined ? <ActivityBars counts={bars} color={color} /> : <Text style={{ color: colors.muted }}>›</Text>}
    </Pressable>
  );
}

export default function TopicsScreen() {
  const router = useRouter();
  const { topics, unsorted } = useTopics();
  const [actionsFor, setActionsFor] = useState<TopicSummary | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
        <Text style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.ink }}>Topics</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 }}>Made by the AI as you save. Long-press to rename or merge.</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: 16 }}>
        {topics.map((topic) => (
          <TopicRow
            key={topic.id}
            color={topic.color}
            name={topic.name}
            detail={`${savesLabel(topic.count)} · ${topic.newThisWeek} new this week`}
            bars={topic.last7}
            onPress={() => router.push(`/topic/${topic.id}`)}
            onLongPress={() => setActionsFor(topic)}
          />
        ))}
        {unsorted.count > 0 && (
          <TopicRow color={colors.line} name="Unsorted" detail={`${unsorted.count} waiting for the AI`} dashed onPress={() => router.push('/topic/unsorted')} />
        )}
        {topics.length === 0 && unsorted.count === 0 && (
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 32 }}>
            Topics appear here once the AI has sorted your first saves.
          </Text>
        )}
        <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, paddingHorizontal: 16, paddingTop: 6 }}>Bars show saves per day over the last 7 days.</Text>
      </ScrollView>
      {actionsFor !== null && (
        <TopicActions topic={actionsFor} otherTopics={topics.filter((topic) => topic.id !== actionsFor.id)} onClose={() => setActionsFor(null)} />
      )}
    </SafeAreaView>
  );
}
