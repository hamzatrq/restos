// JOURNEY J2 — "a blocked cursor survives a busy branch" (adversarial-review finding
// B2, fixed in `9dc9800`; regression pin owed per `plans/wave-0/sec-review-followups.md`).
//
// THE FAILURE THIS PINS. `applyEvents` serves BOTH `catchup_response` and live
// `event_batch`, and `blockedCursor = report` was unconditional. One sale on any other
// terminal produced a clean live batch that (a) cleared the report and (b) advanced
// `last_global_seq` past the blocking sequence — which was then never re-requested.
// Silent, permanent data loss, reachable within seconds on any multi-device branch.
// Violates DEC-SYNC-011(a) AND (b) ("stop-and-report, NEVER skip … skipping is
// unrecoverable"), 01-F9, 01-F34.
//
// WHY NO EXISTING ORACLE SAW IT. The T-01-20 suite pins the catch-up plane; the
// fan-out plane is pinned elsewhere. Nothing crossed them — and the defect lives
// exactly on the crossing. Every scenario below therefore mixes the two message
// kinds on ONE session, which is the whole point of a journey pin.
//
// Authored from spec text ONLY (24 §3 step 2 — read-only to the implementing session):
//   • DEC-SYNC-011 (accepted): (a) a blocked cursor is OBSERVABLE; (b) STOP AND
//     REPORT, NEVER SKIP; (c) the device keeps operating locally (01-F17).
//   • 01-F9  catch-up is a range fetch from the last received global sequence.
//   • 01-F11 sync status is queryable by the host app for the honesty UI (00 §5.7).
//   • 01-F34 `global_seq` is the delivery/catch-up cursor, never a business arbiter.
//   • 01-F8  id-dedupe makes re-delivery free, which is what makes stopping safe.
import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { type CloudSession, createCloudSession, type DeviceStore, openStore } from "../index.js";
import { identity, orderCreated, peerEnvelope, peerIdentity } from "./builders.js";
import {
  catchupPage,
  cloudDevice,
  eventBatch,
  helloAck,
  lastCatchupFrom,
  readBlocked,
  requireBlocked,
  scriptedCloud,
  withSeq,
} from "./journey-builders.js";

/** An event this build can never accept (01-F4 unknown type) — the DEC-SYNC-011 blocker. */
const skewEvent = (peer: ReturnType<typeof peerIdentity>, lamport: number) =>
  peerEnvelope(peer, lamport, { type: "order.teleported", payload: { x: 1 } });

const storedIds = (store: DeviceStore): Set<string> =>
  new Set(store.readAllEvents().map((e) => e.id));

/**
 * `cloudDevice` with an interposed store seam. Only the transient-clear scenario
 * needs it; kept out of the shared builders so a store wrapper never becomes the
 * default shape and quietly stubs a session under some other test.
 */
const wrappedCloudDevice = (
  wrap: (real: DeviceStore) => DeviceStore,
): {
  store: DeviceStore;
  session: CloudSession;
  cloud: ReturnType<typeof scriptedCloud>;
  stop(): void;
} => {
  const id = identity();
  const real = openStore({ path: ":memory:", identity: id });
  const cloud = scriptedCloud();
  const session = createCloudSession({
    store: wrap(real),
    transport: cloud.transport,
    clock: createSim({ seed: 9_002 }).clock,
    device_class: "counter_electron",
    token: "journey-cloud-token",
  });
  session.start();
  cloud.up();
  cloud.deliver(helloAck("journey-b2-wrapped"));
  return {
    store: real,
    session,
    cloud,
    stop: () => {
      session.stop();
      real.close();
    },
  };
};

