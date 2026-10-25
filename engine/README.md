# back2sleep engine

Node 24 service on Railway (project `back2sleep-engine`, services `engine` + `Postgres`).
Public URL: https://engine-production-2756.up.railway.app. The site reaches it same-origin through the `/api/*` rewrite in `site/vercel.json`.

It does two jobs:

1. **API** (`src/api.js`): `POST /api/signup`, `POST /api/quiz`, `POST /api/event` (cookieless, no IP stored), `GET /api/health`, plus the admin endpoints below.
2. **Scheduler** (`src/scheduler.js`): runs the SEO/AEO/GEO loop in New York time. Every run is recorded in `job_runs`. A failed run is retried 3 times with backoff. On boot it catches up any slot it missed, and a lock stops runs overlapping. A job that still fails opens or updates a GitHub issue labelled `engine-alert`.

| Job | When (America/New_York) | What it does |
|---|---|---|
| monitor | daily 6:00 | GSC clicks/impressions/position per page+query, URL inspection of posts, Bing query stats, sitemap check, signups by source |
| research | Sun 7:00 | LLM + GSC data → keyword/intent/gap opportunities, scored for qualified-signup fit |
| report | Mon 8:00 | Weekly markdown report → GitHub issue `weekly-report` (+ DB) |
| draft | Mon + Thu 9:00 | Writes `content/posts/<slug>.md` (status: draft), verifies source URLs, runs `tools/build-blog.mjs`, opens PR `blog/<slug>` with a claims checklist |
| ai_visibility | Wed 10:00 | Asks Perplexity/OpenAI the target questions, records whether back2sleepnow.com is cited |
| optimize | Fri 11:00 | Refresh PRs for posts with low CTR, position 5–20 or low signup rate |
| approve | hourly | On a blog PR where the repo owner commented `/approve`: sets status approved + approved_by + date, rebuilds, pushes. **Never merges.** |

Any job whose keys are missing is recorded as `skipped`, not failed.

Nothing is published without a person. The engine only opens PRs. A post goes live when you approve it (set `status: approved` and `approved_by`, or comment `/approve`) and **merge** it. Merging to `main` deploys through Vercel.

## Variables

Set them from `engine/` with `railway variables --service engine --set "NAME=value"`.

| Name | Secret | Set? | Notes |
|---|---|---|---|
| DATABASE_URL | | yes | `${{Postgres.DATABASE_URL}}` |
| ADMIN_TOKEN | yes | yes | random; read with `railway variables --service engine --kv` |
| ANTHROPIC_API_KEY | yes | yes | drafting/research |
| LLM_MODEL | | yes | `claude-sonnet-5-5` |
| SITE_URL, GSC_SITE_URL, GITHUB_REPO, TZ | | yes | |
| GITHUB_TOKEN | yes | **you** | Fine-grained token, repo Gahroot/mom317 only, Contents + Pull requests + Issues read/write. Needed for draft/approve/optimize/report/alerts. |
| GSC_SERVICE_ACCOUNT_JSON | yes | **you** | Google Cloud → service account → JSON key; enable "Google Search Console API"; add the service-account email as a user on the Search Console property. Paste the whole JSON. |
| BING_API_KEY | yes | **you** | Bing Webmaster Tools → Settings → API access |
| OPENAI_API_KEY | yes | optional | AI-visibility checks + LLM fallback (`OPENAI_MODEL`, `OPENAI_SEARCH_MODEL`) |
| PERPLEXITY_API_KEY | yes | optional | AI-visibility checks (`PERPLEXITY_MODEL`) |
| APPROVER_NAME | | optional | Name written to `approved_by` (default: the commenter's login) |
| GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL | | optional | Commit identity for engine PRs |
| SCHEDULER | | optional | `off` disables the scheduler (API only) |

## Run by hand

```bash
T=$(railway variables --service engine --kv | grep '^ADMIN_TOKEN=' | cut -d= -f2-)
curl -H "Authorization: Bearer $T" https://engine-production-2756.up.railway.app/api/admin/status
curl -H "Authorization: Bearer $T" https://engine-production-2756.up.railway.app/api/admin/run/draft
```

## Develop and deploy

```bash
cd engine && npm ci && npm test   # offline, pg-mem
railway up --service engine       # deploy from engine/
railway logs --service engine
```

## Recovery

- A job failed: read its `engine-alert` issue or `/api/admin/status`, fix the cause (usually an expired key), then run it again through `/api/admin/run/<job>`. Catch-up also re-runs missed slots on the next boot.
- The service is down: Railway restarts it on failure (up to 10 times) and checks `/api/health`. Use `railway logs`, and `railway redeploy` if needed.
- Signups are safe in Postgres. Railway backs up the database; export with `railway connect Postgres` then `\copy signups to 'signups.csv' csv header`.
