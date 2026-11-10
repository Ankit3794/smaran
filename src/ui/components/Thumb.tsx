// The square preview on a save card: the downloaded image if there is one, otherwise a gradient tile
// in the topic's colour with the first letters of the title, so even text-only saves are easy to tell apart.
import { Image, Text, type DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Save } from '@/core/types';
import { colors, fonts } from '@/ui/theme';

// Mixes a #RRGGBB colour with black; gives the gradient its darker end.
function darken(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((start) => Math.round(parseInt(hex.slice(start, start + 2), 16) * (1 - amount)));
  return `rgb(${channels.join(',')})`;
}

// `size` is the height; the width matches it (a square) unless `width` is given, as on the detail sheet's wide banner.
export function Thumb({ save, size, width = size }: { save: Save; size: number; width?: DimensionValue }) {
  const shape = { width, height: size, borderRadius: 10 };
  if (save.thumbPath !== null) {
    return <Image source={{ uri: save.thumbPath }} style={{ ...shape, backgroundColor: colors.chip }} />;
  }
  const base = save.topicColor ?? colors.muted;
  const glyph = (save.title ?? '').trim().slice(0, 3) || '•';
  return (
    <LinearGradient colors={[darken(base, 0.55), base]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ ...shape, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: fonts.bodySemiBold, fontSize: size * 0.27 }}>{glyph}</Text>
    </LinearGradient>
  );
}