describe("J2/B2 — a LIVE fan-out batch must not erase or step over a blocked cursor (DEC-SYNC-011(b); 01-F9/01-F34)", () => {
  it("B2/DEC-SYNC-011(b)/01-F9: cursor blocked at seq 2; a clean LIVE event_batch at seq 1000 arrives (a sale on another terminal) — the block is STILL reported, the cursor does NOT pass 2, and catch-up still re-requests it", () => {
    const device = cloudDevice();
    const { store, session, cloud } = device;
    const peer = peerIdentity(store.identity);
    const busyTerminal = peerIdentity(store.identity);

    // Catch-up lands seq 1, then stops permanently at seq 2.
    cloud.deliver(catchupPage([withSeq(peerEnvelope(peer, 0, orderCreated("O-a")), 1)]));
    const skew = skewEvent(peer, 1);
    cloud.deliver(catchupPage([withSeq(skew, 2)]));
    expect(requireBlocked(session, "the initial skew block").global_seq).toBe(2);
    expect(session.status().last_global_seq).toBe(1);

    // THE BUSY BRANCH: another terminal rings up a sale. It arrives as LIVE fan-out,
    // far ahead of the blockage, and it is perfectly clean.
    const sale = peerEnvelope(busyTerminal, 0, orderCreated("O-sale"));
    cloud.deliver(eventBatch([withSeq(sale, 1000)]));

    // (1) THE REPORT SURVIVES. A clean batch at seq 1000 says NOTHING about seq 2.
    //     [catches: reverting `if (report !== null) blockedCursor = report; else if
    //     (priorBlock !== null && landedBlocking) blockedCursor = null;` back to the
    //     unconditional `blockedCursor = report` — report is null here, so the block
    //     would be erased and the honesty UI would go quiet on a permanent wedge.]
    const still = requireBlocked(session, "the block after an unrelated live sale");
    expect(still.global_seq).toBe(2);
    expect(still.event_type).toBe("order.teleported");
    expect(still.reason).toBe("unknown_event_type");

    // (2) THE CURSOR DOES NOT PASS. This is the data-loss half: a cursor at 1000 means
    //     the gateway is never asked for 2 again.
    //     [catches: reverting the clamp `const stopBefore = blockedCursor?.global_seq
    //     ?? null; if (stopBefore !== null && advanceTo >= stopBefore) advanceTo =
    //     stopBefore - 1;` — without it last_global_seq becomes 1000.]
    expect(session.status().last_global_seq).toBe(1);

    // (3) …and the device KEEPS WORKING on what it holds (01-F17 / DEC-SYNC-011(c)):
    //     the live sale really did ingest and fold. Holding the CURSOR back is not
    //     the same as refusing the events, and a fix that froze ingest would be wrong.
    expect(storedIds(store).has(sale.id)).toBe(true);
    expect(storedIds(store).has(skew.id)).toBe(false);

    // (4) THE PROOF OF NON-SKIP: a reconnect asks for the branch stream from BEFORE
    //     the blockage (exclusive cursor, 01-F9), so seq 2 is genuinely re-delivered.
    cloud.up();
    cloud.deliver(helloAck("journey-b2-reconnect"));
    expect(lastCatchupFrom(cloud.sent)).toBe(1);

    device.stop();
  });

  it("B2/DEC-SYNC-011(b): a whole RUSH of live batches (5 sales at seqs 1000…1004) never moves the cursor one step past the blockage", () => {
    // The single-batch case could survive an off-by-one; a rush cannot.
    const device = cloudDevice();
    const { store, session, cloud } = device;
    const peer = peerIdentity(store.identity);
    const busyTerminal = peerIdentity(store.identity);

    cloud.deliver(catchupPage([withSeq(peerEnvelope(peer, 0, orderCreated("O-a")), 1)]));
    cloud.deliver(catchupPage([withSeq(skewEvent(peer, 1), 2)]));
    expect(requireBlocked(session, "the block before the rush").global_seq).toBe(2);

    for (let i = 0; i < 5; i++) {
      cloud.deliver(
        eventBatch([withSeq(peerEnvelope(busyTerminal, i, orderCreated(`O-rush-${i}`)), 1000 + i)]),
      );
      expect(session.status().last_global_seq, `after rush batch ${i}`).toBe(1);
      expect(readBlocked(session), `after rush batch ${i}`).not.toBeNull();
    }
    // Every rush sale still projected — the branch keeps selling (01-F17).
    expect(store.openOrders().length).toBeGreaterThan(0);

    device.stop();
  });
});

