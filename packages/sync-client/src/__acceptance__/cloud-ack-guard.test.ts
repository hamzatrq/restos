// Acceptance tests — T-01-08 oracle round, owed pin 2 of the T-01-12 close
// (plans/wave-0/t-01-12-fix-round.md, carried item 2): the F3 ack-guard law
// EXTENDED to the cloud session's OWN-ack path. Authored from the fix-round
// rulings (F3 + ratified interpretation 3: guard = `acked === null || acked ≤
// ownHigh`; only a throw or an over-advance fails) + 19 §5 + specs/DECISIONS.md
// (DEC-SYNC-008) + PROTOCOL.md ONLY (24 §3 step 2: read-only to the
// implementing session). The mesh-side F3 pin (relay-fix-round.test.ts) is
// untouched and stays binding.
//
// RED-AWAITING-FIX map (verified to fail for the ruled reason):
//   F3-ext — cloud-session's own-ack path calls store.advanceTo with the wire
//     value unguarded: a push_ack whose acked_watermark exceeds the reborn
//     store's own_high_water (the wiped-device DR rejoin — the REAL gateway
//     produces exactly this, because quarantine slots from the device's
//     pre-wipe life keep the cloud watermark high (lamport_conflict fills,
//     DEC-SYNC-005) while the reborn store holds almost nothing) throws
//     AckBeyondAppendedError out of the transport dispatch on every reconnect.
//     Ruled: ignore (or clamp ≤ own high) — never crash, never over-advance,
//     and the session KEEPS PROCESSING later genuine acks (19 §5: the
//     checkpoint never claims unappended slots).
// GREEN pins (regression, landed behaviour):
//   DEC-SYNC-008 client half — duplicate quarantine_notice frames are TOLERATED
//     (at-least-once delivery: the durable outbox redelivers on hello, so the
//     same notice may arrive many times); the session neither throws nor stops
//     processing. (Set-dedupe of status().quarantined stays a NAMED FOLLOW-UP,
//     not pinned — DEC-SYNC-008 defers exactly-once.)
import type { CloudTransport, CloudTransportHandlers } from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { createCloudSession, openStore } from "../index.js";
import { appendInput, identity, must } from "./builders.js";

/**
 * Scripted cloud end (the cloud twin of the mesh rawPeer idiom): the test plays
 * the gateway by hand at the exact wire surface. Every delivered frame passes
 * parseMessage so nothing wire-invalid can be smuggled to the session.
 */
const scriptedCloud = () => {
  let handlers: CloudTransportHandlers | null = null;
  const sent: ReturnType<typeof parseMessage>[] = [];
  const transport: CloudTransport = {
    start(h) {
      handlers = h;
    },
    stop() {
      handlers = null;
    },
    send(message) {
      sent.push(parseMessage(message));
    },
  };
  return {
    transport,
    sent,
    up: () => must(handlers, "started transport").onUp(),
    deliver: (raw: unknown) => must(handlers, "started transport").onMessage(parseMessage(raw)),
  };
};

const startSession = (deviceIdentity: ReturnType<typeof identity>) => {
  const sim = createSim({ seed: 1_802 });
  const store = openStore({ path: ":memory:", identity: deviceIdentity });
  const cloud = scriptedCloud();
  const session = createCloudSession({
    store,
    transport: cloud.transport,
    clock: sim.clock,
    device_class: "counter_electron",
    token: "cloud-token-stub",
  });
  session.start();
  cloud.up(); // session hellos
  return { store, cloud, session };
};

const ack = (acked_watermark: number) => ({ v: 1, kind: "push_ack", acked_watermark });

