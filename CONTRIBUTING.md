# Contributing to Smaran

Thanks for wanting to help! Smaran is a small app with a readable codebase. You don't need to be a React Native
expert to contribute, and first-time contributors are very welcome.

## Ways to help

- **Report a bug.** Open a [bug report](https://github.com/Ankit3794/smaran/issues/new?template=bug_report.yml).
  The most useful ones include the link you shared (if it isn't private) and what you expected to see.
- **Ask for a site.** If Smaran reads a site badly, [request a source](https://github.com/Ankit3794/smaran/issues/new?template=new_source.yml).
- **Fix something.** Issues labelled
  [`good first issue`](https://github.com/Ankit3794/smaran/labels/good%20first%20issue) are a gentle start.
- **Improve the docs.** If something confused you, it will confuse the next person too.

For a bigger change (a new screen, a new dependency, a change to the database), please open an issue first so we
can agree on the approach before you put in the work.

## Getting set up

Follow [Build from source](README.md#build-from-source) in the README. Then read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). It maps every folder and follows one share from the share menu to the
screen. Every source file also starts with a short comment on its job.

Before you open a pull request, run:

```bash
npx jest              # all tests
npm run typecheck     # app, tests and scripts
```

Both also run automatically on every pull request (GitHub Actions, see `.github/workflows/ci.yml`).

## How we write code

The codebase is meant to be learnable, so we keep it plain:

- **Plain functions over abstractions.** Database queries are `async` functions that take the database as their
  first argument. There are no classes or dependency-injection frameworks. Add an abstraction only when there are at
  least two real uses for it.
- **Each file starts with a comment** saying what it does and where it sits in the data flow. Keep it true when you
  change the file.
- **Screens don't talk to the network, and extractors and AI providers don't touch the database.** The pipeline
  (`src/pipeline/`) is the only place that connects them.
- **Comments explain *why*,** not what the next line does.
- **Tests come with the change.** Core logic is tested in `test/core/` (Node, real SQLite). Screens are tested in
  `test/ui/` (React Native Testing Library).

## Add a new source

A "source" is a site Smaran knows how to read, such as X, Reddit or YouTube. Adding one touches a few small files.
Hacker News is a good example to copy, so search the code for `hackernews`:

| File | What to add |
| --- | --- |
| `src/core/types.ts` | The new name in the `Source` type |
| `src/core/url.ts` | Recognising the site's links (and cleaning them up, for example removing tracking parameters) |
| `src/extract/<site>.ts` | The extractor: fetch the page or API and return title, author, text and image |
| `src/extract/index.ts` | One `case` that picks your extractor |
| `src/ui/sources.ts` and `src/ui/components/SourceBadge.tsx` | The source's name and badge |
| `test/core/extract-<site>.test.ts` and `test/core/url.test.ts` | Tests. Save real responses under `test/fixtures/extract/` and serve them with `fakeHttp` from `test/helpers/fake-http.ts`, so tests never hit the network |

Then add a row to the **Works with** table in the README.

Please read the site honestly: use public pages or official public APIs and identify as Smaran. Don't bypass login
walls or scrape private data.

## Commits and pull requests

- Keep a pull request to one change. Small PRs get reviewed faster.
- Write commit messages like the existing history: `feat(extract): Threads posts`, `fix(ui): …`, `docs: …`.
  The prefix is `feat`, `fix`, `docs`, `refactor`, `test`, `build` or `chore`, with an optional area in brackets.
- If your change is visible on screen, add a screenshot or a short screen recording to the PR.
- Fill in the PR template's checklist.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By taking part, you agree to it.

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
