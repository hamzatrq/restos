// `06-F30`..`06-F32` acceptance wiring. No Testcontainers and no global setup: the origin's
// outbox and the entitlement source are both PORTS (`outbox.ts`, `entitlement.ts`), so the suite
// runs anywhere `pnpm test` does. The Postgres implementation of the outbox is what `06-F30`'s
// single-writer clause needs and is exercised by the gateway's own suite, not by this one.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
