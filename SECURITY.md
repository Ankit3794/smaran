# Security policy

Smaran stores sign-in tokens and API keys on your phone and sends post text to the AI provider you connect, so
security problems matter here even though there's no server.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub instead:
**[Report a vulnerability](https://github.com/Ankit3794/smaran/security/advisories/new)**.

Please include:

- what the problem is and what an attacker could do with it,
- steps to reproduce it, or a proof of concept, and
- the Smaran version (**Settings → About**) and your Android version.

You'll get a reply within a week. Once it's fixed, a new release goes out and the advisory is published, with credit
to you if you want it.

## In scope

- Credentials (OAuth tokens, API keys) leaking: into logs, backups, other apps, or to any host other than the
  provider they belong to
- Your library or notes being sent anywhere other than what the README's
  [What leaves your phone](README.md#what-leaves-your-phone) table lists
- Another app on the phone being able to read Smaran's data or inject saves without the user sharing them
- A malicious link or page making the app run code, crash repeatedly, or corrupt the library

## Out of scope

- AI providers blocking subscription sign-in. That's a known limit, described in the README.
- Problems that need a rooted phone or physical access to an unlocked phone
- Vulnerabilities in the AI providers themselves. Please report those to Anthropic, OpenAI or Google.

## Supported versions

Only the [latest release](https://github.com/Ankit3794/smaran/releases/latest) gets security fixes.
