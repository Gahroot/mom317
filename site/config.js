// 3:17 founding-list settings. Edit this file only; no code changes needed.
window.WAITLIST_CONFIG = {
  // Where signups are sent (POST, JSON body: { email, ref, source }).
  // Leave empty to run in preview mode: nothing is sent, signups stay in this browser only.
  // Your endpoint may reply with JSON { "referralCode": "abc123", "position": 182 }.
  // Both are optional. The page shows a position only when your endpoint returns one.
  signupEndpoint: "",

  // Where quiz answers are sent (POST, JSON body: { email, wakeTime, stage, next }).
  quizEndpoint: "",

  // Public address of the site, used in share links. Empty = current address.
  siteUrl: "",

  // Only fill in a real number from your email list. Leave null to hide the count.
  realSignupCount: null,

  // Size of the founding batch, e.g. 317. Used only with a real position from your endpoint.
  foundingBatchSize: null
};
