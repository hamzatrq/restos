// T-01-21 oracle — the Auditor's lamport-gap leg re-derived against the WIDENED
// quarantine key (plans/wave-0/t-01-21-quarantine-key.md, "what must NOT
// regress" 3 and 4). Authored from specs/01-kernel-sync.md (01-F3 per-org merge,
// 01-F8 push/ack, 01-F37 "the Auditor's lamport-gap check counts quarantine rows
// as slot-filling") + specs/20-testing.md §4.2 + specs/DECISIONS.md
// (DEC-SYNC-005 accepted, DEC-TEST-003) + the t-01-12 F2 attribution ruling ONLY
// (24 §3 step 2: read-only to the implementing session). The landed T-01-11
// suites — auditor-lamport-gap, auditor-fix-round, auditor-fix-round-2 — stay
// binding; nothing here relaxes them.
//
// WHY THIS NEEDS ITS OWN PINS. The ratified coverage law is per (org, DEVICE):
// with W = acked_watermark (−1 absent) and hi = max(W, max merged lamport),
// every slot in [0..hi] must be covered by a kernel.events row OR a
// kernel.quarantine row ATTRIBUTED TO THAT DEVICE at that stored lamport.
// Under the org-wide key at most one row could exist per claimed event id, so
// "which row covers this slot" and "which row holds this claimed id" were the
// same question. The widened key (org_id, claimed_event_id, device_id) separates
// them: several devices may now hold rows for one claimed id, at the same slot
// number or at different ones. A migration that keys coverage by claimed id —
// or that dedupes rows by claimed id on the way in — passes the old suites and
// silently breaks the gap leg, either manufacturing a gap for an honest device
// or (worse) crediting one device's slot from ANOTHER device's row.
//
// RED-AWAITING-IMPLEMENTATION map (each red verified to fail for this reason):
//   A1/A2 — the honest origin's row is swallowed by the earlier claimant's
//           (ON CONFLICT DO NOTHING at the org-wide key), so its credited slot
//           is covered by nothing and the leg reports a lamport_gap that the
//           widened key must retire. The bytes never reach the table at all.
//   A3    — same, plus the negative control: the genuinely uncovered slots
//           beyond coverage must STILL be reported (loud, never silent) and
//           must name the RIGHT device.
//   A4    — added AFTER the key landed, carrying forward review #5's concern
//           from the pin T-01-21 retired in close-now-parse-guards.test.ts
//           describe C (the ruling is recorded there): the byte-loss class that
//           SURVIVES the widening — an unreadable stored row covering nothing
//           while its slot was credited — must still be loud.
import { type EventEnvelopeT, newId } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import { byCheck, runAuditor, setWatermark } from "./auditor-builders.js";
import {
  BASE_T,
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  openDb,
  openSession,
  pushMsg,
  registerIdentity,
  storedWatermark,
  TEST_TOKEN_SECRET,
  unknownTypeEnvelope,
  validEnvelope,
} from "./helpers.js";

const NUL = String.fromCharCode(0); // storage_reject trigger (U+0000), out of source bytes.

/** Registry-valid, jsonb-UNSTORABLE order.created — the storage_reject poison. */
const storagePoison = (origin: Identity, lamportSeq: number): EventEnvelopeT =>
  validEnvelope(origin, lamportSeq, { payload: { order_id: `${NUL}-nul`, channel: "counter" } });

const peerOf = (of: Identity, suffix: string): Identity => ({
  ...of,
  device_id: `${of.device_id}-${suffix}`,
});

