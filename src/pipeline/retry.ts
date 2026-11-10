// The wait before the next try of a failed fetch or AI step.
// Used by process.ts so every retry in the pipeline follows one schedule.

const RETRY_DELAYS_MS = [60e3, 300e3, 1800e3, 7200e3];
const LONGEST_DELAY_MS = 21600e3;

// `attempts` is how many tries have already failed before this wait (0 = the first failure): 1 min, 5 min, 30 min, 2 h, then 6 h.
export function nextRetryDelay(attempts: number): number {
  return RETRY_DELAYS_MS[attempts] ?? LONGEST_DELAY_MS;
}
