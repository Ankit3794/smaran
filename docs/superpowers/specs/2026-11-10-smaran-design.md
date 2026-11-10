# Smaran: design (v1, Android)

*Smaran (स्मरण): Hindi/Sanskrit for "remembrance; the act of recalling".*

Status: draft for approval · 2026-11-10
Mockups: [`assets/2026-11-10-smaran-mockups.html`](assets/2026-11-10-smaran-mockups.html), open it in a browser. **Direction A was chosen** (it was called "Cairn" during exploration and has been renamed Smaran). Directions B and C stay in the file for reference only.

---

## 1. Why this exists

The owner scrolls X, Reddit, Instagram, GitHub and the web every day and saves things in each app's own bookmarks. Later they can't find them. The trigger: late one night they bookmarked a good trading tool on X, and two days later it was lost among hundreds of bookmarks.

Smaran is a personal memory for things you come across online:

1. **Capture without thinking.** Tap Share → Smaran in any app, and you're done. No typing, no folders, and you stay in the app you were using.
2. **The AI organizes.** Each save gets a one-line summary, a short brief, a topic and tags, automatically.
3. **Get it back by topic and time.** "Trading → yesterday → that scanner." You can also search by keyword when you remember a name.
4. **Go to the source.** The app helps you recognize the item, then sends you to the original post. It is not a reader.

Market context, from validation research done in this session: share-and-AI-summarize apps already exist (The Saved, MarkIt, SaveSync, Recall, mymind…). All of them are cloud services with accounts, and most cap saves because they pay for AI on every save. Smaran's angle is different:
- **No account.**
- **The library lives only on the phone.**
- **You bring your own AI** (subscription login or API key), so saves cost the project nothing and there is no cap.
- **Open source.**

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
- Saving from the Android share sheet takes under a second and never fails, even offline.
- A save is enriched (summary, brief, topic, tags, thumbnail) within about 30 seconds when the phone is online and the AI is reachable.
- The owner can find "the trading thing from two nights ago" in under 5 seconds and in 3 taps or fewer.
- The topic list stays small and coherent. "Trading", "Stocks" and "Markets" must not become three separate topics.
- Polished UI that follows mockup Direction A.
- The code is ready to open-source: clean structure, no secrets, a README, and a license.

**Non-goals (v1)**
- iOS (the stack must not rule it out; see §4).
- Understanding video content (reels get their caption and thumbnail only).
- Running the AI on the phone (designed for, built later).
- Accounts, sync, sharing, collaboration.
- A built-in reader: the app always sends you to the original.
- Importing existing X, Reddit or Instagram bookmarks.
- Monetization.

