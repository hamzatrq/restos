// T-01-12 oracle — hub-relayed cloud uplink for WAN-less devices (DEC-SYNC-009,
// accepted; supersedes DEC-SYNC-004's blanket no-proxy rule the shipped gateway
// still enforces). Authored from specs/DECISIONS.md (DEC-SYNC-009, DEC-SYNC-005),
// specs/01-kernel-sync.md (01-F13 amended, 01-F8, 01-F1, 01-F37),
// packages/sync-protocol/PROTOCOL.md (push row, pending clause) and the T-01-12
// contract in plans/wave-0/kernel-tasks.md ONLY (24 §3 step 2: read-only to the
// implementing session).
//
// RED-AWAITING-IMPLEMENTATION: the shipped gateway quarantines every relayed
// envelope as device_mismatch at identity-check time — so the relay tests fail
// with "expected merged rows, got none / wrong quarantine reason". That is the
// expected red reason. relay-6/relay-7 are GREEN pins: rejections that must
// SURVIVE the relay change.
//
// ── ORACLE-PINNED RELAY SURFACE (binding for the implementing session) ───────
//   • Wave-0 relay capability: the dev-token claims gain `hub_relay: true` —
//     the T-01-09 capability seam ("the hub needs a relay capability in its
//     token", T-01-12 constraint; DEC-SYNC-009 "authenticated as branch hub").
//     T-01-09 swaps the seam internals for jose + registry checks with the SAME
//     claims contract. A session whose token lacks the claim keeps the old
//     behaviour: pushing another device's events quarantines device_mismatch.
//   • A relay push carries ONE origin per push message: PROTOCOL.md's amended
//     push row makes `watermark` per-origin, and the scalar watermark can
//     describe only one origin's stream. push_ack.acked_watermark answering a
//     relay push is THAT origin's contiguous high (per-origin ack). (An
//     additive per-origin ack field is the implementer's to propose if mixed
//     batches are wanted — a PROTOCOL.md spec-review event.)
//   • Relayed events are attested, never re-authored (01-F1): merged rows carry
//     the origin's device_id/lamport_seq/envelope VERBATIM; a relay diverging
//     from stored content stays id_content_divergence; identity checks still
//     bind — the capability never crosses branch (branch_mismatch) or org
//     (org_mismatch).
//   • kernel.device_watermarks is keyed by the ORIGIN device: relay advances
//     the origin's row — its own future hello resumes past the relayed prefix —
//     and NEVER the hub session's own row.
//   • Quarantined relayed events fill the ORIGIN's lamport slot (DEC-SYNC-005):
//     the per-origin ack advances over them; the live quarantine_notice goes to
//     the pushing hub session (durable redelivery to the origin is T-01-08).
//   • The kernel.quarantine.device_id COLUMN attribution — formerly
//     deliberately unpinned — is now RULED (fix round F2, plans/wave-0/
//     t-01-12-fix-round.md): identity-mismatch rows attribute to the SESSION
//     device (pinned in relay-fix-round.test.ts); content-class rows of
//     identity-VALID envelopes stay ORIGIN-attributed (pinned in relay 5
//     below). Mixed-origin relay batches remain unpinned.
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
  registerIdentity,
  signedToken,
  storedWatermark,
  TEST_TOKEN_SECRET,
  unknownTypeEnvelope,
  validEnvelope,
  validEnvelopes,
} from "./helpers.js";

/**
 * Hub-relay token (T-01-09 M3 re-ground): the SIGNED claims gain
 * `hub_relay: true`. Same org/branch/device claims contract — the jose seam
 * validates the capability, not a different shape. openSession registers the
 * hub (counter_electron, hub-eligible), so the T-01-09 grant (claim ∧ registry
 * class) holds and these T-01-12 pins keep their relay-authorized sessions.
 */
const relayToken = (claims: Identity): string => signedToken({ ...claims, hub_relay: true });

/** A same-branch peer identity — the WAN-less ORIGIN a branch hub relays for. */
const sameBranchDevice = (of: Identity): Identity => ({
  ...of,
  device_id: freshIdentity().device_id,
});

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

