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
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
