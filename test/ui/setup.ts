// Setup for every UI test (jest.config.js, ui project).
// The swipeable card row (SwipeToDelete) is built on Reanimated, whose native animation runtime does not exist in
// Jest, and Jest cannot perform a real swipe anyway. A plain View that keeps the row's props stands in, so tests
// can "swipe" by calling its onSwipeableOpen callback.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return { __esModule: true, default: (props: { children: React.ReactNode }) => React.createElement(View, props, props.children) };
});