describe("relay 1 — hub relays a WAN-less origin verbatim (01-F13 / DEC-SYNC-009 / 01-F1)", () => {
  it("01-F13/DEC-SYNC-009/01-F1: a branch-hub session pushes another device's events — merged under the ORIGIN's device_id/lamport_seq with the envelope verbatim, per-origin watermark acked, fanned out with global_seq, and the origin's own next hello resumes past the relayed prefix (01-F8)", async () => {
    const hub = freshIdentity();
    const origin = sameBranchDevice(hub);
    await registerIdentity(db, origin); // T-01-09: relayed origins resolve in the registry
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });
    const peer = await openSession(gateway, sameBranchDevice(hub)); // same-branch observer

    const relayed = validEnvelopes(origin, 0, 3);
    await hubSession.conn.handle(pushMsg(relayed));

    // Merged under the ORIGIN's identity, dense global_seq, envelope VERBATIM
    // (01-F1 — attested, never re-authored; stored exactly as received).
    const rows = await eventRows(verify, hub.org_id);
    expect(rows.map((r) => [r.device_id, r.lamport_seq])).toEqual([
      [origin.device_id, 0],
      [origin.device_id, 1],
      [origin.device_id, 2],
    ]);
    rows.forEach((row, i) => {
      expect(row.envelope).toEqual(relayed[i]); // byte-fidelity of the attested envelope
    });
    const firstSeq = must(rows[0], "first row").global_seq;
    rows.forEach((row, i) => {
      expect(row.global_seq).toBe(firstSeq + i);
    });
    // Nothing quarantined: the blanket device_mismatch is DROPPED for the
    // authorized branch hub (DEC-SYNC-009).
    expect(await quarantineRows(verify, hub.org_id)).toHaveLength(0);

    // Contiguity is tracked per ORIGIN device, not per session (DEC-SYNC-009):
    // the origin's watermark row advances; the hub session's own row does not exist.
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(2);
    expect(await storedWatermark(verify, hub.org_id, hub.device_id)).toBeUndefined();
    // Per-origin ack on the relay push (PROTOCOL.md: watermark is per-origin).
    const ack = must(ofKind(hubSession.rec.all, "push_ack").at(-1), "relay ack");
    expect(ack.acked_watermark).toBe(2);

    // Fan-out (01-F9/01-F34): the same-branch peer AND the pushing hub session
    // (origin-inclusive — how the hub learns the relayed events' global_seq)
    // each received the batch exactly once, every event carrying a global_seq.
    for (const rec of [peer.rec, hubSession.rec]) {
      const fanned = ofKind(rec.all, "event_batch").flatMap((b) => b.events);
      expect(fanned.map((e) => e.id)).toEqual(relayed.map((e) => e.id));
      for (const e of fanned) expect(typeof e.global_seq).toBe("number");
    }

    // The ORIGIN still owns its outbox: its own future session resumes from the
    // relayed prefix (hello_ack.resume_from = acked_watermark + 1).
    const originSession = await openSession(gateway, origin);
    expect(originSession.helloAck.resume_from).toBe(3);

    hubSession.conn.close();
    peer.conn.close();
    originSession.conn.close();
  });
});

