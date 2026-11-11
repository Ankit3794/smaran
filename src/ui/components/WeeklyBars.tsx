// "Saves per week" on the Insights screen: one column per 7-day window, oldest on the left, this week on the right.
// The selected week (this week until another is tapped) is drawn in the accent and named above the chart; the
// others stay quiet. Every column also carries its count as an accessibility label.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fonts } from '@/ui/theme';

const PLOT_HEIGHT = 96;
const BAR_MAX_WIDTH = 24;

function weekName(weeksAgo: number): string {
  if (weeksAgo === 0) return 'This week';
  return weeksAgo === 1 ? '1 week ago' : `${weeksAgo} weeks ago`;
}

function savesLabel(count: number): string {
  return count === 1 ? '1 save' : `${count} saves`;
}

export function WeeklyBars({ counts }: { counts: number[] }) {
  const [selected, setSelected] = useState(counts.length - 1);
  const largest = Math.max(1, ...counts);
  const weeksAgo = (index: number) => counts.length - 1 - index;

  return (
    <View>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.ink, marginBottom: 8 }}>
        {weekName(weeksAgo(selected))} · {savesLabel(counts[selected])}
      </Text>
      <View style={{ height: PLOT_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {counts.map((count, index) => (
          <Pressable
            key={index}
            testID="week-bar"
            accessibilityRole="button"
            accessibilityLabel={`${weekName(weeksAgo(index))}: ${savesLabel(count)}`}
            onPress={() => setSelected(index)}
            // The whole column is the tap target, not just the (maybe tiny) bar.
            style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' }}
          >
            <View
              style={{
                width: '100%', maxWidth: BAR_MAX_WIDTH,
                // An empty week keeps a 2px stub so the run of weeks stays readable.
                height: count === 0 ? 2 : Math.max(4, (count / largest) * PLOT_HEIGHT),
                borderTopLeftRadius: 4, borderTopRightRadius: 4,
                backgroundColor: index === selected ? colors.accent : colors.muted,
                opacity: index === selected ? 1 : 0.35,
              }}
            />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 10.5, color: colors.muted }}>{weekName(counts.length - 1)}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 10.5, color: colors.muted }}>This week</Text>
      </View>
    </View>
  );
}
