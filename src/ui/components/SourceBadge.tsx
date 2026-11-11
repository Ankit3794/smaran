// Tiny rounded square showing where a save came from (X, Reddit, GitHub, YouTube, ...), as in the mockup's card meta row.
// Used by SaveCard.
import { Text, View } from 'react-native';
import type { Source } from '@/core/types';
import { fonts } from '@/ui/theme';

const BADGES: Record<Source, { background: string; label: string }> = {
  x: { background: '#000000', label: '𝕏' },
  reddit: { background: '#FF4500', label: 'r/' },
  github: { background: '#24292F', label: 'GH' },
  instagram: { background: '#DD2A7B', label: '◎' },
  threads: { background: '#000000', label: '@' },
  youtube: { background: '#FF0000', label: '▶' },
  linkedin: { background: '#0A66C2', label: 'in' },
  hackernews: { background: '#FF6600', label: 'Y' },
  web: { background: '#6B7280', label: '↗' },
  text: { background: '#6B7280', label: '“' },
};

export function SourceBadge({ source }: { source: Source }) {
  const badge = BADGES[source];
  return (
    <View style={{ width: 15, height: 15, borderRadius: 4, backgroundColor: badge.background, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 8.5, fontFamily: fonts.bodySemiBold }}>{badge.label}</Text>
    </View>
  );
}
