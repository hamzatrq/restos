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
        },
      },
    ],
  },
});