describe("F3-ext — an oversized OWN cloud ack never crashes the cloud session (t-01-12 carried item 2 / 19 §5 / 01-F8)", () => {
  it("F3-ext/19 §5/01-F8: push_ack{acked_watermark: ownHigh+1000} on the own-ack path → no throw, checkpoint never claims unappended slots, and a later genuine ack still drains the outbox", () => {
    const id = identity();
    const { store, cloud, session } = startSession(id);
    // The reborn device has appended two fresh events — own high water 1. The
    // gateway (which remembers the pre-wipe stream) hellos back a resume point
    // far past them and later acks watermarks the reborn store never appended.
    store.append(appendInput(id));
    store.append(appendInput(id));
    expect(store.status().own_high_water).toBe(1);
    cloud.deliver({ v: 1, kind: "hello_ack", session_id: "dr-1", hub: false, resume_from: 6 });
    session.notifyAppended();

    // THE POISON FRAME (RED today): an own-stream cloud ack beyond own high
    // water — the DR-rejoin shape. Ruled: ignored (or clamped), NEVER thrown
    // out of the transport dispatch.
    expect(() => cloud.deliver(ack(1 + 1_000))).not.toThrow();
    const acked = store.status().acked_watermark;
    // Ignore and clamp are BOTH ruled-acceptable (interpretation 3); a crash or
    // an over-advance is not — the checkpoint never claims unappended slots.
    expect(acked === null || acked <= 1).toBe(true);

    // The session keeps processing: a GENUINE ack for the real high water still
    // advances THE cloud write-checkpoint (19 §5) and drains the outbox — the
    // poison value must not have poisoned the session's ack bookkeeping either.
    cloud.deliver(ack(1));
    expect(store.status().acked_watermark).toBe(1);
    expect(store.status().queue_depth).toBe(0);

    session.stop();
    store.close();
  });

  it("F3-ext/19 §5: on a WIPED (empty) reborn store EVERY positive ack is beyond own high water — ignored without crash, and the first genuine ack after a fresh append still advances", () => {
    const id = identity();
    const { store, cloud, session } = startSession(id);
    expect(store.status().own_high_water).toBeNull(); // wiped: nothing appended
    cloud.deliver({ v: 1, kind: "hello_ack", session_id: "dr-2", hub: false, resume_from: 6 });

    // RED today: on an empty store advanceTo throws for every watermark.
    expect(() => cloud.deliver(ack(5))).not.toThrow();
    expect(store.status().acked_watermark).toBeNull();

    // Post-rejoin life resumes: a fresh append + a genuine ack for it advance
    // the checkpoint from null → 0 (the ignored 5 must not gate it).
    store.append(appendInput(id));
    session.notifyAppended();
    cloud.deliver(ack(0));
    expect(store.status().acked_watermark).toBe(0);
    expect(store.status().queue_depth).toBe(0);

    session.stop();
    store.close();
  });
});

describe("DEC-SYNC-008 client half — duplicate quarantine notices are tolerated (01-F37 / 01-F11)", () => {
  it("DEC-SYNC-008/01-F37: the same quarantine_notice delivered twice (at-least-once redelivery) neither throws nor stops the session; the notice is surfaced in status().quarantined with its reason verbatim", () => {
    const id = identity();
    const { store, cloud, session } = startSession(id);
    cloud.deliver({ v: 1, kind: "hello_ack", session_id: "dup-1", hub: false, resume_from: 0 });

    const notice = {
      v: 1,
      kind: "quarantine_notice",
      event_id: "qn-dup-1",
      reason: "storage_reject",
    };
    expect(() => {
      cloud.deliver(notice);
      cloud.deliver(notice); // redelivery — the DEC-SYNC-008 at-least-once shape
    }).not.toThrow();
    const surfaced = session.status().quarantined.filter((q) => q.event_id === "qn-dup-1");
    expect(surfaced.length).toBeGreaterThanOrEqual(1);
    expect(must(surfaced[0], "surfaced notice").reason).toBe("storage_reject");

    // The session keeps processing after duplicates: a normal push/ack cycle runs.
    store.append(appendInput(id));
    session.notifyAppended();
    cloud.deliver(ack(0));
    expect(store.status().acked_watermark).toBe(0);

    session.stop();
    store.close();
  });
});
