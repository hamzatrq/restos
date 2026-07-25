// T-01-21 oracle — the WIDENED quarantine key (org_id, claimed_event_id,
// device_id) (plans/wave-0/t-01-21-quarantine-key.md; senior review audit-1.md
// #6 "widen the key" / #7 "merged-AND-quarantined placeholder"). Authored from
// specs/01-kernel-sync.md (01-F1 append-only / "relayed events are attested by
// the hub, NEVER re-authored"; 01-F8 push/ack/idempotency; 01-F13 hub relay;
// 01-F17 a sale is never blocked; 01-F37 rejection & quarantine — "stored
// VERBATIM … surfaced to fleet health … originating device notified … a
// quarantined event is durably stored, so it FILLS ITS LAMPORT SLOT") +
// specs/DECISIONS.md (DEC-SYNC-005, DEC-SYNC-008, DEC-SYNC-009) + the corrected
// F2-amend ruling in plans/wave-0/t-01-11-fix-round.md ONLY (24 §3 step 2:
// read-only to the implementing session). Every landed pin — law6-quarantine,
// relay-fix-round, relay-origin-registry, relay-hub-uplink, auditor-*,
// notice-outbox — stays binding; nothing here relaxes them.
//
// THE DEFECT (audit-1 #6). kernel.quarantine is keyed UNIQUE(org_id,
// claimed_event_id) org-wide, so the FIRST device to claim an event id owns the
// only slot and every later claimant's insert is an ON CONFLICT DO NOTHING
// no-op. An honest origin arriving second therefore has its envelope DISCARDED
// ENTIRELY — the bytes are gone, not merely mis-attributed. A trivial insider
// pre-claim, or the DEC-SYNC-009 unregistered→registered relay race, destroys
// exactly the evidence 01-F37 exists to preserve. The T-01-11 F2-amend credit
// law ("credit the origin's slot UNLESS the blocking row is this SAME origin's
// own row at a DIFFERENT slot") stops the honest origin WEDGING, but saves none
// of its bytes: it is a correct patch on a key that is too narrow.
//
// ── ORACLE-PINNED SCHEMA (binding for the implementing session) ──────────────
//   kernel.quarantine's uniqueness is (org_id, claimed_event_id, device_id) —
//   one row PER CLAIMANT DEVICE per claimed event id. The org-wide
//   (org_id, claimed_event_id) unique index is GONE (its continued existence
//   would make the widened key unreachable). device_id keeps its landed
//   attribution law (t-01-12 F2): identity-mismatch and origin_unregistered
//   rows carry the SESSION device (the only authenticated identity);
//   content-class rows of identity-valid envelopes, and origin_revoked, carry
//   the ORIGIN (DEC-SYNC-005 — slot-filling and the T-01-11 Auditor gap leg are
//   per-origin questions).
//   Review #7 (PENDING RULING — see the last describe): resolution (b) adds
//   `superseded_at bigint null` (null ⇔ live), and the doc-15 fleet-health read
//   seam (listQuarantine) filters superseded rows out of live quarantine.
//
// RED-AWAITING-IMPLEMENTATION map (each red verified to fail for this reason):
//   key      — the unique index is still the org-wide pair.
//   bytes    — the honest origin's envelope is not stored at all: one row, the
//              pre-claimer's. THE HEADLINE (audit-1 #6).
//   P1       — never-wedge holds (the F2-amend credit fires) but the origin's
//              slot is covered by NO origin-attributed row, so the Auditor
//              reports a lamport_gap the widened key must retire.
//   P2       — the relayed identity-MISMATCH row is not stored when the claimed
//              id is already held; no-displacement itself is green and must
//              stay green.
//   insider  — the honest origin has no row of its own to attribute.
//   race     — GREEN guard (the F2-amend + heal-in-place already carry it); it
//              must survive the key change, hence the pin.
//   #7       — the leftover origin_unregistered placeholders of events that
//              LATER MERGED are still returned as live quarantine.
import type { EventEnvelopeT } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import * as gatewayModule from "../index.js";
import { createGateway } from "../index.js";
import { byCheck, runAuditor } from "./auditor-builders.js";
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
  type Session,
  signedToken,
  storedWatermark,
  TEST_TOKEN_SECRET,
  unknownTypeEnvelope,
  validEnvelope,
  validEnvelopes,
} from "./helpers.js";

