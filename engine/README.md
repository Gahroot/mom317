# back2sleep engine

Node 24 service on Railway (project `back2sleep-engine`, services `engine` + `Postgres`).
Public URL: https://engine-production-2756.up.railway.app. The site reaches it same-origin through the `/api/*` rewrite in `site/vercel.json`.

It does two jobs:

1. **API** (`src/api.js`): `POST /api/signup`, `POST /api/quiz`, `POST /api/event` (cookieless, no IP stored), `GET /api/health`, plus the admin endpoints below.
2. **Scheduler** (`src/scheduler.js`): runs the SEO/AEO/GEO loop in New York time. Every run is recorded in `job_runs`. A failed run is retried 3 times with backoff. On boot it catches up any slot it missed, and a lock stops runs overlapping. A job that still fails opens or updates a GitHub issue labelled `engine-alert`.

| Job | When (America/New_York) | What it does |
|---|---|---|
| monitor | daily 6:00 | GSC clicks/impressions/position per page+query, URL inspection of posts, Bing query stats, sitemap check, signups by source |
| research | Sun 3:00 | LLM + GSC data → keyword/intent/gap opportunities, scored for qualified-signup fit |
| report | Mon 8:00 | Weekly markdown report → GitHub issue `weekly-report` (+ DB) |
| draft | Mon + Thu 4:00 | Writes `content/posts/<slug>.md` (status: draft), verifies source URLs, runs `tools/build-blog.mjs`, opens PR `blog/<slug>` with a claims checklist, then runs the approval gate on it |
| ai_visibility | Wed 10:00, even ISO weeks | Asks Perplexity `sonar` up to 15 target questions (OpenAI web search: 5 questions, first run of the month only), records whether back2sleepnow.com is cited |
| optimize | Fri 5:00 | Refresh PRs for posts with low CTR, position 5–20 or low signup rate, then runs the approval gate on it |
| audit | Sat 4:00 | Re-fact-checks up to 2 published posts not audited in 30 days (`AUDIT_EVERY_DAYS`, `AUDIT_MAX_PER_RUN`). A post that no longer passes gets a refresh PR that the gate self-revises and merges only on pass; the live version stays up meanwhile. Table `post_audits`. |
| codex_keepalive | Sat 6:00 | One tiny `codex exec` ("Reply with OK") so Codex refreshes its login in quiet weeks; skipped if Codex isn't logged in |
| ai_batches | hourly | Polls Anthropic Message Batches (research/optimize) and re-runs the job once its result is ready |
| gate (was `approve`) | hourly | Runs the automated approval gate on open engine `blog/*` PRs not yet gated (or with new commits), finishes merges still waiting for CI, and handles owner `/approve` overrides. Results in table `gate_results`. |

Any job whose keys are missing is recorded as `skipped`, not failed.

## Publishing: automated approval gate

**The owner chose to replace human approval with an automated gate.** With `AUTO_PUBLISH=true` (the default) posts and refreshes go live with no person reviewing them, so a wrong medical claim can reach production if all four checks miss it. Every PR the engine opens (new posts and refreshes) is gated after its branch is pushed. All of these must pass:

