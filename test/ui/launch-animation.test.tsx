// UI tests for the launch animation's flow (src/ui/components/LaunchAnimation.tsx): it hides Android's launch screen
// once it is drawn, waits for the app to be ready, and then removes itself. The motion itself can only be judged on a
// phone. Reanimated's native runtime does not exist in Jest, so a small stand-in below draws plain views and finishes
// every animation at once, which is enough to check the flow.
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { LaunchAnimation } from '@/ui/components/LaunchAnimation';

jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
jest.mock('react-native-reanimated', () => {
  const { Image, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const curve = () => (t: number) => t;
  return {
    __esModule: true,
    default: { View, Text, Image },
    Easing: { out: curve, inOut: curve, cubic: (t: number) => t },
    interpolate: () => 0,
    interpolateColor: () => '#000000',
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    useSharedValue: (value: number) => ({ value }),
    withDelay: (_delay: number, animation: unknown) => animation,
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    },
  };
});
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn().mockResolvedValue(undefined), preventAutoHideAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));

afterEach(() => jest.clearAllMocks());

const layout = (width: number, height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });

// Draws the cover and the word, as the phone would on its first frames.
async function drawn(props: { ready: boolean; landOnTitle: boolean; onDone: () => void }) {
  const view = await render(<LaunchAnimation fontsLoaded {...props} />);
  await fireEvent(screen.getByTestId('launch-cover'), 'layout', layout(400, 800));
  await fireEvent(screen.getByTestId('launch-word'), 'layout', layout(180, 60));
  await fireEvent(screen.getByText('S'), 'layout', layout(28, 60));
  return view;
}

it('hides the launch screen once the cover is drawn', async () => {
  await drawn({ ready: false, landOnTitle: true, onDone: jest.fn() });
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
});

it('waits while the app is not ready', async () => {
  const onDone = jest.fn();
  await drawn({ ready: false, landOnTitle: true, onDone });
  expect(onDone).not.toHaveBeenCalled();
});

it('lands on the title and finishes once the app is ready', async () => {
  const onDone = jest.fn();
  const view = await drawn({ ready: false, landOnTitle: true, onDone });
  await view.rerender(<LaunchAnimation fontsLoaded ready landOnTitle onDone={onDone} />);
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('fades out when there is no title to land on (first run)', async () => {
  const onDone = jest.fn();
  await drawn({ ready: true, landOnTitle: false, onDone });
  expect(onDone).toHaveBeenCalledTimes(1);
});
