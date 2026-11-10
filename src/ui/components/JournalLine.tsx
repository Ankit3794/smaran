// The topic detail's journal style: a vertical line down the left with a dot per day, and that day's saves beside it.
// Takes the day groups from groupByDay; the screen decides how each save is drawn.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { DayGroup } from '@/core/dates';
import type { Save } from '@/core/types';
import { colors, fonts } from '@/ui/theme';

type Props = { groups: DayGroup[]; renderSave: (save: Save) => ReactNode };

export function JournalLine({ groups, renderSave }: Props) {
  return (
    <View style={{ paddingLeft: 24 }}>
      <View style={{ position: 'absolute', left: 21, top: 14, bottom: 0, width: 2, backgroundColor: colors.line }} />
      {groups.map((group) => (
        <View key={group.key}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 12, paddingBottom: 6 }}>
            <View style={{ position: 'absolute', left: -7, top: 17, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.background }} />
            <Text style={{ fontFamily: fonts.heading, fontSize: 15, color: colors.ink, marginLeft: 12 }}>{group.title}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>{group.sub}</Text>
          </View>
          {group.saves.map((save) => (
            <View key={save.id}>{renderSave(save)}</View>
          ))}
        </View>
      ))}
    </View>
  );
}
