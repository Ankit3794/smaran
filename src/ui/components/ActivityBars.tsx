// Seven small bars, one per day (oldest to today), showing how many saves a topic got each day.
// Used on every Topics row; the counts come from listTopics' `last7`.
import { View } from 'react-native';

const BAR_BASE_HEIGHT = 4;
const BAR_HEIGHT_PER_SAVE = 6;
const BAR_MAX_HEIGHT = 34;

export function ActivityBars({ counts, color }: { counts: number[]; color: string }) {
  return (
    <View testID="activity-bars" accessibilityLabel="Saves per day, last 7 days" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_MAX_HEIGHT }}>
      {counts.map((count, index) => (
        <View
          key={index}
          testID="activity-bar"
          // Quiet days stay as a faint stub so the seven-day rhythm is still visible.
          style={{ width: 5, borderRadius: 2, backgroundColor: color, opacity: count > 0 ? 1 : 0.25, height: Math.min(BAR_BASE_HEIGHT + count * BAR_HEIGHT_PER_SAVE, BAR_MAX_HEIGHT) }}
        />
      ))}
    </View>
  );
}
