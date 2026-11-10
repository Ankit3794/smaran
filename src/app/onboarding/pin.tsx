// Route /onboarding/pin: the one tip that makes saving fast (pin Smaran in the Android share menu).
// "Got it" finishes first-run onboarding (setting onboarded=1) and continues to Connect your AI, which can be skipped.
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDb } from '@/db/DbProvider';
import { setSetting } from '@/db/settings';
import { Button } from '@/ui/components/Button';
import { colors, fonts, radius } from '@/ui/theme';

export default function PinTipScreen() {
  const db = useDb();
  const router = useRouter();

  async function finish() {
    await setSetting(db, 'onboarded', '1');
    // Replace, so Back from Connect doesn't return to the onboarding screens.
    router.replace('/onboarding/connect');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 24, paddingTop: 96 }}>
      <Text style={{ fontFamily: fonts.heading, fontSize: 24, color: colors.ink }}>One tip</Text>
      <View style={{ backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 18, marginTop: 20 }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.ink }}>
          Long-press Smaran in the share menu and tap Pin, so it's always first.
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <Button label="Got it" onPress={finish} />
    </View>
  );
}
