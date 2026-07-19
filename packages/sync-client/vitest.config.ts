// Coverage gate per T-01-04 check contract (20 §2.2): folds are in the mandatory
// 100%-branch-coverage set. Plain `vitest run` (the "test" script) is unaffected;
// `pnpm --filter @restos/sync-client test:coverage` enforces the threshold.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // T-01-06 X8 (>500 backlog) drives 1600 events through the landed store's
    // duplicate-id global_seq adoption (device-store.ts adoptGlobalSeq → full
    // recomputeFolds per event), which is O(N²) at rush-ledger scale — correct but
    // ~20 s wall-clock, past vitest's 5 s default. Raised here to keep the genuinely
    // heavy exit-run scenario green, mirroring services/sync-gateway's testTimeout for
    // its Testcontainers rung. The perf debt itself is store-owned (T-01-04b's
    // incremental engine covers append/ingest-new, not the reorder-on-adoption path).
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/folds/**"],
      thresholds: { branches: 100 },
    },
  },
});
