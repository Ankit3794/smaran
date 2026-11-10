// Route /onboarding/welcome: the first screen on a fresh install (the tabs redirect here until onboarded=1).
// Explains what Smaran does and where data goes, then leads to the pin tip and on to Connect your AI.
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/ui/components/Button';
import { colors, fonts } from '@/ui/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 24, paddingTop: 96, flexGrow: 1 }}>
      <Text style={{ fontFamily: fonts.heading, fontSize: 34, color: colors.ink }}>Smaran</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 }}>स्मरण · remembrance</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.ink, marginTop: 28 }}>
        Smaran remembers what you save. Share anything to it — the AI you choose writes a one-line summary, topic and tags. Your
        library stays on this phone; links are fetched from the source or a public mirror, and only the post text goes to your AI.
      </Text>
      <View style={{ flex: 1 }} />
      <Button label="Get started" onPress={() => router.push('/onboarding/pin')} />
    </ScrollView>
  );
}
