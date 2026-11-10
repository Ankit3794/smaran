// The tag chips on the detail sheet: tap x to remove a tag, "+ tag" to type a new one.
// Reports the full new tag list through onChange; the sheet saves it with setTags.
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { colors, fonts } from '@/ui/theme';

type Props = { tags: string[]; onChange: (tags: string[]) => void };

const chipStyle = { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.chip, borderRadius: 12, paddingVertical: 3, paddingHorizontal: 9 };
const chipText = { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted };

export function TagEditor({ tags, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  function finishAdding() {
    // Tags are always lowercase and trimmed, and never repeated.
    const tag = draft.trim().toLowerCase();
    if (tag !== '' && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft('');
    setAdding(false);
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {tags.map((tag) => (
        <View key={tag} style={{ ...chipStyle, flexDirection: 'row', gap: 5 }}>
          <Text style={chipText}>{tag}</Text>
          <Pressable accessibilityLabel={`Remove tag ${tag}`} hitSlop={8} onPress={() => onChange(tags.filter((other) => other !== tag))}>
            <Text style={chipText}>×</Text>
          </Pressable>
        </View>
      ))}
      {adding ? (
        <TextInput
          autoFocus
          autoCapitalize="none"
          placeholder="new tag"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={finishAdding}
          onBlur={finishAdding}
          style={{ ...chipStyle, ...chipText, minWidth: 80, paddingVertical: 2, color: colors.ink }}
        />
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={{ ...chipStyle, borderStyle: 'dashed', backgroundColor: 'transparent' }}>
          <Text style={chipText}>+ tag</Text>
        </Pressable>
      )}
    </View>
  );
}
