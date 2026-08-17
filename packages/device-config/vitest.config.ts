import { defineConfig } from "vitest/config";

/**
 * ⚠ `testTimeout` is raised for one reason and it is not flakiness-papering: `01-F61`'s Argon2id
 * floor makes every `hashPin`/`verifyPin` deliberately expensive (~0.4 s each, asserted as
 * PARAMETERS and never as elapsed time), and `src/__acceptance__/dev-staff-seed.test.ts` seeds a
 * three-member roster several times per test. `apps/pos-electron/vitest.config.ts` carries the
 * same value with the same reasoning and the measurement behind it (a PIN test at 6.3 s against a
 * 5 s default — passing alone, failing under the parallel run, which reads as a flake and is a
 * real timeout). Raised, never weakened.
 */
export default defineConfig({
  test: {
    testTimeout: 60_000,
  },
});
