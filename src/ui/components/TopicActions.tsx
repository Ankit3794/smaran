// The menu behind a long-press on a topic (or the ⋯ button on its detail screen): rename, merge into another topic,
// or change colour. Writes straight to the database; the screens refresh themselves when SQLite reports the change.
import { useState } from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useDb } from '@/db/DbProvider';
import { mergeTopics, renameTopic, setTopicColor, TOPIC_PALETTE, type TopicSummary } from '@/db/topics';
import { Button } from './Button';
import { colors, fonts, radius } from '@/ui/theme';

type Props = {
  topic: TopicSummary;
  otherTopics: TopicSummary[];
  onClose: () => void;
  // The merged topic no longer exists, so a screen showing it needs to leave.
  onMerged?: () => void;
};

export function TopicActions({ topic, otherTopics, onClose, onMerged }: Props) {
  const db = useDb();
  const [mode, setMode] = useState<'menu' | 'rename' | 'merge' | 'color'>('menu');
  const [nameDraft, setNameDraft] = useState(topic.name);

  async function rename() {
    if (nameDraft.trim() !== '') await renameTopic(db, topic.id, nameDraft);
    onClose();
  }

  async function changeColor(color: string) {
    await setTopicColor(db, topic.id, color);
    onClose();
  }

  // Merging cannot be undone, so it asks first.
  function confirmMerge(target: TopicSummary) {
    Alert.alert(`Merge ${topic.name} into ${target.name}?`, `All ${topic.count} saves move to ${target.name}, and ${topic.name} goes away.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Merge',
        style: 'destructive',
        onPress: async () => {
          await mergeTopics(db, topic.id, target.id);
          onClose();
          onMerged?.();
        },
      },
    ]);
  }

  const rowStyle = { paddingVertical: 12, paddingHorizontal: 4 };
  const rowText = { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30,25,20,0.45)' }}>
        <Pressable accessibilityLabel="Close topic actions" style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24, gap: 6 }}>
          <Text style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.ink, marginBottom: 6 }}>{topic.name}</Text>

          {mode === 'menu' && (
            <>
              <Pressable accessibilityRole="button" style={rowStyle} onPress={() => setMode('rename')}>
                <Text style={rowText}>Rename</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={rowStyle} onPress={() => setMode('merge')}>
                <Text style={rowText}>Merge into another topic</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={rowStyle} onPress={() => setMode('color')}>
                <Text style={rowText}>Change colour</Text>
              </Pressable>
            </>
          )}

          {mode === 'rename' && (
            <>
              <TextInput
                autoFocus
                value={nameDraft}
                onChangeText={setNameDraft}
                style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius, padding: 10, fontFamily: fonts.body, fontSize: 14, color: colors.ink }}
              />
              <Button label="Save" onPress={rename} />
            </>
          )}

          {mode === 'merge' &&
            (otherTopics.length === 0 ? (
              <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted }}>There is no other topic to merge into.</Text>
            ) : (
              otherTopics.map((target) => (
                <Pressable key={target.id} accessibilityRole="button" accessibilityLabel={`Merge into ${target.name}`} style={[rowStyle, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => confirmMerge(target)}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: target.color }} />
                  <Text style={rowText}>{target.name}</Text>
                </Pressable>
              ))
            ))}

          {mode === 'color' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 8 }}>
              {TOPIC_PALETTE.map((color) => (
                <Pressable
                  key={color}
                  accessibilityRole="button"
                  accessibilityLabel={`Colour ${color}`}
                  onPress={() => changeColor(color)}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color, borderWidth: color === topic.color ? 3 : 0, borderColor: colors.ink }}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
