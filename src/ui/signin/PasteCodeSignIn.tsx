// Sign-in for Claude and Gemini subscriptions: open the provider's page in the browser, the user copies the code
// it shows, and this screen picks it up from the clipboard (never auto-submitting) and trades it for tokens.
import { useEffect, useState } from 'react';
import { AppState, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getRandomBytes } from 'expo-crypto';
import { createPkce } from '@/ai/auth/pkce';
import { claudeAuthUrl, claudeExchange } from '@/ai/auth/claudeOAuth';
import { googleAuthUrl, googleExchange } from '@/ai/auth/googleOAuth';
import { codeAssistSetup } from '@/ai/providers/codeAssist';
import { AiError, type OAuthTokens } from '@/ai/types';
import { useDb } from '@/db/DbProvider';
import { Button } from '@/ui/components/Button';
import { finishSignIn } from '@/ui/signin/finishSignIn';
import { colors, fonts, radius } from '@/ui/theme';

type Props = { providerId: 'claude-sub' | 'gemini-sub' };

// What each provider's code looks like, so we only prefill from the clipboard when it really is one.
const CODE_SHAPE = { 'claude-sub': /^\S+#\S+$/, 'gemini-sub': /^4\/[\w-]+$/ };

export function PasteCodeSignIn({ providerId }: Props) {
  const db = useDb();
  const router = useRouter();
  const isClaude = providerId === 'claude-sub';
  // Created once per screen: the verifier made now must be the one used when the code is exchanged.
  const [pkce] = useState(() => createPkce(getRandomBytes));
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInUrl = isClaude ? claudeAuthUrl(pkce) : googleAuthUrl(pkce);
  const openSignInPage = () => WebBrowser.openBrowserAsync(signInUrl);

  useEffect(() => {
    openSignInPage();
    // The user comes back from the browser with the code copied; look for it each time the app becomes active.
    async function prefillFromClipboard() {
      const copied = (await Clipboard.getStringAsync()).trim();
      if (CODE_SHAPE[providerId].test(copied)) setCode(copied);
    }
    prefillFromClipboard();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') prefillFromClipboard();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per screen; the URL never changes while it is open
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      let tokens: OAuthTokens;
      if (isClaude) {
        tokens = await claudeExchange(fetch, code, pkce);
      } else {
        const googleTokens = await googleExchange(fetch, code, pkce);
        // Gemini subscription calls need the Cloud project that Google assigns to this account.
        const { projectId } = await codeAssistSetup(fetch, googleTokens.accessToken);
        tokens = { ...googleTokens, projectId };
      }
      await finishSignIn(db, router, providerId, tokens);
    } catch (caught) {
      setError(caught instanceof AiError ? caught.message : 'Sign-in failed. Please try again.');
      setBusy(false);
    }
  }

  return (
    <View>
      <Step number="1" done title={`Sign in on ${isClaude ? 'claude.ai' : 'Google'}`} detail="Opened in your browser and approved" />
      <Step number="2" done={code !== ''} title={`Copy the code ${isClaude ? 'Claude' : 'Google'} shows you`} detail={code !== '' ? 'We spotted it on your clipboard' : 'Then come back to this app'} />
      <Step number="3" title="Paste it here">
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Paste the code"
          placeholderTextColor={colors.muted}
          style={{
            marginTop: 8,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.accent,
            borderRadius: radius,
            padding: 12,
            fontFamily: fonts.body,
            fontSize: 12,
            color: colors.ink,
          }}
        />
      </Step>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.ink, marginVertical: 8 }}>
        Your sign-in stays encrypted on this phone. We never see it, because there is no server.
      </Text>
      {error !== null && <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.accent, marginBottom: 8 }}>{error}</Text>}
      <Button label="Connect" onPress={connect} disabled={busy || code.trim() === ''} />
      <Text onPress={openSignInPage} style={{ textAlign: 'center', fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, marginTop: 12 }}>
        Open {isClaude ? 'claude.ai' : 'the Google page'} again
      </Text>
    </View>
  );
}

function Step({ number, title, detail, done = false, children }: { number: string; title: string; detail?: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? colors.accent : colors.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 11, color: done ? colors.accentInk : colors.ink }}>{done ? '✓' : number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink }}>{title}</Text>
        {detail !== undefined && <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, marginTop: 2 }}>{detail}</Text>}
        {children}
      </View>
    </View>
  );
}
