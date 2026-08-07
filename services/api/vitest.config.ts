// B-2 acceptance wiring (plans/wave-1/backoffice-catalog.md). No Testcontainers and no global
// setup: this host's store is a port (services/api/src/users.ts) and B-2 supplies the in-memory
// implementation, so the suite runs anywhere `pnpm test` does.
//
// `testTimeout` is 30 s, not the 5 s default, and the reason is measured rather than defensive:
// `01-F61`'s Argon2id cost floor (19 MiB, t=2) makes every login deliberately slow, and four
// oracle suites in this repo have already flaked on a 5 s default.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000,
    /**
     * ⚠ 120 s, and the reason is measured. `startable.test.ts` SPAWNS THE REAL SERVER in a
     * `beforeAll` — the declared `start` script, on an ephemeral port — and the boot hashes a
     * bootstrap credential at `01-F61`'s Argon2id floor. Alone that is comfortable; under
     * `pnpm test --force --continue`, with nine other packages competing for cores, the hook
     * measured **62 s against a 60 s budget** and vitest reported `35 tests | 35 SKIPPED`.
     *
     * A skipped suite is the dangerous outcome, not a failed one: the task goes red with no
     * assertion having run, so the failure names no test and reads like infrastructure noise.
     * Raised rather than made cheaper — a fake boot would delete the one property this suite
     * exists for, that `services/api` can actually be started (it could not be, for a whole wave).
     */
    hookTimeout: 120_000,
  },
});
