# Marian Grout blog carousels

## Contract and design

Approved **and publicly live** articles on `main` become six-slide Instagram packs, emailed only to `mariangrout@gmail.com`. Nothing posts to Instagram.

Owner direction: **elegant, highly scannable, graphic-led**, not article paragraphs on slides. One idea per slide, a short serif headline, one supporting line, no more than 18 words combined (at most six headline words and twelve supporting words). Quiet paper-sculpture illustrations with parchment, brown and restrained amber. Plenty of space, consistent 80px inset, 1080×1350 JPEG exports. Cormorant Garamond 500 headline outlines and Figtree 400 body outlines make rendering independent of host fonts. No invented founder history, portraits, testimonials, dosage or product claims.

Each pack contains six numbered JPEGs, `caption.txt` (≤2,200 characters), `sources.txt` (full references plus exact supporting quotes), and `alt-text.txt`. Visuals are labelled AI-generated in the caption, notes and email. Public slide, caption, alt-text and email copy uses short, everyday words at about a fifth-grade level. Detailed research stays in the article and separate source notes, not the caption. Formal source titles and exact evidence quotes are kept intact for reference. Shortened medical points must retain their meaning and supporting evidence. This is general education, not individual advice.

One high-quality Codex subscription image call produces six distinct compositions as a 2×3 grid. A copy-only revision can reuse the prior Codex artwork for the exact same source, so it does not waste image calls. The renderer separates them and adds crisp, deterministic type. The image backend may ignore requested native dimensions; **only the exported slides** have the guaranteed exact 4:5 size. No paid API fallback. Existing subscription quotas still apply.

## Flow

`src/jobs/carousel.js` is an hourly scheduler job. It reads approved posts from the configured GitHub repo's `main`, verifies each public article URL returns success, then plans → generates → renders → verifies → sends through Resend.

- The four tested articles have brief, plain-language copy in `src/carousel-copy.js`, tied to exact approved source quotes. An older approved fixture has source-aware wording, never a removed claim. If a later source revision invalidates the evidence, the current article goes through Codex adaptation and review instead of reusing stale copy.
- Future articles use the engine's existing Codex text adapter, with provider order forcibly `codex`. A second Codex pass rejects unsupported or non-plain summaries. A dependency-free reading-level estimate (upper bound five), a medical-jargon block, word limits, and actual glyph-layout checks run before delivery. These are useful guards, not a reading-level certificate. There is at most one shortening/plain-word repair, preserving the source quotes and artwork; a failed repair stops for review. Exact supporting text must occur in the approved article. Unknown sources, unsupported summaries, or copy that still fails after the one repair stop delivery for review.
- Artwork uses the same authenticated subscription endpoint and request shape as EZ Coder's `generate_image`: `https://chatgpt.com/backend-api/codex/images/generations`. It reads the server's existing `$CODEX_HOME/auth.json` in memory. No login or bearer token is copied into the repository or artifacts.
- `401/403` waits for the subscription login to be renewed; `429` records a 24-hour image backoff. Transient image HTTP 5xx gets at most three attempts. Neither image nor text generation falls back to paid providers.
- Plans, artwork and completed exports are cached under the persistent volume: `/data/carousels/<slug>/<versioned-source-hash>/`. New article revisions produce a new versioned pack. A successful repeat run does not email again.
- Resend sends nine direct attachments per pack (six JPEGs plus three text files) from `3:17 Carousel Studio <carousels@prestyj.com>`, using the existing verified domain. No campaign or subscriber data is involved.
- Durable delivery receipts and request hashes prevent duplicate sends. Ambiguous network failures retry the **same request** within Resend's 24-hour idempotency window. After 23 hours, an uncertain send stops for manual reconciliation rather than risking a duplicate. Preserve this directory and the Railway `/data` volume.
- Keep one scheduler replica, as the engine is currently configured. Its existing process lock prevents overlap between scheduled and manual runs. Don't invoke the exported job concurrently from outside that scheduler.

## Configuration

The existing Railway `engine` service and persistent `/data` volume are used. No new paid service is required.

