// Acceptance tests — T-01-20: a BLOCKED catch-up cursor is observable (DEC-SYNC-011).
// Authored from spec text ONLY (24 §3 step 2: read-only to the implementing session):
//   • specs/DECISIONS.md DEC-SYNC-011 (accepted), verbatim policy:
//       (a) a blocked cursor is OBSERVABLE — `status()` carries the blocking
//           `global_seq`, the rejected event type, and a machine-readable reason,
//           surfaced to fleet health (doc 15) and the honesty UI;
//       (b) forward-skew policy is STOP-AND-REPORT, NEVER SKIP — silently skipping an
//           unparseable event would fabricate a gap in a log whose whole value is
//           completeness, and skipping is unrecoverable while stopping is not;
//       (c) the device keeps operating locally on what it already holds (01-F17).
//     Blocking cases named by the row: "an event the device can never accept — unknown
//     event type, payload from a newer schema version — is not divergence and not
//     quarantinable at the device, so the cursor simply stops."
//   • 01-F9  catch-up is a range fetch from the last received global sequence.
//   • 01-F11 sync status (last push ack, last pull position, queue depth) is queryable
//           by the host app for the honesty UI (00 §5.7).
//   • 01-F17 a sale is never blocked.
//   • 01-F34 `global_seq` is the delivery/catch-up cursor, never a business arbiter.
//   • 01-F37 quarantine is for events rejected at hub or cloud — NOT this case.
//   • 00 §5.7 sync honesty: stale is never presented as live.
//   • 00 §5.4 org data isolation absolute (customer phone numbers never cross orgs) —
//           payload values must not leak into a status surface fleet health persists.
//
// ── ORACLE-PROPOSED SURFACE (binding for the implementing session; flagged for
//    ratification in the oracle report — packages/sync-client is a PROTECTED PATH,
//    senior review). Additive to `CloudSessionStatus` (cloud-session.ts):
//
//      blocked: {
//        global_seq: number | null;   // the seq the cursor cannot pass ("stopped at X").
//                                     // null only if the blocking wire event carried none.
//        event_type: string;          // the REJECTED event's `type` — a catalog name,
//                                     // never a payload value (00 §5.4).
//        reason: BlockedReason;       // machine-readable token, snake_case, NOT a message.
//      } | null                       // null (or absent) ⇔ the cursor is not blocked.
//
//      type BlockedReason =
//        | "unknown_event_type"  // domain UnknownEventTypeError — this build's catalog
//                                //   has no such type (01-F4). PERMANENT: re-fetch cannot help.
//        | "schema_invalid"      // envelope/payload validation failure (01-F4) — the
//                                //   "payload from a newer schema version" case (00 §6).
//        | "ingest_failed";      // anything else the store refused. The catch-all that
//                                //   covers the genuinely transient (infra) failures.
//
//    Only the FIRST non-landed event of a page is reported: the cursor stops there, so
//    that is the seq the honesty UI must name and the seq fleet health must alert on.
//
// RED-AWAITING-IMPLEMENTATION: `status()` today returns
// `{ connected, last_push_ack, last_global_seq, quarantined }` — `applyEvents` computes
// a local `blocked` flag, uses it to stop the contiguous-prefix advance, and DISCARDS
// it. `requireBlocked()` throws a self-documenting missing-feature reason.
import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import {
  type CloudSession,
  type CloudSessionStatus,
  createCloudSession,
  type DeviceStore,
  openStore,
} from "../index.js";
import {
  appendInput,
  identity,
  must,
  orderCreated,
  peerEnvelope,
  peerIdentity,
} from "./builders.js";

// ── the oracle-proposed surface, resolved off the real session via a typed read ──

type BlockedCursor = {
  global_seq: number | null;
  event_type: string;
  reason: string;
};

/** The closed machine-readable vocabulary fleet health (doc 15) alerts on. */
const BLOCKED_REASONS = ["unknown_event_type", "schema_invalid", "ingest_failed"] as const;

