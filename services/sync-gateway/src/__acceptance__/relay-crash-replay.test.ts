// T-01-09 FIX ROUND oracle — ruling F1(a), gateway half
// (plans/wave-0/t-01-09-fix-round.md @08a1b72, BINDING): dedupe-before-origin-
// gate in the relay push path. Authored from the fix-round ruling +
// specs/DECISIONS.md (DEC-SYNC-009, DEC-SYNC-005) + specs/01-kernel-sync.md
// (01-F8, 01-F25, 01-F37) ONLY (24 §3 step 2: read-only to the implementing
// session). The T-01-09 origin-gate pins (relay-origin-registry.test.ts) are
// untouched and stay binding — they gate NEW ids only; THIS file pins what the
// gate must never touch: ids already merged.
//
// RED-AWAITING-FIX (verified to fail for the ruled reason): the shipped
// gateway runs the origin-registry gate (step 1.5) BEFORE dedupe (step 3), so
// a crash-replayed prefix of ALREADY-MERGED events from a since-revoked origin
// mints origin_revoked quarantine rows for ids that sit in kernel.events (the
// merged-AND-quarantined contradiction, review scenario B) and answers NO
// push_ack — the rebooted hub's relay cursor never advances and it re-pushes
// the same prefix forever. Ruled: an event already in kernel.events acks
// through REGARDLESS of the origin's current registry state — its identity was
// authoritative at merge time. No quarantine row for merged ids; the per-origin
// ack advances; nothing double-merges (01-F8 — the dedupe fill is the same
// watermark credit a same-content duplicate always earned).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway, registerDevice, revokeDevice } from "../index.js";
import {
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  quarantineRows,
  signedToken,
  storedWatermark,
  TEST_TOKEN_SECRET,
  validEnvelopes,
} from "./helpers.js";

/** Hub-relay token (T-01-09 signed claims carrying hub_relay; the explicit
 * counter_electron registration below makes the grant hold). */
const relayToken = (claims: Identity): string => signedToken({ ...claims, hub_relay: true });

let db: Db;
let verify: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("F1(a) — dedupe-before-origin-gate: a crash-replayed merged prefix acks through the origin's revocation (t-01-09-fix-round F1 / DEC-SYNC-009 / 01-F8 / 01-F25)", () => {
  it("F1(a)/01-F8/01-F25: merge O:0..2 via relay → revoke O → a rebooted hub re-relays 0..2 — NO quarantine rows for the merged ids, the push_ack answers the origin stream (2), nothing double-merged", async () => {
    const hub = freshIdentity();
    const origin: Identity = { ...hub, device_id: freshIdentity().device_id };
    await registerDevice(db, { ...hub, device_class: "counter_electron" });
    await registerDevice(db, { ...origin, device_class: "waiter" });

    // Life 1: the hub relays the WAN-less origin's prefix 0..2 — merged, acked.
    const first = await openSession(gateway, hub, { token: relayToken(hub) });
    const relayed = validEnvelopes(origin, 0, 3);
    await first.conn.handle(pushMsg(relayed));
    const firstAck = must(ofKind(first.rec.all, "push_ack").at(-1), "first relay ack");
    expect(firstAck.acked_watermark).toBe(2);
    expect(firstAck.origin_device_id).toBe(origin.device_id);
    expect((await eventRows(verify, hub.org_id)).map((r) => r.id)).toEqual(
      relayed.map((e) => e.id),
    );
    first.conn.close();

    // The origin is revoked AFTER its prefix merged (01-F25 next-contact).
    await revokeDevice(db, { org_id: hub.org_id, device_id: origin.device_id });

    // Life 2 — the crash-replay: a rebooted hub lost its VOLATILE per-origin
    // relay cursor (session-local by design, T-01-12) and re-relays the same
    // merged prefix from zero, verbatim.
    const second = await openSession(gateway, hub, { token: relayToken(hub) });
    await second.conn.handle(pushMsg(relayed));

    // PIN 1 (the ruled core): NO quarantine row is minted for an id already in
    // kernel.events — its identity was authoritative at merge time. RED today:
    // three origin_revoked rows appear here (the merged-AND-quarantined
    // contradiction), which is the wrong behavior this red run demonstrates.
    expect(await quarantineRows(verify, hub.org_id)).toEqual([]);
    // PIN 2: no live quarantine_notice frames name the merged ids either.
    expect(ofKind(second.rec.all, "quarantine_notice")).toEqual([]);
    // PIN 3: the push_ack answers the origin's contiguous high — the rebooted
    // hub's relay cursor advances instead of re-pushing forever. RED today: no
    // push_ack at all (the all-quarantined relay push names no origin).
    const replayAck = must(ofKind(second.rec.all, "push_ack").at(-1), "crash-replay ack");
    expect(replayAck.acked_watermark).toBe(2);
    expect(replayAck.origin_device_id).toBe(origin.device_id);
    // PIN 4: nothing double-merged, nothing re-authored (01-F8/01-F1): the same
    // three rows stand, per-origin lamport order intact.
    const rows = await eventRows(verify, hub.org_id);
    expect(rows.map((r) => r.id)).toEqual(relayed.map((e) => e.id));
    expect(rows.map((r) => [r.device_id, r.lamport_seq])).toEqual([
      [origin.device_id, 0],
      [origin.device_id, 1],
      [origin.device_id, 2],
    ]);
    // PIN 5: the origin's durable watermark is undisturbed by the replay.
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(2);

    second.conn.close();
  });
});
