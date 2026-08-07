import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Two environments split by filename, the shape `packages/ui` and `apps/pos-electron` both adopted:
 * a DOM is only paid for where something is actually rendered. `.dom.test.tsx` opts in; the pure
 * grid/money logic and the structural guards stay in a node environment where a DOM is dead weight.
 *
 * ⚠ `testTimeout` is raised deliberately, and **it is set INSIDE each project, not once at the
 * root** — that distinction cost a green suite. A root-level `testTimeout` does **not** inherit
 * into `projects[]`: this file carried `testTimeout: 60_000` at the root and the runner still
 * failed with *"Test timed out in 5000ms"*, because each project's own `test` block is the one
 * that applies. Silent, and invisible until something genuinely slow runs.
 *
 * What is genuinely slow: `01-F61`'s Argon2id cost floor (OWASP `m=19456,t=2,p=1`) is DELIBERATELY
 * expensive, ~0.4 s per verify, and any suite that logs in pays it several times. Under
 * `pnpm test --force --continue` — nine other packages competing for cores — a login test measured
 * 6.1 s against the 5 s default. It passes alone and fails in the full run, which is the worst
 * shape: it reads as a flake and is a real, reproducible timeout. Raised, never weakened: cutting
 * the cost parameters would trade a credential's strength for a green CI light, which is exactly
 * what `01-F61` exists to prevent.
 */
const TIMEOUT_MS = 60_000;

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: TIMEOUT_MS,
    projects: [
      {
        plugins: [react()],
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          environment: "node",
          testTimeout: TIMEOUT_MS,
        },
      },
      {
        plugins: [react()],
        test: {
          name: "dom",
          include: ["src/**/*.dom.test.tsx"],
          environment: "happy-dom",
          globals: false,
          testTimeout: TIMEOUT_MS,
        },
      },
    ],
  },
});
