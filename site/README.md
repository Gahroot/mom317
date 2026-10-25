# 3:17 founding-list site

A static landing page (HTML, CSS and a little JavaScript, no build step) for collecting founding-list signups.

## Preview it

```bash
cd site
python3 -m http.server 8317
# open http://localhost:8317
```

Until an email service is connected it runs in **preview mode**. Signups aren't saved anywhere, and the thank-you page says so.

## Before going live

1. **Connect the email list.** In `config.js`, set `signupEndpoint` to a URL that accepts a POST with JSON `{ email, ref, source }`. Klaviyo, Mailchimp, ConvertKit or Kit, Formspark, a Shopify app or a small serverless function all work. If it replies with `{ "referralCode": "...", "position": 182 }`, the thank-you page shows her real place in line and uses her real referral code. Set `quizEndpoint` the same way for the optional questions.
2. **Fill every highlighted placeholder** (dashed outline): the contact email, and on the thank-you page the founding price, regular price and referral goal.
3. **Swap the AI mock photos for real product photos** when the bottle exists: `img/hero-bottle-night*.webp`, `img/reserve-bottle-morning*.webp` and the share card `img/og.jpg` (see `DESIGN.md` › Photography).
4. **Show a signup count only once it's real.** Put it in `realSignupCount`. The batch size in `foundingBatchSize` must also be real.
5. **Optional: founding reservation** (thank-you page). Set `reservationUrl` to a checkout link for a small refundable deposit (a Stripe Payment Link works; the page pre-fills her email and passes her referral code as `client_reference_id`) and `reservationAmount` to the amount, e.g. `"$1"`. The card stays hidden on the live site until both are set. Before turning it on, the ship month must be a real date and refunds must work as the page says ("full refund any time before it ships"); US mail-order rules apply once you take money. See `research/317/preorder-research.md`.
6. **Optional: referral reward** (thank-you page). Set `referralGoal` (a whole number) and `referralReward` (text, e.g. `"a free second bottle"`). Your email service has to count referrals from the `ref` field and send the reward; the page only describes it.
7. **Have a lawyer review** the privacy page, the claims wording, the reservation terms and the referral rules before collecting real emails or money.

## Files

| File | What it is |
|---|---|
| `index.html` | Landing page: one screen (headline, waitlist form, bottle, disclaimer) |
| `thanks.html` | After signup: optional founding reservation, share link with optional referral reward, text/WhatsApp sharing, optional 3-question quiz |
| `privacy.html` | Draft placeholder, must be replaced |
| `styles.css`, `thanks.css` | Design tokens and layout |
| `app.js`, `thanks.js` | Form validation, submit, referral capture, share, quiz |
| `config.js` | The only file you need to edit to go live |
| `DESIGN.md` | Design decisions, tokens, contrast measurements, checks |
| `blog.css` | Blog, article and about page styles (light reading surface) |
| `blog/`, `about/`, `sitemap.xml`, `feed.xml`, `llms.txt` | **Generated** by `node tools/build-blog.mjs` from `content/posts/*.md`; don't edit by hand |
| `robots.txt`, `vercel.json` | Crawler rules (AI crawlers allowed); clean URLs, `/img` caching and the `/api/*` rewrite to the Railway API |
| `globals.d.ts` | Type declarations for the type check only; the browser never loads it |

## Blog

Posts live in `content/posts/<slug>.md` (repo root, not deployed). Only `status: approved` posts with `approved_by` are published. From the repo root:

```bash
node tools/build-blog.mjs          # render site/blog, about, sitemap.xml, feed.xml, llms.txt
node tools/build-blog.mjs --check  # CI: fails on invalid posts or stale output
node --test tools/
```

Join forms on blog pages send `source` = `blog:<slug>:inline|end` (hero form: `hero`), plus the page path and first-touch UTM tags. `eventsEndpoint` in `config.js` turns on cookieless pageview/cta_click beacons.

## Deploy

The Vercel project `317-waitlist` (root directory `site`) is connected to the GitHub repo, so every push to `main` deploys to production and other branches get preview deploys. No build step runs; `.vercelignore` keeps docs and type declarations out of the upload.

## Type check

```bash
cd site
npx --yes -p typescript@5.9.3 tsc --noEmit --allowJs --checkJs --target es2019 --lib es2019,dom,dom.iterable globals.d.ts config.js app.js thanks.js
```
