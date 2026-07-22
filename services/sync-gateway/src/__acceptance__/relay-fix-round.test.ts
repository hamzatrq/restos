// T-01-12 FIX ROUND oracle — gateway rulings F1/F2/F6
// (plans/wave-0/t-01-12-fix-round.md, rulings merged at 98b52a1). Authored from
// the fix-round rulings + specs/DECISIONS.md (DEC-SYNC-009, DEC-SYNC-005) +
// specs/01-kernel-sync.md (01-F8, 01-F37) ONLY (24 §3 step 2: read-only to the
// implementing session). The T-01-12 pins (relay-hub-uplink.test.ts) and the
// law-6 pins (law6-quarantine.test.ts) are untouched and stay binding.
//
// RED-AWAITING-FIX map (each red verified to fail for the ruled reason):
//   F1 — the shipped gateway fills the pushing session's OWN stream for EVERY
//        identity-mismatch quarantine (the law-6 fill, ratified under
//        pusher==author). For a RELAY-capable session that is a displacement
//        hole: a relayed mismatch's lamport_seq belongs to the ORIGIN's
//        numbering, so filling the hub's own slot at that number advances the
//        hub's watermark over a slot the hub never authored — and the hub's
//        genuine event at that slot later dies as lamport_conflict (durable
//        merged-log loss). Ruled: identity-mismatch quarantines from a
//        relay-capable session fill NO stream; nothing can wedge by not
//        filling — the garbage was never in the hub's outbox. The row is still
//        stored verbatim (01-F37). The plain-session fill SURVIVES: under
//        pusher==author the mismatch envelope's lamport_seq IS the pusher's
//        own outbox numbering (green guard below).
//   F2 — kernel.quarantine.device_id attribution = the stream semantics:
//        identity-mismatch rows attribute to session.deviceId (the only
//        authenticated identity — the claimed origin ids are unauthenticated);
//        content-class quarantines of identity-VALID envelopes stay
//        ORIGIN-attributed and origin-slot-filling (DEC-SYNC-005; the T-01-11
//        Auditor counts per origin). The origin-attribution half is pinned as
//        an added assertion in relay-hub-uplink.test.ts relay 5 (green).
//   F6 — document, don't build: the origin-existence/registry check for
//        RELAYED origins is T-01-09 — one line at the auth seam (grep-pinned
//        below via the K-08 source-read idiom; wording is free) plus
//        DEC-SYNC-009's open-dependency column in specs/DECISIONS.md (NOT
//        test-pinned — a spec-table grep is beyond this suite's reach; the
//        implementer lands it alongside).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
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
  storedWatermark,
  validEnvelope,
  validEnvelopes,
} from "./helpers.js";

/** Wave-0 hub-relay dev token (the T-01-09 capability seam — relay-hub-uplink pin). */
const relayToken = (claims: Identity): string =>
  Buffer.from(JSON.stringify({ ...claims, hub_relay: true })).toString("base64url");

let db: Db;
let verify: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  gateway = createGateway({ db, clock: makeClock() });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("F1 — identity-mismatch from a relay-capable session fills NO stream (fix round F1 / DEC-SYNC-009 / 01-F8)", () => {
  it("F1/01-F8/01-F37: a relayed identity-mismatch envelope at lamport hubOwnThrough+1 leaves the hub's OWN watermark untouched and unacked, is quarantined verbatim, and the hub's GENUINE event at that slot later merges — the review's displacement scenario, end-to-end", async () => {
    const hub = freshIdentity();
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });

    // The hub's own stream reaches through = 2 (hubOwnThrough).
    await hubSession.conn.handle(pushMsg(validEnvelopes(hub, 0, 3)));
    expect(must(ofKind(hubSession.rec.all, "push_ack").at(-1), "own ack").acked_watermark).toBe(2);

    // The displacement probe: a same-org FOREIGN-BRANCH origin's envelope
    // claiming lamport 3. The number 3 is the hub's own NEXT slot — but it
    // belongs to the ORIGIN's numbering, and the origin failed identity
    // validation; filling the hub's own slot with it displaces the hub's
    // genuine future event (F1 ruling: fill NO stream).
    const foreignBranchOrigin: Identity = {
      org_id: hub.org_id,
      branch_id: freshIdentity().branch_id,
      device_id: freshIdentity().device_id,
    };
    const mismatch = validEnvelope(foreignBranchOrigin, 3);
    await hubSession.conn.handle(pushMsg([mismatch]));

    // The hub's OWN stream watermark did NOT advance…
    expect(await storedWatermark(verify, hub.org_id, hub.device_id)).toBe(2);
    // …and no ack so far covers the displaced slot.
    for (const ack of ofKind(hubSession.rec.all, "push_ack")) {
      expect(ack.acked_watermark).toBeLessThanOrEqual(2);
    }
    // The quarantine row is still stored verbatim (01-F37 survives F1).
    const quarantined = await quarantineRows(verify, hub.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [mismatch.id, "branch_mismatch"],
    ]);
    expect(must(quarantined[0], "mismatch row").envelope).toEqual(
      JSON.parse(JSON.stringify(mismatch)),
    );

    // The hub's GENUINE own event at slot 3 merges — no lamport_conflict, no
    // durable merged-log loss.
    const genuine = validEnvelope(hub, 3);
    await hubSession.conn.handle(pushMsg([genuine]));
    const own = (await eventRows(verify, hub.org_id)).filter((r) => r.device_id === hub.device_id);
    expect(own.map((r) => r.lamport_seq)).toEqual([0, 1, 2, 3]);
    expect(own.map((r) => r.id)).toContain(genuine.id);
    expect(await storedWatermark(verify, hub.org_id, hub.device_id)).toBe(3);
    expect(must(ofKind(hubSession.rec.all, "push_ack").at(-1), "genuine ack").acked_watermark).toBe(
      3,
    );
    // No second quarantine row materialized for the genuine event.
    expect((await quarantineRows(verify, hub.org_id)).map((q) => q.reason)).toEqual([
      "branch_mismatch",
    ]);

    hubSession.conn.close();
  });

  it("F1 guard (GREEN)/01-F37/DEC-SYNC-005: a PLAIN session's identity-mismatch keeps the law-6 fill — pusher==author, so the mismatch slot IS the session's own outbox slot; the watermark advances over it and its own next event continues past it", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity); // plain dev token — no hub_relay

    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 2)));
    expect(must(ofKind(session.rec.all, "push_ack").at(-1), "own ack").acked_watermark).toBe(1);

    // The pusher's OWN outbox slot 2 carries a device-mismatched envelope: the
    // law-6 fill holds — the pusher's outbox must not wedge on its own garbage.
    const foreign = freshIdentity();
    const mismatch = validEnvelope(identity, 2, { device_id: foreign.device_id });
    await session.conn.handle(pushMsg([mismatch]));
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(2);
    expect(must(ofKind(session.rec.all, "push_ack").at(-1), "fill ack").acked_watermark).toBe(2);

    // Its own genuine NEXT event continues at slot 3 — the fill was correct.
    await session.conn.handle(pushMsg([validEnvelope(identity, 3)]));
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(3);
    const own = (await eventRows(verify, identity.org_id)).filter(
      (r) => r.device_id === identity.device_id,
    );
    expect(own.map((r) => r.lamport_seq)).toEqual([0, 1, 3]); // 2 is the quarantine-filled slot

    session.conn.close();
  });
});

