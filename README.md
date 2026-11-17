# Smaran

*Smaran (स्मरण) means "remembrance".*

Smaran is an Android app for the things you mean to come back to. Share a post, reel, repo or article to it from
any app's share menu. A small card says "Saved", you stay where you were, and in the background the AI you choose
writes a one-line summary, a topic and a few tags. Later you can find it again by day on the Timeline, by topic, or
by searching for any word you remember.

- **No account and no server.** Your library is a SQLite database on your phone.
- **Works with X, Reddit, Instagram (reels by caption), GitHub and any web page.** Plain shared text works too.
- **Bring your own AI.** Sign in with a Claude, ChatGPT or Gemini subscription, or paste an API key.
- **Nothing is lost.** Saves made offline, or while the AI is out of quota, wait in a queue and finish on their own.

> Screenshots will be added with the first public release. Until then, the design mockups are in
> [`docs/superpowers/specs/assets/2026-11-10-smaran-mockups.html`](docs/superpowers/specs/assets/2026-11-10-smaran-mockups.html)
> (Direction A).

## What leaves your phone

| What | Where it goes | Why |
| --- | --- | --- |
| The link you shared | The site itself (x.com, reddit.com, github.com, instagram.com, …) | To read the title, text and preview image |
| The link, for X posts only | `api.fxtwitter.com`, a public read-only mirror, when X won't answer directly | X blocks most direct reads. You can turn mirrors off in **Settings → Use public mirrors** |
| The post's text (title, author, text, caption, your note) | The AI provider you connected (Anthropic, OpenAI or Google) | To write the summary, topic and tags |
| Sign-in tokens or API keys | Only to that same provider | Stored in Android's encrypted storage (`expo-secure-store`). Never logged, never in backups |

Nothing else is collected. There are no analytics or crash reporters, and Smaran has no server. Backups
(**Settings → Export backup**) are a `.zip` you choose where to send. They never contain credentials.

## Subscription sign-in: read this first

**Signing in with a Claude, ChatGPT or Gemini subscription reuses the public OAuth clients of the official
Claude Code, Codex CLI and Gemini CLI tools.** This is how several open-source coding tools work, but:

- it **may violate those providers' terms of service**,
- the provider can block it at any time, and the sign-in then **stops working without warning**, and
- your account is the one at risk.

If you use it, you do so at your own risk. **API keys are the supported path.** Choose "I have an API key instead"
on the Connect screen. Keys are billed by the provider per use, and summarising a save costs a fraction of a cent on
the default fast models.

## Install

Until a release APK is published, build it yourself (below).

## Build from source

You need Linux, macOS or Windows with:

- **Node.js 20+** and npm
- **JDK 17.** Newer JDKs are not supported by the Android Gradle plugin used here. This repo's `mise.toml` pins one
  if you use [mise](https://mise.jdx.dev).
- **The Android SDK**, with platform tools, a recent platform, build tools, NDK 27.1 and CMake. Android Studio's SDK
  Manager installs these. Set `ANDROID_HOME` to the SDK folder.
- An Android phone with USB debugging on, or an emulator.

```bash
npm install
npx expo run:android          # generates android/, builds a debug APK, installs it and starts Metro
```

The first build takes a while. Later builds are incremental. For a faster build for one phone, add
`-- -PreactNativeArchitectures=arm64-v8a` (most phones from 2017 on are arm64).

**Metro** is the JavaScript dev server. A debug build loads the app's JavaScript from it, so keep it running while
you develop, and run `adb reverse tcp:8081 tcp:8081` if the phone is on USB. A release build bundles the JavaScript
inside the APK and needs no Metro. See [docs/release.md](docs/release.md).

### A release APK in one command

```bash
npm run apk                   # clean build: regenerates android/, builds the release APK, copies it to dist/smaran.apk
```

Then install it with `adb install -r dist/smaran.apk`, or copy the file to the phone and open it. It is signed with your
upload key once that is set up (docs/release.md, steps 1 and 2); until then it uses Expo's debug key, which is fine for
your own phone but must not be published.

### Tests and type checks

```bash
npx jest              # core logic (Node) and screens (React Native test renderer), on a real SQLite
npm run typecheck     # the app, the tests and the scripts, each with its own tsconfig
```

Expo Router generates typed routes into `.expo/types/` (gitignored). After cloning, or after adding a screen, run
`npx expo start` once and stop it, so `npm run typecheck` knows the routes.

## How it's built

The code is written to be read. If you're new to app development, start with
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). It walks through every folder and follows one share from the share
menu to the screen.

## License

MIT. See [LICENSE](LICENSE).
