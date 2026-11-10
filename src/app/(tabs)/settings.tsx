// The Settings tab: which AI reads your saves (and its model), the library (size, topics, backups, mirrors),
// features coming later, and about. Values live in the settings table; credentials in expo-secure-store.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Directory, Paths } from 'expo-file-system';
import { loadCredential, removeCredential } from '@/ai/credentials';
import { DEFAULT_MODELS, MODEL_CHOICES } from '@/ai/providers/errors';
import type { ProviderId } from '@/ai/types';
import { exportBackupFile, importBackupFile } from '@/backup/backupFiles';
import { useDb } from '@/db/DbProvider';
import { libraryStats } from '@/db/saves';
import { getSetting, setSetting } from '@/db/settings';
import { ChoiceModal } from '@/ui/components/ChoiceModal';
import { useReloadOnChange } from '@/ui/hooks/useReloadOnChange';
import { colors, fonts, radius } from '@/ui/theme';

// How each provider is named in Settings, and what "connected" means for it.
const PROVIDERS: Record<ProviderId, { name: string; connectedAs: string; logoColor: string; logoGlyph: string }> = {
  'claude-sub': { name: 'Claude', connectedAs: 'Pro subscription · connected', logoColor: '#D97757', logoGlyph: '✳' },
  'claude-key': { name: 'Claude', connectedAs: 'API key · connected', logoColor: '#D97757', logoGlyph: '✳' },
  'chatgpt-sub': { name: 'ChatGPT', connectedAs: 'Plus subscription · connected', logoColor: '#10a37f', logoGlyph: '◎' },
  'openai-key': { name: 'OpenAI', connectedAs: 'API key · connected', logoColor: '#10a37f', logoGlyph: '◎' },
  'gemini-sub': { name: 'Gemini', connectedAs: 'Google account · connected', logoColor: '#7B6FD6', logoGlyph: '✦' },
  'gemini-key': { name: 'Gemini', connectedAs: 'API key · connected', logoColor: '#7B6FD6', logoGlyph: '✦' },
};

const SOURCE_URL: string | undefined = Constants.expoConfig?.extra?.sourceUrl;

interface SettingsState {
  providerId: ProviderId | null;
  hasCredential: boolean;
  model: string;
  allowMirrors: boolean;
  saveCount: number;
  libraryBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Thumbnails are files next to the database; a folder that can't be read just doesn't count.
function thumbnailBytes(): number {
  try {
    return new Directory(Paths.document, 'thumbs').size ?? 0;
  } catch {
    return 0;
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many.replace('#', String(count));
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted, marginTop: 22, marginBottom: 4 }}>{title}</Text>;
}

