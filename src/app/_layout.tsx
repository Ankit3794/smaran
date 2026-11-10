// Root layout for Expo Router: loads the fonts, opens the database once, then renders every screen
// inside a Stack with the database available through useDb().
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { openDb, type Db } from '@/db/db';
import { DbContext } from '@/db/DbProvider';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const [db, setDb] = useState<Db | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    openDb().then(setDb, (error) => setDbError(error instanceof Error ? error.message : 'Could not open the database'));
  }, []);

  // A plain paper-coloured view avoids a flash of unstyled text while fonts and the database load.
  if (dbError !== null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' }}>
        <Text>{dbError}</Text>
      </View>
    );
  }
  if (!fontsLoaded || db === null) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    // Swipe gestures (swipe a card left to delete) need this root view around the whole app.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DbContext.Provider value={db}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </DbContext.Provider>
    </GestureHandlerRootView>
  );
}
