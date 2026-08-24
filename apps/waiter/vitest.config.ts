import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // ⚠ happy-dom performs NO LAYOUT: every `getBoundingClientRect` is zeroes. So a `.dom.test.tsx`
    // here can say "the control is in the document" and can never say "the control is on the
    // screen". Nine layout defects in this repo were found by launching and looking and zero by
    // suites like this one. See `Pad.tsx`'s header: this surface has no layout rail at all yet.
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
