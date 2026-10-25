// Type declarations for the type check only (not loaded by the browser).
interface WaitlistConfig {
  signupEndpoint?: string;
  quizEndpoint?: string;
  eventsEndpoint?: string;
  siteUrl?: string;
  realSignupCount?: number | null;
  foundingBatchSize?: number | null;
  reservationUrl?: string;
  reservationAmount?: string;
  referralGoal?: number | null;
  referralReward?: string;
}
interface Window {
  WAITLIST_CONFIG?: WaitlistConfig;
}
