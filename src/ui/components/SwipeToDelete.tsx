// Wraps a card so swiping it left deletes it, like archiving in Gmail: the card slides away over a red
// "Delete" strip. The screen hides the card at once and offers Undo (see useUndoableDelete and UndoBar).
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Text, View } from 'react-native';
import { colors, fonts, radius } from '@/ui/theme';

function DeleteStrip() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 24, marginHorizontal: 10, marginBottom: 7, borderRadius: radius, backgroundColor: colors.danger }}>
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.accentInk }}>Delete</Text>
    </View>
  );
}

export function SwipeToDelete({ onDelete, testID, children }: { onDelete: () => void; testID?: string; children: React.ReactNode }) {
  return (
    <ReanimatedSwipeable
      testID={testID}
      // Only the right side has an action, so any completed swipe is a swipe left: delete.
      renderRightActions={() => <View style={{ width: '100%' }}><DeleteStrip /></View>}
      // How far the card must be dragged (px) before letting go deletes it; shorter drags spring back.
      rightThreshold={110}
      overshootRight={false}
      onSwipeableOpen={onDelete}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