**Anti-goals** *(the designer's guess, not yet confirmed by the owner)*. v1 has failed if any of these is true, even if everything technically works:
- Sharing feels slow, or pulls you out of the app you were scrolling.
- A save is ever silently lost.
- Topics turn into a messy pile of near-duplicates.
- Finding a recent save takes longer than scrolling X bookmarks would.

## 3. Constraints

- Android only for v1. The developer works on Linux without a Mac.
- Must be cross-platform capable for a future iOS version.
- Free to build: no paid services are required to develop or run the app.
- No backend, no accounts, no analytics. Everything is stored on the device.
- Content sent off the device:
  - Fetching the source URL to read it, or a public mirror for X when the source blocks reading (can be turned off; see §4).
  - Sending extracted text to the AI provider the user chose.
  - Nothing else.

## 4. Decisions

### Decided by the owner
- **Platform:** Android first, built with a cross-platform toolkit.
- **AI:** cloud providers in v1, with on-device models later. The user picks **Claude, ChatGPT or Gemini**, and for each they can **sign in with their subscription (OAuth)** or paste an API key.
  - The owner accepted the terms-of-service risk of the subscription logins after it was raised. Specifically, Anthropic's terms forbid third-party use of Pro/Max subscription logins. Do not reopen this decision. Do isolate the risk (see §8.3).
  - **All three subscription sign-ins (Claude, ChatGPT, Gemini) plus API keys for all three must work in v1. They block the release.** The plan therefore starts with a spike that proves each sign-in flow end to end on a real device. The owner provides the test accounts (Claude Pro/Max, ChatGPT Plus/Pro, a Google account).
- **Sources that must work in v1:** X posts, web links, Reddit, GitHub repos, Instagram reels (caption only).
- **Reels:** caption plus thumbnail is enough. Video understanding is parked.
- **Finding things:** browse by topic and timeline first, keyword search second. No chat or Q&A interface.
- **Card content:** thumbnail, one-line summary, source link.
- **Visual direction:** mockup Direction A (calm journal).
- **Bottom tabs:** Timeline / Topics / Search / Settings.
- **Name:** Smaran.
- **Later version:** reminder notifications for saves you shared but never opened, in an engaging style. Tapping a notification opens those saves. v1 must record the data this needs.
- **Open source** once v1 works.

### The designer's calls (the owner can override)
- **Stack:** Expo (React Native) + TypeScript, Expo Router, `expo-sqlite`. Native Android code only where Expo can't do the job (the share entry point, see §6.1).
  - Reasons: works on Android and iOS, its cloud service can build iOS without a Mac, and it has the largest pool of open-source contributors.
- **One active AI provider at a time**, switchable in Settings. Switching never touches the library.
- **Default models: the cheapest fast tier** of each provider. Claude Haiku-class, Gemini Flash-class, and the smallest model the ChatGPT/Codex backend offers. The user can change the model in Settings.
- **Re-sharing an already-saved URL** creates no duplicate. The existing save moves to the top of the timeline (`last_saved_at` = now), and the confirmation says "Already saved, moved to today".
- **"Opened"** means the user tapped through to the original from Smaran (sets `opened_at`). This field is what the later reminders use.
- **Thumbnails are downloaded and cached on the device**, so cards survive deleted posts and link rot. If there's no image, the card shows a generated tile (gradient plus a short glyph, as in the mockups).
- **X threads:** v1 captures the shared post itself, including long-form posts. Expanding the full thread is a stretch goal (§6.3).
- **License:** MIT.
- **Android application ID:** `app.smaran` (placeholder until publishing).
- **Share confirmation:** a translucent activity shows a small card for ~1.5 seconds and then closes itself. No "display over other apps" permission. The app underneath pauses only for that moment.
  - Tapping **Add a note** on the card keeps it open until the note is saved.
  - Tapping **Undo** deletes the save, and also cancels processing if it has started.
- **Distribution (v1):** a signed APK, built locally with Gradle/`expo run:android` (free), installed directly on the phone and published on GitHub Releases. The Play Store and F-Droid come later. This avoids the store fee and store review of the borrowed CLI client IDs for now.
- **Third-party fetch services:** the X extractor may fall back to a public mirror service (e.g. fxtwitter), which sees only the post URL.
  - The privacy copy discloses this: "links are fetched from the source or a public mirror".
  - Settings has a toggle, **Use public mirrors when a source blocks reading** (on by default).
- **Weak X/Instagram extraction does not block v1.** If the spike shows lower success rates, v1 ships with the partial state (link + shared text + whatever metadata exists) and the logged-in hidden WebView stays a post-v1 item. The §11 targets become goals to track, not release gates.
- **Spike URLs:** the builder collects ~20 public sample URLs per source. The owner may add links from their own bookmarks to make the test more realistic.

## 5. The experience (Direction A)

The mockups show every screen below. **Mockup screen numbers are in brackets.**

### 5.1 First run
1. **Welcome:** one screen with what Smaran does and the privacy promise. This step is not in the mockups; follow Direction A's style.
2. **Connect your AI [1]:**
   - Choose Claude / ChatGPT / Gemini, each with "Sign in with subscription". There's also an "I have an API key instead" link.
   - The copy states that the library stays on the phone and only post text goes to the chosen AI.
3. **Sign-in flow [2]:**
   - **Claude and Gemini** use a browser sign-in that ends by showing a code. The user copies it, and the app detects it on the clipboard and offers to paste it.
   - **ChatGPT** uses a device code: the app shows a short code, the user enters it on OpenAI's site, and the app keeps checking until sign-in completes.
   - **API keys** are pasted and checked with one cheap test call.
4. **Pin Smaran to the share sheet:** a short tip showing how to long-press Smaran in the Android share sheet and pin it. Not in the mockups.

Skipping AI setup is allowed. Saves then queue with status "waiting for AI" (see §5.4).

### 5.2 Capture [4, 5]
- Smaran appears in the Android share sheet for any shared text or URL.
- Tapping it saves immediately. A small confirmation appears over the current app ("Saved to Smaran · sorting it into a topic…"), offering **Undo** and **Add a note**, and the user **stays in the app they were in**.
- If the shared content has no URL (plain text), save it as a text note and enrich it the same way.
- If the user shares an image only, v1 shows "Smaran saves links and text for now" and saves nothing.

### 5.3 Finding things
- **Timeline (home) [7]:**
  - Saves grouped by day: Today, Yesterday, then the weekday name for the last 7 days, then dates.
  - Topic chips across the top filter the list ("All" + topics with counts, sorted by most recently used), plus a search bar.
  - Card: thumbnail, one-line summary (2 lines max), source badge, author, time, and topic (coloured dot + name). A terracotta dot on the card means unopened.
- **Topics [8]:** each topic with count, "N new this week", and a 7-day activity bar. "Unsorted" holds saves the AI hasn't processed yet. Long-press or the overflow menu gives rename, merge into another topic, and change colour.
- **Topic detail [9]:** the topic name, count and last save time; tag chips with counts (top tags) to filter; and the saves in a journal-style vertical line grouped by day.
- **Detail sheet [10]:**
  - A bottom sheet with the large thumbnail, summary, brief, source + author + saved time, topic (changeable), editable tags (add/remove), and the user's note.
  - Actions: **Open on <source> ↗** (primary; opens the native app if it's installed, otherwise the browser; sets `opened_at`), copy link, delete, and retry AI (when it failed).
- **Search [11]:**
  - Keyword search over summary, brief, title, author, tags, note and extracted text, with prefix matching as you type.
  - Filters: time (any / today / 7 days / 30 days), source, topic.
  - Results are grouped by topic with matches highlighted, and the best match comes first within each group.

### 5.4 States [6]
- Status of a save:
  - fetching
  - waiting for AI (with the reason: offline / not connected / quota reached until X / provider error)
  - partial (the content couldn't be read, so link and caption were kept)
  - done
- When anything is queued, the timeline shows a banner explaining why, with **Retry now**.
- A failed fetch never deletes the save. The card shows whatever the app has: URL, shared text, title.

### 5.5 Settings [3]
- **AI:**
  - Current provider, connection status and plan type where known.
  - Model picker.
  - Switch provider / use an API key.
  - Disconnect.
- **Library:**
  - Number of saves and storage used.
  - Rename & merge topics.
  - **Export backup** (.zip) and **Import backup**.
- **Coming later** (shown disabled):
  - Reminders.
  - On-device AI.
- **About:** version, license, link to the source code.

### 5.6 Visual language (Direction A)
- **Background:** warm paper `#F6F2EA`, cards `#FFFDF8`, ink `#221F1A`, muted `#8A8174`, lines `#E7E0D3`. Accent: terracotta `#C8553D`.
- **Fonts:** **Fraunces** for headings and the wordmark, **Inter** for body text. Rounded cards (radius ~14).
- **Topic colours:** each topic gets a quiet colour from a fixed palette of about 10 muted colours (e.g. `#2F7D5B` green, `#B4443A` red, `#3C5FA8` blue, `#B07A1F` amber, and similar). Assign them in creation order; the user can change them.
- **Light theme is primary.** Dark mode is a "nice to have" in v1 and must keep the paper/ink character (warm dark, not pure black).
- **Motion:** calm. The bottom sheet slides up; there are no bouncy effects.

## 6. How it works

### 6.1 Capture path (must be fast and never lose data)
- A lightweight **native Android share activity** receives `ACTION_SEND` (text/plain), which covers URLs and text. It is translucent, with no full app UI.
- It:
  - writes the raw share (shared text, extracted URL, sending app's package name, timestamp) to the shared SQLite database
  - shows the confirmation overlay
  - starts processing
  - finishes, returning the user to where they were.
- The overlay's Undo deletes the row. "Add a note" opens a minimal note input in the same overlay.
- **Processing must start right away**, not on a 15-minute schedule. Running JavaScript in the background (React Native "Headless JS"), WorkManager, or both are acceptable. This is left to the builder.
- Fallbacks: the queue is also processed when the app opens and on a periodic background task. Whatever the mechanism, processing is resumable and safe to run twice.
- The database uses WAL mode so the share activity and the app can both write.

### 6.2 Processing pipeline (per save)
1. **Normalize the URL:**
   - Expand known short links (t.co etc.) by following redirects.
   - Strip tracking parameters (`utm_*`, `igsh`, `si`, `s`, `t` for x.com, etc.).
   - Compute a canonical URL for duplicate checks.
2. **Fetch** using the extractor for that source (§6.3). This gives title, author, main text, image URL, published time and source-specific extras.
3. **Cache the thumbnail** locally.
4. **Enrich with AI** (§7). This gives summary, brief, topic, tags.
5. **Index** for search.

Each step stores its result. A failure moves the save to the right status with a retry schedule:
- Exponential backoff (1m, 5m, 30m, 2h, then every 6h).
- On quota errors with a known reset time, retry at that time.
- After repeated fetch failures, mark as partial and still run the AI on whatever text exists (shared text plus title).

### 6.3 Extractors (v1)
- **Always** keep the raw shared text. Apps often include the post text or title in it, and it serves as fallback content.

| Source | Approach (builder may improve) | Minimum to accept |
|---|---|---|
| Web | Fetch HTML → Open Graph/Twitter meta + main-text extraction (Readability-style) | Title + description or main text + image if any |
| Reddit | `<post-url>.json` → title, selftext, subreddit, author, thumbnail/preview, top ~5 comments | Title + body/link |
| GitHub | `api.github.com/repos/{owner}/{repo}` (unauthenticated) + README (truncated). For issue/PR/gist URLs, fall back to the web extractor | Name, description, stars, language, README excerpt |
| X | Post ID from the URL → X's public embed data endpoint (the no-auth one used by `react-tweet`/`cdn.syndication.twimg.com`), with a public mirror API (e.g. fxtwitter) as fallback. Long posts should come through in full | Post text + author + first image |
| Instagram | Fetch the reel/post page's Open Graph data (caption in `og:description`, image in `og:image`), trying a link-preview user agent if needed | Caption + thumbnail; otherwise partial |

**Stretch goal (not required for v1):**
- A hidden WebView that loads the page with the user's own logged-in session, for X threads and Instagram posts the extractors above can't read.
- Only do this if it fits cleanly behind the same extractor interface.

**Known risk:** X and Instagram break unauthenticated access often. Extractors must be:
- separate modules behind one interface, each with a fallback chain
- testable with recorded sample pages (fixtures).

The first build step should be a short spike that measures success rates on about 20 real URLs per source.

## 7. AI enrichment

**Input:** source, author, title, extracted text (truncated to ~6,000 characters), the user's note, and the **current topic list with counts**.

**Output (strict JSON, validated):**
- `summary`: one line, at most ~90 characters. A plain statement of what the thing *is* or *says*, never clickbait.
- `brief`: 2–3 sentences.
- `topic`: **an existing topic name unless none fits**. A new topic is a broad 1–2 word Title Case area ("Trading", "Security", "Dev Tools", "Politics"), never a narrow subject.
- `tags`: 2–4 lowercase tags, reusing existing tags where they fit.

**Keeping topics tidy:**
- The prompt includes existing topics and tells the AI to prefer them.
- Above roughly 15 topics, creating a new one requires a strong mismatch.
- The app maps case and spelling variants to the existing topic.
- Users can merge topics in Settings. A merge is remembered (an alias map), so the AI's output keeps getting mapped to the merged topic.

**Language:** summaries are in English in v1.

## 8. AI providers

### 8.1 Interface
- One interface, `generateJson(prompt, schema, options) → result | typed error`.
- Typed errors: `auth_expired`, `quota_exceeded(resetAt?)`, `rate_limited`, `network`, `bad_output`, `provider_error`.
- Each provider implements sign-in, token refresh and request formatting **in its own module**, so a broken provider can be fixed or disabled without touching the rest of the app.
- Credentials live in Android's encrypted storage (`expo-secure-store`) and never appear in logs or exports.

### 8.2 Sign-in flows
Taken from the open-source Hermes Agent (`agent/anthropic_credentials.py`, `hermes_cli/auth_codex.py`, `agent/codex_headers.py`) and Gemini CLI (`packages/core/src/code_assist/oauth2.ts`). **Verify against current versions before building.**

**Claude (Pro/Max)**
- **Sign-in:** OAuth PKCE using Claude Code's public client ID (`9d1c250a-e61b-44d9-88ed-5944d1962f5e`).
  - Authorize URL: `https://claude.ai/oauth/authorize` with `code=true`, redirect `https://console.anthropic.com/oauth/code/callback`, scopes `org:create_api_key user:profile user:inference`.
  - The user pastes `code#state` back into the app.
  - Exchange at `https://platform.claude.com/v1/oauth/token` (JSON body).
  - Refresh the token with `grant_type=refresh_token`. The token endpoint rejects `claude-code/` user agents; Hermes uses a plain `axios/x.y` user agent.
- **Calls:** `Authorization: Bearer <token>`, `anthropic-beta: oauth-2025-04-20,claude-code-20250219`, user agent `claude-code/<version> (external, cli)`, `x-app: cli`. The system prompt must start with "You are Claude Code, Anthropic's official CLI for Claude."
- Hermes reports that Anthropic sends requests that look like third-party apps to paid "extra usage", which shows up as HTTP 400. Keep prompts plain, with no tools.

**ChatGPT (Plus/Pro)**
- **Sign-in:** device-code flow using the Codex CLI client ID (`app_EMoamEEZ73f0CkXaXp7hrann`).
  1. Request a user code: POST `https://auth.openai.com/api/accounts/deviceauth/usercode`.
  2. The user enters the code on OpenAI's site.
  3. Poll `…/deviceauth/token` until approved.
  4. Exchange the authorization code + verifier at `https://auth.openai.com/oauth/token` with redirect `https://auth.openai.com/deviceauth/callback`.
- **Calls:** `https://chatgpt.com/backend-api/codex` (Responses-style API) with a bearer token, the ChatGPT account ID header and Codex `originator`/user-agent headers.

**Gemini (Google account)**
- **Sign-in:** Google OAuth using Gemini CLI's installed-app client. Use the manual-code flow: redirect `https://codeassist.google.com/authcode`, and the user pastes the code back.
- **Calls:** Code Assist API at `https://cloudcode-pa.googleapis.com` (`v1internal:*generateContent`). This needs the user's project to be loaded or onboarded first, as Gemini CLI does.
- A free tier is available for personal accounts.

**API keys** (Anthropic / OpenAI / Gemini)
- Standard public APIs: `x-api-key`, `Authorization: Bearer` and the `x-goog-api-key` header respectively.

### 8.3 Risk handling
- Subscription logins depend on undocumented behavior that can break or be blocked at any time. The app must:
  1. show a clear error state ("Claude sign-in stopped working, use an API key or another provider")
  2. never lose queued saves
  3. let the user switch provider in two taps.
- The README discloses that subscription sign-in reuses official CLI clients and may break the provider's terms. Users opt in.

## 9. Data model (SQLite)

- `saves`: `id`, `url`, `canonical_url` (unique), `source` (x | reddit | github | instagram | web | text), `source_app` (sending package), `shared_text`, `title`, `author`, `extracted_text`, `image_url`, `thumb_path`, `summary`, `brief`, `topic_id`, `note`, `status` (fetching | waiting_ai | partial | done), `status_reason`, `attempts`, `next_retry_at`, `created_at`, `last_saved_at` (timeline order), `opened_at` (null means unopened), `extra_json` (source-specific data, e.g. stars, subreddit).
- `topics`: `id`, `name` (unique, case-insensitive), `color`, `created_at`. Plus `topic_aliases(alias, topic_id)` for merges.
- `tags`, `save_tags`.
- `saves_fts`: FTS5 over summary, brief, title, author, note, extracted_text, tags. Kept in sync with triggers.
- `schema_version` + migrations from day one.

**Export:** a zip containing `smaran.json` (all rows) and `thumbs/`. Import merges by `canonical_url`.

## 10. Prepared for later
- **Reminders:** v1 already stores `opened_at`, `created_at` and topic data. The later version adds a scheduler and the notification styles from mockup [12]: "Remember this one?" for a single save, plus a weekly recap. Tapping opens the save, or a filtered list.
- **On-device AI:** another implementation of the provider interface (§8.1). The same goes for "custom server address" endpoints such as Ollama or LM Studio, if wanted.
- **Video:** a later step between fetch and enrich (transcript → text).
- **iOS:** an iOS Share Extension and the same JS core. Expo's cloud build service builds it without a Mac.

## 11. Success check for v1
The owner uses it as their only "save for later" for 2 weeks. Then:
- There are no lost saves.
- At least 90% of X and Reddit saves are fully enriched, and at least 70% of Instagram saves.
- The owner can retrieve recent saves by topic and time without scrolling through other apps.
- The topic count stays under ~15.

## 12. Left to the builder
- Folder structure, state management, UI component library, and the list/animation libraries.
- Background-processing mechanism, within the "starts immediately" requirement in §6.1.
- Exact extractor techniques and fallback order. The prompt wording, within §7's output contract.
- Testing approach. Expected at minimum:
  - unit tests for URL normalization, extractors (with recorded sample pages) and AI output validation
  - mocked-HTTP tests for each provider
  - a manual test checklist on a real device.
- Exact copy text, icons, empty states and the welcome/pin-tip screens, in the style of Direction A.
