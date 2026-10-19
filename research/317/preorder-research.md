# 3:17: Pre-order research

*Research for the 3:17 pre-launch page · October 2026 · Sources: Refero (real live sites), public campaign data, platform and legal guidance. Links are at the end.*

---

## 0. The short version

**Nobody publishes a verified conversion rate for a supplement pre-order landing page.** The best-documented results come from crowdfunding agencies and a handful of famous launches. Founders with no audience who did well all followed the same pattern:

1. **Ask for an email first.** Keep it to one field, as the site does now.
2. **On the next screen, ask for a small refundable reservation** ($1–$5) that locks in a founding price. Agencies report that depositors buy at many times the rate of email-only signups.
3. **Add a referral loop** with a reward that's easy to reach.
4. **Open the cart soon after reservations open.** Within about 30 days, conversion holds up. Past three months, it collapses.

For 3:17, keep `index.html` exactly as it is (email only). Add the reservation as step 2 on `thanks.html`. **Don't take full pre-payment until the ship month is a real date.** US mail-order law ties any money you take to a shipping promise you can keep (§5).

---

## 1. Who did it best: the evidence

None of these brands started with literally zero reach. Each borrowed reach from somewhere: friends, a viral post, press, a previous campaign or an agency's ad budget. That's the transferable lesson.

| Campaign | Product | Reach at the start | Result | The mechanic |
|---|---|---|---|---|
| **Harry's** (2013) | Razors | Founders plus roughly 200 friends and contacts | ~100,000 emails in one week, 77% of them from referrals | A two-page microsite. Page 1 asks for an email. Page 2 gives a personal share link with reward tiers (the first tier needed 5 friends). |
| **LaunchBoom reservation funnel** (agency, since 2017) | Hardware and games | Paid Meta ads | Depositors were reported as ~30× more likely to buy than email-only leads. Typical conversion was 35–45% against 5–10%. One client turned ~10,000 emails into 2,488 deposits and $155,804 in 24 hours. | Email, then a "reservation bridge": a refundable $1 to lock the best price. *Agency-reported.* |
| **Soylent** (2013) | Meal-replacement powder | A founder blog post that went viral on Hacker News | Hit its $100k goal in about 2 hours. Roughly $1.5M in pre-orders. | Kickstarter rejected it as a nutritional supplement, so it self-hosted the campaign on its own domain. |
| **Sprayable Sleep** (2015) | Melatonin spray | A previous successful campaign (Sprayable Energy) | $409,798 from 4,924 backers against a $15k goal (Indiegogo) | A low $15 entry tier and a clear "welcome to the beginning of tired" line |
| **Embr Wave** (2017) | Hot-flash wristband | MIT press coverage (most inbound interest came from women in menopause) | $629,856 from 2,837 backers (Kickstarter) | An early-bird discount and a deadline |
| **Scalarly client** (agency case study) | Natural sleep supplement, UK | Zero: no social accounts, no list | The first batch sold out in 72 hours. 62% of first-week sales came from waitlist members. | Four months of list building, then a founding-member launch, 40 influencers at once and a waitlist-only limited first batch. *Agency-reported.* |

---

## 2. Benchmarks to judge the page against

| Metric | Number | Source |
|---|---|---|
| Wellness landing pages, median conversion | **8.2%** (health and wellness overall: 5.1%) | Unbounce |
| Health and wellness pages written at a 5th–7th grade reading level | **10.8%** median | Unbounce |
| Email traffic compared with paid traffic, health and wellness | Converts about **2×** better | Unbounce |
| Desktop compared with mobile, health and wellness | Desktop converts **22% better**, but mobile brings **7×** the traffic | Unbounce |
| Open waitlist → paying customer | **2–3%**. About 20% if people get access within a month, under 10% after three months. | Lenny Rachitsky via mean.ceo |
| Free list compared with a $5-deposit list at launch | 2–5% compared with **15–30%** | Blazon (agency) |
| Visitor → reservation target, products under $500 | **2%** | Prelaunch.com |
| Subscriber → reservation target | **15%** | Prelaunch.com |

