import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // One measuring suite at a time across every repository on this machine.
    // See vitest.global-setup.ts and suite-lock.ts.
    globalSetup: ['./vitest.global-setup.ts'],
  },
})
