// The last step of every subscription sign-in: keep the tokens in secure storage, make this provider the
// active one, and leave the sign-in flow. Called by the paste-code and device-code screens.
import type { useRouter } from 'expo-router';
import { saveCredential } from '@/ai/credentials';
import type { OAuthTokens, ProviderId } from '@/ai/types';
import type { Db } from '@/db/db';
import { rearmWaitingAi } from '@/db/saves';
import { setSetting } from '@/db/settings';

export async function finishSignIn(db: Db, router: ReturnType<typeof useRouter>, providerId: ProviderId, tokens: OAuthTokens): Promise<void> {
  await saveCredential(providerId, { kind: 'oauth', tokens });
  await setSetting(db, 'activeProvider', providerId);
  // Saves that were waiting for a provider or a fresh sign-in can be processed again now.
  await rearmWaitingAi(db, ['not_connected', 'auth_expired']);
  router.replace('/');
}
