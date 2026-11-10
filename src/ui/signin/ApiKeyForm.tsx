// "I have an API key instead": pick Claude, OpenAI or Gemini, paste the key, and prove it works with a one-word test
// before keeping it. The test runs on the pasted key alone, so a key that fails changes nothing: the provider that
// was working stays connected, and an older stored key is not touched.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { activateProvider, keyProvider, testConnection } from '@/ai/registry';
import { saveCredential } from '@/ai/credentials';
import { DEFAULT_MODELS, withTimeout } from '@/ai/providers/errors';
import { AiError } from '@/ai/types';
import { useDb } from '@/db/DbProvider';
import { getSetting } from '@/db/settings';
import { Button } from '@/ui/components/Button';
import { colors, fonts, radius } from '@/ui/theme';

const KEY_PROVIDERS: { id: 'claude-key' | 'openai-key' | 'gemini-key'; label: string }[] = [
  { id: 'claude-key', label: 'Claude' },
  { id: 'openai-key', label: 'OpenAI' },
  { id: 'gemini-key', label: 'Gemini' },
];

export function ApiKeyForm() {
  const db = useDb();
  const router = useRouter();
  const [providerId, setProviderId] = useState<(typeof KEY_PROVIDERS)[number]['id']>('claude-key');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const pastedKey = key.trim();
    try {
      const model = await getSetting(db, `model.${providerId}`, DEFAULT_MODELS[providerId]);
      await testConnection(keyProvider(providerId, withTimeout(fetch, 30_000), pastedKey), model);
      // Only a key that answered is stored and switched to.
      await saveCredential(providerId, { kind: 'apiKey', key: pastedKey });
      await activateProvider(db, providerId);
      router.replace('/');
    } catch (caught) {
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
