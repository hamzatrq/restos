// T-01-08 oracle — gateway inline invariant validation: the fold-free refund
// cap (laws 1–3 + law 7's gateway boundary of the T-01-08 contract,
// plans/wave-0/kernel-tasks.md). Authored from specs/01-kernel-sync.md (01-F29
// as amended July 2026, 01-F30, 01-F31, 01-F37, 01-F17) + specs/DECISIONS.md
// (DEC-SYNC-007 accepted, DEC-SYNC-005, DEC-SYNC-008) + specs/26-merge-semantics.md
// §7 (the ordering-uses list: naming WHICH refund busted the cap is the
// gateway's job) + the T-01-08 contract ONLY (24 §3 step 2: read-only to the
// implementing session). T-01-07 laws 1–8 and the T-01-12 relay pins are
// untouched and stay binding.
//
// RED-AWAITING-IMPLEMENTATION: the shipped gateway has no invariant step — an
// over-refund merges like any valid event, so these tests fail with "expected a
// quarantine row / expected the refund absent from kernel.events". That is the
// expected red reason.
//
// ── ORACLE-PINNED INVARIANT SURFACE (binding for the implementing session) ───
//   • QuarantineReason gains `invariant_violation` (the taxonomy slot T-01-07
//     reserved for T-01-08).
//   • The check keys on ATTEMPT ids, never envelope ids (01-F29 as amended /
//     T-01-15 C2): the parent is the merged `payment.recorded` whose
//     settlement_attempt_id equals the refund's payment_attempt_id; prior
//     refunds are merged `payment.refunded` naming the same parent, totalled
//     over UNIQUE refund settlement_attempt_ids (01-F31 unique-keyed sums — an
//     intent re-expressed under a second envelope id adds no new money, and an
//     envelope-keyed Σ would double-count exactly the way 01-F29's parenthetical
//     warns id-keyed caps fragment). NOTE for the report: the T-01-08 contract
//     text predates the C2 ratification and still says `payment_id`; the spec
//     (01-F29) wins — flagged as a contract-vs-spec drift, not silently chosen.
//   • Violation ⇔ this refund's amount exceeds parent amount − Σ prior unique
//     attempts (exact cover legal, one paisa over quarantines) — exactly the
//     domain rule (law 7; the numbers here mirror refund-remainder.test.ts).
//   • A violator quarantines per 01-F37: verbatim row, ORIGIN-attributed,
//     absent from kernel.events / fan-out / catchup, notice to the pusher,
//     lamport slot FILLED (DEC-SYNC-005 — the ack advances, the outbox never
//     wedges, and following events in the same push still merge, 01-F17).
//   • UNPROVABLE cases pass through (DEC-SYNC-007): a refund whose parent
//     attempt is not merged (never seen, or itself quarantined) merges
//     normally — the gateway blocks only provable violations; the Auditor's
//     refold owns the rest (T-01-11).
//   • Sale-path events are NEVER invariant-checked: only `payment.refunded`
//     can quarantine `invariant_violation`.
import { newId } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
import {
  BASE_T,
  catchupMsg,
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
  TEST_TOKEN_SECRET,
  type TestClock,
  validEnvelope,
} from "./helpers.js";

