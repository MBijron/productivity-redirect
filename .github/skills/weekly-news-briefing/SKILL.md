---
name: weekly-news-briefing
description: Maintain the weekly FreeNewsAPI-powered news briefing for the productivity redirect site.
---

# Weekly News Briefing

Use this workflow when you need to inspect, debug, or update the automated weekly briefing that powers `weekly-news.jsonl` and the derived site view.

## Source of truth

- `scripts/fetch_gdelt.py` is the current FreeNewsAPI fetcher despite its legacy filename.
- `data/raw/` stores every raw FreeNewsAPI listing and detail response before summarization.
- `data/world_gdelt.json` and `data/dutch_gdelt.json` store the merged, de-duplicated section inputs.
- `data/story-candidate-diagnostics.json` stores the deterministic pre-ranking output and inclusion decisions per section.
- `scripts/build_summary.py prepare` produces `data/summary-input.json` for Copilot CLI.
- `weekly-news.jsonl` is the published machine-readable output with required lines for `world_news`, `dutch_news`, and `tech_news`, plus optional `buddhist_news` last.
- `scripts/build_summary.py validate --site-output news-summary.json` derives the browser-friendly fallback file.
- `.github/workflows/weekly-news.yml` runs the fetch, Copilot summarization, validation, and commit flow on GitHub Actions.

## How it works

- The workflow runs every Monday at 06:00 UTC and on manual dispatch.
- The fetcher uses `https://api.freenewsapi.io/v1/news` for listing and `https://api.freenewsapi.io/v1/details` for richer article records.
- The API key must be sent in the `x-api-key` header.
- The workflow uses the repository secret `FREENEWSAPI_TOKEN` and the fetcher also supports a local `FREENEWSAPI_TOKEN` environment variable.
- The documented FreeNewsAPI limit is 2 requests per second, so the fetcher includes a deliberate delay between requests.
- Dutch coverage currently uses `country=nl` and `language=nl`.
- International coverage currently uses `topic=world` and `language=en`.
- To avoid a false two-day snapshot, the fetcher now slices the seven-day window into UTC day buckets and uses `order_by=recent` inside each slice instead of fetching the whole week in archive order.
- Each raw API response is written to `data/raw/<section>/...json` before summarization.
- Each fetch run resets `data/raw/<section>/` before refilling it so raw files reflect one run instead of accumulating stale captures.
- Detailed article records are deduplicated by canonical `original_url`, keeping the latest publication date for duplicates.
- Listing items are now clustered into deterministic story candidates before detail fetching.
- Detail fetching now follows the ranked story candidates, prioritizing latest-status items and older context items only when a story changed meaningfully over the week.
- The ranking layer is where coverage-gap reduction, noise reduction, and latest-status preference are enforced before Copilot writes the bulletin.
- Copilot CLI reads `data/summary-input.json`, writes `weekly-news.jsonl`, and must stay non-interactive.
- `data/summary-input.json` now includes `coverage_by_day` so the summarizer can see whether coverage spans the whole week.
- `data/summary-input.json` now also includes ranked `story_candidates` so the summarizer writes from a deterministic agenda instead of rediscovering the week's priorities from scratch.
- `scripts/article_context.py` can pull richer body text for specific sections, dates, keywords, or UUIDs using only the cached FreeNewsAPI detail responses and the same API for cache misses.
- The workflow trusts the repository path for Copilot CLI by writing `$HOME/.copilot/config.json` on the runner.
- `news.js` and `app.js` now prefer `weekly-news.jsonl` and fall back to `news-summary.json` only if the JSONL file is missing or invalid.
- The page access window is separate from publication: `app.js` and `news.js` still enforce a 24-hour per-browser window via localStorage.

## Local validation

- Validate the published JSONL and regenerate the browser fallback:
  - `c:/localrepo/productivity-redirect/.venv/Scripts/python.exe scripts/build_summary.py validate --input weekly-news.jsonl --site-output news-summary.json`
- Compile the workflow scripts:
  - `c:/localrepo/productivity-redirect/.venv/Scripts/python.exe -m py_compile scripts/fetch_gdelt.py scripts/build_summary.py scripts/article_context.py`
- Rebuild the Copilot evidence pack locally from cached data:
  - `c:/localrepo/productivity-redirect/.venv/Scripts/python.exe scripts/build_summary.py prepare --input-dir data --output data/summary-input.json`
- Smoke-test the live API locally:
  - set `FREENEWSAPI_TOKEN`
  - `c:/localrepo/productivity-redirect/.venv/Scripts/python.exe scripts/fetch_gdelt.py --output-dir data --max-listed-articles 20 --max-detailed-articles 5`
- Serve the site locally for browser checks:
  - `c:/localrepo/productivity-redirect/.venv/Scripts/python.exe -m http.server 8123`
- Validate the browser flow:
  - open `index.html?preview=1`
  - click `Read news summary`
  - confirm `weekly-news-access` is written to localStorage
  - confirm `news.html` renders the generated `weekly-news.jsonl` output

## Editing guidance

- Keep the FreeNewsAPI fetch deterministic and fail loudly when a section returns no data.
- If a workflow run becomes interactive again, check both the Copilot CLI `GH_TOKEN` env vars and the trusted folder config written in the workflow.
- If world coverage gets too large, reduce the detail fetch cap before weakening the non-interactive workflow or dropping rate limiting.
- If the summary collapses onto one or two dates again, inspect `coverage_by_day` in `data/summary-input.json` before blaming the prompt; the fetch layer is responsible for week-wide spread.
- If important stories appear to be missing, inspect `data/story-candidate-diagnostics.json` before changing the prompt. The deterministic ranking layer is now the main editorial gate.
- The Dutch feed can skew heavily toward sport, culture, and lifestyle coverage, so the ranking layer now suppresses that noise before summarization. Tune ranking rules before relaxing the prompt.
- Keep the JSONL contract stable: `world_news`, `dutch_news`, and `tech_news` first, with optional `buddhist_news` last.
- If the rendered page looks stale, verify whether `weekly-news.jsonl` regenerated and whether `scripts/build_summary.py validate --site-output news-summary.json` ran afterward.

## Known constraints

- FreeNewsAPI listing records only include `uuid`, `title`, `publisher`, and `published_at`; richer fields such as `original_url`, `languages`, `countries`, `topics`, and `body` require `/details` calls.
- `article_count` in `weekly-news.jsonl` now represents total matched coverage, while `articles` can be a smaller curated set backed by the fetched detail records.
- Sonar security hotspots require Connected Mode in this workspace; local file analysis still works without it.