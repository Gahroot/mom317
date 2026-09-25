# 3:17 — Luxury Waitlist Landing Page Research

*Design research for the 3:17 pre-launch site · September 2026 · Sources: Refero design library (real, live beauty and supplement sites), the 3:17 Brand Vision document, and the earlier Sleep Shot waitlist research in `research/report/`.*

---

## 0. The short version

**Build a "night-to-morning" page: a dark, lamp-lit 3:17 a.m. hero with the gold wordmark, which opens into warm sand-and-parchment sections below. Use one espresso/amber button repeated down the page and ask for an email only.**

Why this direction:

1. **It solves a real colour problem.** Gold type on a sand background is only **2.06:1** contrast, which fails accessibility rules even for large text. On a near-black "night" background the same gold scores **6.4–9.1:1**. The bottle's palette works in print, where foil catches light, but on a screen the gold wordmark needs a dark stage.
2. **It turns the brand name into the hero.** Most people don't read a sleep brand's name as a moment in time. 3:17 is one. The hero *is* that moment: dark room, lamp glow, amber bottle on the nightstand.
3. **It keeps the reading sections light.** Women 45+ are the audience. Long stretches of light text on dark are harder to read, so everything after the hero sits on warm parchment with dark ink text (15.6:1).
4. **It follows how the best luxury beauty brands behave.** Aesop, Prose, Function Health and Aplós all pair a restrained, quiet page with **one solid, high-contrast button**. None of them use hype colours, and none use a ghost button for the main action.

The rest of this document shows the evidence, three design directions, a section-by-section blueprint, copy starters, design tokens, and a test plan.

---

## 1. What the brand vision asks for, and what it means on screen

| Brand vision says | Design and conversion implication |
|---|---|
| Hero product: helps women **fall back asleep** after waking 3–4 hours in | The page must name *that exact moment*, not "better sleep". The number 3:17 does the work. |
| Audience: pre-, peri- and post-menopausal women who feel **dismissed** | **Being understood is the conversion event.** Validation comes before product ("You're not imagining it"). |
| Founder: **15 years** living with it; built what she couldn't find | A founder letter is the strongest trust asset before launch. There are no reviews yet, so her story stands in for them. |
| Value 1: **ingredient transparency** | Show every ingredient with its exact amount and why it's there. No "proprietary blend". |
| Value 3: **truthful — no hype, no fear** | No fake countdowns, fake scarcity or inflated counters. Luxury restraint and honesty point the same way. |
| Value 4: **Approved by God** | Faith shows up as tone (stewardship, care) and one quiet, sincere line, not a banner. See §8. |
| Roadmap: **Cool, Calm, Travel, Restore** | A "the 3:17 system" preview gives people a reason to stay subscribed after the first product and invites them to vote. |
| 5-year goal: **1 million women**; giving and advocacy | Frame joining as joining a *movement*, not just getting a discount. |
| Packaging: **amber bottle, sand label, gold 3:17, black product text** | Derive the web palette from the bottle, adjusted for screen contrast (§6). |

---

## 2. What Refero shows: how premium beauty and supplement brands capture interest before a purchase

Refero holds very few true consumer "waitlist" pages. Searching for "waitlist" returns mostly software startups. So I studied how premium beauty and wellness brands handle the *same job*: capturing an email from someone not ready to buy. Then I combined those parts with the waitlist mechanics already proven in the earlier report.

### 2.1 Aesop: the luxury "notify me" (the closest luxury waitlist pattern)
*Body Care Duo product page · Refero screen `7a61125e` · `img/s-aesop-notify.jpg`*