/** Attribution of every quarantine row for one claimed event id (device → reason). */
const claimantsOf = async (
  database: Db,
  orgId: string,
  claimedEventId: string,
): Promise<Map<string, string>> => {
  const rows = await database.execute(
    sql`select device_id, reason from kernel.quarantine
        where org_id = ${orgId} and claimed_event_id = ${claimedEventId}`,
  );
  return new Map([...rows].map((row) => [String(row.device_id), String(row.reason)]));
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
 * Two devices of one branch end up holding a quarantine row for the SAME claimed
 * event id: device A first (a registry-unknown envelope carrying the id), then
 * the honest device O whose genuine event bears that id and quarantines
 * storage_reject. `originSlot` places O's row at a chosen slot so the
 * same-slot and different-slot shapes share one builder.
 */
const sharedClaimedId = async (
  originSlot: number,
): Promise<{ deviceA: Identity; origin: Identity; claimedId: string }> => {
  const deviceA = freshIdentity();
  const origin = peerOf(deviceA, "o");
  await registerIdentity(db, origin, "waiter");

  const poison = storagePoison(origin, originSlot);
  const claimedId = poison.id;

  // A claims the id first, at ITS OWN slot 1, under its own identity.
  const aSession = await openSession(gateway, deviceA);
  const aBad = { ...unknownTypeEnvelope(deviceA, 1), id: claimedId };
  await aSession.conn.handle(pushMsg([validEnvelope(deviceA, 0), aBad]));
  aSession.conn.close();

  // O then pushes its own contiguous prefix ending in the poison at originSlot.
  const oSession = await openSession(gateway, origin);
  const prefix = Array.from({ length: originSlot }, (_, i) => validEnvelope(origin, i));
  await oSession.conn.handle(pushMsg([...prefix, poison]));
  oSession.conn.close();

  return { deviceA, origin, claimedId };
};

describe("A1 — coverage is a per-DEVICE question: two devices, one claimed id, DIFFERENT slots (01-F37 / DEC-SYNC-005 / 20 §4.2)", () => {
  it("01-F37/DEC-SYNC-005: device A's row covers A's slot 1 and the origin's row covers the origin's slot 2 — both devices audit gap-clean, and neither device's slot is credited from the other's row", async () => {
    const { deviceA, origin, claimedId } = await sharedClaimedId(2);

    // Both rows exist under the widened key, each with its own attribution.
    const claimants = await claimantsOf(db, deviceA.org_id, claimedId);
    expect(claimants.get(deviceA.device_id)).toBe("schema_invalid");
    expect(claimants.get(origin.device_id)).toBe("storage_reject");

    expect(await storedWatermark(db, deviceA.org_id, deviceA.device_id)).toBe(1);
    expect(await storedWatermark(db, deviceA.org_id, origin.device_id)).toBe(2);

    // RED today: O's row was never stored, so O's credited slot 2 is covered by
    // nothing and the leg reports a gap. A's obligation [0..1] is met either way.
    const report = await runAuditor({ db, org_id: deviceA.org_id });
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === origin.device_id)).toEqual(
      [],
    );
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === deviceA.device_id)).toEqual(
      [],
    );
  });
});

describe("A2 — two devices, one claimed id, the SAME slot number (01-F37 / DEC-SYNC-005)", () => {
  it("01-F37/DEC-SYNC-005: when both devices' rows for one claimed id sit at lamport 1, each row covers ITS OWN device's slot 1 — a coverage map keyed by claimed id would cover one device and strand the other", async () => {
    const { deviceA, origin, claimedId } = await sharedClaimedId(1);

    const claimants = await claimantsOf(db, deviceA.org_id, claimedId);
    expect([...claimants.keys()].sort()).toEqual([deviceA.device_id, origin.device_id].sort());

    expect(await storedWatermark(db, deviceA.org_id, deviceA.device_id)).toBe(1);
    expect(await storedWatermark(db, deviceA.org_id, origin.device_id)).toBe(1);

    const report = await runAuditor({ db, org_id: deviceA.org_id });
    expect(byCheck(report, "lamport_gap")).toEqual([]);
  });
});