---

## 3. What Refero shows

Refero has **no supplement pre-order page**, and a style search for "supplement", "menopause" or "sleep wellness" returns nothing. The closest real screens, with the parts worth copying:

- **New Balance, coming-soon product page** (screen `166784a6-38cf-4e0d-a2ca-c457771493c0`, flow 11853).
  - The page shows a "Coming soon" label, a countdown, an exact availability date *and time*, and one black "Notify me" button.
  - The email form opens in a side sheet, which then switches to a "Subscribed!" state.
  - Lesson: a specific date beats "soon". A countdown is only honest when it counts down to a real date.
- **Seed PM-02 Sleep + Restore product page** (screen `ed73f73f-f6bc-4996-88c7-fd8576b87f73`). This is the buy box to copy at launch:
  - a one-line benefit with an asterisk
  - each ingredient listed with its exact dose
  - the price with a promo chip
  - "30-day supply delivered monthly. Pause or cancel anytime."
  - one solid button
  - a reassurance line under the button (a 30-day guarantee and free shipping)
- **Seed quiz flow** (flow 12731, 35 steps).
  - It asks questions and teaches about the product first.
  - Then it asks for an email for 25% off (step 13), then a phone number for 30% off with a Skip option (step 15), then shows a recommended routine with discounted prices.
  - Lesson: ask for commitment only after giving value, one optional ask at a time. 3:17's quiz on `thanks.html` already sits in the right place.
- **Hers, Desire gummies product page** (screen `85f70c5b-6a9c-4f61-b57b-a98f413b3b04`). A modal lets people choose between subscribing and a one-time purchase.
- **Lulu and Georgia, pre-order product page** (flow 1660). Pre-order status appears inline in the normal buy box, not on a separate page.

---

## 4. Recommended funnel for 3:17

| Step | Where | What |
|---|---|---|
| 1 | `index.html` | **Email only** (already built). Copy written at a 5th–7th grade reading level. |
| 2 | `thanks.html`, top | **Founding reservation**: a refundable $1–$5 that holds a first-batch bottle at the founding price. Say plainly that it's fully refundable, that nothing else is charged now, and when the batch ships (a real month). |
| 3 | `thanks.html` | Share link (already built), plus a **real, reachable reward** at a small number of friends. The owner sets the reward; never invent one. |
| 4 | Email | Send 6–8 emails: the founder story, an ingredient-by-ingredient reveal, then open the cart to depositors first for 24–48 hours. |
| 5 | Launch | Open the cart **within about 30 days** of opening reservations. |

**Traffic when there's no audience.** Borrow reach where this audience already spends time:

- **Platforms:** 74% of US adults aged 50–64 use Facebook (78% of women), and 85% use YouTube.
- **Places on them:** menopause Facebook groups, podcasts and newsletters.
- **The founder's own network:** Harry's started from about 200 people.

**Meta ad copy.** Meta's personal-attributes rule treats menopause and life stage as protected, so ads can't say or imply that the reader has a condition. "Your menopause" or "Do you wake at 3am?" will be rejected. Write about the product or the moment instead, for example "Made for the 3:17 wake-up".

---

## 5. Constraints and risks (need owner or legal sign-off)

- **FTC Mail Order Rule (US).**
  - If you take money for an order, you need a reasonable basis to ship by the date you state, or within 30 days if you state none.
  - If shipping slips, you must offer the buyer a choice to cancel for a prompt refund.
  - Treat a deposit as covered too. Full pre-payment must wait until the `[Month]` placeholder is a real, supportable date.
