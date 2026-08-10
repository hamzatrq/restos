import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Two environments split by filename, the shape `apps/pos-electron` and `packages/ui` both use:
 * `.dom.test.tsx` opts into happy-dom, everything else runs in node.
 *
 * ⚠ `testTimeout` is set INSIDE each project and never once at the root — a root-level value does
 * not inherit into `projects[]`, which is how another package ran with 60 s configured and still
 * failed at 5 s.
 *
 * ⚠ **happy-dom performs NO LAYOUT.** Every `getBoundingClientRect` here is zeroes, so nothing in
 * this file can say *"the ticket is on the screen"* — only *"the ticket is in the document"*. The
 * screen claim belongs to `pnpm -C apps/pass-kds layout:check`, which renders in Blink.
 */
const TIMEOUT_MS = 60_000;

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: "node",
          testTimeout: TIMEOUT_MS,
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [react()],
        test: {
          name: "dom",
          testTimeout: TIMEOUT_MS,
          include: ["src/**/*.dom.test.tsx"],
          environment: "happy-dom",
          globals: false,
        },
      },
    ],
  },
});