1. **Sources resolve**: every source URL is on a trusted host and answers 2xx/3xx (PubMed's 203 to bots counts as OK).
2. **Build check**: with `status: approved` set, `node tools/build-blog.mjs` then `--check` pass in the checkout (every `[^n]` maps to a source, every claim names an existing source id).
3. **Claims lint**: no efficacy/cure/treat/prevent language about 3:17, no ingredients or dose, never "liquid dietary supplement", no signup counts or testimonials.
4. **Independent fact-check**: a separate LLM call (own skeptical fact-checker prompt, temperature 0) reads each cited source page (title/abstract, ~6k chars) and rates every claim `supported`, `overstated` or `unsupported`. Only all-`supported` passes; an unfetchable source fails its claim, and any medical statement in the body that isn't in `claims` fails the post. Verdicts are stored in `gate_results` and posted as a table on the PR.

**Pass**: the engine sets `status: approved`, `approved_by: auto-review (3:17 engine)` and `updated`, rebuilds, pushes, waits up to ~20 minutes for the PR's GitHub checks to go green (the next hourly run keeps waiting), then squash-merges and deletes the branch. Merging to `main` deploys through Vercel.

**Fail**: nothing is merged. The PR is labelled `needs-review`, gets a comment listing the failing checks, and a `needs-review` issue assigned to the repo owner is opened or updated (so GitHub emails them). The PR is re-gated only after a new commit. A repo-owner `/approve` comment is a manual override: the engine approves, rebuilds, pushes and merges once CI is green.

The weekly report has an "Approval gate" table (published / held, and why).

`AUTO_PUBLISH=false` restores the old human-only flow: no gate, `/approve` sets the approval and pushes, and a person merges. The engine never merges in that mode.

## Current mode: Codex-only (owner's choice, 25 Oct 2026)

Railway runs with `LLM_PROVIDER_ORDER=codex`, `CODEX_MODEL=gpt-6.1-sol`, `CODEX_REASONING_EFFORT=high`. In this mode:

- **Every AI call goes through Codex** on the owner's ChatGPT subscription: research, drafting, the source-repair pass, self-revisions, the gate fact-check and the AI-visibility checks (ChatGPT with live web search, `-c web_search="live"`, provider `chatgpt-codex`). Paid APIs are never called, even when their keys are set.
- **No budget.** Nothing is paid for, so `AI_MONTHLY_BUDGET_USD` is ignored and `/api/admin/status` shows `aiBudget.budget: "off"`. The cost controls below apply again only if you switch back to a mixed mode.
- **No paid fallback: jobs wait instead.** If Codex is logged out, at its usage limit (24 h back-off), over the weekly runaway guard (`CODEX_MAX_CALLS_PER_WEEK`, default 80 in this mode) or not installed, the job is recorded as `deferred` and its slot is retried every hour (no alert; a login problem still opens one `engine-alert` issue). The gate never holds a PR just because the fact-checker was unavailable; it re-checks it later. Transient Codex errors are retried with backoff and then fail and alert like any other error.
- **Any time of day.** The night-only rule applies only in mixed mode; scheduled jobs still start at night (research Sun 3:00, draft Mon/Thu 4:00, optimize Fri 5:00 NY).
- **Same model writes and checks.** The fact-checker is a separate, fresh Codex session with its own skeptical prompt that judges each claim only against the source abstract, but it is the same model family as the writer.
- Calls time out after 25 minutes (`CODEX_TIMEOUT_MS`).

Switch back to paid fallback: `railway variables --service engine --set LLM_PROVIDER_ORDER=codex,anthropic` (budget and night-only rule return).

## AI cost controls (mixed mode only)

The owner set a **$10/month combined cap** for Anthropic + OpenAI + Perplexity. Every call is written to table `ai_usage` (job, provider, model, input/output/cache tokens, estimated USD). Prices are the `PRICES` table in `src/cost.js` (sources and the check date are in its comment); override with `AI_PRICES_JSON`. The month is the calendar month in America/New_York.

- **Cap**: when month-to-date spend reaches `AI_MONTHLY_BUDGET_USD`, research, optimize and ai_visibility are recorded as `skipped` (reason `budget`). draft and the gate fact-check keep running up to 1.5x the budget (hard ceiling), then they are skipped too (the gate defers the PR to a later hour). At 80% one `engine-alert` issue is opened per month. Budget skips are never retried.
- **Where to see it**: `aiBudget` in `/api/admin/status` and the "AI spend" table (by job) in the weekly report.
- **No double-paying**: draft stores the generated post in `posts.draft_md` (status `pending`) before any GitHub work and reuses it on retry; optimize stores its suggestion in `optimize_suggestions`. HTTP 400/401/403/404 are not retried, a bad JSON reply is retried once, 429/5xx/network errors are retried with backoff.
- **Model tiers**: research + optimize use `LLM_MODEL_FAST` (Haiku), max 3000/2000 output tokens, through the Message Batches API (50% off; batch id in table `ai_batches`, polled hourly; a normal call after 24h). draft + fact-check use `LLM_MODEL` (Sonnet), max 9000/2500, with the static system prompt in a prompt-cached block.
- **Fact-check cache**: `claim_checks` keeps `supported` verdicts for 90 days (key sha256 of claim + source URL), so a refresh PR only checks changed claims; fetched source text is cached 7 days in `source_cache`.
- **Optimize** only calls the LLM for a published post with at least `OPTIMIZE_MIN_IMPRESSIONS` (200) GSC impressions in 28 days; otherwise `skipped: not enough data`.

**Expected cost**: about $2–3 a month at the current cadence (rough estimate: ~9 drafts × ~$0.10, ~12 fact-checks × ~$0.05, two sonar runs × 15 questions × ~$0.013, 5 OpenAI web searches × ~$0.04, research/optimize batches on Haiku under $0.05). Real figures are in `ai_usage`.

**Raise the cap**: `railway variables --service engine --set AI_MONTHLY_BUDGET_USD=20` (the service redeploys; the new cap applies at once, spend so far still counts).

## Using your ChatGPT/Codex subscription

**How it works.** The image ships the Codex CLI (`@openai/codex@0.164.0`). research, draft and optimize first try `codex exec` on your ChatGPT plan ($0 per call), following OpenAI's [CI/CD auth guidance](https://developers.openai.com/codex/auth/ci-cd-auth.md): the login lives in `$CODEX_HOME/auth.json` (`/data/codex`, a persistent Railway volume `engine-volume` at `/data`), and Codex refreshes it itself during normal runs and writes it back. The engine only reads `auth_mode`/`last_refresh` from it; it is never logged, printed, copied or overwritten. `config.toml` (`cli_auth_credentials_store = "file"`) is written at start only if missing. Each call runs `codex exec --skip-git-repo-check --ephemeral --sandbox read-only -c approval_policy="never" --cd <empty tmp dir> --json --output-last-message <tmp file> -` (prompt on stdin, `-m $CODEX_MODEL` only if set), times out after 10 minutes, and only one Codex process runs at a time. Codex calls are logged in `ai_usage` as provider `codex`, cost 0, and don't count toward the budget. **The gate fact-check never uses Codex** (`LLM_FACTCHECK_PROVIDER`, default `anthropic`), so a different model family checks the writer.

**Shared limits, light use.** It shares your subscription's usage limits with your own Codex use, so the engine stays polite:
- only research (1/week), draft (2/week) and optimize (≤1/week) use it, with a hard cap `CODEX_MAX_CALLS_PER_WEEK` (default 6, the keep-alive not counted); over the cap the call goes to Anthropic;
- only off-hours: a call between 8:00 and 23:00 New York time goes to Anthropic unless `CODEX_ANYTIME=true` (the jobs are scheduled 3:00–6:00);
- after a usage/rate-limit reply Codex is paused for 24 hours (`codex_state.backoff_until`), with no alert; the weekly report notes it.

**One-time login** (a separate device login for the server, so your Mac stays signed in; never copy `~/.codex` from your Mac):
```bash
cd engine && railway ssh --service engine
codex login --device-auth      # open the URL, enter the code
```
Device code login may need enabling for Codex in ChatGPT settings → Security. Then `/api/admin/status` shows `codex.loggedIn: true` (plus `installed`, `lastRefresh`, `lastSuccess`, `lastError`, no tokens).

**Reseeding.** If Codex reports an auth error (login is stale after ~8 days without a refresh, or was revoked), the engine opens one `engine-alert` issue "Codex login needs renewing" (at most once per 7 days). Run the login again as above; don't overwrite `auth.json` from a copy. Keep one `auth.json` per machine.

**Fallback.** Any Codex failure (non-zero exit, auth, limit, timeout) sends that call to Anthropic, so the blog keeps running. To turn Codex off: `railway variables --service engine --set LLM_PROVIDER_ORDER=anthropic`.

**Public repo note.** The container clones the public repo and runs `tools/build-blog.mjs` from it; Codex runs read-only in an empty temp dir, not in the checkout. Only repo collaborators can change `main`, so only they control the code the engine runs.

## Variables

Set them from `engine/` with `railway variables --service engine --set "NAME=value"`.

| Name | Secret | Set? | Notes |
|---|---|---|---|
| DATABASE_URL | | yes | `${{Postgres.DATABASE_URL}}` |
| ADMIN_TOKEN | yes | yes | random; read with `railway variables --service engine --kv` |
| ANTHROPIC_API_KEY | yes | yes | drafting/research |
| LLM_MODEL | | yes | `claude-sonnet-5-5` (draft, fact-check) |
| LLM_MODEL_FAST | | yes | `claude-haiku-5-5` (research, optimize) |
| AI_MONTHLY_BUDGET_USD | | yes | `10`. Optional jobs stop at 100%, essential at 150% |
| AI_PRICES_JSON | | optional | Price overrides, e.g. `{"sonar":{"input":1,"output":1,"request":0.005}}` (USD per M tokens; `request`/`webSearch` per call) |
| AI_VIS_MAX_QUESTIONS | | optional | Default 15 |
| OPTIMIZE_MIN_IMPRESSIONS | | optional | Default 200 (28 days) |
| SITE_URL, GSC_SITE_URL, GITHUB_REPO, TZ | | yes | |
| GITHUB_TOKEN | yes | **you** | Fine-grained token, repo Gahroot/mom317 only, Contents + Pull requests + Issues read/write. Needed for draft/gate/optimize/report/alerts. Auto-merge also needs Contents write and branch deletion on `blog/*`. |
| GSC_SERVICE_ACCOUNT_JSON | yes | **you** | Google Cloud → service account → JSON key; enable "Google Search Console API"; add the service-account email as a user on the Search Console property. Paste the whole JSON. |
| BING_API_KEY | yes | **you** | Bing Webmaster Tools → Settings → API access |
| OPENAI_API_KEY | yes | optional | AI-visibility checks + LLM fallback (`OPENAI_MODEL`, `OPENAI_SEARCH_MODEL`) |
| PERPLEXITY_API_KEY | yes | optional | AI-visibility checks (`PERPLEXITY_MODEL`) |
| AUTO_PUBLISH | | yes | `true` (default): automated approval gate + auto-merge. `false`: human-only flow, never merges |
| GATE_CI_TIMEOUT_MS / GATE_CI_POLL_MS | | optional | How long to wait for green checks before merging (default 20 min, poll 30 s) |
| APPROVER_NAME | | optional | Name written to `approved_by` on a `/approve` override (default: the commenter's login) |
| GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL | | optional | Commit identity for engine PRs |
| LLM_PROVIDER_ORDER | | yes | **`codex`** = Codex-only (current). Default `codex,anthropic` (Codex for research/draft/optimize, paid fallback). `anthropic` turns Codex off |
| LLM_FACTCHECK_PROVIDER | | optional | Default `anthropic`; Codex is never used for fact-checks |
| CODEX_MODEL | | yes | `gpt-6.1-sol` (unset = Codex's default) |
| CODEX_REASONING_EFFORT | | yes | `high` (passed as `-c model_reasoning_effort="high"`) |
| CODEX_TIMEOUT_MS | | optional | Per-call timeout; default 25 min in Codex-only mode, 10 min otherwise |
| CODEX_MAX_CALLS_PER_WEEK | | optional | Default 6 |
| CODEX_ANYTIME | | optional | `true` allows Codex calls 8:00–23:00 NY |
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