let db: Db;
let verify: Db;
let clock: TestClock;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  clock = makeClock();
  gateway = createGateway({ db, clock, auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

/** Registry-valid payment.recorded (01 §4; T-01-15 amended shape). */
const paymentEnv = (
  identity: Identity,
  lamport: number,
  opts: { order: string; amount: number; attempt: string },
) =>
  validEnvelope(identity, lamport, {
    type: "payment.recorded",
    payload: {
      order_id: opts.order,
      amount_paisa: opts.amount,
      method: "cash",
      purpose: "settles_order",
      settlement_attempt_id: opts.attempt,
    },
  });

/** Registry-valid payment.refunded (01-F29 amended: order key carried; parent
 * referenced by the parent's settlement_attempt_id via payment_attempt_id;
 * the refund carries its OWN attempt key, 01-F31). */
const refundEnv = (
  identity: Identity,
  lamport: number,
  opts: { order: string; amount: number; parent: string; attempt?: string },
) =>
  validEnvelope(identity, lamport, {
    type: "payment.refunded",
    payload: {
      order_id: opts.order,
      amount_paisa: opts.amount,
      method: "cash_out",
      settlement_attempt_id: opts.attempt ?? newId(),
      payment_attempt_id: opts.parent,
    },
  });

describe("law 1 — an over-refund quarantines invariant_violation (01-F29 / 01-F37 / DEC-SYNC-007)", () => {
  it("01-F29/01-F37/DEC-SYNC-007: a refund exceeding its merged parent's remainder is quarantined verbatim as invariant_violation — absent from events/fan-out/catchup, notice to the pusher, slot filled, and the NEXT event in the same push still merges (01-F17/DEC-SYNC-005)", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const observer = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });

    clock.t = BASE_T + 8_000;
    const orderId = newId();
    const pay = paymentEnv(identity, 0, { order: orderId, amount: 1_000, attempt: "att-l1-p" });
    const overRefund = refundEnv(identity, 1, {
      order: orderId,
      amount: 1_200,
      parent: "att-l1-p",
      attempt: "att-l1-r",
    });
    const saleAfter = validEnvelope(identity, 2); // the sale path continues past the violator
    await pusher.conn.handle(pushMsg([pay, overRefund, saleAfter]));

    // The slot fills (DEC-SYNC-005): the ack advances over the quarantined
    // refund and the outbox never wedges (01-F17).
    const ackMsg = must(ofKind(pusher.rec.all, "push_ack").at(-1), "push_ack");
    expect(ackMsg.acked_watermark).toBe(2);
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(2);

    // Verbatim quarantine row, invariant_violation, ORIGIN-attributed.
    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    const row = must(quarantined[0], "quarantine row");
    expect(row.reason).toBe("invariant_violation");
    expect(row.claimed_event_id).toBe(overRefund.id);
    expect(row.envelope).toEqual(JSON.parse(JSON.stringify(overRefund)));
    expect(row.device_id).toBe(identity.device_id);

    // Never enters kernel.events; the survivors' global_seq stays dense.
    const rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.id)).toEqual([pay.id, saleAfter.id]);
    const [r0, r1] = [must(rows[0], "row 0"), must(rows[1], "row 1")];
    expect(r1.global_seq).toBe(r0.global_seq + 1);

    // Notice to the pushing session; the observer gets none.
    const notices = ofKind(pusher.rec.all, "quarantine_notice");
    expect(notices.map((n) => ({ event_id: n.event_id, reason: n.reason }))).toContainEqual({
      event_id: overRefund.id,
      reason: "invariant_violation",
    });
    expect(ofKind(observer.rec.all, "quarantine_notice")).toHaveLength(0);

    // Fan-out and catchup carry only the merged events (01-F37 exclusion).
    const fanned = ofKind(observer.rec.all, "event_batch").flatMap((b) => b.events);
    expect(fanned.map((e) => e.id)).toEqual([pay.id, saleAfter.id]);
    await observer.conn.handle(catchupMsg(0));
    const page = must(ofKind(observer.rec.all, "catchup_response").at(-1), "catchup page");
    expect(page.events.map((e) => e.id)).toEqual([pay.id, saleAfter.id]);
  });
});

