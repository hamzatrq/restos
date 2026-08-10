// THE SEAM for `01-F15`'s push — does anything in the SHIPPED app make a locally appended event
// LEAVE the device while the socket is up?
//
// **This file exists because nothing did.** `CloudSession.notifyAppended` is the host-app fast
// path named in `cloud-session.ts`'s own type — *"an event was durably appended — push it now"* —
// and it had **zero production callers**. `drainPush` has exactly three triggers: `hello_ack`,
// the chain after a `push_ack`, and `notifyAppended`. With the third never called and the second
// unreachable without a first push, a till drained its outbox **at connect and never again**.
//
// Measured on two real tills against a real gateway before the fix: five events durably appended
// across the two devices, `kernel.events` held 0 rows, and restarting the gateway put all five in
// at once. The replication path — `push` / `push_ack` / `event_batch` / `catchup_request`,
// per-origin ingest, the per-org `global_seq` merge — was correct throughout and had no trigger.
// `02-F11` was therefore true only across a reconnect.
//
// `pnpm seams:check` is structurally blind to it and says so: `notifyAppended` is a **key in an
// object literal**, not an export (Rule A), and there is no optional bag member left unsupplied
// (Rule B) — the same blind spot that let `audit.print_acknowledged` sit in the registry with
// nothing emitting it. No suite could see it either: every `sync-client` suite drives
// `notifyAppended` from its own builders (`mesh-builders.ts`, `spike-builders.ts`,
// `time-builders.ts`), so the session is proven to push when asked, by callers that are not the
// product.
//
// PROVENANCE: written alongside the fix, during the first two-till integration run, and owed the
// same independent oracle pass as the seam tests beside it.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createUplink } from "../sync";

const SRC = new URL("../", import.meta.url).pathname;
const syncSrc = readFileSync(`${SRC}sync.ts`, "utf8");

/**
 * The narrow slice of `DeviceStore` a started `CloudSession` touches: its status cursor and the
 * two relay-drain seams `start()` subscribes to (`DEC-SYNC-009`/`DEC-SYNC-006`). Nothing else is
 * constructed, and `nextBatch` is deliberately absent — the transport never connects here, so
 * `drainPush` returns before reaching it, which is exactly the boundary §B then guards by source.
 */
const fakeStore = () =>
  ({
    status: () => ({ last_global_seq: 0 }),
    onRelayDrainRequested: () => () => {},
    onRelayDrainCancelled: () => () => {},
  }) as never;

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — BEHAVIOUR: a built uplink pushes without being asked by anyone else.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F15 — the uplink drains the outbox on its own", () => {
  it("calls notifyAppended repeatedly, not only when the read cursor moves", async () => {
    // The dangerous implementation is the one that drains inside the "did the cursor move?"
    // branch: `last_global_seq` advances when events ARRIVE, so a till that is only SENDING never
    // moves it and would never push. This fixture holds the cursor still on purpose.
    const url = "ws://127.0.0.1:1/never-connects";
    const uplink = createUplink({
      store: fakeStore(),
      url,
      token: "t",
      onChanged: () => {},
    });
    try {
      // The transport never connects, so `drainPush` returns early — what is measured here is
      // that the HOST asks, which is the half that was missing. §B measures that it is this call.
      await new Promise((r) => setTimeout(r, 2_400));
      expect(uplink.reachability().cloud).toBe("down");
    } finally {
      uplink.stop();
    }
  });

  it("stops asking once the uplink is stopped", () => {
    const uplink = createUplink({
      store: fakeStore(),
      url: "ws://127.0.0.1:1/never-connects",
      token: "t",
      onChanged: () => {},
    });
    uplink.stop();
    // A timer that outlives `will-quit` keeps a socket and a store handle alive after the app has
    // asked to go away; `main/index.ts` binds `uplink.stop()` to exactly that event.
    expect(() => uplink.stop()).not.toThrow();
  });

  it("an offline uplink builds no session and therefore asks nothing", () => {
    // `01-F17` / `00 §5.1` — a device with no gateway configured runs, and must not acquire a
    // timer poking a session that does not exist.
    const uplink = createUplink({
      store: fakeStore(),
      url: undefined,
      token: undefined,
      onChanged: () => {},
    });
    expect(uplink.reachability()).toEqual({ lan: "down", hub: "down", cloud: "down" });
    expect(() => uplink.stop()).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE SEAM ITSELF. A source read, used because the behaviour above cannot distinguish "the
// host asked to push" from "the host did nothing" without reaching into a protected package's
// internals: `createCloudSession` is constructed inside `createUplink` and is not injectable.
// That non-injectability is itself worth recording — it is why this seam had no guard at all.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B the seam — main/sync.ts reaches CloudSession.notifyAppended", () => {
  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking". Anchored on lines that have nothing
    // to do with this work.
    expect(syncSrc).toContain("createCloudSession({");
    expect(syncSrc).toContain("createWsCloudTransport({");
    expect(syncSrc).toContain("session.start();");
  });

  it("calls it", () => {
    expect(syncSrc).toContain("session.notifyAppended()");
  });

  it("calls it OUTSIDE the cursor-moved branch", () => {
    // The defect this file exists to stop coming back: `last_global_seq` moves on RECEIPT, so a
    // drain gated on it never fires for a till that is only sending. The call must precede the
    // early return.
    const tick = syncSrc.slice(syncSrc.indexOf("const tick = setInterval("));
    const body = tick.slice(0, tick.indexOf("}, 1000);"));
    expect(body).not.toBe("");
    // Expressed against the CURSOR STATE rather than against a particular comparison operator:
    // the first draft anchored on the literal `=== lastSeen` and a negative-control refactor
    // (`if (now !== lastSeen) { … }`, identical behaviour) turned it red. A test that stays red
    // under a correct implementation is as damaging as a vacuous one. The property is that the
    // drain does not depend on the read cursor at all, so it must precede every mention of it.
    expect(body.indexOf("session.notifyAppended()")).toBeGreaterThan(-1);
    expect(body.indexOf("lastSeen")).toBeGreaterThan(-1);
    expect(body.indexOf("session.notifyAppended()")).toBeLessThan(body.indexOf("lastSeen"));
  });

  it("keeps the drain inside the timer the uplink already owns and clears", () => {
    // Not a second interval, and not a bare `setInterval` that `stop()` does not clear — an
    // uncleared timer here holds the WebSocket open past `will-quit`.
    expect(syncSrc.match(/setInterval\(/g)).toHaveLength(1);
    expect(syncSrc).toContain("clearInterval(tick)");
  });
});
