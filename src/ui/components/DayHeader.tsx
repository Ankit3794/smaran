// Day heading in the Timeline: serif title ("Today") with a small sans sub-label ("Tue 10 Nov").
import { Text, View } from 'react-native';
import { colors, fonts } from '@/ui/theme';

export function DayHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, backgroundColor: colors.background }}>
      <Text style={{ fontFamily: fonts.heading, fontSize: 15, color: colors.ink }}>{title}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>{sub}</Text>
    </View>
  );
}
