// Coverage gate per T-01-04 check contract (20 §2.2): folds are in the mandatory
// 100%-branch-coverage set. Plain `vitest run` (the "test" script) is unaffected;
// `pnpm --filter @restos/sync-client test:coverage` enforces the threshold.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/folds/**"],
      thresholds: { branches: 100 },
    },
  },
});
