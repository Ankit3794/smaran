// One save in a list (Timeline, topic detail, search results): thumbnail, one-line summary, and a meta row
// (source, author, time, topic). With a search `query`, the matched words in the summary are marked.
// Shows "Reading…" / "Waiting for AI" in place of the topic while the pipeline hasn't finished.
// With `onDelete`, a long press asks "Delete this save?" first. (This replaced swipe-to-delete: a swipe gesture on every
// card fought the list's own scrolling and made scrolling stutter whenever a finger started on a card.)
import { Alert, Pressable, Text, View } from 'react-native';
import { clockTime } from '@/core/dates';
import type { Save } from '@/core/types';
import { colors, fonts, radius } from '@/ui/theme';
import { Highlight } from './Highlight';
import { SourceBadge } from './SourceBadge';
import { Thumb } from './Thumb';

type Props = { save: Save; onPress: () => void; onDelete?: () => void; showTopic?: boolean; query?: string };

// Best available description, from most to least refined.
function headline(save: Save): string {
  return save.summary || save.title || save.url || save.sharedText;
}

function StatusOrTopic({ save, showTopic }: { save: Save; showTopic: boolean }) {
  const small = { fontFamily: fonts.bodySemiBold, fontSize: 11 };
  if (save.status === 'fetching') return <Text style={{ ...small, color: colors.muted }}>Reading…</Text>;
  if (save.status === 'waiting_ai') return <Text style={{ ...small, color: colors.accent }}>Waiting for AI</Text>;
  if (!showTopic || save.topicName === null) return null;
  const topicColor = save.topicColor ?? colors.muted;
  return (
    <>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: topicColor }} />
      <Text style={{ ...small, color: topicColor }}>{save.topicName}</Text>
    </>
  );
}

function askToDelete(onDelete: () => void) {
  Alert.alert('Delete this save?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);
}

export function SaveCard({ save, onPress, onDelete, showTopic = true, query = '' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={onDelete ? 'Long press to delete' : undefined}
      onPress={onPress}
      onLongPress={onDelete ? () => askToDelete(onDelete) : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 12, marginHorizontal: 10, marginBottom: 7, backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line }}
    >
      <Thumb save={save} size={48} />
      <View style={{ flex: 1 }}>
        <Highlight
          text={headline(save)}
          query={query}
          numberOfLines={2}
          style={{ fontFamily: fonts.bodyMedium, fontSize: 12.8, lineHeight: 17, color: colors.ink }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <SourceBadge source={save.source} />
          {save.author !== null && (
            <Text numberOfLines={1} style={{ maxWidth: 78, fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>
              @{save.author}
            </Text>
          )}
          <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>{clockTime(save.lastSavedAt)}</Text>
          <StatusOrTopic save={save} showTopic={showTopic} />
        </View>
      </View>
      {save.openedAt === null && <View testID="unread-dot" style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} />}
    </Pressable>
  );
}
