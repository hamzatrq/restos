import { defineConfig } from "vitest/config";

/**
 * `node` only, and that is a measured constraint rather than a starting point.
 *
 * `18 §12` gives React Native exactly one testing tool — **Maestro E2E on the office reference
 * rig** — and no component-level renderer. `react-test-renderer` and `@testing-library/react-native`
 * are on no allowlist in `18 §14`, and `packages/ui` ships no RN components for a suite to mount
 * anyway (`18 §2` specifies an RN kit; the repo built all 18 components against React DOM). So
 * every assertion in this package is about a pure function, and none of them says anything about
 * what appears on a phone. `apps/pass-kds` and `packages/ui` can add a `dom` project because they
 * render to a DOM; this app cannot, and a config implying otherwise would be the first step toward
 * a suite that believes it has seen a screen.
 *
 * The `bundle:check` script is the rail that DOES cover this platform: it proves the modules here
 * reach Hermes at all, which is where an accidental `@restos/sync-client` root import (and with it
 * `better-sqlite3`) would surface. It is not run from here because it takes tens of seconds.
 */
const TIMEOUT_MS = 60_000;

export default defineConfig({
  test: {
    name: "node",
    testTimeout: TIMEOUT_MS,
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
