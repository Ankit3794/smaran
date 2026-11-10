// Route /onboarding/signin?provider=<ProviderId>: the subscription sign-in for the provider chosen on the connect screen.
// Picks the flow that matches how that provider hands out access (paste a code, or approve a device code).
import { ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DeviceCodeSignIn } from '@/ui/signin/DeviceCodeSignIn';
import { PasteCodeSignIn } from '@/ui/signin/PasteCodeSignIn';
import { colors, fonts } from '@/ui/theme';

const PROVIDER_NAMES = { 'claude-sub': 'Claude', 'chatgpt-sub': 'ChatGPT', 'gemini-sub': 'Gemini' };

export default function SignInScreen() {
  const { provider } = useLocalSearchParams<{ provider: string }>();
  const router = useRouter();

  if (provider !== 'claude-sub' && provider !== 'chatgpt-sub' && provider !== 'gemini-sub') {
    // Only reachable by a hand-typed link; send the user back to pick a provider.
    router.back();
    return null;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 48 }}>
      <Text onPress={() => router.back()} style={{ fontFamily: fonts.body, fontSize: 22, color: colors.ink }}>
        ←
      </Text>
      <Text style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.ink, marginTop: 6, marginBottom: 16 }}>Connect {PROVIDER_NAMES[provider]}</Text>
      {provider === 'chatgpt-sub' ? <DeviceCodeSignIn /> : <PasteCodeSignIn providerId={provider} />}
    </ScrollView>
  );
}
