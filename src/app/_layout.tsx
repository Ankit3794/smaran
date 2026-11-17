// Root layout for Expo Router: loads the fonts, opens the database once, then renders every screen
// inside a Stack with the database available through useDb(). The launch animation covers all of this on a cold
// start and ends on the Timeline's title (or fades, on first run before onboarding).
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { openDb, type Db } from '@/db/db';
import { DbContext } from '@/db/DbProvider';
import { getSetting } from '@/db/settings';
import { holdLaunchScreen, LaunchAnimation } from '@/ui/components/LaunchAnimation';
import { colors } from '@/ui/theme';

holdLaunchScreen();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  // If a font fails to load, carry on with the system font rather than waiting forever.
  const fontsReady = fontsLoaded || fontError !== null;
  const [db, setDb] = useState<Db | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  // Whether the first screen is the Timeline (onboarded) or the welcome screen; decides where the animation ends.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [launching, setLaunching] = useState(true);
  const endLaunch = useCallback(() => setLaunching(false), []);

  useEffect(() => {
    openDb().then(
      async (openedDb) => {
        // Same rule as the tabs layout: if the setting can't be read, show the app.
        setOnboarded(await getSetting(openedDb, 'onboarded', '0').then((value) => value === '1', () => true));
        setDb(openedDb);
      },
      (error) => setDbError(error instanceof Error ? error.message : 'Could not open the database'),
    );
  }, []);

  let content: React.ReactNode;
  if (dbError !== null) {
    content = (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <Text>{dbError}</Text>
      </View>
    );
  } else if (!fontsReady || db === null) {
    // Nothing yet; the launch animation covers this.
    content = null;
  } else {
    content = (
      <DbContext.Provider value={db}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </DbContext.Provider>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Smaran is always light (app.json "userInterfaceStyle"), so the clock and icons at the top must be dark.
          Left to the system they can come out white, which is unreadable on the cream background. */}
      <StatusBar style="dark" />
      {content}
      {launching && (
        <LaunchAnimation
          fontsLoaded={fontsReady}
          ready={dbError !== null || (fontsReady && db !== null)}
          landOnTitle={dbError === null && onboarded === true}
          onDone={endLaunch}
        />
      )}
    </View>
  );
}