describe("law 2 — cumulative remainder over prior merged refunds (01-F29 / 01-F31 / 01-F30)", () => {
  it("01-F29/DEC-SYNC-007: 600-then-600 against 1000 — the first merges, the SECOND quarantines (the gateway names which refund busted the cap, 26 §7); a quarantined violator shrinks NOTHING, so a later 400 still lands the exact cover (01-F37)", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const orderId = newId();

    await pusher.conn.handle(
      pushMsg([paymentEnv(identity, 0, { order: orderId, amount: 1_000, attempt: "att-l2-p" })]),
    );
    const r600a = refundEnv(identity, 1, { order: orderId, amount: 600, parent: "att-l2-p" });
    await pusher.conn.handle(pushMsg([r600a]));
    const r600b = refundEnv(identity, 2, { order: orderId, amount: 600, parent: "att-l2-p" });
    await pusher.conn.handle(pushMsg([r600b]));
    // Quarantined refunds never merged, so they must not count toward the
    // remainder: 600 (merged) + 400 = exact cover — legal.
    const r400 = refundEnv(identity, 3, { order: orderId, amount: 400, parent: "att-l2-p" });
    await pusher.conn.handle(pushMsg([r400]));

    const rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.id)).toContain(r600a.id);
    expect(rows.map((r) => r.id)).toContain(r400.id);
    expect(rows.map((r) => r.id)).not.toContain(r600b.id);
    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [r600b.id, "invariant_violation"],
    ]);
    // Every slot filled (merged or quarantined): the stream acks through 3.
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(3);
  });

  it("01-F29/01-F30: 400-then-600 against 1000 both merge (exact cover is not a violation) — zero invariant quarantines", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const orderId = newId();

    await pusher.conn.handle(
      pushMsg([
        paymentEnv(identity, 0, { order: orderId, amount: 1_000, attempt: "att-l2b-p" }),
        refundEnv(identity, 1, { order: orderId, amount: 400, parent: "att-l2b-p" }),
        refundEnv(identity, 2, { order: orderId, amount: 600, parent: "att-l2b-p" }),
      ]),
    );

    expect(await eventRows(verify, identity.org_id)).toHaveLength(3);
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(2);
  });

  it("01-F29/01-F31: the IN-BATCH case resolves identically to the two-push case — [pay 1000, refund 600, refund 600] in ONE push merges the first refund and quarantines the second (earlier same-batch refunds are visible to the check)", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const orderId = newId();

    const pay = paymentEnv(identity, 0, { order: orderId, amount: 1_000, attempt: "att-l2c-p" });
    const rA = refundEnv(identity, 1, { order: orderId, amount: 600, parent: "att-l2c-p" });
    const rB = refundEnv(identity, 2, { order: orderId, amount: 600, parent: "att-l2c-p" });
    await pusher.conn.handle(pushMsg([pay, rA, rB]));

    const rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.id)).toEqual([pay.id, rA.id]);
    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [rB.id, "invariant_violation"],
    ]);
    expect(must(ofKind(pusher.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(2);
  });

  it("01-F31/01-F29: prior refunds total over UNIQUE attempt keys — the same refund intent re-expressed under a SECOND envelope id merges (no new money, no violation), and the cap math counts it ONCE (an envelope-keyed sum would wrongly quarantine the exact cover)", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const orderId = newId();

    await pusher.conn.handle(
      pushMsg([paymentEnv(identity, 0, { order: orderId, amount: 1_000, attempt: "att-l2d-p" })]),
    );
    // One refund INTENT (attempt att-l2d-r1), expressed under two envelope ids —
    // 01-F29's stated hazard: "one intent may legitimately exist under two
    // envelope ids, which fragments any id-keyed cap".
    const intentOnce = refundEnv(identity, 1, {
      order: orderId,
      amount: 600,
      parent: "att-l2d-p",
      attempt: "att-l2d-r1",
    });
    const intentAgain = refundEnv(identity, 2, {
      order: orderId,
      amount: 600,
      parent: "att-l2d-p",
      attempt: "att-l2d-r1",
    });
    await pusher.conn.handle(pushMsg([intentOnce, intentAgain]));
    // Unique-key Σ so far = 600. A fresh 400 attempt is the exact cover — legal.
    const cover = refundEnv(identity, 3, {
      order: orderId,
      amount: 400,
      parent: "att-l2d-p",
      attempt: "att-l2d-r2",
    });
    await pusher.conn.handle(pushMsg([cover]));
    // The cap is now exactly consumed: ONE more paisa violates (law 7 boundary).
    const onePaisa = refundEnv(identity, 4, {
      order: orderId,
      amount: 1,
      parent: "att-l2d-p",
      attempt: "att-l2d-r3",
    });
    await pusher.conn.handle(pushMsg([onePaisa]));

    const rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.id)).toEqual([
      expect.any(String), // the payment
      intentOnce.id,
      intentAgain.id,
      cover.id,
    ]);
    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [onePaisa.id, "invariant_violation"],
    ]);
  });
});

