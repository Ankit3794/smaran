// "Add a link" from inside the app, for links that reach you some other way (a chat, an email).
// Offers the link on the clipboard, takes an optional note, and hands both to the same pipeline as the share menu.
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { extractFirstUrl } from '@/core/url';
import { useDb } from '@/db/DbProvider';
import { addShare } from '@/pipeline/ingest';
import { runQueueNow } from '@/pipeline/runNow';
import { Button } from '@/ui/components/Button';
import { colors, fonts, radius } from '@/ui/theme';

const inputStyle = {
  fontFamily: fonts.body, fontSize: 14, color: colors.ink, backgroundColor: colors.card,
  borderWidth: 1, borderColor: colors.line, borderRadius: radius, paddingHorizontal: 14, paddingVertical: 11,
};

export function AddLinkSheet({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Most of the time the link was just copied, so offer it; only a link, never other clipboard text.
  useEffect(() => {
    Clipboard.getStringAsync().then(
      (text) => {
        const url = extractFirstUrl(text);
        if (url !== null) setLink((current) => (current === '' ? url : current));
      },
      () => {},
    );
  }, []);

  async function save() {
    setBusy(true);
    try {
      await addShare(db, link, note, Date.now());
      // Fetching and summarising happen in the background, as for a share; the card appears on the Timeline.
      runQueueNow(db).catch(() => {});
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
      <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 }}>
        <Text style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.ink }}>Add a link</Text>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="Paste a link"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={inputStyle}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.muted}
          multiline
          style={{ ...inputStyle, minHeight: 64, textAlignVertical: 'top' }}
        />
        <Button label="Save" onPress={save} disabled={busy || link.trim() === ''} />
      </View>
    </Modal>
  );
}
