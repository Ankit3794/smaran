// A small centred list of choices over a dimmed background, e.g. the Search filters or the Settings model picker.
// Tapping a choice calls onPick; tapping outside or the back button calls onClose. The current choice is bold.
import { Modal, Pressable, Text, View } from 'react-native';
import { colors, fonts, radius } from '@/ui/theme';

type Props<T extends { label: string }> = { choices: T[]; current: string; onPick: (choice: T) => void; onClose: () => void };

export function ChoiceModal<T extends { label: string }>({ choices, current, onPick, onClose }: Props<T>) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <View style={{ backgroundColor: colors.card, borderRadius: radius, paddingVertical: 6 }}>
          {choices.map((choice) => (
            <Pressable
              key={choice.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onPick(choice);
              }}
              style={{ paddingVertical: 12, paddingHorizontal: 18 }}
            >
              <Text style={{ fontFamily: choice.label === current ? fonts.bodySemiBold : fonts.body, fontSize: 14, color: colors.ink }}>{choice.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
