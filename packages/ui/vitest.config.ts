import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Most of this package's suites are structural or arithmetic and need no DOM — they read source
 * text or re-derive colour maths. The `.dom.test.tsx` suffix opts a file into a real DOM, so the
 * cost is paid only where something is actually rendered.
 *
 * That there was no DOM environment AT ALL until now is a finding, not a preference: an oracle
 * reviewer noted that **no test in `packages/ui` ever rendered a component**, so every guard here
 * was about how the code is WRITTEN and nothing observed what it DOES. `27-F67`'s training
 * inversion was token-correct and never seen; `01-F59`'s "greyed is not disabled" could only be
 * asserted by grepping for the `disabled` attribute.
 */
export default defineConfig({
  plugins: [react()],
  test: {
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
          // happy-dom over jsdom: this package renders inline styles and reads computed values,
          // which both support, and happy-dom starts in a fraction of the time on a suite that
          // will grow with every screen.
          globals: false,
          /**
           * ⚠ **Raised from vitest's 5 s default because CI is slower than any dev machine here,
           * and the 5 s default is a documented flake source in this repo** (`AGENTS.md`: four
           * subprocess-spawning oracle suites have flaked on it across two packages).
           *
           * Measured 2026-08-17: `item-tile.dom.test.tsx` renders a 6,912-cell cross-product and
           * takes ~46 s for its 45 tests on a GitHub `ubuntu-latest` runner, where two of the
           * heavier sweeps crossed 5 s and failed as TIMEOUTS — not assertions. The same file is
           * comfortably green locally, which is exactly the shape that gets read as a regression.
           *
           * 20 s and not `0`: an unbounded timeout turns a genuine hang into a job that runs
           * until the runner's own limit, and turns a real performance regression into silence.
           * If a single `.dom` test ever needs more than 20 s, that is a finding about the test.
           */
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
    ],
  },
});
