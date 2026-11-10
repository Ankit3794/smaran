// Banner above the Timeline when saves are waiting: says how many, why, and offers "Retry now".
// Renders nothing when the queue is empty. The sentence is built from queueSummary plus the active provider setting.
import { Pressable, Text, View } from 'react-native';
import { clockTime } from '@/core/dates';
import { colors, fonts, radius } from '@/ui/theme';
import type { QueueState } from '@/ui/hooks/useQueue';

// The provider setting holds ids like 'claude-sub'; people know the brand name.
function providerLabel(providerId: string): string {
  if (providerId.startsWith('claude')) return 'Claude';
  if (providerId.startsWith('chatgpt')) return 'ChatGPT';
  if (providerId.startsWith('gemini')) return 'Gemini';
  if (providerId.startsWith('openai')) return 'OpenAI';
  return 'Your AI provider';
}

export function queueMessage(queue: QueueState): { lead: string; rest: string } {
  const lead = `${queue.waiting} ${queue.waiting === 1 ? 'save is' : 'saves are'} waiting for the AI.`;
  const retryPhrase = queue.nextRetryAt === null ? 'retry soon' : `retry at ${clockTime(queue.nextRetryAt)}`;
  switch (queue.reason) {
    case 'offline':
      return { lead, rest: "You're offline, so we'll retry when you're back online." };
    case 'not_connected':
      return { lead, rest: 'Connect an AI in Settings to sort them.' };
    case 'quota':
      return { lead, rest: `${providerLabel(queue.providerId)}'s usage limit was reached, so we'll ${retryPhrase}.` };
    case 'auth_expired':
      return { lead, rest: 'Your AI sign-in expired. Sign in again in Settings.' };
    default:
      return { lead, rest: `We'll ${retryPhrase}.` };
  }
}

export function QueueBanner({ queue, onRetry }: { queue: QueueState; onRetry: () => void }) {
  if (queue.waiting === 0) return null;
  const { lead, rest } = queueMessage(queue);
  return (
    <View style={{ marginHorizontal: 16, marginVertical: 6, padding: 12, borderRadius: radius, backgroundColor: '#F3E3D8', borderWidth: 1, borderColor: '#E3B9A8' }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 17.5, color: colors.ink }}>
        <Text style={{ fontFamily: fonts.bodySemiBold }}>{lead}</Text> {rest} Nothing is lost.
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
        <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.accent }}>Retry now</Text>
      </Pressable>
    </View>
  );
}
