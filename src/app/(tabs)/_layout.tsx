// The four bottom tabs (Timeline / Topics / Search / Settings), styled like the mockup's nav bar.
// Each tab is a file in this folder; the Timeline is index.tsx, so it is the app's home screen at "/".
import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { colors, fonts } from '@/ui/theme';

function tabIcon(glyph: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 16, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Timeline', tabBarIcon: tabIcon('◷') }} />
      <Tabs.Screen name="topics" options={{ title: 'Topics', tabBarIcon: tabIcon('◫') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: tabIcon('⌕') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('⚙') }} />
    </Tabs>
  );
}
