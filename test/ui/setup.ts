// Setup for every UI test (jest.config.js, ui project).
// The swipeable card row (SwipeToDelete) is built on Reanimated, whose native animation runtime does not exist in
// Jest, and Jest cannot perform a real swipe anyway. A plain View stands in and always shows the row's hidden
// actions (as if swiped open), so tests can press the Delete button the swipe reveals.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  const swipeableMethods = { close: jest.fn(), openLeft: jest.fn(), openRight: jest.fn(), reset: jest.fn() };
  return {
    __esModule: true,
    default: (props: { children: React.ReactNode; renderRightActions?: (...args: unknown[]) => React.ReactNode }) => React.createElement(View, props, props.children, props.renderRightActions?.({ value: 1 }, { value: -96 }, swipeableMethods)),
  };
});
