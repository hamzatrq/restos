/**
 * **AUTHORED FROM SPEC TEXT ONLY** — acceptance wiring for `services/jobs` (`20 §4.2`'s Auditor
 * host). One Testcontainers Postgres + one Redis for the whole run (`global-setup.ts`); per-test
 * isolation is by fresh `org_id`, never truncation (the `services/sync-gateway` suite's rule).
 *
 * `pool: "forks"` so the connection URLs exported via `process.env` in `globalSetup` reach the
 * worker processes.
 *
 * ⚠ The timeouts are generous for a measured reason, not a defensive one. `auditor-host.test.ts`
 * SPAWNS THREE REAL WORKER PROCESSES in `beforeAll` and then waits for two complete audit passes
 * over four orgs — under `pnpm test --force --continue` with nine other packages competing for
 * cores, that is minutes, and a hook that times out reports `SKIPPED` tests, which is the dangerous
 * outcome: the task goes red with no assertion having run and the failure names no test
 * (`services/api/vitest.config.ts` records the same lesson).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    globalSetup: ["./src/__acceptance__/global-setup.ts"],
    include: ["src/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