/** The landed doc-15 fleet-health read seam (01-F37 "surfaced to fleet health"). */
type QuarantineEntry = { claimed_event_id: string; device_id: string; reason: string };
const { listQuarantine } = gatewayModule as unknown as {
  listQuarantine(
    db: Db,
    filter: { org_id: string; branch_id?: string; device_id?: string; limit?: number },
  ): Promise<QuarantineEntry[]>;
};

/** Hub-relay token (DEC-SYNC-009: claim ∧ hub-eligible registry class). */
const relayToken = (claims: Identity): string => signedToken({ ...claims, hub_relay: true });

const NUL = String.fromCharCode(0); // storage_reject trigger (U+0000), out of source bytes.

/** Registry-valid, jsonb-UNSTORABLE order.created — the storage_reject poison. */
const storagePoison = (origin: Identity, lamportSeq: number): EventEnvelopeT =>
  validEnvelope(origin, lamportSeq, { payload: { order_id: `${NUL}-nul`, channel: "counter" } });

/** A same-org/branch peer — the WAN-less origin a hub relays for (01-F13). */
const peerOf = (of: Identity, suffix: string): Identity => ({
  ...of,
  device_id: `${of.device_id}-${suffix}`,
});

type Row = { device_id: string; branch_id: string; reason: string; envelope: unknown };

/** EVERY quarantine row for one claimed event id — the widened key admits more
 * than one, so nothing here may assume a single row or a stable order. */
const rowsFor = async (database: Db, orgId: string, claimedEventId: string): Promise<Row[]> => {
  const rows = await database.execute(
    sql`select device_id, branch_id, reason, envelope from kernel.quarantine
        where org_id = ${orgId} and claimed_event_id = ${claimedEventId}`,
  );
  return [...rows].map((row) => ({
    device_id: String(row.device_id),
    branch_id: String(row.branch_id),
    reason: String(row.reason),
    envelope: JSON.parse(String(row.envelope)) as unknown,
  }));
};

const byDeviceId = (rows: readonly Row[]): Map<string, Row> =>
  new Map(rows.map((row) => [row.device_id, row]));

/**
 * The envelope AS THE WIRE DELIVERED IT — the verbatim compare for 01-F37
 * ("stored verbatim") / 01-F1 ("relayed events are attested … never
 * re-authored"). The pin is against the DECODED push, not the pre-wire literal:
 * what the codec puts on the wire is @restos/sync-protocol's call, and the law
 * this file pins is that the gateway stores what it received without rewriting a
 * byte of it.
 */
const asReceived = (envelope: EventEnvelopeT): unknown => {
  const message = pushMsg([envelope]);
  if (message.kind !== "push") throw new Error("pushMsg did not build a push message");
  return JSON.parse(JSON.stringify(must(message.events[0], "the decoded wire envelope")));
};

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

/**
 * The audit-1 #6 shape, built through the LANDED pipeline only: a registered
 * same-branch insider A pre-claims (org, X) under its OWN identity with a
 * registry-unknown envelope; the hub then relays the honest WAN-less origin O's
 * outbox, whose slot-1 event genuinely bears id X and is a storage_reject
 * poison. Two DIFFERENT envelopes, one claimed id, two distinct claimants.
 */
type Preclaimed = {
  hub: Identity;
  origin: Identity;
  insider: Identity;
  poison: EventEnvelopeT;
  preclaim: EventEnvelopeT;
  outbox: EventEnvelopeT[];
  relay: Session;
};