describe("law 3 — unprovable refunds are never blocked (01-F29 / 01-F17 / DEC-SYNC-007)", () => {
  it("01-F29/01-F17: a refund whose parent attempt is NOT merged (out-of-order arrival) merges normally — global_seq assigned, fanned out, no quarantine; once the parent lands, the merged-while-unprovable refund COUNTS toward the remainder for later provable checks", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const observer = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });
    const orderId = newId();

    // Refund first: its parent attempt is unknown — unprovable, must merge.
    const early = refundEnv(identity, 0, { order: orderId, amount: 600, parent: "att-l3-p" });
    await pusher.conn.handle(pushMsg([early]));
    const afterEarly = await eventRows(verify, identity.org_id);
    expect(afterEarly.map((r) => r.id)).toEqual([early.id]);
    expect(must(afterEarly[0], "early refund row").global_seq).toBeGreaterThanOrEqual(1);
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);
    const fanned = ofKind(observer.rec.all, "event_batch").flatMap((b) => b.events);
    expect(fanned.map((e) => e.id)).toContain(early.id);

    // The parent arrives; the cap is now provable and the early refund counts:
    // 600 already against a 1000 parent → another 600 violates, a 400 covers.
    await pusher.conn.handle(
      pushMsg([paymentEnv(identity, 1, { order: orderId, amount: 1_000, attempt: "att-l3-p" })]),
    );
    const over = refundEnv(identity, 2, { order: orderId, amount: 600, parent: "att-l3-p" });
    await pusher.conn.handle(pushMsg([over]));
    const cover = refundEnv(identity, 3, { order: orderId, amount: 400, parent: "att-l3-p" });
    await pusher.conn.handle(pushMsg([cover]));

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [over.id, "invariant_violation"],
    ]);
    expect((await eventRows(verify, identity.org_id)).map((r) => r.id)).toContain(cover.id);
  });

  it("01-F17/DEC-SYNC-007: a refund whose parent was QUARANTINED (not merged) is unprovable and passes through — the gateway blocks only provable violations", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const orderId = newId();
    const NUL = String.fromCharCode(0); // storage_reject trigger, kept out of source bytes

    // The parent payment poisons storage (U+0000 in a string) → quarantined,
    // never merged. Registry-valid, so it reaches the storage boundary.
    const poisonedParent = paymentEnv(identity, 0, {
      order: `l3b-${NUL}-order`,
      amount: 1_000,
      attempt: "att-l3b-p",
    });
    const refund = refundEnv(identity, 1, { order: orderId, amount: 900, parent: "att-l3b-p" });
    await pusher.conn.handle(pushMsg([poisonedParent, refund]));

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [poisonedParent.id, "storage_reject"],
    ]);
    expect((await eventRows(verify, identity.org_id)).map((r) => r.id)).toEqual([refund.id]);
    expect(must(ofKind(pusher.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(1);
  });

  it("01-F17/DEC-SYNC-007: sale-path events are never invariant-checked — payments of any size merge; only payment.refunded can quarantine invariant_violation", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const orderId = newId();

    await pusher.conn.handle(
      pushMsg([
        paymentEnv(identity, 0, { order: orderId, amount: 1, attempt: "att-l3c-p1" }),
        // A second, far larger payment on the same order: payments have no cap.
        paymentEnv(identity, 1, {
          order: orderId,
          amount: 9_999_999,
          attempt: "att-l3c-p2",
        }),
        validEnvelope(identity, 2), // order.created — the plain sale path
      ]),
    );

    expect(await eventRows(verify, identity.org_id)).toHaveLength(3);
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);
    expect(must(ofKind(pusher.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(2);
  });
});

// ── F-1 fix round (plans/wave-0/t-01-08-fix-round.md @e012b73, ruling BINDING) ─
//
// RED-AWAITING-FIX: today the domain fn's RangeError (asPaisaInt rejecting the
// unsafe prior-Σ) escapes step 3.5 and rejects the WHOLE push — the merge tx
// rolls back (nothing merged, no quarantine row, no watermark advance) and the
// origin's outbox re-pushes the same refund forever: the DEC-SYNC-005 wedge
// class. Expected red reason: the final push aborts with
// "RangeError: prior_refunds_total_paisa must be a non-negative safe integer".
//
// RULED: an unrepresentable prior-Σ is a PROVABLE violation, not an unprovable
// case — if Σ(priors) alone exceeds 2^53−1 paisa it necessarily exceeds any
// schema-valid payment_amount_paisa (the registry's z.number().int() caps at
// 2^53−1), so remainder < 0 by pure magnitude. The gateway catches the domain
// fn's RangeError at the step-3.5 call site and quarantines
// `invariant_violation` (slot filled, noticed, never wedges). The domain
// surface stays as pinned: refundRemainderExceeded still throws on unsafe args.