describe("relay 2 — per-ORIGIN lamport contiguity, independent of the pushing session (01-F8 / DEC-SYNC-009)", () => {
  it("01-F8/DEC-SYNC-009: interleaved own and relayed pushes hold independent per-origin watermarks; a relayed gap holds (stop-at-gap) until the origin's contiguous re-relay completes it", async () => {
    const hub = freshIdentity();
    const origin = sameBranchDevice(hub);
    await registerIdentity(db, origin); // T-01-09: relayed origins resolve in the registry
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });

    const own = validEnvelopes(hub, 0, 3);
    const w = validEnvelopes(origin, 0, 4);

    // Own events 0..1 → the session's own stream acks 1.
    await hubSession.conn.handle(pushMsg([must(own[0], "h0"), must(own[1], "h1")]));
    expect(must(ofKind(hubSession.rec.all, "push_ack").at(-1), "own ack").acked_watermark).toBe(1);

    // Relay origin 0 → the ORIGIN's stream acks 0 — NOT the session's 1.
    await hubSession.conn.handle(pushMsg([must(w[0], "w0")]));
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(0);
    expect(must(ofKind(hubSession.rec.all, "push_ack").at(-1), "relay ack").acked_watermark).toBe(
      0,
    );

    // Own 2 → own stream advances to 2; origin's stream is untouched.
    await hubSession.conn.handle(pushMsg([must(own[2], "h2")]));
    expect(await storedWatermark(verify, hub.org_id, hub.device_id)).toBe(2);
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(0);

    // Relayed gap: origin [2,3] while 1 is missing → stop-at-gap per ORIGIN —
    // nothing stored, the origin's watermark unmoved (01-F8; T-01-07 law 7).
    await hubSession.conn.handle(pushMsg([must(w[2], "w2"), must(w[3], "w3")]));
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(0);
    let originRows = (await eventRows(verify, hub.org_id)).filter(
      (r) => r.device_id === origin.device_id,
    );
    expect(originRows.map((r) => r.lamport_seq)).toEqual([0]);

    // The contiguous re-relay completes the origin's sequence.
    await hubSession.conn.handle(pushMsg([must(w[1], "w1"), must(w[2], "w2"), must(w[3], "w3")]));
    expect(must(ofKind(hubSession.rec.all, "push_ack").at(-1), "final ack").acked_watermark).toBe(
      3,
    );
    originRows = (await eventRows(verify, hub.org_id)).filter(
      (r) => r.device_id === origin.device_id,
    );
    expect(originRows.map((r) => r.lamport_seq)).toEqual([0, 1, 2, 3]); // gap-free per origin
    const hubRows = (await eventRows(verify, hub.org_id)).filter(
      (r) => r.device_id === hub.device_id,
    );
    expect(hubRows.map((r) => r.lamport_seq)).toEqual([0, 1, 2]); // own stream independent
    expect(await storedWatermark(verify, hub.org_id, hub.device_id)).toBe(2);
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(3);

    hubSession.conn.close();
  });
});

describe("relay 3 — both delivery paths, no double-merge (01-F8 / DEC-SYNC-009)", () => {
  it("01-F8/DEC-SYNC-009: events delivered by BOTH the origin's own session and the hub relay merge exactly once (id dedupe), fan exactly once, and the origin's resume_from reflects the union — per-device sessions remain the default", async () => {
    const hub = freshIdentity();
    const origin = sameBranchDevice(hub);
    const originSession = await openSession(gateway, origin);
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });
    const peer = await openSession(gateway, sameBranchDevice(hub)); // fan-out observer

    const w = validEnvelopes(origin, 0, 3);

    // Origin pushes 0..1 over its OWN session (the default path, still primary).
    await originSession.conn.handle(pushMsg([must(w[0], "w0"), must(w[1], "w1")]));
    expect(must(ofKind(originSession.rec.all, "push_ack").at(-1), "own ack").acked_watermark).toBe(
      1,
    );

    // The hub relays the SAME stream 0..2: 0..1 dedupe by id, 2 merges — one
    // copy of each in the ledger, the origin's watermark reaches 2.
    await hubSession.conn.handle(pushMsg(w));
    const rows = (await eventRows(verify, hub.org_id)).filter(
      (r) => r.device_id === origin.device_id,
    );
    expect(rows.map((r) => r.lamport_seq)).toEqual([0, 1, 2]); // exactly once each
    expect(rows.map((r) => r.id)).toEqual(w.map((e) => e.id));
    expect(await quarantineRows(verify, hub.org_id)).toHaveLength(0);
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(2);
    expect(must(ofKind(hubSession.rec.all, "push_ack").at(-1), "relay ack").acked_watermark).toBe(
      2,
    );

    // The origin re-pushes 2 itself (it may not know the relay beat it): dedupe,
    // same ack, still three rows (01-F8 idempotent retry).
    await originSession.conn.handle(pushMsg([must(w[2], "w2")], 2));
    expect(
      must(ofKind(originSession.rec.all, "push_ack").at(-1), "retry ack").acked_watermark,
    ).toBe(2);
    expect(
      (await eventRows(verify, hub.org_id)).filter((r) => r.device_id === origin.device_id),
    ).toHaveLength(3);

    // Fan-out reached the observer exactly once per id — no re-fan of deduped
    // deliveries (T-01-07 law 2, surviving the relay path).
    const fannedIds = ofKind(peer.rec.all, "event_batch")
      .flatMap((b) => b.events)
      .map((e) => e.id);
    expect([...fannedIds].sort()).toEqual(w.map((e) => e.id).sort());

    // The origin's next session resumes past the union of both paths.
    originSession.conn.close();
    const resumed = await openSession(gateway, origin);
    expect(resumed.helloAck.resume_from).toBe(3);

    hubSession.conn.close();
    peer.conn.close();
    resumed.conn.close();
  });
});

