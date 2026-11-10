// Placeholder for the Topics tab so the tab bar is complete; a later task replaces this file with the real screen.
import { Text, View } from 'react-native';
import { colors, fonts } from '@/ui/theme';

export default function TopicsScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <Text style={{ fontFamily: fonts.body, color: colors.muted }}>Topics is coming soon.</Text>
    </View>
  );
}
