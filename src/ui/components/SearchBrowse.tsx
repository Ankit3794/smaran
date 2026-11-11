// What the Search tab shows before anything is typed, in the style of Spotify's or Google Photos' search page:
// recent searches, a tile per platform (tap to list its saves), popular tags (tap to search one), and a link to
// the Insights screen. Rendered by the Search tab, which owns the query and filters these taps change.
import { Pressable, Text, View } from 'react-native';
import type { Source } from '@/core/types';
import type { BrowseData } from '@/ui/hooks/useBrowse';
import { SOURCE_NAMES } from '@/ui/sources';
import { colors, fonts, radius } from '@/ui/theme';
import { SourceBadge } from './SourceBadge';

function savesLabel(count: number): string {
  return count === 1 ? '1 save' : `${count} saves`;
}

function SectionTitle({ title, action }: { title: string; action?: { label: string; accessibilityLabel: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18, marginBottom: 8 }}>
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted }}>{title}</Text>
      {action !== undefined && (
        <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress} hitSlop={8}>
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.accent }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

type Props = BrowseData & {
  onSearch: (query: string) => void;
  onPickSource: (source: Source) => void;
  onClearRecent: () => void;
  onOpenInsights: () => void;
};

export function SearchBrowse({ recent, sources, tags, onSearch, onPickSource, onClearRecent, onOpenInsights }: Props) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {recent.length > 0 && (
        <>
          <SectionTitle title="Recent" action={{ label: 'Clear', accessibilityLabel: 'Clear recent searches', onPress: onClearRecent }} />
          {recent.map((query) => (
            <Pressable
              key={query}
              accessibilityRole="button"
              accessibilityLabel={`Search again for ${query}`}
              onPress={() => onSearch(query)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }}
            >
              <Text style={{ fontSize: 14, color: colors.muted }}>↺</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.ink }}>{query}</Text>
            </Pressable>
          ))}
        </>
      )}

      {sources.length > 0 && (
        <>
          <SectionTitle title="Browse by source" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {sources.map(({ source, count }) => (
              <Pressable
                key={source}
                accessibilityRole="button"
                accessibilityLabel={`${SOURCE_NAMES[source]}, ${savesLabel(count)}`}
                onPress={() => onPickSource(source)}
                // Two tiles per row: each takes just under half, the gap makes up the rest.
                style={{ flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}
              >
                <SourceBadge source={source} size={28} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.ink }}>{SOURCE_NAMES[source]}</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.muted }}>{savesLabel(count)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {tags.length > 0 && (
        <>
          <SectionTitle title="Popular tags" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {tags.map(({ name, count }) => (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityLabel={`Tag ${name}, ${savesLabel(count)}`}
                onPress={() => onSearch(name)}
                style={{ flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: colors.chip }}
              >
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink }}>#{name}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>{count}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {sources.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your library in numbers"
          onPress={onOpenInsights}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}
        >
          <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink }}>Your library in numbers</Text>
          <Text style={{ fontSize: 14, color: colors.muted }}>›</Text>
        </Pressable>
      )}
    </View>
  );
}