describe("relay 4 — attested, never re-authored (01-F1 / DEC-SYNC-009)", () => {
  it("01-F1/DEC-SYNC-009: a hub relay diverging from the origin's stored content quarantines id_content_divergence with the stored row untouched; a fresh id at an occupied origin slot quarantines lamport_conflict — the capability licenses relay, never re-authoring", async () => {
    const hub = freshIdentity();
    const origin = sameBranchDevice(hub);
    const originSession = await openSession(gateway, origin);
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });

    const w0 = validEnvelope(origin, 0);
    await originSession.conn.handle(pushMsg([w0]));

    // A "relay" whose payload was rewritten: same id, divergent content. The
    // relay capability must NOT relax the divergence check — quarantine, and
    // the stored row stays byte-identical (01-F1: never overwrite).
    const tampered = { ...w0, payload: { order_id: "re-authored", channel: "counter" } };
    await hubSession.conn.handle(pushMsg([tampered]));
    let quarantined = await quarantineRows(verify, hub.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [w0.id, "id_content_divergence"],
    ]);
    const stored = (await eventRows(verify, hub.org_id)).filter((r) => r.id === w0.id);
    expect(must(stored[0], "stored w0").envelope).toEqual(w0); // untouched

    // A forged FRESH event id claiming the origin's already-persisted slot 0.
    const forged = validEnvelope(origin, 0);
    await hubSession.conn.handle(pushMsg([forged]));
    quarantined = await quarantineRows(verify, hub.org_id);
    expect(quarantined.map((q) => q.reason).sort()).toEqual([
      "id_content_divergence",
      "lamport_conflict",
    ]);
    expect(
      (await eventRows(verify, hub.org_id)).filter((r) => r.device_id === origin.device_id),
    ).toHaveLength(1); // still only the origin's genuine event

    originSession.conn.close();
    hubSession.conn.close();
  });
});

describe("relay 5 — a quarantined relayed event fills its ORIGIN's slot (DEC-SYNC-005 / 01-F37)", () => {
  it("DEC-SYNC-005/01-F37/DEC-SYNC-009: a poison event inside a relayed stream quarantines verbatim, fills the ORIGIN's lamport slot, and the per-origin ack advances over it — the origin's stream stays gap-free modulo quarantine and its outbox never wedges (01-F17)", async () => {
    const hub = freshIdentity();
    const origin = sameBranchDevice(hub);
    await registerIdentity(db, origin); // T-01-09: relayed origins resolve in the registry
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });

    const good0 = validEnvelope(origin, 0);
    const poison1 = unknownTypeEnvelope(origin, 1);
    const good2 = validEnvelope(origin, 2);
    await hubSession.conn.handle(pushMsg([good0, poison1, good2]));

    // Clean events merged under the origin; the poison quarantined verbatim.
    const originRows = (await eventRows(verify, hub.org_id)).filter(
      (r) => r.device_id === origin.device_id,
    );
    expect(originRows.map((r) => r.lamport_seq)).toEqual([0, 2]);
    const quarantined = await quarantineRows(verify, hub.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [poison1.id, "schema_invalid"],
    ]);
    expect(must(quarantined[0], "row").envelope).toEqual(poison1); // verbatim, origin identity inside
    // Fix round F2 (ruled): a content-class quarantine of an identity-VALID
    // relayed envelope keeps ORIGIN attribution — the T-01-11 Auditor counts
    // slot-fills per origin (DEC-SYNC-005), never against the relaying hub.
    expect(must(quarantined[0], "row").device_id).toBe(origin.device_id);

    // The ORIGIN's slot is durably filled (DEC-SYNC-005): the per-origin
    // watermark advances over the poisoned slot — union gap-free 0..2.
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(2);
    const ack = must(ofKind(hubSession.rec.all, "push_ack").at(-1), "relay ack");
    expect(ack.acked_watermark).toBe(2);
    const quarantineLamports = quarantined.map((q) =>
      Number((q.envelope as { lamport_seq?: unknown }).lamport_seq),
    );
    expect(
      [...originRows.map((r) => r.lamport_seq), ...quarantineLamports].sort((x, y) => x - y),
    ).toEqual([0, 1, 2]); // the Auditor's slot-filling reading (T-01-11)

    // The live quarantine_notice goes to the PUSHING hub session (durable
    // redelivery to the origin itself is T-01-08, not pinned here).
    const notices = ofKind(hubSession.rec.all, "quarantine_notice");
    expect(notices.map((n) => n.event_id)).toEqual([poison1.id]);

    hubSession.conn.close();
  });
});

