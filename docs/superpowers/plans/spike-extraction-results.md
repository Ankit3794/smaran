# Extraction spike results

Run on 2026-11-10 from the developer's home network with `npx tsx scripts/spike-extract.ts`
(real `fetch`, `allowMirrors: true`, 97 public URLs in `scripts/spike-urls.txt`).
A URL counts as a success only if the extractor returned non-empty `text`. These rates are information, not a gate.

Reading the numbers:
- **GitHub (30%) is an artefact.** The unauthenticated REST API allows 60 requests per hour per IP. An earlier
  trial run of the same script (20/20 GitHub successes with a looser check) had already used the quota, so the
  last 14 repos were rate-limited (`blocked`). Real-world use by one person stays far below 60 per hour.
- **Reddit (38%)**: Reddit returns 403 for anonymous `.json` from this network, so every URL took the
  page-meta fallback. 6 pages gave a usable `og:description`; 10 gave a page with no description (`parse`).
  Reddit is the weakest source; the AI step must cope with title-only or missing text.
- **Instagram (70%)**: public posts and reels work with the `facebookexternalhit/1.1` user agent;
  the 6 `blocked` are login walls (older or restricted posts).
- **X (75%)**: embed endpoint plus fxtwitter mirror; 3 `not_found` are deleted posts, 2 `blocked` are posts both services refuse.
- **Web (75%)**: NYT and Medium block bots (`blocked`), arstechnica timed out or refused (`network`),
  and Hacker News and paulgraham.com have no `<p>`/`<article>` text or meta description (`parse`).

## Output

| source | success | rate |
|---|---|---|
| x | 15/20 | 75% |
| reddit | 6/16 | 38% |
| instagram | 14/20 | 70% |
| github | 6/20 | 30% |
| web | 15/20 | 75% |

| source | failure kind | url |
|---|---|---|
| x | not_found | https://twitter.com/KHOUStephanie/status/1354781130021609478 |
| x | not_found | https://twitter.com/w3Nicolas/status/1134529316904153089 |
| x | not_found | https://twitter.com/Demilogic/status/1358661840402845696 |
| x | blocked | https://twitter.com/_danilo/status/1583169632516509697 |
| x | blocked | https://twitter.com/foone/status/1572260363764400129 |
| reddit | parse | https://www.reddit.com/r/AskReddit/comments/sxqt5/what_is_the_minimum_number_of_words_that_you/ |
| reddit | parse | https://www.reddit.com/r/linux/comments/53ri0m/warning_microsoft_signature_pc_program_now/ |
| reddit | parse | https://www.reddit.com/r/linux/comments/od3h8b/audacity_may_collect_data_necessary_for_law/ |
| reddit | parse | https://www.reddit.com/r/programming/comments/q3smfr/unfollow_everything_developer_banned_for_life/ |
| reddit | parse | https://www.reddit.com/r/programming/comments/bglvey/the_9bn_james_webb_space_telescope_will_run/ |
| reddit | parse | https://www.reddit.com/r/Python/comments/62q2sm/python_helped_me_write_again/ |
| reddit | parse | https://www.reddit.com/r/Python/comments/8hvzja/backdoor_in_sshdecorator_package/ |
| reddit | parse | https://www.reddit.com/r/science/comments/3eret9/science_ama_series_i_am_stephen_hawking/ |
| reddit | parse | https://www.reddit.com/r/science/comments/7yegux/aaas_ama_hi_were_researchers_from_google/ |
| reddit | parse | https://www.reddit.com/r/technology/comments/1xl2pr3/lenovos_encrypted_fingerprint_usb_drive_is_just/ |
| instagram | blocked | https://www.instagram.com/p/B9MhjgphNWj/ |
| instagram | blocked | https://www.instagram.com/p/BAqirNbwEc0/ |
| instagram | blocked | https://www.instagram.com/p/Bwf080_Bfby/ |
| instagram | blocked | https://www.instagram.com/p/BYIPmEFAIIn/ |
| instagram | blocked | https://www.instagram.com/p/Cx6WuAULrGY/ |
| instagram | blocked | https://www.instagram.com/reel/DbWcGXdIfmU/ |
| github | blocked | https://github.com/rust-lang/rust |
| github | blocked | https://github.com/golang/go |
| github | blocked | https://github.com/python/cpython |
| github | blocked | https://github.com/denoland/deno |
| github | blocked | https://github.com/nodejs/node |
| github | blocked | https://github.com/tailwindlabs/tailwindcss |
| github | blocked | https://github.com/sveltejs/svelte |
| github | blocked | https://github.com/vuejs/core |
| github | blocked | https://github.com/pytorch/pytorch |
| github | blocked | https://github.com/home-assistant/core |
| github | blocked | https://github.com/bitcoin/bitcoin |
| github | blocked | https://github.com/kubernetes/kubernetes |
| github | blocked | https://github.com/sqlite/sqlite |
| github | blocked | https://github.com/github/gitignore |
| web | blocked | https://www.nytimes.com/ |
| web | parse | https://news.ycombinator.com/ |
| web | parse | https://paulgraham.com/greatwork.html |
| web | blocked | https://medium.com/ |
| web | network | https://arstechnica.com/ |
