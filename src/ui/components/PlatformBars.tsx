// "By platform" on the Insights screen: one row per platform, biggest first, with a thin bar for its share of the
// library and its numbers written out (so nothing is read from the bar alone). One colour for every bar: the badge
// and name say which platform it is.
import { Text, View } from 'react-native';
import type { Source } from '@/core/types';
import { SOURCE_NAMES } from '@/ui/sources';
import { formatBytes } from '@/ui/storage';
import { colors, fonts } from '@/ui/theme';
import { SourceBadge } from './SourceBadge';

type Platform = { source: Source; count: number; opened: number; bytes: number };

export function PlatformBars({ platforms, total }: { platforms: Platform[]; total: number }) {
  const largest = Math.max(1, ...platforms.map((platform) => platform.count));
  return (
    <View style={{ gap: 14 }}>
      {platforms.map(({ source, count, opened, bytes }) => {
        const share = Math.round((count / total) * 100);
        const saves = count === 1 ? '1 save' : `${count} saves`;
        return (
          <View
            key={source}
            testID="platform-row"
            accessible
            accessibilityLabel={`${SOURCE_NAMES[source]}: ${saves}, ${share}%, about ${formatBytes(bytes)}, ${opened} opened`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SourceBadge source={source} size={20} />
              <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink }}>{SOURCE_NAMES[source]}</Text>
              <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink }}>{count}</Text>
            </View>
            {/* Bars are scaled to the biggest platform, so the top row always spans the width. */}
            <View
              style={{
                height: 8, marginTop: 6, width: `${(count / largest) * 100}%`, minWidth: 4,
                backgroundColor: colors.accent, borderTopRightRadius: 4, borderBottomRightRadius: 4,
              }}
            />
            <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, marginTop: 4 }}>
              {share}% · {formatBytes(bytes)} · {opened} opened
            </Text>
          </View>
        );
      })}
    </View>
  );
}
