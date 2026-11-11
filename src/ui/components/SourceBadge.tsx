// Tiny rounded square showing where a save came from (X, Reddit, GitHub, YouTube, ...), as in the mockup's card meta row.
// Used by SaveCard and the save sheet at 15 px, and larger on the Search browse tiles and the Insights screen.
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

export function SourceBadge({ source, size = 15 }: { source: Source; size?: number }) {
  const badge = BADGES[source];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: badge.background, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.57, fontFamily: fonts.bodySemiBold }}>{badge.label}</Text>
    </View>
  );
}