- **Kickstarter.** It rejected Soylent as a nutritional supplement, and says it avoids anything claiming to cure, treat or prevent a condition. Check the current rules before planning on it. Indiegogo hosted Sprayable Sleep. Self-hosting on this site is the Soylent route.
- **Claims.** Supplements may make structure/function claims ("supports…", with the standard disclaimer) but not disease claims. Insomnia and hot-flash wording needs legal review. The `.ph` placeholders already flag this.
- **Meta data restrictions (since January 2025).** Health and wellness advertisers can lose Purchase and Add to Cart optimisation, and sometimes lead events too. Check the classification in Events Manager before planning spend around purchase events.
- **No invented numbers.** Don't show a reservation counter unless the count is real (AGENTS.md rule).
- **Shopify, if used later.** Shopify's native pre-order button charges the full price. Deposits and charge-later need Shopify Payments plus a pre-order app.

---

## 6. Numbers to watch

| Stage | Target |
|---|---|
| Visitor → email | ≥ 8% (the wellness median) |
| Email → reservation | ~15% |
| Visitor → reservation | ~2% |
| Reservation → purchase at cart open | 30%+ |
| Days from reservations opening to cart open | ≤ 30 |

---

## 7. Sources

- Harry's: https://referralrock.com/blog/harrys-referral-program/ · https://www.prefinery.com/blog/referral-programs/prelaunch-campaign/harrys/
- LaunchBoom: https://www.launchboom.com/crowdfunding-guides/the-7-step-launchboom-framework-how-to-get-funded-on-day-one-of-your-kickstarter-campaign · https://www.launchboom.com/crowdfunding-tips/how-to-promote-your-kickstarter-campaign-updated/ · https://stonemaiergames.com/prelaunch-promos-accessories-and-expansions-ks-lesson-281/
- Soylent: https://en.wikipedia.org/wiki/Soylent_(meal_replacement) · https://www.forbes.com/sites/karstenstrauss/2013/05/31/wonder-drink-explodes-on-crowd-funding-campaign/ · https://boingboing.net/2013/05/23/kickstarter-for-soylent-defa.html
- Sprayable Sleep: https://www.backerkit.com/projects/sprayable-sleep-first-topical-melatonin-spray
- Embr Wave: https://www.kickstarter.com/projects/embrwave/embr-wave-a-thermostat-for-your-body · https://www.costco.com/f/-/connection-fyh-keeping-your-cool-october-2023
- Scalarly: https://scalarly.com/case-studies/brand-launch-consumer.html
- Benchmarks: https://unbounce.com/conversion-benchmark-report/healthcare-wellness-conversion-rate/ · https://hortongroup.com/blog/healthcare-website-conversion-benchmarks-is-your-practice-turning-visitors-into-patients/ · https://christopholivierconsulting.com/conversion-rate-benchmarks/ · https://blog.mean.ceo/startup-waitlist-conversion-statistics/ · https://blazonagency.com/post/waitlist-strategy · https://www.prelaunch.com/blog/product-launch-metrics
- Platforms and policy: https://www.pewresearch.org/internet/fact-sheet/social-media/ · https://ragingagency.com/blog/meta-personal-attributes-rule-wellness-brands-2026/ · https://www.curvecompliance.com/ad-account-rescue/meta-ad-rejected-personal-attributes · https://www.elmtmarketing.com/blog/meta-ads
- FTC Mail Order Rule: https://www.loeb.com/en/insights/publications/2014/10/ftc-updates-its-mail-order-rule · https://paykings.com/blog/ftc-mail-order-rule-shipping-delays/
- Shopify pre-orders: https://www.stoqapp.com/blog/ways-to-collect-payment-for-preorders · https://getdownpay.com/blog/ultimate-guide-to-deposits-and-partial-payments-on-shopify
- Refero: screens `166784a6-38cf-4e0d-a2ca-c457771493c0`, `ed73f73f-f6bc-4996-88c7-fd8576b87f73`, `85f70c5b-6a9c-4f61-b57b-a98f413b3b04`; flows 11853, 12731, 12732, 1660.
