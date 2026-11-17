# Launch animation: स्म becomes "Smaran"

Short design (small change). Approved approach: in-app animation with Reanimated.

## Intent

Opening Smaran today shows Android's still स्म launch screen, then a blank cream screen, then the Timeline. The owner
wants a short branded animation in its place, like JioHotstar's: the स्म from the icon turns into the word "Smaran",
which then becomes the title of the Timeline. It should make opening the app feel finished and quick.

## Goals

- Every cold start: स्म (exactly where Android's launch screen drew it) → "Smaran" → glides into the Timeline title.
- Seamless hand-off from Android's launch screen: no jump, flash or blank frame.
- Short: about 1.2 s when the app is ready. It never makes startup slower than the work it covers.

## Non-goals

- No animation when returning to the app from the background (the app is still running; nothing to cover).
- No change to the share card (the native "Saved" card from the share sheet does not run this code).
- No new libraries, no Lottie, no animated Android launch icon.

## Anti-goals

- An animation that hides a genuinely slow startup. If the app is slow to get ready, that is a bug to find, not
  something to decorate.
- A stutter: the animation must stay smooth while the database opens and the Timeline loads underneath.

## Approaches considered

1. **Reanimated in the app (picked).** Already installed; runs on the UI thread so it stays smooth while JavaScript
   is busy. No new dependency, all in TypeScript.
2. Lottie file. New native library, and the animation would be hand-written JSON with no designer. Harder to tune.
3. Android 12+ animated launch icon. Limited to the round icon area and about a second; "Smaran" cannot grow beyond
   the circle or move to the title, so it cannot do this design.

## The animation (about 1.2 s)

```
0.00–0.25 s   स्म alone, centred, same size and place as Android's launch screen (96 px wide, terracotta)
0.25–0.65 s   स्म fades and shrinks into a large "S"; "maran" writes out to its right, letter by letter
              (Fraunces SemiBold, terracotta, centred)
0.65–0.85 s   "Smaran" rests
0.85–1.25 s   "Smaran" shrinks to 24 px and moves to the Timeline title's place (top left, under the status
              bar), turning from terracotta to ink; the cream cover fades out and the real Timeline shows through
```

- The cover waits for the app to be ready (fonts loaded, database open, first screen decided) before the last step.
  If that takes longer than 0.85 s, "Smaran" stays resting until it is ready; it does not loop or restart.
- First run (not onboarded yet): there is no Timeline title to land on, so after "Smaran" rests the cover just fades
  out to the welcome screen.
- If the phone's "Remove animations" setting is on, skip the motion: a short fade from स्म to the app.

## How it fits the app

- Android's launch screen is held (`SplashScreen.preventAutoHideAsync`) until the cover's first frame is drawn,
  then hidden, so the hand-off is invisible.
- The cover is one component, `src/ui/components/LaunchAnimation.tsx`, drawn over everything in the root layout
  (`src/app/_layout.tsx`) and removed when it finishes. The root layout tells it when the app is ready.
- The स्म is drawn from `assets/images/splash-icon.png`, the same image Android's launch screen uses, so it matches.

## Startup time

The owner reports waiting a long time on the logo. Before building, the builder reads the startup path (JavaScript
bundle load, font loading, opening the database and its migrations, the onboarding check) for anything slow. Debug
builds load JavaScript from Metro and are much slower than release builds. If a release build still waits several
seconds, that is a separate bug and gets reported to the owner, not covered up.

## Left to the builder

Exact easing curves, the letter-by-letter timing, and how the title position is measured, as long as "Smaran" lands
on the Timeline title closely enough that the cross-fade looks like one word.

## Owner checks (on the phone, release build)

1. Open Smaran from cold (swipe it away from recents first): स्म turns into Smaran, which lands on the title.
   No flash between Android's logo and the animation.
2. Switch to another app and back: no animation.
3. With "Remove animations" on (Accessibility settings): a quick fade only.
4. Fresh install: the animation ends on the welcome screen.
