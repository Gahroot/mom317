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
2. **Fill every highlighted placeholder** (dashed outline): ship month, founder name, dose, the three ingredients with amounts, contact email.
3. **Replace the drawn bottle and portrait** with real photos (see `DESIGN.md` › Photography).
4. **Show a signup count only once it's real.** Put it in `realSignupCount`. The batch size in `foundingBatchSize` must also be real.
5. **Have a lawyer review** the privacy page, the claims wording and the referral rules before collecting real emails.

## Files

| File | What it is |
|---|---|
| `index.html` | Landing page (night hero, then morning sections) |
| `thanks.html` | After signup: share link, text/WhatsApp sharing, optional 3-question quiz |
| `privacy.html` | Draft placeholder, must be replaced |
| `styles.css`, `thanks.css` | Design tokens and layout |
| `app.js`, `thanks.js` | Form validation, submit, referral capture, sticky mobile button, share, quiz |
| `config.js` | The only file you need to edit to go live |
| `DESIGN.md` | Design decisions, tokens, contrast measurements, checks |
| `globals.d.ts` | Type declarations for the type check only; the browser never loads it |

## Type check

```bash
cd site
npx --yes -p typescript@5.9.3 tsc --noEmit --allowJs --checkJs --target es2019 --lib es2019,dom,dom.iterable globals.d.ts config.js app.js thanks.js
```
