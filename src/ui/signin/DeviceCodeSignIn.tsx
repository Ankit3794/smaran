// Sign-in for a ChatGPT subscription: ChatGPT gives us a short code, the user types it on OpenAI's page,
// and meanwhile this screen polls until they approve. There is nothing to paste back.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { codexPoll, codexStartDevice } from '@/ai/auth/codexOAuth';
import { AiError } from '@/ai/types';
import { useDb } from '@/db/DbProvider';
import { Button } from '@/ui/components/Button';
import { finishSignIn } from '@/ui/signin/finishSignIn';
import { colors, fonts, radius } from '@/ui/theme';

const TEN_MINUTES_MS = 10 * 60 * 1000;

export function DeviceCodeSignIn() {
  const db = useDb();
  const router = useRouter();
  const [device, setDevice] = useState<Awaited<ReturnType<typeof codexStartDevice>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Changing this restarts the whole flow (used by "Try again").
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // The poll cannot be cancelled, so after leaving the screen we just ignore whatever it returns.
    let screenClosed = false;
    async function signIn() {
      try {
        setError(null);
        const started = await codexStartDevice(fetch);
        if (screenClosed) return;
        setDevice(started);
        WebBrowser.openBrowserAsync(started.verifyUrl);
        const tokens = await codexPoll(fetch, started, { sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs: TEN_MINUTES_MS });
        if (!screenClosed) await finishSignIn(db, router, 'chatgpt-sub', tokens);
      } catch (caught) {
        if (!screenClosed) setError(caught instanceof AiError ? caught.message : 'Sign-in failed. Please try again.');
      }
    }
    signIn();
    return () => {
      screenClosed = true;
    };
  }, [attempt, db, router]);

  if (error !== null) {
    return (
      <View>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.accent, marginBottom: 12 }}>{error}</Text>
        <Button
          label="Try again"
          onPress={() => {
            setDevice(null);
            setAttempt(attempt + 1);
          }}
        />
      </View>
    );
  }

  return (
    <View>
      <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.ink }}>
        Enter this code on the OpenAI page that just opened, then approve the sign-in.
      </Text>
      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius, padding: 18, marginVertical: 16, alignItems: 'center' }}>
        <Text selectable style={{ fontFamily: fonts.heading, fontSize: 30, letterSpacing: 3, color: colors.ink }}>
          {device?.userCode ?? '…'}
        </Text>
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, textAlign: 'center', marginBottom: 16 }}>Waiting for you to approve…</Text>
      {device !== null && <Button variant="secondary" label="Copy code" onPress={() => Clipboard.setStringAsync(device.userCode)} />}
      {device !== null && (
        <Text onPress={() => WebBrowser.openBrowserAsync(device.verifyUrl)} style={{ textAlign: 'center', fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, marginTop: 12 }}>
          Open the OpenAI page again
        </Text>
      )}
    </View>
  );
}