const preclaimedRelay = async (): Promise<Preclaimed> => {
  const hub = freshIdentity();
  const origin = peerOf(hub, "w"); // the WAN-less origin (01-F13 relayed)
  const insider = peerOf(hub, "a"); // a plain same-branch device with its own session
  await registerIdentity(db, origin, "waiter");
  await registerIdentity(db, insider);

  // O's outbox is fixed first so the poison's id is knowable to the pre-claimer.
  const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
  const poison = must(outbox[1], "the origin's slot-1 poison");
  const preclaim = { ...unknownTypeEnvelope(insider, 0), id: poison.id };

  const insiderSession = await openSession(gateway, insider);
  await insiderSession.conn.handle(pushMsg([preclaim]));
  insiderSession.conn.close();

  const relay = await openSession(gateway, hub, { token: relayToken(hub) });
  await relay.conn.handle(pushMsg(outbox));
  return { hub, origin, insider, poison, preclaim, outbox, relay };
};

describe("T-01-21 key — kernel.quarantine is keyed per CLAIMANT (01-F37 / audit-1 #6)", () => {
  it("01-F37: the quarantine uniqueness is (org_id, claimed_event_id, device_id) — the org-wide (org_id, claimed_event_id) index, which lets the first claimant own the only slot, is gone", async () => {
    const rows = await db.execute(
      sql`select i.relname as index_name,
                 (select array_agg(a.attname::text order by k.ord)
                    from unnest(x.indkey) with ordinality as k(attnum, ord)
                    join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum) as cols
          from pg_index x
          join pg_class i on i.oid = x.indexrelid
          join pg_class t on t.oid = x.indrelid
          join pg_namespace n on n.oid = t.relnamespace
          where n.nspname = 'kernel' and t.relname = 'quarantine' and x.indisunique`,
    );
    // The driver returns text[] as a JS array; normalize the literal form too.
    const columnsOf = (value: unknown): string[] =>
      (Array.isArray(value)
        ? value.map(String)
        : String(value)
            .replace(/^\{|\}$/g, "")
            .split(",")
      ).filter((column) => column.length > 0);
    const uniqueKeys = [...rows].map((row) => columnsOf(row.cols).sort().join(","));

    expect(uniqueKeys).toContain("claimed_event_id,device_id,org_id");
    expect(uniqueKeys).not.toContain("claimed_event_id,org_id");
  });
});

describe("BYTES — both claimants' envelopes are durably stored, each verbatim (01-F37 / 01-F1 / audit-1 #6)", () => {
  it("01-F37/01-F1: a foreign pre-claim of (org, event_id) no longer discards the honest origin's genuinely-different envelope — BOTH rows exist, each attributed to its own claimant, each stored verbatim and never re-authored", async () => {
    const { hub, origin, insider, poison, preclaim, relay } = await preclaimedRelay();
    relay.conn.close();

    const rows = await rowsFor(db, hub.org_id, poison.id);
    const claimants = byDeviceId(rows);
    // THE HEADLINE: today the honest origin's bytes are gone entirely — one row,
    // the pre-claimer's, and no record anywhere of what O actually sent.
    expect([...claimants.keys()].sort()).toEqual([insider.device_id, origin.device_id].sort());

    const originRow = must(claimants.get(origin.device_id), "the honest origin's own row");
    const insiderRow = must(claimants.get(insider.device_id), "the pre-claimer's row");
    expect(originRow.reason).toBe("storage_reject"); // the TRUE class of O's event
    expect(insiderRow.reason).toBe("schema_invalid"); // A's own, untouched
    // Verbatim, both (01-F37 "stored verbatim"; 01-F1 — a relay never re-authors).
    expect(originRow.envelope).toEqual(asReceived(poison));
    expect(insiderRow.envelope).toEqual(asReceived(preclaim));
    // …and they are genuinely different bytes: the key must keep BOTH, not pick.
    expect(originRow.envelope).not.toEqual(insiderRow.envelope);
    expect(originRow.branch_id).toBe(origin.branch_id);
  });
});

