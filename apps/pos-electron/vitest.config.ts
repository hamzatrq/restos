import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Two environments, split by filename — the same shape `packages/ui` adopted in `ff7b750`, and
 * for the same reason: a DOM is only paid for where something is actually rendered.
 *
 * This app had **no DOM environment at all**, so `src/main/`'s seam was covered and
 * `src/renderer/Counter.tsx` — the actual counter screen, the one an operator touches ~300 times
 * a shift — was covered by nothing. The oracle round flagged the neighbouring gap (`main/index.ts`
 * and `preload/index.ts` are covered by nothing, which is precisely the seam finding A2 lived in);
 * the renderer is the third file in that list and the one with behaviour worth asserting.
 *
 * `.dom.test.tsx` opts in. Everything else stays in a node environment, where the gateway and
 * IPC-seam suites already live and where a DOM would be dead weight.
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
          globals: false,
        },
      },
    ],
  },
});