describe("J2/B2 — the block CLEARS only when the blocking event actually applies (DEC-SYNC-011; 01-F11)", () => {
  it("B2/01-F11/01-F8: after live-batch noise, a catch-up that RE-DELIVERS the blocking seq and lands it clears the report and releases the cursor", () => {
    // The counterpart pin. A fix that never cleared would be as wrong as one that
    // cleared too eagerly: the honesty UI would cry wolf forever after any transient
    // stall. The clear must be caused by the BLOCKING EVENT LANDING, nothing else.
    //
    // A genuinely transient ingest failure is an INFRA fault (SQLITE_BUSY, a failed
    // fsync) — every deterministic device-store rejection is permanent by construction,
    // so "fails once, then succeeds" is scripted by interposing on the store seam the
    // session already consumes. Nothing about the SESSION is stubbed.
    let healed = false;
    let targetId = "";
    const device = wrappedCloudDevice((inner) => ({
      ...inner,
      ingestPage(items) {
        const idx = items.findIndex((item) => (item.envelope as { id?: string }).id === targetId);
        if (healed || idx < 0) return inner.ingestPage(items);
        return [
          ...inner.ingestPage(items.slice(0, idx)),
          {
            ok: false as const,
            error: new Error("simulated transient infra ingest fault (not a permanent rejection)"),
          },
          ...inner.ingestPage(items.slice(idx + 1)),
        ];
      },
    }));
    const { store, session, cloud } = device;
    const peer = peerIdentity(store.identity);
    const busyTerminal = peerIdentity(store.identity);

    const first = peerEnvelope(peer, 0, orderCreated("O-t1"));
    const target = peerEnvelope(peer, 1, orderCreated("O-t2"));
    targetId = target.id;
    const page = [withSeq(first, 1), withSeq(target, 2)];

    cloud.deliver(catchupPage(page));
    expect(requireBlocked(session, "the transient stall at seq 2").global_seq).toBe(2);

    // Busy branch in between — must neither clear nor advance (the B2 property again).
    cloud.deliver(
      eventBatch([withSeq(peerEnvelope(busyTerminal, 0, orderCreated("O-sale")), 1000)]),
    );
    expect(readBlocked(session)).not.toBeNull();
    expect(session.status().last_global_seq).toBe(1);

    // The fault clears and catch-up re-delivers the same page (01-F9 + 01-F8 dedupe).
    // [catches: reverting the `landedBlocking` computation, or the `else if (priorBlock
    // !== null && landedBlocking) blockedCursor = null` arm — with no clearing arm the
    // report sticks forever and this assertion goes red.]
    healed = true;
    cloud.deliver(catchupPage(page));
    expect(readBlocked(session)).toBeNull();
    expect(session.status().last_global_seq).toBe(2);
    expect(storedIds(store).has(target.id)).toBe(true);

    device.stop();
  });
});

describe("J2/B2 — the landed PREFIX still counts: the cursor is CLAMPED, never frozen (01-F9/01-F17)", () => {
  it("B2/01-F9: a page whose prefix lands and whose 3rd event blocks advances to the last landed seq — real progress is not discarded", () => {
    const device = cloudDevice();
    const { store, session, cloud } = device;
    const peer = peerIdentity(store.identity);

    cloud.deliver(
      catchupPage([
        withSeq(peerEnvelope(peer, 0, orderCreated("O-1")), 1),
        withSeq(peerEnvelope(peer, 1, orderCreated("O-2")), 2),
        withSeq(skewEvent(peer, 2), 3),
      ]),
    );

    // [catches: the implementer's FIRST attempt at B2 — freezing the cursor outright
    // while a block stands (`if (stopBefore !== null) advanceTo = -1`). That discards
    // two events' worth of real progress and makes every reconnect re-fetch them.]
    expect(session.status().last_global_seq).toBe(2);
    expect(requireBlocked(session, "the block at the end of the page").global_seq).toBe(3);

    device.stop();
  });

  it("B2/01-F9: while a block stands at seq 9, a LIVE batch delivering seqs 6,7,8 (all BELOW it) still advances the cursor to 8 — the clamp is stop-BEFORE, not stop-dead", () => {
    const device = cloudDevice();
    const { store, session, cloud } = device;
    const peer = peerIdentity(store.identity);
    const other = peerIdentity(store.identity);

    // Land 1..5, then block at 9. Catch-up pages are ranges, so a later page may
    // legitimately arrive while an earlier gap is still being filled by fan-out.
    cloud.deliver(
      catchupPage(
        [1, 2, 3, 4, 5].map((seq, i) =>
          withSeq(peerEnvelope(peer, i, orderCreated(`O-${seq}`)), seq),
        ),
      ),
    );
    expect(session.status().last_global_seq).toBe(5);
    cloud.deliver(catchupPage([withSeq(skewEvent(peer, 5), 9)]));
    expect(requireBlocked(session, "the block at seq 9").global_seq).toBe(9);
    expect(session.status().last_global_seq).toBe(5);

    cloud.deliver(
      eventBatch(
        [6, 7, 8].map((seq, i) => withSeq(peerEnvelope(other, i, orderCreated(`O-b${seq}`)), seq)),
      ),
    );

    // Progress BELOW the blockage is real and is kept (stop-BEFORE)…
    expect(session.status().last_global_seq).toBe(8);
    // …and the blockage itself is still standing and still unpassed.
    expect(requireBlocked(session, "the block after the sub-block batch").global_seq).toBe(9);

    device.stop();
  });
});
