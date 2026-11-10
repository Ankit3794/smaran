// Route /onboarding/connect: "Connect your AI". The user picks Claude, ChatGPT or Gemini (subscription sign-in)
// or switches to an API key; Continue opens /onboarding/signin for the chosen provider. Skipping is allowed.
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/ui/components/Button';
import { ProviderCard } from '@/ui/components/ProviderCard';
import { ApiKeyForm } from '@/ui/signin/ApiKeyForm';
import { colors, fonts } from '@/ui/theme';

const SUBSCRIPTIONS = [
  { id: 'claude-sub', name: 'Claude', subtitle: 'Sign in with Pro / Max', logoColor: '#D97757', logoGlyph: '✳' },
  { id: 'chatgpt-sub', name: 'ChatGPT', subtitle: 'Sign in with Plus / Pro', logoColor: '#10a37f', logoGlyph: '◎' },
  { id: 'gemini-sub', name: 'Gemini', subtitle: 'Sign in with Google · free tier', logoColor: '#7B6FD6', logoGlyph: '✦' },
] as const;

export default function ConnectScreen() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<(typeof SUBSCRIPTIONS)[number]['id']>('claude-sub');
  const [useApiKey, setUseApiKey] = useState(false);
  const selected = SUBSCRIPTIONS.find((option) => option.id === selectedId)!;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 56, flexGrow: 1 }}>
      <Text style={{ fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, color: colors.ink, marginBottom: 8 }}>Pick the AI that reads your saves</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.muted, marginBottom: 16 }}>
        For each save it writes a one-line summary, a topic and tags. Your library stays on this phone, and only the post text goes to the AI you pick.
      </Text>

      {useApiKey ? (
        <ApiKeyForm />
      ) : (
        SUBSCRIPTIONS.map((option) => <ProviderCard key={option.id} {...option} selected={option.id === selectedId} onPress={() => setSelectedId(option.id)} />)
      )}

      <Text onPress={() => setUseApiKey(!useApiKey)} style={{ textAlign: 'center', fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.accent, marginTop: 14 }}>
        {useApiKey ? 'Sign in with a subscription instead' : 'I have an API key instead'}
      </Text>

      <View style={{ flex: 1 }} />
      <View style={{ marginTop: 24 }}>
        {!useApiKey && <Button label={`Continue with ${selected.name}`} onPress={() => router.push({ pathname: '/onboarding/signin', params: { provider: selectedId } })} />}
        <Text onPress={() => router.replace('/')} style={{ textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 14 }}>
          Skip for now
        </Text>
      </View>
    </ScrollView>
  );
}
