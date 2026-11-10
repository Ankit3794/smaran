// Wraps a card so swiping it left reveals a Delete button, as in Gmail: the swipe only opens the button, and
// tapping it deletes. The screen then hides the card at once and offers Undo (see useUndoableDelete and UndoBar).
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Pressable, Text } from 'react-native';
import { colors, fonts, radius } from '@/ui/theme';

const BUTTON_WIDTH = 96;

function DeleteButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Delete save"
      onPress={onPress}
      style={{ width: BUTTON_WIDTH, marginRight: 10, marginBottom: 7, borderRadius: radius, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.accentInk }}>Delete</Text>
    </Pressable>
  );
}

export function SwipeToDelete({ onDelete, testID, children }: { onDelete: () => void; testID?: string; children: React.ReactNode }) {
  return (
    <ReanimatedSwipeable
      testID={testID}
      // A short swipe left springs open to show the button; it never deletes on its own.
      renderRightActions={(_progress, _translation, swipeable: SwipeableMethods) => (
        <DeleteButton
          onPress={() => {
            swipeable.close();
            onDelete();
          }}
        />
      )}
      overshootRight={false}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