describe("relay 6 — the auth boundary: no capability, no relay (01-F27 / T-01-09 seam)", () => {
  it("01-F27/DEC-SYNC-009 (T-01-09 capability seam): a session WITHOUT the hub-relay capability pushing another device's events is rejected — device_mismatch quarantine, nothing merged for the foreign device; its OWN events still merge", async () => {
    const identity = freshIdentity();
    const foreignDevice = sameBranchDevice(identity);
    const session = await openSession(gateway, identity); // plain dev token — no hub_relay

    // Its own events merge normally (the default path is untouched).
    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 2)));
    expect(must(ofKind(session.rec.all, "push_ack").at(-1), "own ack").acked_watermark).toBe(1);

    // Another device's events from a NON-hub session: the superseded-rule
    // rejection SURVIVES DEC-SYNC-009 — an unauthorized session must never
    // speak for another device (a hub must not be forgeable by any session).
    const foreign = validEnvelope(foreignDevice, 0);
    await session.conn.handle(pushMsg([foreign]));

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [foreign.id, "device_mismatch"],
    ]);
    const rows = await eventRows(verify, identity.org_id);
    expect(rows.filter((r) => r.device_id === foreignDevice.device_id)).toHaveLength(0);
    expect(rows.map((r) => r.device_id)).toEqual([identity.device_id, identity.device_id]);
    // No per-origin watermark materializes for the rejected origin.
    expect(await storedWatermark(verify, identity.org_id, foreignDevice.device_id)).toBeUndefined();

    session.conn.close();
  });
});

describe("relay 7 — the capability never crosses branch or org (DEC-SYNC-009 / 00 §5.4)", () => {
  it("DEC-SYNC-009/01-F37: a relay-capable hub pushing events for a foreign-BRANCH or foreign-ORG origin is rejected — branch_mismatch / org_mismatch quarantine, nothing merged (the origin must belong to the hub's own org+branch)", async () => {
    const hub = freshIdentity();
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });

    // Same org, another branch: the hub is not that branch's uplink.
    const otherBranchOrigin: Identity = {
      org_id: hub.org_id,
      branch_id: freshIdentity().branch_id,
      device_id: freshIdentity().device_id,
    };
    const crossBranch = validEnvelope(otherBranchOrigin, 0);
    // Another org entirely.
    const foreignOrg = freshIdentity();
    const crossOrg = validEnvelope(foreignOrg, 0);
    await hubSession.conn.handle(pushMsg([crossBranch, crossOrg]));

    const quarantined = await quarantineRows(verify, hub.org_id);
    const reasonByClaimedId = new Map(quarantined.map((q) => [q.claimed_event_id, q.reason]));
    expect(reasonByClaimedId.get(crossBranch.id)).toBe("branch_mismatch");
    expect(reasonByClaimedId.get(crossOrg.id)).toBe("org_mismatch");
    expect(await eventRows(verify, hub.org_id)).toHaveLength(0);
    expect(await eventRows(verify, foreignOrg.org_id)).toHaveLength(0); // nothing leaked cross-org

    hubSession.conn.close();
  });
});
