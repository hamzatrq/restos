import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Two environments split by filename, the shape `packages/ui` and `apps/pos-electron` both adopted:
 * a DOM is only paid for where something is actually rendered. `.dom.test.tsx` opts in; the pure
 * grid/money logic and the structural guards stay in a node environment where a DOM is dead weight.
 *
 * ⚠ `testTimeout` is raised deliberately. Four subprocess-spawning oracle suites in this repo have
 * flaked on vitest's 5 s default across two packages, and `commandment-5.oracle.test.ts` spawns
 * `tsc` — the same PROPERTY, so it takes the same allowance rather than waiting to be discovered.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 60_000,
    projects: [
      {
        plugins: [react()],
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [react()],
        test: {
          name: "dom",
          include: ["src/**/*.dom.test.tsx"],
          environment: "happy-dom",
          globals: false,
        },
      },
    ],
  },
});