describe("P1 — slot-fill / never-wedge survives the wider key (DEC-SYNC-005 / 01-F8 / 01-F17)", () => {
  it("DEC-SYNC-005/01-F8/01-F37: a durably-stored quarantine row fills its ORIGIN's lamport slot — the relayed WAN-less origin's ack advances past the poison, its tail merges, and (the widened key's payoff) the Auditor reports NO lamport_gap, because the slot is covered by the ORIGIN'S OWN row", async () => {
    const { hub, origin, insider, relay } = await preclaimedRelay();

    // Never-wedge (green today via the F2-amend credit, and it must stay green).
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBe(2);
    const ack = must(ofKind(relay.rec.all, "push_ack").at(-1), "the relayed push_ack");
    expect(ack.acked_watermark).toBe(2);
    expect(ack.origin_device_id).toBe(origin.device_id); // per-ORIGIN ack (DEC-SYNC-009)
    relay.conn.close();

    const merged = (await eventRows(db, hub.org_id))
      .filter((row) => row.device_id === origin.device_id)
      .map((row) => row.lamport_seq)
      .sort((a, b) => a - b);
    expect(merged).toEqual([0, 2]); // slot 1 is the poison, durably quarantined

    // RED today: the coverage law's premise ("the slot is durably held by the
    // row") is false at the narrow key — no O-attributed row exists, so the
    // credited slot 1 surfaces as a gap. The widened key makes the premise true.
    const report = await runAuditor({ db, org_id: hub.org_id });
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === origin.device_id)).toEqual(
      [],
    );
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === insider.device_id)).toEqual(
      [],
    );
  });
});

describe("P2 — no slot displacement under the wider key (t-01-12 F1 / DEC-SYNC-009 / 01-F8)", () => {
  it("F1/01-F37: a relayed identity-MISMATCH envelope fills NO stream even when another device already holds its claimed id — the hub's own watermark never advances over the borrowed lamport, the hub's GENUINE event at that slot still merges, and the mismatch bytes are stored as the HUB's own row alongside the pre-claimer's", async () => {
    const hub = freshIdentity();
    const preClaimer = peerOf(hub, "p");
    await registerIdentity(db, preClaimer);
    const hubSession = await openSession(gateway, hub, { token: relayToken(hub) });

    // The hub's own stream reaches through = 2.
    await hubSession.conn.handle(pushMsg(validEnvelopes(hub, 0, 3)));
    expect(must(ofKind(hubSession.rec.all, "push_ack").at(-1), "own ack").acked_watermark).toBe(2);

    // The displacement probe: a same-org FOREIGN-BRANCH origin's envelope
    // claiming lamport 3 — the hub's own next slot, but in the ORIGIN's
    // numbering. Its id is pre-claimed by a third device first.
    const foreignBranchOrigin: Identity = {
      org_id: hub.org_id,
      branch_id: freshIdentity().branch_id,
      device_id: freshIdentity().device_id,
    };
    const mismatch = validEnvelope(foreignBranchOrigin, 3);
    const preSession = await openSession(gateway, preClaimer);
    const preclaim = { ...unknownTypeEnvelope(preClaimer, 0), id: mismatch.id };
    await preSession.conn.handle(pushMsg([preclaim]));
    preSession.conn.close();

    await hubSession.conn.handle(pushMsg([mismatch]));

    // No displacement (green today; must stay green under the wider key).
    expect(await storedWatermark(db, hub.org_id, hub.device_id)).toBe(2);
    for (const seen of ofKind(hubSession.rec.all, "push_ack")) {
      expect(seen.acked_watermark).toBeLessThanOrEqual(2);
    }

    // RED today: the mismatch row is swallowed by the pre-claim conflict.
    const claimants = byDeviceId(await rowsFor(db, hub.org_id, mismatch.id));
    const hubRow = must(claimants.get(hub.device_id), "the hub's own mismatch row");
    expect(hubRow.reason).toBe("branch_mismatch");
    expect(hubRow.envelope).toEqual(asReceived(mismatch));
    const preRow = must(claimants.get(preClaimer.device_id), "the pre-claimer's row");
    expect(preRow.reason).toBe("schema_invalid");
    expect(preRow.envelope).toEqual(asReceived(preclaim));

    // The hub's GENUINE own event at slot 3 still merges — no lamport_conflict,
    // no durable merged-log loss (the t-01-12 F1 scenario, end to end).
    const genuine = validEnvelope(hub, 3);
    await hubSession.conn.handle(pushMsg([genuine]));
    const own = (await eventRows(db, hub.org_id)).filter((row) => row.device_id === hub.device_id);
    expect(own.map((row) => row.lamport_seq)).toEqual([0, 1, 2, 3]);
    expect(own.map((row) => row.id)).toContain(genuine.id);
    expect(await storedWatermark(db, hub.org_id, hub.device_id)).toBe(3);

    hubSession.conn.close();
  });
});