/** A machine-readable token — snake_case, short. Mechanically excludes a dumped message. */
const REASON_TOKEN = /^[a-z][a-z0-9_]*$/;

const readBlocked = (session: CloudSession): BlockedCursor | null => {
  const status = session.status() as CloudSessionStatus & { blocked?: BlockedCursor | null };
  return status.blocked ?? null;
};

const requireBlocked = (session: CloudSession, what: string): BlockedCursor => {
  const blocked = readBlocked(session);
  if (blocked === null) {
    throw new Error(
      "T-01-20 NOT IMPLEMENTED: status().blocked — DEC-SYNC-011(a) requires a blocked " +
        "cursor to be OBSERVABLE (blocking global_seq + rejected event type + " +
        `machine-readable reason). Expected a report for ${what}, got none. ` +
        "The honesty UI (00 §5.7) cannot say 'stopped at X' without it. RED until T-01-20 lands.",
    );
  }
  return blocked;
};

/** Every reported reason is a token from the closed vocabulary — never a free-text message. */
const expectMachineReadable = (blocked: BlockedCursor) => {
  expect(blocked.reason).toMatch(REASON_TOKEN);
  expect(blocked.reason.length).toBeLessThanOrEqual(40);
  expect(BLOCKED_REASONS as readonly string[]).toContain(blocked.reason);
};

// ── scripted cloud end (the cloud-ack-guard idiom): the test plays the gateway by
//    hand at the exact wire surface; every frame passes parseMessage, so nothing
//    wire-invalid can be smuggled in. The sim-cloud double cannot emit a page the
//    device can never accept — that is precisely the case under test.

const scriptedCloud = () => {
  let handlers: CloudTransportHandlers | null = null;
  const sent: ProtocolMessage[] = [];
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
    down: () => must(handlers, "started transport").onDown(),
    deliver: (raw: unknown) => must(handlers, "started transport").onMessage(parseMessage(raw)),
  };
};

const helloAck = (session_id: string) => ({
  v: 1,
  kind: "hello_ack",
  session_id,
  hub: false,
  resume_from: 0,
});

const withSeq = (envelope: object, global_seq: number) => ({ ...envelope, global_seq });

/** A completed catch-up page (01-F9). `complete: true` keeps the tape free of paging noise. */
const catchupPage = (events: readonly unknown[]) => ({
  v: 1,
  kind: "catchup_response",
  events,
  complete: true,
  next_from: 0,
});

const eventBatch = (events: readonly unknown[]) => ({ v: 1, kind: "event_batch", events });

/** The from_global_seq of the last catchup_request the device sent (exclusive cursor, 01-F9). */
const lastCatchupFrom = (sent: readonly ProtocolMessage[]): number =>
  must(sent.filter((m) => m.kind === "catchup_request").at(-1), "a catchup_request")
    .from_global_seq;

/**
 * A connected device: real store + real cloud session over the scripted wire.
 * `wrap` lets a test interpose on the store seam (used ONLY for the transient-clear
 * pin — a genuinely transient ingest failure is an infra fault, see that test's note).
 */
const openDevice = (wrap?: (real: DeviceStore) => DeviceStore) => {
  const id = identity();
  const real = openStore({ path: ":memory:", identity: id });
  const store = wrap === undefined ? real : wrap(real);
  const cloud = scriptedCloud();
  const session = createCloudSession({
    store,
    transport: cloud.transport,
    clock: createSim({ seed: 1_120 }).clock,
    device_class: "counter_electron",
    token: "cloud-token-stub",
  });
  session.start();
  cloud.up();
  cloud.deliver(helloAck("t-01-20"));
  return { id, store: real, session, cloud };
};

const storedIds = (store: DeviceStore) => new Set(store.readAllEvents().map((e) => e.id));

// PII-shaped payload values (00 §5.4). If any of these reaches status(), fleet health
// persists a customer's phone number because a catch-up page failed to parse.
const PII_NAME = "Fatima Zulfiqar";
const PII_PHONE = "+923001234567";
const PII_NOTE = "House 12, Street 5, Gulberg — ring the bell twice";