/** Durable notice rows (kernel.quarantine_notices — the BINDING T-01-08 data
 * contract), reduced to the identity this pin asserts. */
const f1NoticeRows = async (database: Db, orgId: string): Promise<Array<[string, string]>> => {
  const rows = await database.execute(
    sql`select claimed_event_id, reason from kernel.quarantine_notices
        where org_id = ${orgId} order by created_at asc, claimed_event_id asc`,
  );
  return [...rows].map((row) => [String(row.claimed_event_id), String(row.reason)]);
};

describe("F-1 — an unrepresentable prior-refund Σ is a PROVABLE violation; the push never aborts (fix-round ruling / 01-F29 / 01-F17 / DEC-SYNC-005)", () => {
  it("F-1/01-F29/01-F17/DEC-SYNC-005: near-2^53 refunds merged while the parent was unprovable push the prior-Σ past 2^53−1 — the NEXT refund naming that parent quarantines invariant_violation (slot filled, ack advances, notice row written), never aborting the push", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const orderId = newId();
    const MAX_PAISA = Number.MAX_SAFE_INTEGER; // 2^53−1 — the schema's own ceiling

    // Several near-2^53 refunds naming attempt att-f1-p while the parent is
    // UNMERGED: each is individually schema-valid and passes through UNCHECKED
    // (DEC-SYNC-007 unprovable pass-through). Distinct attempt keys, so every
    // one counts in the unique-keyed Σ (01-F31).
    const huge = [MAX_PAISA, MAX_PAISA - 1, MAX_PAISA - 2].map((amount, i) =>
      refundEnv(identity, i, {
        order: orderId,
        amount,
        parent: "att-f1-p",
        attempt: `att-f1-r${i}`,
      }),
    );
    await pusher.conn.handle(pushMsg(huge));
    // Green guard: all merged — Σ over their unique attempts now exceeds 2^53−1.
    expect((await eventRows(verify, identity.org_id)).map((r) => r.id)).toEqual(
      huge.map((e) => e.id),
    );
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);

    // Parent att-f1-p lands: the cap is now provable — and its prior-Σ is
    // unrepresentable (necessarily > any schema-valid parent amount).
    await pusher.conn.handle(
      pushMsg([paymentEnv(identity, 3, { order: orderId, amount: 1_000, attempt: "att-f1-p" })]),
    );

    // One more refund naming att-f1-p forces step 3.5 to total the priors.
    const late = refundEnv(identity, 4, {
      order: orderId,
      amount: 500,
      parent: "att-f1-p",
      attempt: "att-f1-late",
    });
    const abort = await pusher.conn.handle(pushMsg([late])).then(
      () => null,
      (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)),
    );
    if (abort !== null) {
      // TODAY (the red path): the RangeError aborted the push and the tx rolled
      // back whole — the wedge the ruling names: nothing merged, no quarantine
      // row, no watermark advance. The origin re-pushes this refund forever.
      expect((await eventRows(verify, identity.org_id)).map((r) => r.id)).not.toContain(late.id);
      expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);
      expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(3);
    }
    // PINNED: the push NEVER aborts (01-F17 — a sale is never blocked; the
    // failure string above is the captured abort reason while red).
    expect(abort).toBeNull();

    // PINNED: the late refund is a provable violator — quarantined verbatim as
    // invariant_violation, ORIGIN-attributed, never merged (01-F37).
    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.map((q) => [q.claimed_event_id, q.reason])).toEqual([
      [late.id, "invariant_violation"],
    ]);
    expect(must(quarantined[0], "F-1 row").device_id).toBe(identity.device_id);
    expect((await eventRows(verify, identity.org_id)).map((r) => r.id)).not.toContain(late.id);

    // Slot FILLED (DEC-SYNC-005): the ack advances over the violator and the
    // stored watermark follows — the outbox never wedges.
    expect(must(ofKind(pusher.rec.all, "push_ack").at(-1), "final push_ack").acked_watermark).toBe(
      4,
    );
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(4);

    // Notice: live to the pusher AND the durable outbox row (DEC-SYNC-008).
    expect(
      ofKind(pusher.rec.all, "quarantine_notice").map((n) => [n.event_id, n.reason]),
    ).toContainEqual([late.id, "invariant_violation"]);
    expect(await f1NoticeRows(verify, identity.org_id)).toEqual([[late.id, "invariant_violation"]]);
  });
});
