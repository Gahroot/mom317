# AGENTS.md

Static site (plain HTML, CSS and JavaScript in `site/`) plus design research in `research/`. There's no package manifest, so no install, build or test step.

## Rules

- CI lives in `.github/workflows/ci.yml` and must stay green.
- Never commit with `--no-verify`.
- Go-live settings live in `site/config.js` only. Never show invented signup counts, positions or testimonials.
- Design tokens and contrast measurements are in `site/DESIGN.md`. Re-measure contrast when you change a colour.

<!-- gg:init:start -->
## 3:17

Pre-launch founding-list (waitlist) page for "3:17", a sleep-support shot for menopausal women who wake in the night, plus the design research behind it.

- `site/index.html` + `app.js`: one-screen landing page with a single join form (`#join-hero`, button "Be the first") and `?ref=` capture. Audience is women in menopause only. Product name is "Middle of the night sleep shot", tagline "Quickly return to sleep". Never call it a "liquid dietary supplement" on the front.
- `site/thanks.html` + `thanks.js`: after signup. Share links (SMS, WhatsApp, share sheet, copy) and an optional quiz.
- `site/privacy.html`: a draft placeholder, `noindex` like `thanks.html`.
- Blog: `tools/build-blog.mjs` (Node 24, no deps) renders approved `content/posts/*.md` to `site/blog/`, `site/about/`, `sitemap.xml`, `feed.xml`, `llms.txt` (generated: never hand-edit). CI runs `node --test tools/` and `node tools/build-blog.mjs --check`, so rerun the build after changing posts or templates. Frontmatter fields (title, slug, description, date, updated, status, approved_by, answer, faq, sources, claims).
- `research/317/`: the chosen direction (research md, `deck.html`, previews).
- `research/build_deck.py`: the older five-direction deck.

## Data flow

- `config.js` sets `window.WAITLIST_CONFIG` and must stay the first `defer` script on both pages. `app.js` and `thanks.js` read it at startup.
- Signup: POST `{ email, ref, source, page, landing_page, utm_* }` to `signupEndpoint` (`source` from the form's `data-source`, default `hero`; first-touch UTM in sessionStorage `317_attr`). `eventsEndpoint` (empty = off) gets cookieless `sendBeacon` events. The reply `{ referralCode, position }` is optional. Result is saved to sessionStorage `317_signup`, then redirects to `thanks.html`, which reads that key.
- Empty `signupEndpoint` means preview mode: nothing is sent and `thanks.html` shows a preview notice. Live config points `signupEndpoint`/`quizEndpoint`/`eventsEndpoint` at `/api/*`, which `site/vercel.json` rewrites to the Railway engine (`engine/`, see `engine/README.md`). Signups are stored in its Postgres.
- Quiz answers POST to `quizEndpoint`, otherwise sessionStorage `317_quiz`. The referrer is kept in `317_ref`, only if it matches `^[a-zA-Z0-9_-]{3,40}$`.

## Gotchas

- `317_signup` is a contract between `app.js` and `thanks.js`. Rename it in both or never. Tool output may display that literal as `[REDACTED]`, but the file really contains `317_signup` (check with `od -c` before "fixing" a mismatch).
- The type check is `--checkJs` against `site/globals.d.ts`. A new `WAITLIST_CONFIG` key must be added to the `WaitlistConfig` interface there.
- A new JS file is not type-checked until it is added to the explicit file list in `ci.yml`, `site/README.md` and the command below.
- `--lib es2019` makes ES2020+ APIs (`Promise.allSettled`, `replaceAll`, `.at()`) fail CI. Existing code is ES5-style (`var`, IIFE, JSDoc casts), so keep to that.
- `<span class="ph">[…]</span>` (dashed amber outline) marks owner-supplied facts: ship month, founder name, dose, ingredients with mg, contact email.
    - Never fill these with made-up values. They are supplement claims and need legal review.
- Every join form needs the hidden honeypot `input[name="company"]`. `app.js` silently drops submissions where it's filled, so copy it with any new form.
- On light surfaces the brand gold fails contrast (2.06 on sand, 2.60 on parchment), so the wordmark and accents use amber-deep there.
- Inputs stay at least 16px, or iOS zooms in.
- Motion is colour/background transitions only: no hover lift, off under reduced-motion.
- `.ezcoder/` is gitignored because it holds private uploads (the brand vision PDF). Never move its contents into tracked paths.
    - UI screenshots go in `site/.shots/` (also ignored).

## Workflows

- Preview: `cd site && python3 -m http.server 8317`, then open http://localhost:8317.
- Type check (the only CI job; there is no manifest, so it isn't auto-discovered):
  `cd site && npx --yes -p typescript@5.9.3 tsc --noEmit --allowJs --checkJs --target es2019 --lib es2019,dom,dom.iterable globals.d.ts config.js app.js thanks.js`
- `3-17-Waitlist-Research.pdf` (16 pages) is `research/317/deck.html` printed with headless Chrome `--print-to-pdf`. `deck.html` sets `@page` itself, one section per page.
- `Sleep-Shot-Waitlist-Directions.pdf` (19 pages) comes from `python3 research/build_deck.py [--preview]`.
    - It needs Pillow and hard-codes `/Users/groot/mom317/...` paths plus macOS fonts in `/System/Library/Fonts/Supplemental`, so it only runs on this Mac.
    - `--preview` also writes PNGs to `research/report/preview/`.
- Deploy: Vercel project `317-waitlist` (root directory `site`, no build) is Git-connected to `Gahroot/mom317`. A push to `main` deploys to production; other branches get previews. `site/.vercelignore` excludes docs and `globals.d.ts`.
<!-- gg:init:end -->
