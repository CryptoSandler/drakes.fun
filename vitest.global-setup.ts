import { takeSuiteLock, type SuiteLock } from "./suite-lock";

/**
 * One measuring suite at a time, on this whole machine.
 *
 * Named by `vitest.config.ts` as `globalSetup`, so it runs once in the main
 * process before any test file loads and its returned function runs after the
 * last one finishes.
 *
 * THIS REPOSITORY HAD NO `globalSetup` AND NOW HAS ONE FOR EXACTLY THIS. Its
 * suite does not need a database lock — it has no shared database to serialise
 * against — but it competes for the same cores as five other projects on this
 * machine, and that is what the lock below is about. `suite-lock.ts` carries
 * the measurements; it is the same file in all six repositories on purpose.
 */
export async function setup(): Promise<() => void> {
  const suiteLock: SuiteLock = await takeSuiteLock();
  // Closing the descriptor is what releases it — and so is this process dying,
  // which is why there is nothing here to forget.
  return () => suiteLock.release();
}