- The out-of-stock state shows a grey "Out of stock" bar and, directly under it, **a full-width solid black "Register to be notified of stock" button**. That is a luxury brand's waitlist: one quiet, unmissable button with no exclamation marks.
- The page is cream (#FFFEF2-ish) with amber glass bottles photographed like specimens against empty space. **This is almost exactly the 3:17 packaging world.**
- Reassurance row under the buy box: three icons (pay with Apple Pay · speak with a consultant · pay later).
- Footer: charcoal band with an email field and a consent checkbox.

**Take for 3:17:** a solid dark button, amber glass on warm neutral, a reassurance row under the form.

### 2.2 Aesop fragrance: the photography direction
*Fragrance catalog · Refero `9ffc9899` · `img/s-aesop-fragrance.jpg`*

- A single amber bottle on warm, raking-lit stone, in shadow, with white serif-sans copy on the image.
- **Take:** the 3:17 hero shot. The bottle on a nightstand, lit by one warm lamp, the room falling into dark brown.

### 2.3 Prose: the most complete conversion system in premium beauty
*Custom Scalp Serum `539e88ba`, Skincare landing `31719a5c`, email modal `8f2fd292`, quiz `37684eed`, ingredient index `2d2e194e`*

Prose sells an **amber dropper bottle with a cream label**, visually the closest match to 3:17 in the library. Their page stacks nearly every proven device, in quiet luxury styling:

- **Hero:** two columns, bottle on the left, serif headline and **one dark pill button** on the right. The button repeats about 5 times down the page.
- **Attribute ticker:** a dark band of all-caps claims ("PHTHALATE FREE · GMO FREE · VEGAN…"). This is a fast way to show what's *not* inside.
- **Ingredient cards:** macro photo, name, and one line on what it does. There is also a full A–Z ingredient index with a function tag for each. **Radical transparency, presented beautifully.**
- **How to use:** a dark olive band with numbered steps and dosage.
- **Stats grid:** "Clinically tested and proven effective in 4 weeks", then 95% / 91% / 82%. The numbers do the persuading. *Only usable once 3:17 has real tester data.*
- **Expert video testimonials** and a written reviews list with name, city and date.
- **FAQ in two columns:** heading on the left, accordion on the right.
- **Email-for-offer modal:** image on top, serif headline, one email field, dark "Unlock offer" button, consent text.
- **Quiz:** "Let's start personalizing…" uses large outlined tap targets for age groups, a progress bar, and a "Why we ask" box.
- **Legal:** the FDA supplement disclaimer sits in a boxed footnote.

**Take for 3:17:** ingredient cards with exact amounts; a "what's not in it" ticker; a numbered ritual band; a two-question quiz *after* signup; the disclaimer box.
**Leave behind:** the "60% off + free gift" modal. Heavy discounting cheapens a luxury launch.

### 2.4 Hers (perimenopause): empathy-first copy for this exact audience
*forhers.com/perimenopause `f0497969` · `img/s-hers-peri.jpg`*

- The headline is **"What you're feeling is real — it's also treatable."** It validates first and offers help second. A real, happy midlife woman sits in the hero.
- Symptom words float over a photo, so readers recognise themselves. A doctor block with a signature follows. The page closes with **"Let's get back to you."**
- The style is clinical-friendly (white, coral, maroon), **not luxury**. 3:17 should use Hers' *messaging order*, not its look.

**Take:** validation first, then recognition in her own words, then "a person like you made this", then the offer.

### 2.5 Alo Wellness Club: CTA repetition and stacked proof
*`09207b01` · `img/s-alo.jpg`*

- One "JOIN NOW" button appears **4 times**, and each one sits after a section that answers a new doubt.
- Proof comes in layers: a "25K 5-star reviews" laurel badge, a quote carousel, an "AS SEEN IN" press row, and an expert portrait grid.
- "Already a member? Link your account" sits under the button to prevent confusion.
- **Alo Gives** (`a8c9cd31`) is a separate mission page. It's a model for 3:17's giving and advocacy goal.

### 2.6 Hello Klean and Prose: the buy box after launch
*Klean `fdeaf0d4` · `img/s-klean.jpg`*
- A subscription/one-time radio card with the saving shown, plus "cancel anytime" and "100-day guarantee" lines. Plan this now so waitlist members get a clear launch-day offer, such as a founding subscription price.

### 2.7 Warning example: "Launching Soon" with nothing else
*Drepute style `aa138c1f` · `img/t-drepute.jpg`*
- A beautiful night-sky landscape and a serif "Launching Soon". There's no product, no promise, no reason to give an email. It's a GoDaddy template.
- **Atmosphere alone doesn't convert.** 3:17's night hero must carry a specific promise, the bottle and the form, all above the fold.

### 2.8 Style systems worth borrowing (full Refero style specs pulled)

| Style | What it looks like | What 3:17 takes |
|---|---|---|
| **Aesop** (Refero "NGLORA", `58407c0f`) | Parchment #FFFEF2, charcoal #333, umber accent #945C26; humanist serif display; 0px corners; no shadows; 96–128px between sections | Specimen-style product shots, calm grid, warm parchment |
| **Function Health** (`22eb724b`) | Parchment #FEF9EF / cream #F5EEE1; **one accent (#B05A36) used only on CTAs**; light serif display 64–80px; pill buttons | **The "one accent colour = the button" rule**, health credibility with warmth |
| **Aplós** (`807d6288`) | Dark cinematic hero, then **"Desert Sand" #F2F1ED bands**; Goudy-style serif; gold objects on black | **The dark-hero-then-sand structure.** Avoid its ghost buttons. |
| **Amrit Palace** (`5cf04958`) | Mahogany dark, aged parchment #D8CBB8 text, amber glow #D49653; light display serif; moody warm photography | The night palette: warm dark, not cold blue |
| **Savor** (`d89bd263`) | Buttermilk #FFF9EB, oat #F0E7D7, cacao ink #370808; macro honey/oil textures | Macro shots of amber liquid and glass as section textures |
| **Alison Roman** (`0e9417ba`) | Bookish cream, literary serif, one deep reddish-brown filled button | Tone for the founder letter |

---

## 3. Luxury versus conversion: where they clash and how to resolve it

Luxury design likes restraint: whitespace, thin type, ghost buttons, hidden prices, no urgency. Conversion likes clarity: obvious buttons, proof, repetition, urgency. Handled carelessly, one kills the other.

**The rule: quiet page, loud button.** Everything is restrained *except* the single action.

| Luxury habit | Conversion risk | 3:17 resolution |
|---|---|---|
| Ghost/outline buttons (Aplós, Aesop hero, Face Formula) | Low-contrast buttons get missed | **Solid** espresso or deep-amber button, ≥ 8:1 contrast, the same on every section |
| Thin, light serif at small sizes | Hard to read for 45+ eyes | Serif **only for headlines ≥ 32px**; body text in a clear sans at **18px** |
| Tiny all-caps labels | Illegible on phones | Labels ≥ 13px with letter-spacing, never carrying key information |
| Gold text for elegance | Gold on sand = 2.06:1 (fails) | Gold only on dark backgrounds, or as large decoration, never for body text or buttons on light |
| Hide the offer, stay mysterious | "Launching soon" pages convert poorly | Say what it is, who it's for and when it ships, in the first screen |
| No urgency | Low intent | **Honest** urgency: a real founding-batch size and a real ship month. No fake timers. |
| Discount pop-ups (Prose 60% off) | Cheapens the brand | A founding *privilege* (first batch, locked founding price, founder's note) instead of a discount |
| Full navigation menu | Every link is an exit (removing nav is worth ~10–15% per the earlier report) | Logo + a single "Join" anchor. Nothing else at the top. |

---

## 4. Three design directions

Reference images for each are in `research/317/img/` and in the PDF deck.

### Direction A — "The Apothecary" (light)
*References: Aesop, Function Health, Prose*
- Parchment page, amber bottle photographed like a specimen, charcoal type, one deep-amber button.
- **Strengths:** most legible; most "clean clinical luxury"; safest for the audience; fastest to build.
- **Weakness:** the gold wordmark can't sit on it legibly, so the logo must switch to ink or a darkened gold. It also looks like many existing brands, so it's less ownable.

### Direction B — "3:17 a.m." (night, then morning) ← **recommended**
*References: Aplós (structure), Amrit Palace (warm dark palette), Aesop fragrance (lamp-lit amber photography), Function Health (single accent rule)*
- Hero: warm near-black (#15110E), one pool of lamp light, amber bottle on a nightstand, **gold 3:17 wordmark legible at 6–9:1**, parchment headline text.
- Scrolling moves "into morning": sections shift from dark to sand to parchment. The page itself acts out the before-and-after in the brand vision (exhausted → restored).
- Final CTA band returns to night ("Tonight at 3:17, you'll be ready").
- **Strengths:** unique and ownable; tells the brand story with no words; the gold works; feels like premium fragrance, not a pharmacy.
- **Watch-outs:** keep dark areas short (hero plus final band). Photography quality is make-or-break. The dark hero must not look like "insomnia marketing gloom", so the lamp light is warm and hopeful.

### Direction C — "The Letter" (editorial, founder-first)
*References: Alison Roman, Savor, Hers (messaging order)*
- Opens like a handwritten letter from the founder: "For fifteen years, I woke at 3:17." Bookish serif, cream paper, reddish-brown button.
- **Strengths:** the most emotionally honest; strongest for the faith and "from the inside" story; performs well with *warm* traffic such as her own network and podcasts.
- **Weaknesses:** slower to show the product; weaker for cold paid-social traffic.

**Recommendation:** build **B**, and include C's founder letter as section 3. For a warm-traffic launch (email to friends, church, community), an A/B test of B against C is worth running (§9).

---

## 5. Page blueprint: section by section

Each section has one job. The button appears after every section that removes a doubt.

| # | Section | Its one job | Content | Reference |
|---|---|---|---|---|
| 0 | **Announcement bar** | Honest urgency | "Founding list open · First batch ships [Month] · [N] bottles only", only if true | Aesop top bar |
| 1 | **Hero (night)** | Get the email | Kicker "3:17 a.m." · outcome headline · one-line subhead · **email + button inline** · proof line · bottle in lamp light · logo only, no nav | Aplós / Aesop fragrance / Function CTA |
| 2 | **Recognition** | "She gets it" | "You're not imagining it." Four or five lines in *her* words: *wide awake at 3, mind racing · tired but wired · dreading bedtime · everyone says "it's just menopause"* | Hers perimenopause |
| 3 | **Founder letter** | Trust without reviews | 120–180 words, portrait, signature: 15 years, what she tried, why she made it. Button after. | Hers signed doctor block; Alison Roman tone |
| 4 | **The ritual** | Make the product concrete | 3 numbered steps on a dark-amber band: *Keep it by the bed → Take it when you wake → Drift back and wake up clear-headed*. Honest timing only. | Prose "How to use" band |
| 5 | **What's inside** | Transparency (Value 1) | Ingredient cards: macro photo · name · **exact mg** · one plain-English line on why. Then a "what's NOT inside" ticker: only claims that are true (e.g. no melatonin, non-habit-forming). Button after. | Prose ingredient cards + ticker + index |
| 6 | **Proof** | Reduce doubt | Tester stories with first name, age and stage ("Linda, 54, post-menopausal"); advisor or clinician note; stats grid **only with real data**; press row later | Prose stats + reviews; Alo proof stack |
| 7 | **Founding member benefits** | Reward joining | 3 privileges: first-batch priority · founding price locked · a personal note from the founder / early say on Cool & Calm. Button. | Alo "One account, maximum benefits" |
| 8 | **The 3:17 system** | Long-term reason to stay | Soft tiles for Cool, Calm, Travel, Restore, marked "in development". "Vote for what we make next" appears on the thank-you page. | Prose product row, greyed out |
| 9 | **Mission** | Meaning beyond the product | "One million rested women" + giving/advocacy promise + one quiet faith line | Alo Gives |
| 10 | **FAQ** | Remove final objections | 2 columns. Answers: grogginess? habit-forming? with my medications/HRT? ingredients? when does it ship? price? money-back? | Prose FAQ layout |
| 11 | **Final CTA (night again)** | Last chance to convert | Dark band, headline, form repeated | Aplós dark bands |
| 12 | **Footer** | Legal and trust | FDA disclaimer, privacy link, contact, Instagram | Prose disclaimer box |

**Mobile (most launch traffic comes from social):**
- Hero on a 390px screen: headline (2–3 lines) → email field → button → proof line, all visible without scrolling. The bottle sits *behind or beside* the text, not above it.
- A **sticky bottom bar** with the button appears after the hero scrolls away (Prose uses a sticky order CTA).
- Email input font ≥ 16px so iPhones don't zoom in; tap targets ≥ 48px; `type="email"` and `autocomplete="email"`.

### 5.1 After signup: the thank-you screen (where waitlists grow)
From the earlier research (Robinhood, Dropbox, Prose quiz pattern):
1. **"You're in. You're #[position] of the first [N]."** A real position, never inflated.
2. **Referral:** "Share with a friend who's awake at 3 a.m. too. Each friend who joins moves you up [X] places." Pre-written text message and WhatsApp share (this audience shares by text and group chats more than on X).
3. **Two-question micro-quiz** (Prose-style big tap targets, with a "Why we ask" note): *What time do you usually wake up?* · *Which stage are you in: pre-, peri- or post-menopause, or not sure?* This data personalises email and shows the size of each segment.
4. **"Tell us your 3:17 story"** (optional text box). This gives you real language for ads and copy, plus possible testimonials with permission.
5. **Vote on the next product** (Cool / Calm / Travel / Restore). It builds engagement and gives you real demand data.

### 5.2 Email welcome sequence (keeps the list warm until launch)
1. Immediately: the founder letter in full, plus "reply and tell me your story" (she reads them).
2. Day 3: the ingredient story, one ingredient at a time, with exact amounts.
3. Day 7: "Why 3 a.m.?", education on menopause and night waking (no fear, no hype).
4. Monthly until launch: behind the scenes (bottle sampling, first batch), then 48-hour founding-member early access at launch.

---

## 6. Design tokens (derived from the bottle, checked for contrast)

### 6.1 Colour

| Token | Hex | Where it comes from | Use |
|---|---|---|---|
| Night | `#15110E` | the room at 3:17 | Hero and final CTA backgrounds |
| Espresso | `#2B1E16` | dark amber glass in shadow | Primary button on light; dark bands |
| Amber | `#8C4A12` | bottle glass | Accent bands, hover state, image tint |
| Amber deep | `#6E3A10` | bottle glass, lit edge | Alternative primary button |
| Gold | `#B89148` / light `#D4B06A` | label foil | **Wordmark and details on dark only** |
| Sand | `#E6D7BE` | label | Section bands, cards |
| Parchment | `#F7F1E6` | label, lit | Main page background |
| Ink | `#1E1813` | product text on label | Body text and headlines on light |
| Muted ink | `#5E5247` | — | Secondary text |

**Contrast checks (WCAG 2; 4.5:1 needed for body text, 3:1 for large text):**

| Pair | Ratio | Verdict |
|---|---|---|
| Gold #B89148 on Sand | **2.06** | ✗ fails even as large text; avoid on the web |
| Gold #B89148 on Parchment | **2.60** | ✗ fails |
| Light gold #D4B06A on Sand | **1.45** | ✗ nearly invisible |
| Gold #B89148 on Night | **6.42** | ✓ passes for all text |
| Light gold #D4B06A on Night | **9.14** | ✓ excellent |
| Parchment on Night | **16.70** | ✓ |
| Ink on Parchment | **15.63** | ✓ |
| Ink on Sand | **12.41** | ✓ |
| Muted ink on Parchment | **6.73** | ✓ |
| Parchment on Espresso (button) | **14.37** | ✓ |
| Parchment on Amber deep (button) | **8.21** | ✓ |
| Night on Light gold (gold button on dark) | **9.14** | ✓ possible accent button inside the night hero |

**Takeaway:** the bottle's own colour combination (gold on sand) cannot carry text on a screen. Either put gold on dark (Direction B), or use a darker bronze such as `#7A5A22` (~5:1 on parchment) when the wordmark must sit on light.

### 6.2 Type

| Role | Free option | Premium upgrade | Rules |
|---|---|---|---|
| Wordmark "3:17" | — (custom) | — | Old-style serif figures; the colon as two small gold dots (it doubles as a clock) |
| Headlines | **Cormorant Garamond 500** or **Newsreader** | Canela, Financier Display (Function), GT Super | ≥ 32px only; 40–64px desktop, 32–40px mobile; tight leading 1.05–1.15 |
| Body and UI | **Inter** or **Figtree** | Suisse Int'l (Aesop) | **18px body**, 1.6 line height, max ~65 characters per line |
| Labels/kickers | same sans, 13–14px, +0.08em letter-spacing, uppercase | — | Never the only carrier of key information |

### 6.3 Shape and spacing
- Buttons: **solid, 4–6px radius** (Savor-like), about 56px tall, full-width on mobile. Pills (Function) are friendlier; square (Aesop) is more austere. Pick one and use it everywhere.
- Section spacing 96–128px on desktop, 64–80px on mobile (Aesop/Savor scale).
- No drop shadows. Use hairline borders at `rgba(30,24,19,.15)`.

### 6.4 Photography and texture
1. **Hero:** amber bottle on a nightstand, one warm lamp, deep brown shadows, a hint of linen (Aesop fragrance lighting).
2. **Macro:** light passing through amber glass, a drop of liquid, the gold foil catching light (Savor textures). Use these as section dividers.
3. **Women:** real 45–65-year-olds, rested and in morning light, *not* staged insomnia. Show the "after" state (Hers principle).
4. **The label close-up:** sand paper texture and the gold 3:17. It proves the physical quality of a product people can't touch yet.

---

## 7. Copy starters (truthful, no hype)

**Hero kicker:** 3:17 a.m.

**Headline options:**
- A. "For the hour you wake — and can't fall back asleep." *(names the exact moment)*
- B. "Wide awake at 3:17? So was I. For fifteen years." *(founder, validation)*
- C. "Back to sleep, not back to the ceiling." *(outcome, lighter)*
- D. "Made for the middle of the night." *(simple, luxury-quiet)*

**Subhead:** "Natural middle-of-the-night sleep support for women in menopause. Keep it by your bed. When you wake, it helps you drift back to sleep."
*(Keep to structure/function claims; see the earlier report §8.)*

**Button options to test:** "Join the founding list" · "Reserve my place" · "Get first access". Avoid "Submit" and "Sign up".

**Under the button:** "One email when we launch, plus a note from our founder. No spam, ever."

**Proof line:** "Join [N] women who are done accepting 3 a.m." (use a live, real number, and hide it until it's above ~200)

**Final CTA headline:** "Tonight, when you wake at 3:17, be ready."

**Recognition section headline:** "You're not imagining it. And you're not alone."

---

## 8. Handling faith with care ("Approved by God")

The value is sincere and central to the founder, and it can build real affinity. The design question is *how loud* it should be on a page that also needs to convert people outside that community.

- **Recommended:** let it shape tone (service, stewardship, truth) and state it once, simply, in the founder letter and/or the mission section. For example: "3:17 is built on faith — and on the belief that how we serve you matters as much as what we sell."
- **An opportunity for the founder to confirm:** Zephaniah 3:17 reads, in part, "he will rest in his love" (KJV). The doc doesn't mention this, so I haven't assumed it's intended. If the name was chosen partly for this verse, it's a beautiful quiet layer: a line in the founder letter or on the inside of the label, not in the hero. **Ask her first.**
- Avoid making faith a headline or a condition of belonging. The brand vision's community is "women who feel dismissed", which is broader.

---

## 9. What to measure and test

**Targets (from the earlier report):** cold traffic averages 2–5% visitor→signup; good is 8–20%; warm community traffic can reach 25%+.

**Instrument from day one:** visit → signup · signup → quiz completion · signup → share · referrals per sharer · traffic source · mobile vs desktop.

**Test order (one at a time, biggest lever first):**
1. Headline: moment (A) vs founder (B)
2. Night hero (B) vs light apothecary hero (A)
3. Button wording: "Join the founding list" vs "Reserve my place"
4. Proof line shown vs hidden (only once the number is meaningful)
5. Founding privileges section above vs below the ingredients

**Guardrail:** don't test fake scarcity or fake counters. It breaks the "truthful" value and future customers will notice.

---

## 10. Compliance reminders

Covered in detail in `research/report/waitlist-research.md` §8. In short: structure/function claims only ("helps you fall back asleep", never "treats insomnia"), the FDA disclaimer on the page, honest testimonials with typical results and disclosed connections, "studied ingredients" not "clinically proven" unless the finished formula was tested, and a privacy link beside the form. **Before launch, have a lawyer review the claims, the referral rules and the email consent.**

---

## 11. Sources (Refero IDs)

**Screens:** Aesop Body Care Duo `7a61125e-e74d-4ab0-8dd8-a75cc4b5b70d` · Aesop Marrakech `0e8e3926-c8a8-48ca-882b-e0aabcd8007f` · Aesop fragrance catalog `9ffc9899-752b-4cff-b8ca-ca42a875a19c` · Prose Scalp Serum `539e88ba-7122-43e5-89d1-46ee77b25a6e` · Prose skincare landing `31719a5c-b67b-4479-b157-6c518aeacea1` · Prose email modal `8f2fd292-7da8-4b2c-9b51-ef803b6dbb2a` · Prose quiz `37684eed-c2eb-4923-b3e7-f9d66b3fad27` · Prose ingredient index `2d2e194e-6d70-4583-977b-e6453a97376c` · Hers perimenopause `f0497969-3404-4186-97ad-1eb5587af22d` · Alo Wellness Club `09207b01-bb13-40f8-ad51-c01cd0d3b830` · Alo Gives `a8c9cd31-f1eb-4fa4-9201-70977eaafdeb` · Hello Klean `fdeaf0d4-d341-40c9-903c-ece06b9af85d`

**Styles:** Aesop/NGLORA `58407c0f-2290-46d4-9d54-08d9ca5deeac` · Aplós `807d6288-4aee-48b6-b9a8-2898be533ba8` · Amrit Palace `5cf04958-fc79-40fa-be2a-cd968f6e81d6` · Function Health `22eb724b-df5e-46e2-85f0-27e72dbc0a90` · Savor `d89bd263-9846-4fd1-9505-f1f07f1eaa4a` · Alison Roman `0e9417ba-1c8d-421a-8880-047eff20959f` · Emma Lewisham `4a0f3826-2db5-4029-9051-4b20626be38b` · Leandra Isler `2c3cdb65-d17a-475f-8b59-9d8d6f392e48` · Drepute `aa138c1f-2b42-4b10-9a3d-bdb09c216c99`

**Related:** `research/report/waitlist-research.md` (waitlist benchmarks, referral mechanics, supplement conversion, the 45+ audience, compliance).
