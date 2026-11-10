// The app's standard button: filled accent for the main action, outlined for secondary ones.
// Used by the sign-in screens (and later screens) so every button looks the same.
import { Pressable, Text } from 'react-native';
import { colors, fonts, radius } from '@/ui/theme';

type Props = { label: string; onPress: () => void; variant?: 'primary' | 'secondary'; disabled?: boolean };

export function Button({ label, onPress, variant = 'primary', disabled = false }: Props) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: isPrimary ? colors.accent : colors.card,
        borderWidth: isPrimary ? 0 : 1,
        borderColor: colors.line,
        borderRadius: radius,
        paddingVertical: 13,
        paddingHorizontal: 14,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 14, color: isPrimary ? colors.accentInk : colors.ink }}>{label}</Text>
    </Pressable>
  );
}