describe("ADVERSARIAL — an insider pre-claim destroys, mis-attributes and wedges nothing (01-F1 / 01-F37)", () => {
  it("01-F1/01-F37/DEC-SYNC-005: the pre-claimer's own row, reason, bytes, watermark and merged stream are untouched by the honest origin's later arrival, and the honest origin's row is attributed to the ORIGIN — neither device inherits the other's evidence", async () => {
    const { hub, origin, insider, poison, preclaim, relay } = await preclaimedRelay();
    relay.conn.close();

    const claimants = byDeviceId(await rowsFor(db, hub.org_id, poison.id));
    // The pre-claimer keeps exactly what it pushed (01-F1 — nothing re-authors it).
    const insiderRow = must(claimants.get(insider.device_id), "the pre-claimer's row");
    expect(insiderRow.reason).toBe("schema_invalid");
    expect(insiderRow.envelope).toEqual(asReceived(preclaim));
    expect(await storedWatermark(db, hub.org_id, insider.device_id)).toBe(0);
    expect(
      (await eventRows(db, hub.org_id)).filter((row) => row.device_id === insider.device_id),
    ).toHaveLength(0);

    // The honest origin's row is the ORIGIN's — never the pre-claimer's identity,
    // never the relaying hub's (DEC-SYNC-005 attribution is per ORIGIN here).
    const originRow = must(claimants.get(origin.device_id), "the honest origin's own row");
    expect(originRow.envelope).toEqual(asReceived(poison));
    expect(claimants.get(hub.device_id)).toBeUndefined();
    // …and the origin is not wedged: its outbox acked past the poison (01-F17).
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBe(2);
  });
});

describe("ADVERSARIAL — the DEC-SYNC-009 unregistered→registered relay race (GREEN guard under the wider key)", () => {
  it("DEC-SYNC-009/DEC-SYNC-005/01-F8 (must not regress): a WAN-less origin whose outbox is relayed BEFORE it is registered ends neither permanently wedged nor permanently mis-attributed — after registration its slot fills, its tail merges, a row attributed to the ORIGIN carries the TRUE reason with the origin's verbatim bytes, and the Auditor reports no gap", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w"); // NOT registered yet — the honest race
    const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
    const poison = must(outbox[1], "poison");

    const first = await openSession(gateway, hub, { token: relayToken(hub) });
    await first.conn.handle(pushMsg(outbox));
    first.conn.close();
    // Pre-registration: every slot is an origin_unregistered placeholder,
    // SESSION-attributed and no-fill (T-01-09) — nothing merged, no watermark.
    expect(await eventRows(db, hub.org_id)).toHaveLength(0);
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBeUndefined();

    await registerIdentity(db, origin, "waiter");
    const second = await openSession(gateway, hub, { token: relayToken(hub) });
    await second.conn.handle(pushMsg(outbox));
    second.conn.close();

    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBe(2);
    const merged = (await eventRows(db, hub.org_id))
      .filter((row) => row.device_id === origin.device_id)
      .map((row) => row.lamport_seq)
      .sort((a, b) => a - b);
    expect(merged).toEqual([0, 2]);

    const originRow = must(
      byDeviceId(await rowsFor(db, hub.org_id, poison.id)).get(origin.device_id),
      "an ORIGIN-attributed row for the poison event after registration",
    );
    expect(originRow.reason).toBe("storage_reject"); // the true class, not the placeholder's
    expect(originRow.envelope).toEqual(asReceived(poison)); // the origin's own bytes, verbatim

    const report = await runAuditor({ db, org_id: hub.org_id });
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === origin.device_id)).toEqual(
      [],
    );
  });
});

