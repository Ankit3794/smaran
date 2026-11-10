// The four bottom tabs (Timeline / Topics / Search / Settings), styled like the mockup's nav bar.
// Each tab is a file in this folder; the Timeline is index.tsx, so it is the app's home screen at "/".
// Until first-run onboarding is finished (setting onboarded=1), the tabs send the user to the welcome screen.
// The check lives here rather than in the root layout because a redirect needs the root Stack already mounted.
import { useEffect, useState } from 'react';
import { Text, View, type ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useDb } from '@/db/DbProvider';
import { getSetting } from '@/db/settings';
import { colors, fonts } from '@/ui/theme';

function tabIcon(glyph: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 16, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const db = useDb();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    // If the setting can't be read, show the app rather than trapping the user in onboarding.
    getSetting(db, 'onboarded', '0').then((value) => setOnboarded(value === '1'), () => setOnboarded(true));
  }, [db]);

  // A plain paper-coloured view while the one-row read finishes, so the tabs don't flash before a redirect.
  if (onboarded === null) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (!onboarded) return <Redirect href="/onboarding/welcome" />;

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
