// The "Deleted · Undo" bar shown at the bottom of a list for a few seconds after a swipe-delete.
// Renders nothing when there is nothing to undo.
import { Pressable, Text, View } from 'react-native';
import { colors, fonts, radius } from '@/ui/theme';

export function UndoBar({ count, onUndo }: { count: number; onUndo: () => void }) {
  if (count === 0) return null;
  return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius, backgroundColor: colors.ink }}>
      <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.background }}>
        {count === 1 ? 'Save deleted' : `${count} saves deleted`}
      </Text>
      <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={10}>
        <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.accent }}>Undo</Text>
      </Pressable>
    </View>
  );
}