describe("T-01-20 — a blocked catch-up cursor is OBSERVABLE (DEC-SYNC-011(a); 01-F9/01-F11/00 §5.7)", () => {
  it("DEC-SYNC-011(a)/01-F4/01-F11: an UNKNOWN EVENT TYPE mid-page reports the blocking global_seq, the rejected type, and a machine-readable reason", () => {
    const { store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    // A clean prefix lands and the cursor reaches global_seq 1.
    cloud.deliver(catchupPage([withSeq(peerEnvelope(peer, 0, orderCreated("O-clean")), 1)]));
    expect(session.status().last_global_seq).toBe(1);

    // global_seq 2 is an event type this build's catalog does not contain — the
    // DEC-SYNC-011 headline case. A LATER item in the same page is also unknown: the
    // report must name the FIRST blockage (that is where the cursor stops), not the last.
    const skew = peerEnvelope(peer, 1, {
      type: "order.teleported",
      payload: { order_id: "O-skew", channel: "counter" },
    });
    const behind = peerEnvelope(peer, 2, orderCreated("O-behind"));
    const alsoSkew = peerEnvelope(peer, 3, { type: "order.levitated", payload: {} });
    cloud.deliver(catchupPage([withSeq(skew, 2), withSeq(behind, 3), withSeq(alsoSkew, 4)]));

    const blocked = requireBlocked(session, "an unknown event type at global_seq 2");
    expect(blocked.global_seq).toBe(2); // the FIRST blockage — "stopped at 2"
    expect(blocked.event_type).toBe("order.teleported");
    expect(blocked.reason).toBe("unknown_event_type");
    expectMachineReadable(blocked);

    // ...and the cursor genuinely did not pass it (the observable is not decorative).
    expect(session.status().last_global_seq).toBe(1);

    session.stop();
    store.close();
  });

  it("DEC-SYNC-011(a)/00 §6/01-F4: a payload from a NEWER SCHEMA VERSION reports schema_invalid with the rejected type and the blocking seq", () => {
    const { store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    cloud.deliver(catchupPage([withSeq(peerEnvelope(peer, 0, orderCreated("O-v1")), 1)]));
    expect(session.status().last_global_seq).toBe(1);

    // The 00 §6 breaking-change shape: `schema_version` bumped and the v1 required
    // fields renamed, so this build's reader cannot validate the payload. Permanent —
    // re-fetching the same bytes yields the same rejection.
    const newer = peerEnvelope(peer, 1, {
      type: "order.created",
      schema_version: 2,
      payload: { order_ref: "O-v2", channel_code: "dine_in", customer_name: PII_NAME },
    });
    cloud.deliver(catchupPage([withSeq(newer, 2)]));

    const blocked = requireBlocked(session, "a newer-schema-version payload at global_seq 2");
    expect(blocked.global_seq).toBe(2);
    expect(blocked.event_type).toBe("order.created"); // the type IS known; the payload is not
    expect(blocked.reason).toBe("schema_invalid");
    expectMachineReadable(blocked);
    expect(session.status().last_global_seq).toBe(1);

    session.stop();
    store.close();
  });
});

describe("T-01-20 — STOP AND REPORT, NEVER SKIP (DEC-SYNC-011(b); 01-F9/01-F34)", () => {
  it("DEC-SYNC-011(b)/01-F9: the blocking event is NOT stored, the cursor does NOT advance past it, and the next catch-up re-fetches it from the pre-block cursor", () => {
    const { store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    cloud.deliver(catchupPage([withSeq(peerEnvelope(peer, 0, orderCreated("O-a")), 1)]));
    const cursorBefore = must(session.status().last_global_seq, "the pre-block cursor");
    expect(cursorBefore).toBe(1);

    const skew = peerEnvelope(peer, 1, { type: "order.teleported", payload: { x: 1 } });
    cloud.deliver(
      catchupPage([withSeq(skew, 2), withSeq(peerEnvelope(peer, 2, orderCreated("O-c")), 3)]),
    );

    // NEVER SKIP: the blocking event did not land and the cursor is still behind it,
    // so the gateway will send it again. A fabricated gap is unrecoverable; a stop is not.
    expect(storedIds(store).has(skew.id)).toBe(false);
    expect(session.status().last_global_seq).toBe(cursorBefore);
    expect(requireBlocked(session, "the skew block").global_seq).toBe(2);

    // NOT QUARANTINABLE AT THE DEVICE (DEC-SYNC-011 / 01-F37): quarantine is the
    // hub/cloud rejection surface for permanently known-bad events. Recording this one
    // there would let the cursor pass it — exactly the skip the row forbids.
    expect(session.status().quarantined).toHaveLength(0);

    // A RE-DELIVERY of the same page stops at the same point — idempotent, no drift.
    cloud.deliver(
      catchupPage([withSeq(skew, 2), withSeq(peerEnvelope(peer, 2, orderCreated("O-c")), 3)]),
    );
    const again = requireBlocked(session, "the re-delivered skew block");
    expect(again.global_seq).toBe(2);
    expect(again.event_type).toBe("order.teleported");
    expect(again.reason).toBe("unknown_event_type");
    expect(session.status().last_global_seq).toBe(cursorBefore);
    expect(storedIds(store).has(skew.id)).toBe(false);

    // And the proof that the event is genuinely RE-FETCHED, not skipped: a reconnect
    // asks for the branch stream from the pre-block cursor (exclusive, 01-F9).
    cloud.up();
    cloud.deliver(helloAck("t-01-20-reconnect"));
    expect(lastCatchupFrom(cloud.sent)).toBe(cursorBefore);

    session.stop();
    store.close();
  });
});

describe("T-01-20 — the report CLEARS when the cursor advances past the blockage (DEC-SYNC-011; 01-F11)", () => {
  it("01-F11/00 §5.7: a healthy session reports no blocked cursor — the surface must not over-report", () => {
    const { store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    expect(readBlocked(session)).toBeNull(); // fresh, nothing delivered
    cloud.deliver(
      catchupPage([
        withSeq(peerEnvelope(peer, 0, orderCreated("O-1")), 1),
        withSeq(peerEnvelope(peer, 1, orderCreated("O-2")), 2),
      ]),
    );
    expect(session.status().last_global_seq).toBe(2);
    expect(readBlocked(session)).toBeNull(); // a clean page blocks nothing

    session.stop();
    store.close();
  });

  it("DEC-SYNC-011: a TRANSIENT stall reports and then RESOLVES ITSELF — the block appears, the re-delivery lands, the field goes away with no operator action", () => {
    // A genuinely transient ingest failure is an INFRA fault (SQLITE_BUSY, a failed
    // fsync) — every deterministic device-store rejection is permanent by construction,
    // so the only honest way to script "fails once, then succeeds" is to interpose on
    // the store seam the session already consumes. Nothing about the SESSION is stubbed.
    let targetId = "";
    let healed = false;
    const device = openDevice((real) => ({
      ...real,
      ingestPage(items) {
        const idx = items.findIndex((item) => (item.envelope as { id?: string }).id === targetId);
        if (healed || idx < 0) return real.ingestPage(items);
        return [
          ...real.ingestPage(items.slice(0, idx)),
          {
            ok: false as const,
            error: new Error("simulated transient infra ingest fault (not a permanent rejection)"),
          },
          ...real.ingestPage(items.slice(idx + 1)),
        ];
      },
    }));
    const { store, session, cloud } = device;
    const peer = peerIdentity(store.identity);

    const first = peerEnvelope(peer, 0, orderCreated("O-t1"));
    const target = peerEnvelope(peer, 1, orderCreated("O-t2"));
    const after = peerEnvelope(peer, 2, orderCreated("O-t3"));
    targetId = target.id;

    const page = [withSeq(first, 1), withSeq(target, 2), withSeq(after, 3)];
    cloud.deliver(catchupPage(page));

    // IT APPEARS: the stall is reported with the blocking seq and a machine-readable reason.
    const blocked = requireBlocked(session, "a transient ingest fault at global_seq 2");
    expect(blocked.global_seq).toBe(2);
    expect(blocked.event_type).toBe("order.created");
    expectMachineReadable(blocked);
    expect(session.status().last_global_seq).toBe(1); // stopped, exactly as before T-01-20

    // IT GOES AWAY: the fault clears, catch-up re-delivers the same page (01-F9), the
    // cursor advances past the blockage, and the honesty UI stops crying wolf.
    healed = true;
    cloud.deliver(catchupPage(page));
    expect(session.status().last_global_seq).toBe(3);
    expect(storedIds(store).has(target.id)).toBe(true);
    expect(readBlocked(session)).toBeNull();

    session.stop();
    store.close();
  });
});

describe("T-01-20 — the device KEEPS OPERATING LOCALLY while blocked (DEC-SYNC-011(c); 01-F17)", () => {
  it("01-F17/DEC-SYNC-011(c): with the cursor blocked, appends still succeed, folds still project, and the outbox still pushes — a blocked catch-up never blocks a sale", () => {
    const { id, store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    const skew = peerEnvelope(peer, 0, { type: "order.teleported", payload: { x: 1 } });
    cloud.deliver(catchupPage([withSeq(skew, 1)]));
    const blocked = requireBlocked(session, "the skew block before the sale");
    expect(blocked.global_seq).toBe(1);

    // The sale rings up: append persists, the fold projects it, the honesty UI's own
    // counters keep moving. Nothing here consults the pull cursor.
    const sale = store.append(appendInput(id, orderCreated("O-sale")));
    expect(storedIds(store).has(sale.id)).toBe(true);
    expect(store.openOrders().map((o) => o.order_id)).toContain("O-sale");
    expect(store.status().queue_depth).toBeGreaterThan(0);

    // ...and it reaches the cloud: the outbox drains and the ack advances the cloud
    // write-checkpoint (19 §5) even though the PULL cursor is wedged. The two
    // directions are independent; a blocked read must never stall the write path.
    session.notifyAppended();
    const pushed = cloud.sent.filter((m) => m.kind === "push");
    expect(pushed.length).toBeGreaterThan(0);
    expect(must(pushed.at(-1), "the push").events.map((e) => e.id)).toContain(sale.id);
    cloud.deliver({ v: 1, kind: "push_ack", acked_watermark: sale.lamport_seq });
    expect(store.status().acked_watermark).toBe(sale.lamport_seq);
    expect(store.status().queue_depth).toBe(0);

    // Local life did not clear the block — it is a property of the pull cursor.
    expect(requireBlocked(session, "the block after the sale").global_seq).toBe(1);

    session.stop();
    store.close();
  });
});

describe("T-01-20 — BLOCKED is not DISCONNECTED (the two remedies differ; 01-F11/00 §5.7)", () => {
  it("01-F11/00 §5.7: a blocked cursor on a LIVE link reports connected: true AND blocked — a UI that conflates them sends staff to the wrong fix", () => {
    const { store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    cloud.deliver(
      catchupPage([withSeq(peerEnvelope(peer, 0, { type: "order.teleported", payload: {} }), 1)]),
    );

    // Both true at once: the network is fine (restore-the-network is the WRONG remedy);
    // the build is old (ship a new build is the RIGHT one).
    expect(session.status().connected).toBe(true);
    expect(requireBlocked(session, "a block on a live link")).not.toBeNull();

    session.stop();
    store.close();
  });

  it("01-F11/00 §5.7: a merely DISCONNECTED session is NOT reported as a blocked cursor (the converse non-conflation)", () => {
    const { store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    cloud.deliver(catchupPage([withSeq(peerEnvelope(peer, 0, orderCreated("O-ok")), 1)]));
    cloud.down();

    expect(session.status().connected).toBe(false);
    expect(readBlocked(session)).toBeNull(); // a WAN outage is not a blocked cursor

    session.stop();
    store.close();
  });
});

describe("T-01-20 — the DIVERGENT DUPLICATE surface must not regress (01-F34/01-F17; the OTHER permanent failure)", () => {
  it("01-F34/01-F17: a divergent duplicate is still PASSED and still surfaced in quarantined — and is NOT reported as a blocked cursor", () => {
    const { store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    const original = peerEnvelope(peer, 0, orderCreated("O-diverge"));
    cloud.deliver(catchupPage([withSeq(original, 1)]));
    expect(session.status().last_global_seq).toBe(1);

    // Same id, divergent content: its id is ALREADY stored, so re-fetching cannot help.
    // Deliberately PASSED (the cursor advances) and surfaced in `quarantined`.
    // T-2 (02-F42): `phone` is a real channel and differs from the original's `counter`, so the
    // divergence is single-variable — the old fixture also diverged by omitting `order_type`.
    const divergent = {
      ...original,
      payload: { order_id: "O-diverge", order_type: "dine_in", channel: "phone" },
    };
    const clean = peerEnvelope(peer, 1, orderCreated("O-after"));
    cloud.deliver(catchupPage([withSeq(divergent, 2), withSeq(clean, 3)]));

    expect(session.status().quarantined).toContainEqual({
      event_id: original.id,
      reason: "divergent_duplicate",
    });
    expect(session.status().last_global_seq).toBe(3); // PASSED — the pull never wedges
    expect(storedIds(store).has(clean.id)).toBe(true);
    expect(readBlocked(session)).toBeNull(); // and it is NOT a blocked cursor

    // The two surfaces are distinct and coexist: a real block after it populates
    // `blocked` while the divergent duplicate stays in `quarantined`, unduplicated.
    const skew = peerEnvelope(peer, 2, { type: "order.teleported", payload: {} });
    cloud.deliver(eventBatch([withSeq(skew, 4)]));
    const blocked = requireBlocked(session, "the block after a divergent duplicate");
    expect(blocked.global_seq).toBe(4);
    expect(blocked.reason).toBe("unknown_event_type");
    expect(session.status().last_global_seq).toBe(3);
    expect(session.status().quarantined.map((q) => q.event_id)).not.toContain(skew.id);
    expect(session.status().quarantined.filter((q) => q.event_id === original.id)).toHaveLength(1);

    session.stop();
    store.close();
  });
});

describe("T-01-20 — the surfaced reason carries NO PAYLOAD VALUES (00 §5.4; fleet health persists what it is given)", () => {
  it("00 §5.4/DEC-SYNC-011(a): a blocking event whose payload carries customer PII surfaces its TYPE and SEQ only — no payload field value anywhere in the report", () => {
    const { store, session, cloud } = openDevice();
    const peer = peerIdentity(store.identity);

    // A newer-schema-version payload stuffed with PII. The naive implementation puts
    // the validation error's message in `reason` — and Zod messages quote received
    // values, so the customer's phone number lands in doc-15 fleet health forever.
    const poison = peerEnvelope(peer, 0, {
      type: "order.created",
      schema_version: 2,
      payload: {
        order_ref: "O-pii",
        customer_name: PII_NAME,
        customer_phone: PII_PHONE,
        delivery_note: PII_NOTE,
      },
    });
    cloud.deliver(catchupPage([withSeq(poison, 7)]));

    const blocked = requireBlocked(session, "a PII-bearing newer-schema payload");
    expect(blocked.global_seq).toBe(7);
    expect(blocked.event_type).toBe("order.created");
    expectMachineReadable(blocked); // a token, not a rendered error message

    // The whole report, serialized exactly as fleet health would persist it.
    const serialized = JSON.stringify(blocked);
    for (const secret of [PII_NAME, PII_PHONE, PII_NOTE, "O-pii", "customer_phone"]) {
      expect(serialized).not.toContain(secret);
    }

    session.stop();
    store.close();
  });
});