| Setting | Value / purpose |
| --- | --- |
| `CAROUSEL_ENABLED` | `true` enables the hourly flow; absent/false does nothing |
| `CAROUSEL_DIR` | `/data/carousels` |
| `CAROUSEL_MAX_PER_RUN` | default `1`, capped at `3` for backfill |
| `RESEND_API_KEY` | server secret; never put in Git or browser config |
| `GITHUB_TOKEN`, `GITHUB_REPO` | existing engine read access / `Gahroot/mom317` |
| `CODEX_HOME` | existing server subscription session, default `/data/codex` |

The owner-authorized local Resend key backup is outside this repository in the goal's `secrets/resend.env`, directory mode 0700 and file mode 0600. Rotate the Resend key in its dashboard if it is ever exposed, then update the service secret and that backup.

Manual catch-up uses the existing authenticated `GET /api/admin/run/carousel`. Inspect `/api/admin/status` for run results. Do not print the admin token or environment dump. Disable `CAROUSEL_ENABLED` to stop delivery without touching signup, blog publishing, or stored packs.

Deploy local changes with the already-authenticated Railway CLI from `engine/`: `railway up --service engine --path-as-root . --ci`. This does not require committing or pushing. Changes remain uncommitted for the owner; a future deployment from an older checkout will not contain them.

## Checks

From `engine/`: `npm test` (includes `test/carousel.test.js`); `npm audit --omit=dev`.

The 77 engine tests include guards for plain vocabulary, estimated reading level, medical-jargon rejection, source-preserving copy repair and image reuse, as well as approval/path/source gates, every current post's six-slide render, 18-word cap, exact 1080×1350 dimensions, caption limit, references, fixed recipient, direct attachments, duplicate suppression, uncertain sends, subscription-only image/auth/quota behavior, published-only handling, hourly reuse, literal text contrast, and future-post Codex-only generation/support rejection. Root CI now runs these engine tests alongside the existing blog and browser-script checks.

Actual text pairs: ink `#2B1E16` on parchment `#F7F1E6` **14.37:1**, muted `#5E5247` on parchment **6.73:1**. No text overlays artwork, and amber is not used for small text on parchment. The final four revised packs were downloaded from Resend, not merely checked as local previews: 24 JPEGs, exact 1080×1350, no slide over 16 whitespace-counted words, source quotes matching approved posts, plain captions/emails, and confirmed delivery. A live repeat run sent no extra emails. The new emails start with `Your simple sleep slides:`.

Alternative text is supplied for manual entry in Instagram, not embedded as a substitute for that step.

Exact emailed files were inspected at desktop (1440px) and phone (390px) sizes after both owner corrections: first remove text-heavy layouts, then use much simpler fifth-grade wording. The visual direction is editorial rather than a dashboard. Applicable rubric: specificity 2, hierarchy 2, composition 2, consistency 2, typography 2, material/colour 2, static-state completeness 2, proportional resizing 2, accessibility 1 (contrast + supplied alt text checked; Instagram assistive technology not tested), no-motion 2, authentic content 2, distinctive finish 2 = **23/24**. This is a scoped visual check, not an accessibility certification. Instagram upload/compression and screen-reader behaviour were not tested.

## Reference URLs

- Resend send/attachment contract: https://resend.com/docs/api-reference/emails/send-email
- Resend idempotency window: https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend delivery-status retrieval: https://resend.com/docs/api-reference/emails/retrieve-email
- Retrieve exact sent attachments for verification without server SSH: https://resend.com/docs/api-reference/emails/list-email-attachments
- Cormorant Garamond source: https://github.com/google/fonts/tree/main/ofl/cormorantgaramond
- Figtree source: https://github.com/google/fonts/tree/main/ofl/figtree

Both font families retain their SIL Open Font License in `assets/fonts/`. Static 500/400 instances and outline data were derived locally using FontTools 4.67.0; there is no Python or FontTools runtime dependency. EZ Coder's local image implementation was the image integration reference, not an invented public API. This is an authenticated internal endpoint and may change; the image adapter will fail closed until updated.
