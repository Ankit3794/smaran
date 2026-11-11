// The Insights screen ("your library in numbers"), opened from Settings → Library and from the Search tab.
// Totals as four tiles, saves and storage per platform, and saves per week over the last 12 weeks.
// Numbers come from useInsights (db/insights.ts); the charts are PlatformBars and WeeklyBars.
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PlatformBars } from '@/ui/components/PlatformBars';
import { WeeklyBars } from '@/ui/components/WeeklyBars';
import { useInsights } from '@/ui/hooks/useInsights';
import { formatBytes } from '@/ui/storage';
import { colors, fonts, radius } from '@/ui/theme';

function SectionHeader({ title }: { title: string }) {
  return <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted, marginTop: 26, marginBottom: 12 }}>{title}</Text>;
}

function StatTile({ label, value, sub, accessibilityLabel }: { label: string; value: string; sub?: string; accessibilityLabel: string }) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{ flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: radius, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}
    >
      <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 24, color: colors.ink, marginTop: 4 }}>{value}</Text>
      {sub !== undefined && <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, marginTop: 2 }}>{sub}</Text>}
    </View>
  );
}

// "1 more than last week" / "2 fewer than last week" / "same as last week".
function comparedWithLastWeek(thisWeek: number, lastWeek: number): string {
  const difference = thisWeek - lastWeek;
  if (difference === 0) return 'same as last week';
  return `${Math.abs(difference)} ${difference > 0 ? 'more' : 'fewer'} than last week`;
}

export default function InsightsScreen() {
  const router = useRouter();
  const insights = useInsights();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 20, color: colors.ink }}>←</Text>
        </Pressable>
        <Text style={{ fontFamily: fonts.heading, fontSize: 26, color: colors.ink, marginTop: 6 }}>Insights</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 }}>Your library in numbers</Text>

        {insights !== null && insights.total === 0 && (
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 24 }}>
            Nothing saved yet. Share a link to Smaran and it will show up here.
          </Text>
        )}

        {insights !== null && insights.total > 0 && (() => {
          const openedShare = `${Math.round((insights.opened / insights.total) * 100)}%`;
          const weekChange = comparedWithLastWeek(insights.thisWeek, insights.lastWeek);
          return (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
              <StatTile label="Saves" value={String(insights.total)} accessibilityLabel={`Saves: ${insights.total}`} />
              <StatTile
                label="This week"
                value={String(insights.thisWeek)}
                sub={weekChange}
                accessibilityLabel={`This week: ${insights.thisWeek}, ${weekChange}`}
              />
              <StatTile
                label="Opened"
                value={openedShare}
                sub={`${insights.opened} of ${insights.total}`}
                accessibilityLabel={`Opened: ${openedShare}, ${insights.opened} of ${insights.total}`}
              />
              <StatTile label="On this phone" value={formatBytes(insights.libraryBytes)} accessibilityLabel={`On this phone: ${formatBytes(insights.libraryBytes)}`} />
            </View>

            <SectionHeader title="By platform" />
            <PlatformBars platforms={insights.platforms} total={insights.total} />

            <SectionHeader title="Saves per week" />
            <WeeklyBars counts={insights.weeks} />
          </>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}
