// 3:17 founding-list settings. Edit this file only; no code changes needed.
window.WAITLIST_CONFIG = {
  // Where signups are sent (POST, JSON body: { email, ref, source, page, landing_page, utm_source, utm_medium, utm_campaign }).
  // With the Vercel rewrite in vercel.json this will be "/api/signup".
  // Leave empty to run in preview mode: nothing is sent, signups stay in this browser only.
  // Your endpoint may reply with JSON { "referralCode": "abc123", "position": 182 }.
  // Both are optional. The page shows a position only when your endpoint returns one.
  signupEndpoint: "/api/signup",

  // Where quiz answers are sent (POST, JSON body: { email, wakeTime, stage, next }).
  quizEndpoint: "/api/quiz",

  // Cookieless page events (pageview, cta_click) sent with navigator.sendBeacon, e.g. "/api/event".
  // Empty = nothing is sent.
  eventsEndpoint: "/api/event",

  // Public address of the site, used in share links. Empty = current address.
  siteUrl: "",

  // Only fill in a real number from your email list. Leave null to hide the count.
  realSignupCount: null,

  // Size of the first batch (2,500, targeted for December 1, 2026). Used only with a real position from your endpoint.
  foundingBatchSize: 2500,

  // Optional founding reservation on the thank-you page (step 2 after the email).
  // A checkout link (https only) for a small refundable deposit, e.g. a Stripe Payment Link.
  // The card stays hidden on the live site until BOTH of these are set.
  // Before turning it on: fill in the real ship month, founding price and regular price in thanks.html,
  // and make sure refunds work exactly as the page promises ("full refund any time before it ships").
  reservationUrl: "",
  // Shown on the button exactly as written, e.g. "$1". Must match the checkout link.
  reservationAmount: "",

  // Optional referral reward on the thank-you page, e.g. 3 and "a free second bottle".
  // Shown only when both are set. Your email service must count referrals (the `ref` field)
  // and send the reward itself; the page only describes it.
  referralGoal: null,
  referralReward: ""
};