describe("F2 — quarantine-row device_id attribution follows the stream semantics (fix round F2 / DEC-SYNC-005)", () => {
  it("F2/DEC-SYNC-009: identity-mismatch rows from a relay-capable hub attribute to the SESSION device — the only authenticated identity; nothing fills, nothing acks, no watermark row materializes anywhere", async () => {
    const hub = freshIdentity();
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });

    // Same org, another branch — and another org entirely (relay-7's classes).
    const otherBranchOrigin: Identity = {
      org_id: hub.org_id,
      branch_id: freshIdentity().branch_id,
      device_id: freshIdentity().device_id,
    };
    const crossBranch = validEnvelope(otherBranchOrigin, 0);
    const foreignOrg = freshIdentity();
    const crossOrg = validEnvelope(foreignOrg, 0);
    await hubSession.conn.handle(pushMsg([crossBranch, crossOrg]));

    const quarantined = await quarantineRows(verify, hub.org_id);
    const byClaimed = new Map(quarantined.map((q) => [q.claimed_event_id, q]));
    const branchRow = must(byClaimed.get(crossBranch.id), "cross-branch row");
    const orgRow = must(byClaimed.get(crossOrg.id), "cross-org row");
    expect(branchRow.reason).toBe("branch_mismatch");
    expect(orgRow.reason).toBe("org_mismatch");
    // THE ATTRIBUTION PIN (red today: the rows carry the CLAIMED origin ids —
    // unauthenticated garbage a forger controls; the T-01-11 Auditor would
    // count them against devices that never spoke).
    expect(branchRow.device_id).toBe(hub.device_id);
    expect(orgRow.device_id).toBe(hub.device_id);

    // F1 riders on a FRESH relay hub: no stream filled anywhere — no push_ack
    // at all (an ack of 0 would claim slot 0 is held — the amendment-4 guard),
    // no watermark row for the session or the claimed origins, nothing merged.
    expect(ofKind(hubSession.rec.all, "push_ack")).toHaveLength(0);
    expect(await storedWatermark(verify, hub.org_id, hub.device_id)).toBeUndefined();
    expect(await storedWatermark(verify, hub.org_id, otherBranchOrigin.device_id)).toBeUndefined();
    expect(await eventRows(verify, hub.org_id)).toHaveLength(0);
    // The live notices still go to the pushing session (unchanged law).
    expect(
      ofKind(hubSession.rec.all, "quarantine_notice")
        .map((n) => n.event_id)
        .sort(),
    ).toEqual([crossBranch.id, crossOrg.id].sort());

    hubSession.conn.close();
  });

  it("F2/DEC-SYNC-005: a PLAIN session's device_mismatch row also attributes to the SESSION device — the session's own stream is what fills, and the claimed device id is unauthenticated", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity); // plain dev token

    const foreign = freshIdentity();
    const mismatch = validEnvelope(identity, 0, { device_id: foreign.device_id });
    await session.conn.handle(pushMsg([mismatch]));

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [mismatch.id, "device_mismatch"],
    ]);
    expect(must(quarantined[0], "row").device_id).toBe(identity.device_id);
    // No watermark row ever materializes for the CLAIMED foreign device.
    expect(await storedWatermark(verify, identity.org_id, foreign.device_id)).toBeUndefined();

    session.conn.close();
  });
});

describe("F6 — document, don't build: relayed-origin existence/registry is T-01-09 (fix round F6)", () => {
  it("F6/DEC-SYNC-009: the auth seam's commentary names the relayed-ORIGIN existence/registry deferral (doc-pin via the K-08 source-read idiom; wording free)", () => {
    const text = readFileSync(fileURLToPath(new URL("../auth.ts", import.meta.url)), "utf8");
    // The seam already cites T-01-09 for the SESSION device's registry checks;
    // F6 requires one line acknowledging that relayed ORIGIN devices'
    // existence/registry membership is likewise unvalidated until T-01-09.
    expect(text).toContain("T-01-09");
    expect(/origin/i.test(text)).toBe(true);
  });
});
