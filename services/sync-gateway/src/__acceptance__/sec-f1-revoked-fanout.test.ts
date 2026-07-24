// sec-F1 — revocation must block READS (fan-out), not only WRITES.
// audit-1 finding #1 (HIGH) + the T-01-09 fix docket's own filed F3: the shipped
// gateway re-checks revocation only on the INBOUND paths (push / catchup, via
// requireUnrevoked). Fan-out membership (branchSets) is pruned solely on socket
// close. So a device that only RECEIVES — a PURE READER that never pushes or
// catches up — is never re-checked: once revoked it keeps receiving every
// order / payment / refund for its branch until it chooses to disconnect. That
// is a confidentiality breach of the revocation contract (01-F25 / 01-F42 kill
// switch; registry authority, 18 §5). The pin: on revocation the device stops
// receiving fan-out AND is actively torn down (dropped from branchSets + a
// purge_command, the same 01-F42 signal a revoked hello gets) — while a
// still-authorized same-branch peer keeps receiving normally.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway, revokeDevice } from "../index.js";
import {
  closeDb,
  type Db,
  freshIdentity,
  makeClock,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  TEST_TOKEN_SECRET,
  validEnvelopes,
} from "./helpers.js";

let db: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
});

describe("sec-F1 — a revoked device must stop receiving fan-out (audit-1 #1 / T-01-09 F3)", () => {
  it("01-F25/01-F42, 18 §5: a revoked PURE READER (never pushed/caught-up) receives no further fan-out and is evicted+purged; a still-authorized peer keeps receiving", async () => {
    const producer = freshIdentity(); // A — produces the branch events
    const reader = { ...producer, device_id: freshIdentity().device_id }; // R — same branch, PURE READER
    const bystander = { ...producer, device_id: freshIdentity().device_id }; // B — same branch, stays authorized

    const a = await openSession(gateway, producer);
    const r = await openSession(gateway, reader);
    const b = await openSession(gateway, bystander);

    // Baseline: R and B are genuinely on the branch fan-out — A's order.created
    // reaches both. (R never pushes or catches up in this whole test: it is a
    // pure reader, the exact case requireUnrevoked's write-only gate never sees.)
    await a.conn.handle(pushMsg(validEnvelopes(producer, 0, 1)));
    const rBatchesBefore = ofKind(r.rec.all, "event_batch").length;
    expect(rBatchesBefore, "reader is receiving fan-out before revocation").toBe(1);
    expect(ofKind(b.rec.all, "event_batch"), "bystander is receiving fan-out too").toHaveLength(1);

    // R is revoked mid-session. Because R only ever RECEIVES, requireUnrevoked
    // (push/catchup) can never fire for it — only the read/fan-out path can
    // enforce revocation here.
    await revokeDevice(db, { org_id: reader.org_id, device_id: reader.device_id });

    // A NEW branch event is produced after the revocation.
    await a.conn.handle(pushMsg(validEnvelopes(producer, 1, 1)));

    // PIN 1 (confidentiality): the revoked reader receives NO further fan-out.
    // On the shipped code it DOES (the leak) → count grows to 2 → fails red for
    // the real reason.
    expect(
      ofKind(r.rec.all, "event_batch"),
      "revoked reader must receive NO further fan-out",
    ).toHaveLength(rBatchesBefore);

    // PIN 2 (eviction): the reader is actively torn down — a purge_command
    // { scope: "all" } (01-F42), the same kill signal a revoked hello receives,
    // is the observable proof it was evicted from branchSets rather than merely
    // skipped once. On the shipped code no purge is sent → fails red.
    expect(
      ofKind(r.rec.all, "purge_command"),
      "revoked reader is purged / evicted from fan-out",
    ).toHaveLength(1);

    // GREEN GUARD: the still-authorized peer B keeps receiving normally — the
    // fix must evict the REVOKED device only, never "everyone" in the branch.
    expect(
      ofKind(b.rec.all, "event_batch"),
      "still-authorized peer keeps receiving the second event",
    ).toHaveLength(2);
    // And the producer's own second event merged and fanned back to itself.
    expect(
      ofKind(a.rec.all, "event_batch"),
      "producer keeps receiving its own fan-out",
    ).toHaveLength(2);

    a.conn.close();
    r.conn.close();
    b.conn.close();
  });
});
