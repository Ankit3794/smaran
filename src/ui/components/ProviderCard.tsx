// One selectable row on the "Connect your AI" screen: coloured logo, provider name, what you sign in with, and a radio dot.
import { Pressable, Text, View } from 'react-native';
import { colors, fonts, radius } from '@/ui/theme';

type Props = { name: string; subtitle: string; logoColor: string; logoGlyph: string; selected: boolean; onPress: () => void };

export function ProviderCard({ name, subtitle, logoColor, logoGlyph, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.card,
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : colors.line,
        borderRadius: radius,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: logoColor, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 15 }}>{logoGlyph}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink }}>{name}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.muted }}>{subtitle}</Text>
      </View>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: selected ? 5 : 2, borderColor: selected ? colors.accent : colors.line }} />
    </Pressable>
  );
}
