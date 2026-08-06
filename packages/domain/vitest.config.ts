import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * `01-F61`'s Argon2id cost floor is DELIBERATELY SLOW, and that is the point of it.
     *
     * `PIN_ARGON2ID_PARAMS` is the OWASP minimum (m=19456 KiB, t=2, p=1), which costs ~0.4 s per
     * verify on this hardware — a hashing primitive whose whole value is being expensive to run
     * many times. `pin-session.test.ts` performs several per test, so the file sits around 45 s
     * and individual tests around 6.5 s, comfortably past vitest's 5 s default.
     *
     * **This surfaced as a phantom regression and cost real time.** Run alone, `packages/domain`
     * was 306/306; run under `pnpm test --force --continue` alongside eight other packages, four
     * tests failed. Load-dependent, so it read as a flake and was twice misattributed to the
     * documented subprocess-oracle flakiness before anyone looked at the failing test NAMES. The
     * S-0b author predicted it precisely — "green with margin here; a machine ~3× slower would be
     * at the edge" — and declined to raise the timeout unilaterally, which was the right call: a
     * test author widening a gate to make their own suite pass is how a real timeout gets buried.
     * Adding `services/api` to the parallel run supplied the missing contention.
     *
     * Raised, not worked around. The alternative — weakening the cost parameters — would trade a
     * credential's strength for a green CI light, and `01-F61` exists precisely because a
     * conforming-but-weak `m=8,t=1,p=1` passes every functional assertion in 34 ms.
     *
     * Mirrors `packages/sync-client`'s 60 s for its own heavy rung. Note `01-F61` also forbids
     * asserting the floor by ELAPSED TIME — these tests assert PARAMETERS, so a slow machine
     * makes them slow, never wrong.
     */
    testTimeout: 60_000,
  },
});