describe("A3 — loud, never silent: a genuinely uncovered slot still surfaces, naming the right device (01-F3 / 01-F8 / 20 §4.2)", () => {
  it("01-F8/DEC-SYNC-005: with the origin's watermark corrupted forward to 4, the leg reports lamport_gap findings for the origin's UNCOVERED slots 3 and 4 — while slot 2, covered by the ORIGIN'S OWN row for the shared claimed id, is not a finding, and device A (which holds the other row for that same id) draws no finding at all", async () => {
    const { deviceA, origin, claimedId } = await sharedClaimedId(2);

    // The watermark-corruption class (a crash, a bad restore): the obligation
    // runs to 4 while coverage stops at the origin's own rows.
    await setWatermark(db, deviceA.org_id, origin.device_id, 4);

    const report = await runAuditor({ db, org_id: deviceA.org_id });
    const originGaps = byCheck(report, "lamport_gap").filter(
      (f) => f.device_id === origin.device_id,
    );
    // THE FINDING EXISTS — a wedge that is loud is recoverable; one that is
    // silent is not. (Green today and after: the leg must never go quiet.)
    expect(originGaps.length).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
    // RED today: slot 2 is reported too, because the origin's row for the shared
    // claimed id was swallowed by A's earlier claim.
    const gapSlots = originGaps
      .map((finding) => must(finding.lamport_seq, "a lamport_gap finding names its slot"))
      .sort((a, b) => a - b);
    expect(gapSlots).toEqual([3, 4]);
    for (const finding of originGaps) {
      expect(finding.org_id).toBe(origin.org_id);
      expect(finding.detail.length).toBeGreaterThan(0);
    }
    // The other holder of that claimed id is untouched by the origin's gap.
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === deviceA.device_id)).toEqual(
      [],
    );
    const claimants = await claimantsOf(db, deviceA.org_id, claimedId);
    expect(must(claimants.get(deviceA.device_id), "device A's row for the shared id")).toBe(
      "schema_invalid",
    );
  });
});

// ── A4 — review #5's concern, re-pinned where a genuine loss still exists ─────
// T-01-21 retired the loudness pin in close-now-parse-guards.test.ts describe C:
// under the widened key a foreign pre-claim destroys nothing, so the alarm it
// asserted would now be a false positive (the ruling is recorded in that file).
// The concern behind it — a loss that is SILENT is unrecoverable — survives the
// widening and is pinned here against the class that survives with it. With the
// key widened, the only remaining way an honest device's slot is credited while
// no readable evidence covers it is an UNREADABLE stored row for that device's
// claimed id (a disk fault, or a pre-hardening row): the push must not abort
// inside its transaction (01-F17, the review #3 guard), so the slot is credited
// conservatively — and the Auditor must then say so out loud.
describe("A4 — the surviving byte-loss class is still LOUD (review #5's concern, re-pinned; 01-F17 / 20 §4.2)", () => {
  it("01-F17/01-F37/DEC-SYNC-005: when the row holding this device's claimed id is UNREADABLE, the push survives and credits the slot (never a crash-wedge) — and because no readable row covers that slot, the Auditor raises a lamport_gap naming it: a loss is never silent", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    // The corrupt pre-existing row for the device's OWN claimed id: only a disk
    // fault (or a pre-hardening row) can put non-JSON in the text column — the
    // gateway always writes JSON.stringify(envelope).
    const slot1 = { ...unknownTypeEnvelope(identity, 1), id: newId() };
    await db.execute(
      sql`insert into kernel.quarantine
            (id, org_id, branch_id, device_id, claimed_event_id, reason, envelope, received_at)
          values (${newId()}, ${identity.org_id}, ${identity.branch_id}, ${identity.device_id},
            ${slot1.id}, ${"storage_reject"}, ${"not-json{{{ CORRUPT"}, ${BASE_T})`,
    );

    await session.conn.handle(
      pushMsg([validEnvelope(identity, 0), slot1, validEnvelope(identity, 2)]),
    );
    session.conn.close();

    // No crash-wedge: the tail merged and the watermark advanced past slot 1.
    expect(await storedWatermark(db, identity.org_id, identity.device_id)).toBe(2);

    // LOUD: slot 1 was credited but the only row for it is unreadable, so it is
    // covered by nothing — exactly the state an operator must be told about.
    const report = await runAuditor({ db, org_id: identity.org_id });
    const gaps = byCheck(report, "lamport_gap").filter((f) => f.device_id === identity.device_id);
    expect(gaps.length).toBeGreaterThan(0);
    expect(
      gaps.map((finding) => must(finding.lamport_seq, "a lamport_gap finding names its slot")),
    ).toEqual([1]);
    expect(report.ok).toBe(false);
  });
});
