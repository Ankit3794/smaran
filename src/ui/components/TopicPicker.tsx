// The topic chip on the detail sheet. Tapping it lists the existing topics and a box for typing a new name.
// Reports the chosen name through onPick; the sheet turns it into an id with resolveTopic and saves it.
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useDb } from '@/db/DbProvider';
import { listTopics, type TopicSummary } from '@/db/topics';
import { colors, fonts } from '@/ui/theme';

type Props = { name: string | null; color: string | null; onPick: (topicName: string) => void };

export function TopicPicker({ name, color, onPick }: Props) {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) listTopics(db, Date.now()).then(setTopics, () => {});
  }, [db, open]);

  function pick(topicName: string) {
    const trimmed = topicName.trim();
    if (trimmed !== '') onPick(trimmed);
    setDraft('');
    setOpen(false);
  }

  const tint = color ?? colors.muted;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(!open)}
        style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: tint, borderRadius: 12, paddingVertical: 3, paddingHorizontal: 9 }}
      >
        <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 11, color: tint }}>● {name ?? 'No topic'}</Text>
      </Pressable>
      {open && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {topics.map((topic) => (
            <Pressable key={topic.id} accessibilityRole="button" onPress={() => pick(topic.name)} style={{ backgroundColor: colors.chip, borderRadius: 12, paddingVertical: 3, paddingHorizontal: 9 }}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: topic.color }}>{topic.name}</Text>
            </Pressable>
          ))}
          <TextInput
            placeholder="new topic"
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => pick(draft)}
            style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, minWidth: 90, paddingVertical: 2, paddingHorizontal: 9, fontFamily: fonts.body, fontSize: 11, color: colors.ink }}
          />
        </View>
      )}
    </View>
  );
}
