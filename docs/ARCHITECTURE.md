# How Smaran is built

This guide is for someone new to app development who wants to read the code. It maps the folders, follows one
share from the share menu to the screen, explains why each library is there, and links every idea to the file that
implements it. Each source file also starts with a short comment on its job.

## The big picture

Smaran is a [React Native](https://reactnative.dev) app built with [Expo](https://docs.expo.dev). You write
TypeScript and React components, and React Native turns them into real Android views. Expo adds ready-made native
modules (SQLite, secure storage, files, background tasks) and the build tooling. One piece needed custom native
code: the "Saved" card that appears over other apps. It's a small Kotlin module in `modules/share-receiver`.

There is no server. Everything lives in one SQLite database on the phone, and the only network calls are to the
sites you share and to the AI you connect.

```
 src/app/  screens (one file = one route, via Expo Router)
    │
    ▼
 src/ui/   components and hooks shared by screens
    │
    ▼
 src/db/   every SQL query, one file per table group          ◄── modules/share-receiver (Kotlin) writes share_inbox
    ▲
    │
 src/pipeline/   turns new shares into finished saves, in the background
    │
    ├──► src/extract/   reads a link: title, author, text, image
    └──► src/ai/        asks your AI for summary, topic, tags
 src/core/    plain types and helpers used everywhere (URLs, dates)
 src/backup/  export and import of the whole library as a .zip
```

Arrows point from the caller to what it calls. Screens never talk to the network, and extractors and AI providers
never touch the database. The pipeline is the only place that connects them.

## The folders

**`src/app/`: screens.** [Expo Router](https://docs.expo.dev/router/introduction/) turns files into routes.
- `(tabs)/index.tsx` is the Timeline, at `/`. `(tabs)/topics.tsx`, `search.tsx` and `settings.tsx` are the other tabs.
- `(tabs)/_layout.tsx` draws the tab bar, and sends a first-time user to `onboarding/welcome.tsx`.
- `topic/[id].tsx` is one topic. `[id]` means the id comes from the URL.
- `_layout.tsx` is the root: it loads fonts, opens the database, and makes it available to every screen.

Screens arrange components and call hooks. They hold no SQL and no business logic.

**`src/ui/`: building blocks for screens.**
- `components/` holds the visible pieces, for example [`SaveCard`](../src/ui/components/SaveCard.tsx) and
  [`SaveSheet`](../src/ui/components/SaveSheet.tsx) (the detail sheet).
- `hooks/` holds functions starting with `use…` that load data and keep it fresh, for example
  [`useTimeline`](../src/ui/hooks/useTimeline.ts).
- `signin/` holds the three sign-in flows.
- [`theme.ts`](../src/ui/theme.ts) holds the colours and fonts, as a plain object.

**`src/db/`: the database.**
- [`schema.ts`](../src/db/schema.ts) holds the tables, and [`migrate.ts`](../src/db/migrate.ts) applies them.
- [`saves.ts`](../src/db/saves.ts), [`topics.ts`](../src/db/topics.ts), [`search.ts`](../src/db/search.ts) and
  [`settings.ts`](../src/db/settings.ts) hold every query, as plain `async` functions that take the database as
  their first argument.

Every function takes `db` as a parameter, so tests can pass in a real in-memory SQLite (see
[`test/helpers/sqlite.ts`](../test/helpers/sqlite.ts)).

**`src/pipeline/`: background work.**
- [`ingest.ts`](../src/pipeline/ingest.ts) moves new shares into saves.
- [`process.ts`](../src/pipeline/process.ts) handles one save: fetch, thumbnail, AI.
- [`queue.ts`](../src/pipeline/queue.ts) runs everything that's due, one run at a time.
- [`retry.ts`](../src/pipeline/retry.ts) sets the wait between attempts: 1 min, 5 min, 30 min, 2 h, then every 6 h.
- [`runNow.ts`](../src/pipeline/runNow.ts) wires in the real network, AI and files.
- [`headless.ts`](../src/pipeline/headless.ts) registers the background triggers.

**`src/extract/`: reading links.** There's one extractor per source:
[`x.ts`](../src/extract/x.ts), [`reddit.ts`](../src/extract/reddit.ts),
[`instagram.ts`](../src/extract/instagram.ts), [`github.ts`](../src/extract/github.ts), and
[`web.ts`](../src/extract/web.ts) for any other page. [`index.ts`](../src/extract/index.ts) picks one.

Each extractor is a function `(url, ctx) => Promise<Extracted>`. Failures are thrown as an `ExtractError` with a
`kind` (`blocked`, `not_found`, `network`, …), so the pipeline can decide whether to retry.

**`src/ai/`: talking to the AI.**
- [`enrichment.ts`](../src/ai/enrichment.ts) builds the prompt and checks the reply.
- `providers/` holds one file per API: Anthropic, OpenAI, Gemini, plus the ChatGPT Codex and Gemini Code Assist
  endpoints used by subscription sign-in.
- `auth/` holds the three OAuth flows.
- [`credentials.ts`](../src/ai/credentials.ts) stores tokens and keys in encrypted storage.
- [`registry.ts`](../src/ai/registry.ts) builds whichever provider is active.

**`src/core/`: shared, dependency-free code.** It holds types (`Save`, `Source`, …), URL cleaning and
source detection in [`url.ts`](../src/core/url.ts), and date labels in [`dates.ts`](../src/core/dates.ts). It
contains no React and no native code.

**`src/backup/`: backups.** [`backup.ts`](../src/backup/backup.ts) defines the zip format and the merge-on-import
rules. [`backupFiles.ts`](../src/backup/backupFiles.ts) is the phone side: it saves the file, opens the share sheet,
and opens the file picker.

**`modules/share-receiver/`: the native share card (Kotlin).**
- [`ShareActivity.kt`](../modules/share-receiver/android/src/main/java/app/smaran/share/ShareActivity.kt) is the
  see-through activity Android opens when you pick Smaran in the share menu.
- [`ShareInboxDb.kt`](../modules/share-receiver/android/src/main/java/app/smaran/share/ShareInboxDb.kt) holds its
  few SQL statements.
- [`ProcessTaskService.kt`](../modules/share-receiver/android/src/main/java/app/smaran/share/ProcessTaskService.kt)
  wakes the JavaScript side.
- [`withShareReceiver.js`](../modules/share-receiver/plugin/withShareReceiver.js) is a *config plugin*: it adds the
  activity to `AndroidManifest.xml`. The `android/` folder is generated by `npx expo prebuild` and not committed, so
  every native setting has to come from a plugin.

**`plugins/`: other config plugins.** [`withReleaseSigning.js`](../plugins/withReleaseSigning.js) signs release
builds with your key ([docs/release.md](release.md)).

## The life of one share

```
 You tap Share → Smaran in X
        │
        ▼
 ShareActivity (Kotlin, its own ":share" process)
   • INSERT INTO share_inbox (shared_text, …)          ← Android's built-in SQLite, same smaran.db file
   • shows "Saved" for 1.5 s, with Undo and Add a note (both only update that share_inbox row)
   • starts ProcessTaskService
        │
        ▼
 ProcessTaskService (Headless JS) runs the "SmaranProcess" task  → src/pipeline/headless.ts
        │
        ▼
 runQueue                                               → src/pipeline/queue.ts
   1. ingestInbox: share_inbox row → saves row, status 'fetching'          → ingest.ts, db/saves.ts
      (the same link shared again moves the old save to today instead of duplicating it)
   2. claimDue: lease up to 5 saves that are due                            → db/saves.ts
   3. processSave, for each one:                                           → process.ts
        fetch:  extractorFor(source)(url) → title, author, text, image      → src/extract/*
                download a thumbnail                                       → thumbs.ts
        AI:     enrich(text) → { summary, brief, topic, tags }             → src/ai/enrichment.ts
        save:   applyEnrichment → status 'done'                            → db/saves.ts
      on failure: status 'waiting_ai' or 'partial' with a reason, and next_retry_at from retry.ts
   4. ingest again, in case a note or another share arrived during the run
        │
        ▼
 SQLite tells the app "table saves changed"   (expo-sqlite's change listener)
        │
        ▼
 useReloadOnChange → useTimeline reloads → the Timeline shows the new card
```

Some details worth knowing:

- **Why a separate table and a separate process for the share card?** The card must appear instantly, even when the
  app isn't running. Starting React Native takes about a second, so the card is plain Kotlin and only writes one row.
  Two rules keep that safe:
  - Kotlin never writes to `saves`. That table has search triggers that use SQLite's FTS5 module, which Android's
    built-in SQLite lacks.
  - The card runs in its own process (`android:process=":share"`). Two different SQLite libraries must not open the
    same file in one process, or their file locks interfere.
- **Why "leases"?** The pipeline can be started by the app opening, by the share card, or by the 15-minute
  background task. Leasing a save, by marking it taken until a time, means two runs never work on the same save.
  See `claimDue` in [`db/saves.ts`](../src/db/saves.ts).
- **Nothing is lost.** Offline, out of quota, or no AI connected: the save keeps its link and text, and the queue
  banner says why it's waiting. A link that can't be read goes `partial`, and the AI still works from the caption.

## Search

The `saves_fts` table is an [FTS5](https://www.sqlite.org/fts5.html) full-text index over summary, brief, title,
author, note, extracted text and tags. Triggers in [`schema.ts`](../src/db/schema.ts) keep it in sync whenever a
save or its tags change. [`search.ts`](../src/db/search.ts) turns what you type into a safe prefix query
(`scan` → `"scan"*`) and ranks results with `bm25()`.

## Why these libraries

| Library | Used for | Why this one |
| --- | --- | --- |
| Expo + Expo Router | App framework, screens, builds | File-based routes, and native modules without writing native code |
| `expo-sqlite` | The database | Includes FTS5 for search, and can notify the UI when a table changes |
| `expo-secure-store` | Sign-in tokens and API keys | Android Keystore-backed encrypted storage |
| `expo-background-task`, `expo-task-manager` | The 15-minute catch-up run | The supported way to run JS periodically in the background |
| `expo-file-system`, `expo-sharing` | Thumbnails, backup files, file picker, share sheet | Expo's own APIs; the file picker is built in |
| `expo-web-browser`, `expo-clipboard`, `expo-crypto` | Sign-in flows | Open the provider's login page, read the pasted code, random state |
| `expo-network` | Skip the network when offline | Avoids burning retry attempts while offline |
| `@shopify/flash-list` | The Timeline list | Fast scrolling through thousands of saves |
| `htmlparser2` | Reading web pages | Small and forgiving with real-world HTML |
| `zod` | Checking the AI's JSON reply | An answer in the wrong shape becomes a clean retry, not a crash |
| `@noble/hashes` | SHA-256 for OAuth PKCE | Audited, pure JS, works without native code |
| `fflate` | Backup `.zip` files | Pure JS and small |

Some things are deliberately absent:
- No state-management library. Each hook loads from SQLite and reloads on change.
- No HTTP client. `fetch` is enough.
- No dependency-injection framework. Functions take what they need as arguments.

## Testing

```bash
npx jest              # all tests (two projects: core and ui)
npx jest test/core    # pure logic in Node: db queries, pipeline, extractors, AI providers, backup
npx jest test/ui      # screens rendered with React Native Testing Library
npm run typecheck     # TypeScript for app, tests and scripts
```

Tests use a real SQLite: Node's built-in `node:sqlite`, wrapped to look like expo-sqlite in
[`test/helpers/sqlite.ts`](../test/helpers/sqlite.ts). So the SQL, triggers and search in tests are the real ones.
Only things that need a phone are faked: secure storage, files, the network, navigation.

The Kotlin share card can't be tested in Jest. It's checked on a phone with the checklist in
[docs/release.md](release.md).

## Where to start reading

1. [`src/core/types.ts`](../src/core/types.ts) defines what a "save" is.
2. [`src/db/schema.ts`](../src/db/schema.ts) shows how saves are stored.
3. [`src/pipeline/queue.ts`](../src/pipeline/queue.ts) → [`process.ts`](../src/pipeline/process.ts) show how a save
   is finished.
4. [`src/app/(tabs)/index.tsx`](../src/app/(tabs)/index.tsx) → [`SaveCard`](../src/ui/components/SaveCard.tsx) show
   how it's displayed.
5. [`ShareActivity.kt`](../modules/share-receiver/android/src/main/java/app/smaran/share/ShareActivity.kt) shows how
   it arrives.