describe("REVIEW #7 — the merged-AND-quarantined placeholder (audit-1 #7)", () => {
  it("01-F37/DEC-SYNC-009: a pre-registration placeholder whose event LATER MERGED is no longer counted as LIVE quarantine by the doc-15 fleet-health read seam (holds under either candidate resolution — deleted, or retained-and-filtered)", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w"); // unregistered at relay time
    const outbox = validEnvelopes(origin, 0, 3); // all VALID — every one later merges

    const first = await openSession(gateway, hub, { token: relayToken(hub) });
    await first.conn.handle(pushMsg(outbox));
    first.conn.close();
    expect((await quarantineRows(db, hub.org_id)).map((row) => row.reason)).toEqual([
      "origin_unregistered",
      "origin_unregistered",
      "origin_unregistered",
    ]);

    await registerIdentity(db, origin, "waiter");
    const second = await openSession(gateway, hub, { token: relayToken(hub) });
    await second.conn.handle(pushMsg(outbox));
    second.conn.close();

    const mergedIds = (await eventRows(db, hub.org_id))
      .filter((row) => row.device_id === origin.device_id)
      .map((row) => row.id);
    expect(mergedIds).toHaveLength(3); // the placeholders' events are all in the ledger now

    // RED today: all three placeholders are still served as live quarantine, so
    // fleet health shows three "quarantined" events that are merged and healthy.
    const live = await listQuarantine(db, { org_id: hub.org_id });
    expect(live.filter((entry) => mergedIds.includes(entry.claimed_event_id))).toEqual([]);
  });

  it("PENDING RULING #7(b) — 01-F1/01-F37: the superseded placeholder is RETAINED as evidence and MARKED (`superseded_at` non-null), never deleted; resolution (a) delete-on-supersede would retire this test", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w");
    const outbox = validEnvelopes(origin, 0, 1);
    const supersededId = must(outbox[0], "the relayed event").id;

    const first = await openSession(gateway, hub, { token: relayToken(hub) });
    await first.conn.handle(pushMsg(outbox));
    first.conn.close();
    await registerIdentity(db, origin, "waiter");
    const second = await openSession(gateway, hub, { token: relayToken(hub) });
    await second.conn.handle(pushMsg(outbox));
    second.conn.close();
    const ledger = (await eventRows(db, hub.org_id)).filter((row) => row.id === supersededId);
    expect(ledger).toHaveLength(1);

    // The assumed shape of resolution (b): one nullable marker column, null ⇔ live
    // (the `revoked_at` / `delivered_at` house form). Asserted BEFORE the row read
    // so a missing column reds here, legibly, instead of as a driver error.
    const columns = [
      ...(await db.execute(
        sql`select column_name from information_schema.columns
            where table_schema = 'kernel' and table_name = 'quarantine'`,
      )),
    ].map((row) => String(row.column_name));
    expect(columns).toContain("superseded_at");

    const rows = await db.execute(
      sql`select superseded_at from kernel.quarantine
          where org_id = ${hub.org_id} and claimed_event_id = ${supersededId}`,
    );
    const placeholder = must([...rows][0], "the retained placeholder row (evidence, 01-F37)");
    expect(placeholder.superseded_at).not.toBeNull();
  });
});
