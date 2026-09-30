window.PVT_CONFIG = Object.freeze({
  version: "1.1.0",
  testType: "duration",
  durationMs: 0.5 * 60 * 1000,
  fixationMs: 400,
  minIsiMs: 1000,
  maxIsiMs: 10000,
  tooFastMs: 150,
  lapseMs: 500,
  sleepAttackMs: 30000,
  stimulusTimeoutMs: 600000,
  feedbackEnabled: true,
  feedbackMs: 1500,
  noFeedbackPauseMs: 500,
  interTrialPauseMs: 500,
  apiEndpoint: "/api/pvt/session"
});
