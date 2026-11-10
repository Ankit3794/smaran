// The detail sheet that opens when a Timeline card is tapped: big thumbnail, summary, brief, topic, tags, note,
// and the actions (open original, copy link, delete, retry AI). Every edit goes straight to the database,
// then the sheet reloads the save so the screen shows what was stored.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { savedAtLabel } from '@/core/dates';
import type { Save, Source } from '@/core/types';
import { useDb } from '@/db/DbProvider';
import { deleteSave, getSave, markOpened, retrySave, setTags, setTopic, updateNote } from '@/db/saves';
import { resolveTopic } from '@/db/topics';
import { runQueueNow } from '@/pipeline/runNow';
import { useReloadOnChange } from '@/ui/hooks/useReloadOnChange';
import { colors, fonts, radius } from '@/ui/theme';
import { Button } from './Button';
import { SourceBadge } from './SourceBadge';
import { TagEditor } from './TagEditor';
import { Thumb } from './Thumb';
import { TopicPicker } from './TopicPicker';

type Props = { saveId: number; onClose: () => void };

const SOURCE_NAMES: Partial<Record<Source, string>> = { x: 'X', reddit: 'Reddit', github: 'GitHub', instagram: 'Instagram' };

function openButtonLabel(source: Source): string {
  const name = SOURCE_NAMES[source];
  return name === undefined ? 'Open link ↗' : `Open on ${name} ↗`;
}

export function SaveSheet({ saveId, onClose }: Props) {
  const db = useDb();
  const [save, setSave] = useState<Save | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const noteFilled = useRef(false);

  const reload = useCallback(async () => {
    const loaded = await getSave(db, saveId).catch(() => null);
    if (loaded === null) return;
    setSave(loaded);
    // Fill the note box only on the first load, so a later reload never overwrites typing in progress.
    if (!noteFilled.current) {
      noteFilled.current = true;
      setNoteDraft(loaded.note ?? '');
    }
  }, [db, saveId]);

  useEffect(() => {
    reload();
  }, [reload]);
  useReloadOnChange(reload, ['saves', 'save_tags', 'topics']);

  if (save === null) return null;
  const currentSave = save;

  async function open() {
    if (currentSave.url === null) return;
    await Linking.openURL(currentSave.url);
    await markOpened(db, currentSave.id, Date.now());
    reload();
  }

  async function saveNote() {
    const note = noteDraft.trim();
    await updateNote(db, currentSave.id, note === '' ? null : note);
    reload();
  }

  async function changeTags(tags: string[]) {
    await setTags(db, currentSave.id, tags);
    reload();
  }

  async function changeTopic(topicName: string) {
    await setTopic(db, currentSave.id, await resolveTopic(db, topicName, Date.now()));
    reload();
  }

  function confirmDelete() {
    Alert.alert('Delete this save?', 'It will be removed from Smaran. The original link is not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSave(db, currentSave.id);
          onClose();
        },
      },
    ]);
  }

  async function retryAi() {
    await retrySave(db, currentSave.id);
    // The run records its own failures on the save; ignoring the rejection avoids an unhandled promise rejection.
    await runQueueNow(db).catch(() => {});
    reload();
  }

  const needsRetry = currentSave.status === 'partial' || (currentSave.status === 'waiting_ai' && currentSave.statusReason !== null);
  const heading = currentSave.summary || currentSave.title || currentSave.url || currentSave.sharedText;
  const muted = { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30,25,20,0.45)' }}>
        <Pressable accessibilityLabel="Close details" style={{ flex: 1 }} onPress={onClose} />
        <ScrollView
          style={{ maxHeight: '88%', flexGrow: 0, backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 10 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
          <Thumb save={currentSave} size={118} width="100%" />
          <Text style={{ fontFamily: fonts.heading, fontSize: 18, lineHeight: 23, color: colors.ink }}>{heading}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SourceBadge source={currentSave.source} />
            <Text style={muted}>
              {currentSave.author !== null ? `@${currentSave.author} · ` : ''}saved {savedAtLabel(currentSave.lastSavedAt, Date.now())}
            </Text>
          </View>
          {currentSave.brief !== null && (
            <Text style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.ink }}>{currentSave.brief}</Text>
          )}
          <TopicPicker name={currentSave.topicName} color={currentSave.topicColor} onPick={changeTopic} />
          <TagEditor tags={currentSave.tags} onChange={changeTags} />
          <TextInput
            multiline
            placeholder="Add a note"
            placeholderTextColor={colors.muted}
            value={noteDraft}
            onChangeText={setNoteDraft}
            onBlur={saveNote}
            style={{ minHeight: 44, textAlignVertical: 'top', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius, padding: 10, fontFamily: fonts.body, fontSize: 12.5, color: colors.ink }}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {currentSave.url !== null && (
              <View style={{ flex: 1 }}>
                <Button label={openButtonLabel(currentSave.source)} onPress={open} />
              </View>
            )}
            {currentSave.url !== null && <Button label="Copy link" variant="secondary" onPress={() => Clipboard.setStringAsync(currentSave.url ?? '')} />}
            <Button label="Delete" variant="secondary" onPress={confirmDelete} />
          </View>
          {needsRetry && <Button label="Retry AI" variant="secondary" onPress={retryAi} />}
        </ScrollView>
      </View>
    </Modal>
  );
}
