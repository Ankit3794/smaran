// The last step of every subscription sign-in: keep the tokens in secure storage, make this provider the
// active one, and leave the sign-in flow. Called by the paste-code and device-code screens.
import type { useRouter } from 'expo-router';
import { saveCredential } from '@/ai/credentials';
import type { OAuthTokens, ProviderId } from '@/ai/types';
import type { Db } from '@/db/db';
import { setSetting } from '@/db/settings';

export async function finishSignIn(db: Db, router: ReturnType<typeof useRouter>, providerId: ProviderId, tokens: OAuthTokens): Promise<void> {
  await saveCredential(providerId, { kind: 'oauth', tokens });
  await setSetting(db, 'activeProvider', providerId);
  router.replace('/');
}
