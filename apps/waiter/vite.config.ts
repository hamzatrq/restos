import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * `04-F21` — the pad is a static bundle the TILL serves; there is no server of our own here and
 * there must not be. `main/terminal-server.ts` reads `RESTOS_TERMINAL_BUNDLE` and serves this
 * directory over the same TLS socket the intents ride, which is what keeps `04-F22` (a)'s
 * secure-context requirement true of the app shell as well as of the API.
 */
export default defineConfig({
  build: { outDir: "dist", emptyOutDir: true },
  // Relative, because the till serves the bundle from its own root and the pad is never hosted
  // anywhere else. An absolute base would break the moment the port moves.
  base: "./",
  plugins: [react()],
});
