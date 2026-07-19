// T-01-07 acceptance wiring (plans/wave-0/kernel-tasks.md). One Testcontainers
// Postgres for the whole run (global setup); per-test isolation is by fresh
// org_id, never truncation. pool: "forks" so the connection URL exported via
// process.env in globalSetup propagates to worker processes.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    globalSetup: ["./src/__acceptance__/global-setup.ts"],
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
