// `06-F30`..`06-F37` acceptance wiring.
//
// ⚠ **THIS SUITE NEEDS LOCAL DOCKER NOW, AND THE COMMENT THAT STOOD HERE IS WHY IT DID NOT.** It
// read: *"No Testcontainers and no global setup: the origin's outbox and the entitlement source
// are both PORTS … The Postgres implementation of the outbox is what `06-F30`'s single-writer
// clause needs and is exercised by the gateway's own suite, not by this one."* The first half was
// true and the second half was never true — the gateway's suite has never held a line of this
// module's storage, there was no Postgres implementation to exercise, and the in-memory port
// reached production. Measured on a real stack: three carts accepted, three order ids returned,
// **zero rows** in the ledger, and a boot banner that said so.
//
// So `06-F36`'s durable outbox is tested against a real Postgres, on `20 §1`/`18 §12`'s ban on
// mocked infra in service tests, and the setup fails LOUDLY with Docker absent rather than
// skipping (`T-01-07`). Every other file here still runs over the ports and pays nothing for it:
// the container starts once for the run.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/__acceptance__/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
