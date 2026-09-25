// Type declarations for the type check only (not loaded by the browser).
interface WaitlistConfig {
  signupEndpoint?: string;
  quizEndpoint?: string;
  siteUrl?: string;
  realSignupCount?: number | null;
  foundingBatchSize?: number | null;
}
interface Window {
  WAITLIST_CONFIG?: WaitlistConfig;
}
