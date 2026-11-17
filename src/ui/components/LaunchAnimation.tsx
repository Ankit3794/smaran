// The launch animation drawn over the app on every cold start: स्म (exactly where Android's launch screen drew it)
// turns into "Smaran", which then shrinks and glides into the Timeline's title while this cream cover fades away.
// The root layout (src/app/_layout.tsx) keeps Android's launch screen up until this cover is drawn, so the hand-off
// is invisible, and tells it when the app is ready. Design: docs/superpowers/specs/2026-11-16-launch-animation-design.md
//
// Steps:  स्म alone (MARK_HOLD) → स्म slides into the "S" while "maran" writes out (FORM) → "Smaran" rests until the app
// is ready (at least REST) → it lands on the title, or just fades when there is no title to land on (LAND).
// With the phone's "Remove animations" setting on, it skips the motion and only fades.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, fonts } from '@/ui/theme';

const MARK_HOLD = 250;
const FORM = 400;
const REST = 200;
const LAND = 450;

// The same image and size Android's launch screen uses (app.json, expo-splash-screen "imageWidth": 96).
const MARK_SIZE = 96;
const WORD = ['S', 'm', 'a', 'r', 'a', 'n'];
// The word is drawn at twice the title's size and scaled down to exactly half when it lands.
const WORD_FONT_SIZE = 48;
const LANDED_SCALE = 0.5;
// Where the Timeline's title sits (src/app/(tabs)/index.tsx): 16 from the left, 8 below the status bar, centred in
// a row as tall as the 34 px "+" button.
const TITLE_LEFT = 16;
const TITLE_TOP = 8;
const TITLE_ROW_HEIGHT = 34;

const ease = Easing.out(Easing.cubic);

type Props = {
  // Fonts loaded, so "Smaran" can be drawn in Fraunces.
  fontsLoaded: boolean;
  // The first screen is decided and drawn underneath.
  ready: boolean;
  // True when the first screen is the Timeline; otherwise (onboarding, an error) the cover just fades.
  landOnTitle: boolean;
  onDone: () => void;
};

type Layout = { width: number; height: number };

function Letter({ letter, index, form, land, onLayout }: { letter: string; index: number; form: SharedValue<number>; land: SharedValue<number>; onLayout?: (event: LayoutChangeEvent) => void }) {
  const style = useAnimatedStyle(() => {
    // The "S" appears as स्म arrives; "maran" follows one letter at a time, each sliding in slightly from the left.
    const start = index === 0 ? 0.35 : 0.2 + index * 0.1;
    const shown = interpolate(form.value, [start, start + 0.4], [0, 1], 'clamp');
    return {
      opacity: shown,
      transform: [{ translateX: (1 - shown) * -6 }],
      color: interpolateColor(land.value, [0, 1], [colors.accent, colors.ink]),
    };
  });
  return (
    <Animated.Text onLayout={onLayout} style={[{ fontFamily: fonts.heading, fontSize: WORD_FONT_SIZE }, style]}>
      {letter}
    </Animated.Text>
  );
}

export function LaunchAnimation({ fontsLoaded, ready, landOnTitle, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const mountedAt = useRef(Date.now());
  const [screen, setScreen] = useState<Layout | null>(null);
  const [word, setWord] = useState<Layout | null>(null);
  const [sWidth, setSWidth] = useState<number | null>(null);
  const [formed, setFormed] = useState(false);

  const form = useSharedValue(0);
  const land = useSharedValue(0);
  const cover = useSharedValue(1);

  const measured = screen !== null && word !== null && sWidth !== null;

  // Step 2: once the word can be drawn and measured, स्म turns into "Smaran".
  useEffect(() => {
    if (!fontsLoaded || !measured || reduceMotion) return;
    const delay = Math.max(0, MARK_HOLD - (Date.now() - mountedAt.current));
    form.value = withDelay(
      delay,
      withTiming(1, { duration: FORM, easing: ease }, (finished) => {
        if (finished) scheduleOnRN(setFormed, true);
      }),
    );
  }, [fontsLoaded, measured, reduceMotion, form]);

  // Step 3: when the app is ready (and the word has formed), land on the title or just fade.
  const finishing = useRef(false);
  useEffect(() => {
    if (!ready || finishing.current) return;
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(onDone);
    };
    if (reduceMotion || !fontsLoaded) {
      finishing.current = true;
      cover.value = withTiming(0, { duration: 200 }, finish);
      return;
    }
    if (!formed) return;
    // Start the ending once only, even if a prop changes while it plays.
    finishing.current = true;
    if (landOnTitle) {
      land.value = withDelay(REST, withTiming(1, { duration: LAND, easing: Easing.inOut(Easing.cubic) }));
      // The cover fades during the second half, so the real title shows through as the word arrives on it.
      cover.value = withDelay(REST + LAND / 2, withTiming(0, { duration: LAND / 2 }, finish));
    } else {
      cover.value = withDelay(REST, withTiming(0, { duration: 300 }, finish));
    }
  }, [ready, formed, landOnTitle, reduceMotion, fontsLoaded, land, cover, onDone]);

  // Where the word sits at rest (centred on screen) relative to where it lands (the title).
  const titleTop = insets.top + TITLE_TOP + Math.max(0, (TITLE_ROW_HEIGHT - (word?.height ?? 0) * LANDED_SCALE) / 2);
  const restX = screen && word ? (screen.width - word.width) / 2 - TITLE_LEFT : 0;
  const restY = screen && word ? (screen.height - word.height) / 2 - titleTop : 0;
  // How far स्म travels to sit on the "S" (both start centred on screen).
  const markToS = word && sWidth !== null ? sWidth / 2 - word.width / 2 : 0;

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: interpolate(form.value, [0.15, 0.6], [1, 0], 'clamp'),
    transform: [{ translateX: interpolate(form.value, [0, 0.6], [0, markToS], 'clamp') }, { scale: interpolate(form.value, [0, 0.6], [1, 0.8], 'clamp') }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: restX * (1 - land.value) },
      { translateY: restY * (1 - land.value) },
      { scale: 1 - (1 - LANDED_SCALE) * land.value },
    ],
  }));

  return (
    <Animated.View
      testID="launch-cover"
      pointerEvents="none"
      // Android's launch screen is hidden only once this cover is on screen, so there is never a blank frame.
      onLayout={(event) => {
        setScreen(event.nativeEvent.layout);
        SplashScreen.hideAsync().catch(() => {});
      }}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, coverStyle]}
    >
      <Animated.Image source={require('../../../assets/images/splash-icon.png')} style={[{ width: MARK_SIZE, height: MARK_SIZE }, markStyle]} />
      {fontsLoaded && (
        <Animated.View
          testID="launch-word"
          onLayout={(event) => setWord(event.nativeEvent.layout)}
          style={[{ position: 'absolute', left: TITLE_LEFT, top: titleTop, flexDirection: 'row', transformOrigin: 'left top' }, wordStyle]}
        >
          {WORD.map((letter, index) => (
            <Letter
              key={index}
              letter={letter}
              index={index}
              form={form}
              land={land}
              onLayout={index === 0 ? (event) => setSWidth(event.nativeEvent.layout.width) : undefined}
            />
          ))}
        </Animated.View>
      )}
    </Animated.View>
  );
}

// Android's launch screen would otherwise disappear as soon as React draws anything, before this cover exists.
export function holdLaunchScreen() {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}
