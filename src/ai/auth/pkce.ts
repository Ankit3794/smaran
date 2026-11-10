// PKCE (RFC 7636) values for the browser sign-in flows: a secret verifier, its SHA-256 challenge, and a state check.
// Used by the Claude (and later ChatGPT/Gemini) sign-in modules before they open the browser.
import { sha256 } from '@noble/hashes/sha2.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Hand-written because React Native has no Buffer; base64url without padding is what OAuth servers expect.
function base64url(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    result += ALPHABET[(chunk >> 18) & 63] + ALPHABET[(chunk >> 12) & 63];
    if (i + 1 < bytes.length) result += ALPHABET[(chunk >> 6) & 63];
    if (i + 2 < bytes.length) result += ALPHABET[chunk & 63];
  }
  return result;
}

// The challenge is the SHA-256 of the verifier's text (not of the random bytes behind it).
export function challengeFor(verifier: string): string {
  return base64url(sha256(new TextEncoder().encode(verifier)));
}

// `randomBytes` is passed in (expo-crypto in the app, a fake in tests) so this file stays pure.
export function createPkce(randomBytes: (count: number) => Uint8Array): {
  verifier: string;
  challenge: string;
  state: string;
} {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: challengeFor(verifier), state: base64url(randomBytes(32)) };
}
