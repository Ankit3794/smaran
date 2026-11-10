// "I have an API key instead": pick Claude, OpenAI or Gemini, paste the key, and prove it works with a one-word test
// before keeping it. A key that fails is removed again so nothing half-connected is left behind.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getActiveProvider, testConnection } from '@/ai/registry';
import { removeCredential, saveCredential } from '@/ai/credentials';
import { AiError, type ProviderId } from '@/ai/types';
import { useDb } from '@/db/DbProvider';
import { setSetting } from '@/db/settings';
import { Button } from '@/ui/components/Button';
import { colors, fonts, radius } from '@/ui/theme';

const KEY_PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'claude-key', label: 'Claude' },
  { id: 'openai-key', label: 'OpenAI' },
  { id: 'gemini-key', label: 'Gemini' },
];

export function ApiKeyForm() {
  const db = useDb();
  const router = useRouter();
  const [providerId, setProviderId] = useState<ProviderId>('claude-key');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await saveCredential(providerId, { kind: 'apiKey', key: key.trim() });
      await setSetting(db, 'activeProvider', providerId);
      const active = await getActiveProvider(db, fetch);
      if (active === null) throw new AiError('not_connected', 'Could not use that key');
      await testConnection(active.provider, active.model);
      router.replace('/');
    } catch (caught) {
      await removeCredential(providerId);
      await setSetting(db, 'activeProvider', '');
      setError(caught instanceof AiError ? caught.message : 'Could not check that key. Please try again.');
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', gap: 7, marginBottom: 12 }}>
        {KEY_PROVIDERS.map((option) => {
          const selected = option.id === providerId;
          return (
            <Text
              key={option.id}
              onPress={() => setProviderId(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 999,
                overflow: 'hidden',
                fontFamily: fonts.bodyMedium,
                fontSize: 12,
                backgroundColor: selected ? colors.ink : colors.chip,
                color: selected ? colors.background : colors.ink,
              }}
            >
              {option.label}
            </Text>
          );
        })}
      </View>
      <TextInput
        value={key}
        onChangeText={setKey}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste your API key"
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius, padding: 12, fontFamily: fonts.body, fontSize: 13, color: colors.ink, marginBottom: 12 }}
      />
      {error !== null && <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.accent, marginBottom: 8 }}>{error}</Text>}
      <Button label="Save and test key" onPress={submit} disabled={busy || key.trim() === ''} />
    </View>
  );
}