function Row({ label, sub, value, onPress, disabled = false, children }: { label: string; sub?: string; value?: string; onPress?: () => void; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || onPress === undefined}
      accessibilityState={{ disabled }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: disabled ? 0.5 : 1 }}
    >
      {children}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink }}>{label}</Text>
        {sub !== undefined && <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 1 }}>{sub}</Text>}
      </View>
      {value !== undefined && <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.muted }}>{value}</Text>}
      {onPress !== undefined && !disabled && <Text style={{ fontSize: 14, color: colors.muted }}>›</Text>}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const db = useDb();
  const router = useRouter();
  const [state, setState] = useState<SettingsState | null>(null);
  const [pickingModel, setPickingModel] = useState(false);

  const load = useCallback(() => {
    (async () => {
      const activeProvider = await getSetting(db, 'activeProvider', '');
      const providerId = activeProvider === '' ? null : (activeProvider as ProviderId);
      const stats = await libraryStats(db);
      setState({
        providerId,
        hasCredential: providerId !== null && (await loadCredential(providerId)) !== null,
        model: providerId === null ? '' : await getSetting(db, `model.${providerId}`, DEFAULT_MODELS[providerId]),
        allowMirrors: (await getSetting(db, 'allowMirrors', '1')) !== '0',
        saveCount: stats.count,
        libraryBytes: stats.databaseBytes + thumbnailBytes(),
      });
    })().catch(() => {
      // A failed read keeps whatever is on screen; the next change or app resume tries again.
    });
  }, [db]);

  useEffect(load, [load]);
  useReloadOnChange(load, ['settings', 'saves']);

  if (state === null) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const provider = state.providerId === null ? null : PROVIDERS[state.providerId];
  const modelChoices = state.providerId === null ? [] : MODEL_CHOICES[state.providerId];
  // A model set by hand to something no longer in the list still shows, by its id.
  const modelLabel = modelChoices.find((choice) => choice.id === state.model)?.label ?? state.model;

  function confirmDisconnect(providerId: ProviderId) {
    Alert.alert(`Disconnect ${PROVIDERS[providerId].name}?`, 'New saves will wait for the AI until you connect again. Your library stays on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await removeCredential(providerId);
          await setSetting(db, 'activeProvider', '');
          load();
        },
      },
    ]);
  }

  async function exportLibrary() {
    try {
      await exportBackupFile(db);
    } catch (error) {
      Alert.alert("Couldn't export", error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function importLibrary() {
    try {
      const result = await importBackupFile(db);
      if (result === null) return;
      const added = plural(result.added, 'Added 1 save.', 'Added # saves.');
      const skipped = result.skipped === 0 ? '' : ` ${plural(result.skipped, '1 was already here.', '# were already here.')}`;
      Alert.alert('Backup imported', added + skipped);
    } catch (error) {
      Alert.alert("Couldn't import", error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 }}>
        <Text style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.ink }}>Settings</Text>

        <SectionHeader title="AI" />
        {state.providerId !== null && provider !== null ? (
          <>
            <Row label={provider.name} sub={state.hasCredential ? provider.connectedAs : 'Signed out · connect again'}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: provider.logoColor, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.accentInk, fontSize: 13 }}>{provider.logoGlyph}</Text>
              </View>
            </Row>
            <Row label="Model" value={modelLabel} onPress={() => setPickingModel(true)} />
            <Row label="Switch provider or use API key" onPress={() => router.push('/onboarding/connect')} />
            <Row label="Disconnect" onPress={() => confirmDisconnect(state.providerId!)} />
          </>
        ) : (
          <>
            <Row label="No AI connected" sub="New saves wait until you connect one." />
            <Row label="Connect an AI" onPress={() => router.push('/onboarding/connect')} />
          </>
        )}

        <SectionHeader title="Library" />
        <Row label="Saves on this phone" value={`${state.saveCount} · ${formatBytes(state.libraryBytes)}`} />
        <Row label="Rename & merge topics" sub="Long-press a topic" onPress={() => router.push('/topics')} />
        <Row label="Export backup (.zip)" onPress={exportLibrary} />
        <Row label="Import backup" onPress={importLibrary} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink }}>Use public mirrors when a source blocks reading</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 1 }}>
              When X won't answer, ask the public read-only mirror fxtwitter for the post. Only the link is sent.
            </Text>
          </View>
          <Switch
            accessibilityRole="switch"
            accessibilityLabel="Use public mirrors when a source blocks reading"
            value={state.allowMirrors}
            onValueChange={(on) => setSetting(db, 'allowMirrors', on ? '1' : '0').then(load, () => {})}
            trackColor={{ true: colors.accent, false: colors.line }}
          />
        </View>

        <SectionHeader title="Coming later" />
        <Row label="Reminders for unopened saves" value="soon" disabled />
        <Row label="On-device AI (no internet)" value="soon" disabled />

        <SectionHeader title="About" />
        <Row label={`Smaran ${Constants.expoConfig?.version ?? ''}`.trim()} sub="Your library stays on this phone. No account." />
        <Row label="MIT licence" />
        {SOURCE_URL !== undefined && (
          <Text onPress={() => Linking.openURL(SOURCE_URL).catch(() => {})} style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.accent, paddingVertical: 12 }}>
            {SOURCE_URL}
          </Text>
        )}
      </ScrollView>

      {pickingModel && state.providerId !== null && (
        <ChoiceModal
          choices={modelChoices}
          current={modelLabel}
          onPick={(choice) => setSetting(db, `model.${state.providerId}`, choice.id).then(load, () => {})}
          onClose={() => setPickingModel(false)}
        />
      )}
    </SafeAreaView>
  );
}
