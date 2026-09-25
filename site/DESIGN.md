# 3:17 founding-list page: design record

## Design read
- **Surface:** single-job marketing page with a pre-launch commerce feel.
- **Audience:** pre-, peri- and post-menopausal women, mostly 45+, mostly on phones, many arriving from a shared link or group chat. They feel dismissed and are wary of hype.
- **Single job:** get an email address. Everything else either removes a doubt or leads back to the form.
- **Constraints:** no reviews yet (pre-launch), supplement claim rules, the brand values "transparent" and "truthful, no hype, no fear", a luxury feel, and packaging of an amber bottle with a sand label, gold wordmark and black text.

## Evidence (Refero, full notes in `research/317/`)
- **Aesop** (`7a61125e`, `9ffc9899`): a luxury "notify me" is one solid black button. Amber glass on cream, lit like a specimen.
- **Prose** (`539e88ba`, `31719a5c`, `37684eed`): amber dropper bottle with a cream label; one dark button repeated; ingredient cards; numbered ritual band; large-tap-target quiz.
- **Hers perimenopause** (`f0497969`): validate first ("what you're feeling is real"), then offer help.
- **Contrast case, Drepute** (`aa138c1f`): a night-sky "Launching Soon" page with no reason to sign up. The mood worked, the message didn't.

## Thesis
**The page moves through one night.** It opens at 3:17 a.m. in lamp light, stays in the dark while she recognises herself (3:24 a.m.), then warms into morning (parchment, sand) as the founder, the ritual and the formula build trust. It returns to night for the last ask ("The next time you wake at 3:17, be ready"). The thank-you page is "Morning".

- **First glance:** the headline naming her exact moment. **Second glance:** the email field and gold button.
- **The memorable device:** real timestamps as section labels (3:17 a.m., 3:24 a.m., Bedtime, Morning, Tonight). They are a sequence, not decorative eyebrows.
- **Why dark here** (anti-default "dark equals premium"): the product is used in a dark bedroom, the brand name is a time of night, and the gold wordmark only reaches readable contrast on dark. Long reading happens on light surfaces.

## Tokens (all ratios measured)
| Role | Value | Contrast |
|---|---|---|
| Night surface | `#15110E` | parchment text 16.7, muted `#C9BBA5` 9.96, gold `#D4B06A` 9.14 |
| Parchment surface | `#F7F1E6` | ink 15.6, muted `#5E5247` 6.73, amber label `#8C4A12` 6.02, amber-deep 8.21 |
| Sand surface | `#E6D7BE` | ink 12.4, muted 5.35, amber label 4.78, amber-deep 6.52 |
| Ritual band | `#6E3A10` | parchment 7.21 (92%), labels `#E2C27F` 5.39 |
| Gold button | `#D4B06A`, night text | 9.14 (hover `#E2C27F` 10.96) |
| Dark button | `#2B1E16`, parchment text | 14.37 (hover amber-deep 8.21) |
| Focus ring | gold on dark, amber-deep on light | 9.14 / 8.21 / 6.52 |
| Quiz tile border | ink at 65% | 4.13 on sand, 5.2 on parchment |
| Error text on night | `#F6B8A2` with "!" prefix | 10.99 |

**Rejected:** the bottle's gold on sand (2.06) and gold on parchment (2.60) both fail even for large text. On light surfaces the wordmark uses amber-deep instead.

- **Type:** Cormorant Garamond 500/600 for display (a calm, bookish, high-contrast serif, echoing a foil wordmark); Figtree 400/500/600 for body and UI (open shapes, readable at small sizes). Body text is 18px with 1.6 line height. Inputs are at least 16px so iPhones don't zoom in.
- **Shape:** 5px corners, 56px control height, flat surfaces, hairline dividers, no card shadows.
- **Rhythm:** one 1160px content rail with a clamped gutter (20 to 48px); sections use 72 to 128px vertical padding.
- **Motion:** colour and background transitions only (100 to 160ms). No hover lift, no ambient motion. Smooth scrolling only without reduced-motion; transitions drop out under reduced-motion.

## Components and states
- **Join form** (hero and final): visible label; `type=email` with `autocomplete=email`; honeypot field; states for empty, invalid, pending ("Joining", duplicate submits blocked), network failure (keeps her email and invites a retry) and success (redirects to the thank-you page). Errors are text in a `role=alert` region, and the field gets `aria-invalid`.
- **Sticky mobile button:** appears at 900px and below, only when neither form is on screen. Tapping it scrolls to the final form and puts the cursor in it.
- **Thank-you page:** her place in line appears only if the real service returns one. Sharing by text (`sms:`), WhatsApp, and the phone's share sheet where available. Copy link with a fallback. Quiz uses native radio groups in fieldsets, with a tick as the non-colour selected cue. Preview-mode notice when no email service is connected.
- **FAQ:** native `details`/`summary`.

## Photography (to replace the drawn stand-ins)
1. Hero: the amber bottle on a nightstand, one warm lamp, linen, deep brown shadow (lit like Aesop's fragrance photos). Serve as AVIF/WebP with explicit sizes and don't lazy-load it (it's the largest image on first load).
2. Founder: natural light, unretouched, 4:5 crop.
3. Macro: ingredient or liquid in amber glass, for the formula section.

## Checks run (Chromium via Playwright, 25 Sep 2026)
- **Pass:** tab order (skip link, logo, header link, email, button, privacy, formula button, FAQ); focus visible on every stop (2px outline); skip link lands on `#main`; empty and invalid submit show a text error, keep focus on the field and set `aria-invalid`; FAQ opens with Enter; header and sticky links focus the email field.
- **Pass:** no horizontal scrolling at 320, 390 or 768px; sticky button hidden at the hero, shown mid-page, hidden at the final form; referral code captured from `?ref=`; share link and SMS body generated; no console errors; only the used font weights load.
- **Unverified:** screen reader output (VoiceOver/NVDA), Safari and Firefox, a real iPhone, 200% text zoom, forced-colours mode, field Core Web Vitals. This is **not** a WCAG or ADA conformance claim.
