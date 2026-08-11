// ACCEPTANCE TESTS — `02-F30`'s NO-SETTLEMENT STEP: a foodpanda order is aggregator-collected,
// so the till must never ask a cashier to settle it and the ledger must close it by itself.
//
// ⚠ PROVENANCE (`24 §3` step 2): **authored from SPEC TEXT ONLY, by a session that has not read
// the plan for this task and has not seen an implementation.** There is no
// `main/aggregator-settlement.ts` in the tree as this file is written; the contract below IS the
// contract, and the module is owed against it. Committed RED on purpose.
//
// ── THE FRs, QUOTED, so an assertion can be argued with rather than believed ──────────────────
//
//   02-F30   "Dedicated quick-entry mode: channel pre-tagged `foodpanda`, item picker restricted
//            to the mapped menu (mapping owned by doc 08), **no settlement step**
//            (aggregator-collected; economics handled by doc 08). Target ≤ 30 s per order.
//            Quick-entry orders behave identically downstream: KOT print, inventory deduction,
//            channel reporting."
//   01-F32   "Channel closure: aggregator-collected orders settle as
//            `payment.recorded { method: aggregator_receivable }` (doc 08 reconciles against
//            payouts) … No order reaches settled state with conservation violated."
//   08-F17   "Every aggregator order (both modes) settles at creation/entry with
//            `payment.recorded { method: aggregator_receivable }` (01-F32) — the order closes
//            operationally; the money owed by the aggregator becomes a tracked receivable. Money
//            conservation (01-F30) holds without a counter settlement step."
//   08-F8    "manual quick-entry orders are confirmed by the act of entry (02-F30)" — which is
//            why the trigger below is named `confirmed`: the confirm IS the entry act, and it is
//            the only moment at which the bill is known and the order is finished.
//   01-F31   "every emission carries a UI-layer `settlement_attempt_id` — double-taps and retries
//            can never double-record … folds dedupe by attempt key."
//   01-F30   "per order, `Σ tendering payments (purpose: settles_order) − Σ refunds =
//            billed_total − void_value − comp_value − discounts` once settled."
//   01-F17   "A sale is never blocked" (by inventory math, sync, or approval timeouts).
//   02-F23   "system-expected cash (by method) vs counted cash" — the fold this suite reads the
//            money back out of, because a method is not a label: it decides a drawer.
//   02-F37   settling with no shift open SUCCEEDS and records a null shift reference.
//   02-F42   `channel` is a CLOSED set — `counter | phone | storefront | whatsapp | foodpanda`.
//
// ── ⚠ THE CORPUS CONTRADICTS ITSELF ON THIS STRING, AND THIS SUITE DOES NOT PICK SILENTLY ─────
//
// `08-F5` writes the method as **`aggregator_settlement`**. `01-F32`, `08-F17` (the SAME doc, one
// screen down) and `packages/domain/src/registry.ts:48` all write **`aggregator_receivable`**, and
// `PAYMENT_METHODS` is a CLOSED `z.enum` — so `aggregator_settlement` is an `01-F4` error at emit
// and is not merely disfavoured, it is **unemittable**. `specs/00`'s authority order resolves the
// tie in the kernel's favour besides. This suite therefore asserts `aggregator_receivable`, and
// the doc-08 correction (`08-F5`) is reported as owed rather than made here.
//
// ── WHAT THIS SUITE DOES NOT CLAIM ───────────────────────────────────────────────────────────
//
//  1. **The item picker restricted to doc 08's mapped menu (`02-F30`, `08-F6`, `08-F9`) is NOT
//     here and is NOT closed.** No mapping exists anywhere in the repo — `services/foodpanda` is
//     a two-line stub — so a test for it would be asserting against an invention.
//  2. **`08-F5`'s mandatory `aggregator_order_ref` is NOT here.** `order.channel_tagged` has no
//     payload schema in `packages/domain`, so `01-F4` makes it unemittable today.
//  3. **Nothing here says a foodpanda line ever reaches a terminal service state.** See §G, which
//     asserts the current behaviour and names it as a QUESTION rather than a defect.
//  4. **This is not evidence about doc 08's Mode 2 (API ingestion).** `08-F17` covers both modes;
//     only the Mode 1 quick-entry half has a surface in this product.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { billedEffectiveFromJsonLines, type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { createAggregatorSettlement } from "../aggregator-settlement";

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const TILL = "00000000-0000-7000-8000-000000000003";

const SHIFT_ID = "0199bbbb-0000-7000-8000-00000000551f";
const DAY_ID = "0199bbbb-0000-7000-8000-00000000d001";

/**
 * Five orders on four channels. **The channel is the variable this suite exists to vary** — the
 * K-4 defect recorded in AGENTS.md is a suite that varies everything except the input its
 * assertions claim to own, and an implementation ignoring `channel` entirely would auto-settle
 * every counter sale in the branch.
 */
const FP_1 = "0199bbbb-0000-7000-8000-00000000f001"; // foodpanda, 2 lines, one with qty 2
const FP_2 = "0199bbbb-0000-7000-8000-00000000f002"; // foodpanda, 1 line, qty 3
const FP_EMPTY = "0199bbbb-0000-7000-8000-00000000f003"; // foodpanda, NO lines
const COUNTER_1 = "0199bbbb-0000-7000-8000-00000000c001"; // counter, same bill as FP_2
const PHONE_1 = "0199bbbb-0000-7000-8000-00000000p001"; // phone, same bill as FP_2

/**
 * The bills, stated here only so a reader can check the arithmetic. **No assertion below compares
 * against these constants alone** — every money assertion also compares against
 * `billedEffectiveFromJsonLines` over the store's own projection, so a fixture typo cannot make a
 * test agree with a wrong implementation.
 */
const FP_1_BILL = 45_000 + 6_000 * 2; // Rs 570
const FP_2_BILL = 32_000 * 3; // Rs 960

type Harness = {
  store: DeviceStore;
  /** The SHIPPED emitter, wired to this store and appending into it. */
  entry: { confirmed: (order_id: string) => void };
  /** Everything the emitter appended, in order. */
  emitted: { type: string; payload: Record<string, unknown> }[];
  /** `01-F31`'s keyed tender sum for an order, off the REAL merge engine. */
  payTotal: (order_id: string) => number;
  /** `01-F30`'s billed total for an order, off the REAL merge engine. */
  billed: (order_id: string) => number;
  /** `02-F23`'s system-expected cash BY METHOD for the open shift, off the REAL `shift_cash` fold. */
  expectedByMethod: () => Record<string, number>;
};

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A real store holding an open day, an open shift and five real orders, plus the shipped emitter
 * wired over an `append` that lands in that same store.
 *
 * Prices arrive through `order.line_added`'s `unit_price_paisa` exactly as `01-F53` snapshots
 * them, so `billed_effective` below is the merge engine's own derivation and never a number this
 * file typed in.
 *
 * @param openShift when false, no `shift.opened` — `02-F37`'s "no shift open" case.
 */
const harness = ({ openShift = true }: { openShift?: boolean } = {}): Harness => {
  const dir = mkdtempSync(join(tmpdir(), "restos-aggregator-settle-"));
  dirs.push(dir);
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL },
  });

  let n = 0;
  const raw = (type: string, payload: Record<string, unknown>): void => {
    n += 1;
    store.append({
      id: `0199dddd-0000-7000-8000-${String(n).padStart(12, "0")}`,
      org_id: ORG,
      branch_id: BRANCH,
      device_id: TILL,
      actor_user_id: "user-ayesha",
      device_created_at: 1_754_400_000_000 + n,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };

  raw("day.opened", { day_id: DAY_ID, opening_float_paisa: 500_000, prev_day_id: null });
  if (openShift) raw("shift.opened", { shift_id: SHIFT_ID, prev_shift_id: null });

  const line = (order_id: string, suffix: string, unit_price_paisa: number, qty: number): void =>
    raw("order.line_added", {
      order_id,
      line_id: `${order_id.slice(0, 24)}${suffix}`,
      item_id: `i-${suffix}`,
      qty,
      unit_price_paisa,
    });

  // `02-F1`: both axes at creation. `order_type: "delivery"` on the foodpanda orders because
  // that is what a foodpanda order IS — `08-F5`'s own words are "when foodpanda's rider
  // delivers". See §G, which is about the consequence and deliberately asserts no policy.
  raw("order.created", { order_id: FP_1, channel: "foodpanda", order_type: "delivery" });
  line(FP_1, "aa01", 45_000, 1);
  line(FP_1, "aa02", 6_000, 2);

  raw("order.created", { order_id: FP_2, channel: "foodpanda", order_type: "delivery" });
  line(FP_2, "bb01", 32_000, 3);

  raw("order.created", { order_id: FP_EMPTY, channel: "foodpanda", order_type: "delivery" });

  raw("order.created", { order_id: COUNTER_1, channel: "counter", order_type: "takeaway" });
  line(COUNTER_1, "cc01", 32_000, 3);

  raw("order.created", { order_id: PHONE_1, channel: "phone", order_type: "delivery" });
  line(PHONE_1, "dd01", 32_000, 3);

  const emitted: { type: string; payload: Record<string, unknown> }[] = [];
  const entry = createAggregatorSettlement({
    store,
    append: (type, payload) => {
      emitted.push({ type, payload });
      raw(type, payload);
    },
  });

  const row = (order_id: string) => store.openOrders().find((r) => r.order_id === order_id);

  return {
    store,
    entry,
    emitted,
    payTotal: (order_id) => row(order_id)?.pay_total ?? -1,
    billed: (order_id) => billedEffectiveFromJsonLines(row(order_id)?.json_lines ?? "{}"),
    expectedByMethod: () => {
      const shift = store.shifts().find((s) => s.shift_id === SHIFT_ID);
      return JSON.parse(shift?.expected_json ?? "{}") as Record<string, number>;
    },
  };
};

/** Every `payment.recorded` the emitter produced, whatever else it produced. */
const payments = (h: Harness): Record<string, unknown>[] =>
  h.emitted.filter((e) => e.type === "payment.recorded").map((e) => e.payload);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `08-F17`: THE ORDER CLOSES ITSELF, AND IT CLOSES INTO `pay_total`.
//
// The plausible wrong implementation this section exists for is `purpose: "repays_receivable"` —
// a natural confusion, because the METHOD is called `aggregator_receivable`. `01-F32` excludes
// repayments from `pay_total` by `01-F31`'s keyed sum, so that implementation emits a correct-
// looking event, satisfies "the method is aggregator_receivable", and leaves the order's money at
// zero — which is the defect this whole task exists to close, wearing the fix's clothes.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 08-F17/01-F32 — a foodpanda order settles at entry, with no cashier act", () => {
  it("records payment.recorded { method: aggregator_receivable } for the order's own bill", () => {
    const h = harness();
    expect(h.payTotal(FP_1)).toBe(0); // before: nothing has settled it

    h.entry.confirmed(FP_1);

    const paid = payments(h);
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({
      order_id: FP_1,
      method: "aggregator_receivable",
      amount_paisa: FP_1_BILL,
    });
    // Not a number this file typed in: the merge engine's own `billed_effective`.
    expect(paid[0]?.amount_paisa).toBe(h.billed(FP_1));
  });

  it("lands in pay_total, not repaid_total — 01-F32's keyed-sum exclusion", () => {
    const h = harness();
    h.entry.confirmed(FP_1);

    // THE ASSERTION THAT KILLS `purpose: "repays_receivable"`. `pay_total` is what
    // `01-F30` conservation is evaluated over, what `settlement-guard.ts` reads, and what
    // `main/printing.ts` pushes into `02-F24`'s sales-by-channel row (`bucket.push(order.pay_total)`)
    // — so an event that misses this column leaves the Foodpanda row at Rs 0 on the day summary
    // while real food went out the door.
    expect(h.payTotal(FP_1)).toBe(FP_1_BILL);
    expect(h.payTotal(FP_1)).toBe(h.billed(FP_1));
    expect(payments(h)[0]).toMatchObject({ purpose: "settles_order" });
  });

  it("carries 01-F31's settlement_attempt_id — a non-empty key, so the fold can dedupe", () => {
    const h = harness();
    h.entry.confirmed(FP_1);
    const key = payments(h)[0]?.settlement_attempt_id;
    expect(typeof key).toBe("string");
    expect(key).not.toBe("");
    // The KEY's shape is not pinned — only that it exists and that repeat entry does not double
    // the money (§E), which is the property `01-F31` is actually about. Pinning a derivation here
    // would redden a correct implementation that mints it differently.
  });

  it("emits nothing but the payment — no invented event types (commandment 2)", () => {
    const h = harness();
    h.entry.confirmed(FP_1);
    expect(h.emitted.map((e) => e.type)).toEqual(["payment.recorded"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE DRAWER. `02-F23`'s expected cash is BY METHOD, and a method decides a drawer.
//
// This is the section that would have caught `DEC-MONEY-009`'s cousin: an implementation emitting
// `method: "cash"` produces a green §A (the order closes, `pay_total` is right, conservation
// holds) and makes the cashier **short by the whole foodpanda take** at `shift.closed`, against a
// correct drawer, permanently under `01-F1`. It is read through the REAL `shift_cash` fold and not
// through this module's own idea of what it did.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F23/08-F5 — no cash is expected at the branch", () => {
  it("moves the aggregator_receivable bucket and leaves the CASH bucket at zero", () => {
    const h = harness();
    h.entry.confirmed(FP_1);
    h.entry.confirmed(FP_2);

    const expected = h.expectedByMethod();
    expect(expected.aggregator_receivable).toBe(FP_1_BILL + FP_2_BILL);
    // `08-F5`: "no cash expected at branch when foodpanda's rider delivers".
    expect(expected.cash ?? 0).toBe(0);
    expect(expected.card ?? 0).toBe(0);
    expect(expected.raast ?? 0).toBe(0);
    expect(expected.khata_credit ?? 0).toBe(0);
  });

  it("binds the settlement to the OPEN SHIFT, so 02-F23's Aggregator row is not always Rs 0", () => {
    const h = harness();
    h.entry.confirmed(FP_1);

    // `26 §7`: the shift is a CARRIED key, never resolved at fold time from the reading device's
    // state. A constant `null` here is not a cosmetic default — `Counter.tsx` records that exact
    // defect on the cashier's own tender path ("the cost was total, not partial"), and it would
    // land here harder: `aggregator_receivable` is the one method that ONLY ever arrives
    // automatically, so a null would make its `02-F23` row permanently Rs 0 with nothing to
    // notice.
    expect(payments(h)[0]).toMatchObject({ shift_id: SHIFT_ID });
    expect(h.expectedByMethod().aggregator_receivable).toBe(FP_1_BILL);
  });

  it("still settles with NO shift open, recording the null reference — 02-F37, 01-F17", () => {
    const h = harness({ openShift: false });
    expect(() => h.entry.confirmed(FP_1)).not.toThrow();

    // "Never a modal, never a block": the order still closes. The `shift_id` KEY is present and
    // null rather than absent — `payment.recorded` requires it, and an absent key is an `01-F4`
    // error at emit, which would lose the settlement entirely.
    expect(h.payTotal(FP_1)).toBe(FP_1_BILL);
    const paid = payments(h)[0] as Record<string, unknown>;
    expect("shift_id" in paid).toBe(true);
    expect(paid.shift_id).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE CHANNEL IS THE DISCRIMINATOR. Vary the input the assertions claim to own.
//
// Without this section an implementation that auto-settles EVERY confirmed order passes every
// other assertion in the file — and it would settle every counter sale in the branch as an
// aggregator receivable, so no cash is ever expected in any drawer and `02-F23`'s reconciliation
// reads Rs 0 against a full till. That is the K-4 defect (~90 renders, one input never varied)
// with money attached.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F30/02-F42 — only the foodpanda channel is aggregator-collected", () => {
  it("does NOT settle a counter order — the cashier still takes the money", () => {
    const h = harness();
    h.entry.confirmed(COUNTER_1);
    expect(h.emitted).toEqual([]);
    expect(h.payTotal(COUNTER_1)).toBe(0);
  });

  it("does NOT settle a phone order — 02-F28 is settled at the counter like any other", () => {
    const h = harness();
    h.entry.confirmed(PHONE_1);
    expect(h.emitted).toEqual([]);
    expect(h.payTotal(PHONE_1)).toBe(0);
  });

  it("settles the foodpanda order and leaves its same-priced neighbours alone", () => {
    // The three orders carry the IDENTICAL bill (Rs 960) and differ in nothing but `channel`, so
    // an implementation keying off the money, the order type, the line count or "the first open
    // order" cannot tell them apart and fails here.
    const h = harness();
    expect(h.billed(FP_2)).toBe(h.billed(COUNTER_1));
    expect(h.billed(FP_2)).toBe(h.billed(PHONE_1));

    h.entry.confirmed(FP_2);
    h.entry.confirmed(COUNTER_1);
    h.entry.confirmed(PHONE_1);

    expect(payments(h).map((p) => p.order_id)).toEqual([FP_2]);
    expect(h.payTotal(FP_2)).toBe(FP_2_BILL);
    expect(h.payTotal(COUNTER_1)).toBe(0);
    expect(h.payTotal(PHONE_1)).toBe(0);
  });

  it("settles the named order and NOT every foodpanda order it can see", () => {
    // A sweep over `openOrders()` that ignores its own argument would settle FP_1 and FP_2 on one
    // call, double-billing an order the cashier has not finished entering.
    const h = harness();
    h.entry.confirmed(FP_2);
    expect(payments(h).map((p) => p.order_id)).toEqual([FP_2]);
    expect(h.payTotal(FP_1)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE AMOUNT IS THIS ORDER'S OWN BILL, AND IT MOVES WHEN THE BILL MOVES.
//
// Aimed at the hardcode, the wrong-order read, and `qty` being ignored (a `Σ unit_price` that
// drops quantity is right for FP_2's single line and wrong by Rs 640 — a plausible slip that a
// single-fixture suite cannot see).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F30 — the receivable equals the order's billed total", () => {
  it("tracks two different bills across two orders, including qty > 1", () => {
    const h = harness();
    h.entry.confirmed(FP_1);
    h.entry.confirmed(FP_2);

    const byOrder = new Map(payments(h).map((p) => [p.order_id, p.amount_paisa]));
    expect(byOrder.get(FP_1)).toBe(FP_1_BILL);
    expect(byOrder.get(FP_2)).toBe(FP_2_BILL);
    expect(byOrder.get(FP_1)).not.toBe(byOrder.get(FP_2));
    // Both against the engine's derivation, so the two constants above are corroborated and not
    // trusted.
    expect(byOrder.get(FP_1)).toBe(h.billed(FP_1));
    expect(byOrder.get(FP_2)).toBe(h.billed(FP_2));
  });

  it("counts quantity — FP_2 is 3 x Rs 320, not Rs 320", () => {
    const h = harness();
    h.entry.confirmed(FP_2);
    expect(payments(h)[0]?.amount_paisa).toBe(96_000);
  });

  it("satisfies 01-F30 conservation: paid − refunded = billed, with no counter settlement", () => {
    const h = harness();
    h.entry.confirmed(FP_1);
    h.entry.confirmed(FP_2);
    for (const id of [FP_1, FP_2]) {
      const row = h.store.openOrders().find((r) => r.order_id === id);
      expect(row?.pay_total).toBe(h.billed(id));
      expect(row?.refund_total).toBe(0);
      expect(row?.repaid_total).toBe(0);
      // `01-F32`: "No order reaches settled state with conservation violated."
      expect(JSON.parse(row?.exceptions_json ?? "[]")).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `01-F31`: ENTERING TWICE DOES NOT BILL TWICE.
//
// The emitter is a ROBOT on the confirm path, so the double-tap `01-F31` protects a human from is
// strictly more likely here, not less: a re-sent `order.confirmed` (which `02-F9` requires to be
// idempotent) fires it again. An implementation minting a fresh `settlement_attempt_id` per
// firing produces two genuine-looking attempts, `26 §7`'s unique-keyed sum correctly adds them,
// and the receivable DOUBLES — `DEC-MONEY-009` reintroduced with no human in the loop to notice.
//
// The assertion is on the MONEY, not on the key, because two implementations are both correct: a
// stable key that the fold dedupes, or a covered-bill check that emits nothing the second time.
// Pinning the key would redden one of them.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F31 — repeat entry is idempotent in the money", () => {
  it("does not double the receivable when the entry act fires twice", () => {
    const h = harness();
    h.entry.confirmed(FP_1);
    h.entry.confirmed(FP_1);
    expect(h.payTotal(FP_1)).toBe(FP_1_BILL);
    expect(h.payTotal(FP_1)).not.toBe(FP_1_BILL * 2);
  });

  it("does not double it across five firings, and the drawer is unmoved", () => {
    const h = harness();
    for (let i = 0; i < 5; i += 1) h.entry.confirmed(FP_1);
    expect(h.payTotal(FP_1)).toBe(FP_1_BILL);
    expect(h.expectedByMethod().aggregator_receivable).toBe(FP_1_BILL);
    // `attempt_divergence` is `01-F31`'s disputed-key anomaly: two DIFFERENT payloads under one
    // key contribute zero and raise it. A stable key carrying a stable payload must not.
    const row = h.store.openOrders().find((r) => r.order_id === FP_1);
    expect(JSON.parse(row?.exceptions_json ?? "[]")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — NOTHING IS BILLED FOR AN ORDER WITH NO BILL.
//
// A foodpanda order started and abandoned has no billable lines. A receivable against it is a
// record of money owed for food that was never ordered, permanent under `01-F1`, and the Pay
// surface would then tell a cashier the aggregator collects Rs 0 on a bill that does not exist.
//
// Asserted on the MONEY rather than on "no event emitted", so an implementation that emits
// `amount_paisa: 0` is not reddened for a choice that harms nobody. The two shipped `billed > 0`
// narrowings in this app (`settlement-guard.ts`'s `alreadySettled`, `Counter.tsx`'s
// `isAlreadySettled`) are the precedent for the conservative direction.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F30 — a foodpanda order with no lines carries no receivable", () => {
  it("leaves pay_total at zero for an empty order", () => {
    const h = harness();
    expect(h.billed(FP_EMPTY)).toBe(0);
    h.entry.confirmed(FP_EMPTY);
    expect(h.payTotal(FP_EMPTY)).toBe(0);
    expect(h.expectedByMethod().aggregator_receivable ?? 0).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — `01-F17`: THE ENTRY IS NEVER COST BY THE SETTLEMENT.
//
// The emitter hangs off an `order.confirmed` that has ALREADY landed, beside `kot.confirmed` —
// the kitchen handoff. A throw here does not merely fail to settle: depending on where the host
// puts the call it can skip the KOT, so the food is never cooked for an order the ledger says was
// confirmed. `LineAdvance.settled` handles exactly this with `if (order === undefined) return;`
// and this is the same requirement one module over.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 01-F17 — an unreadable order costs nothing", () => {
  it("returns quietly for an order id this device does not hold", () => {
    const h = harness();
    expect(() => h.entry.confirmed("0199bbbb-0000-7000-8000-0000000fffff")).not.toThrow();
    expect(h.emitted).toEqual([]);
  });

  it("returns quietly for an order whose channel the projection does not carry", () => {
    // `OpenOrderRow.channel` is projected from `order.created`; an order this device saw only
    // through later events has no channel, and `01-F54` requires a degrade rather than a throw.
    const h = harness();
    const orphan = "0199bbbb-0000-7000-8000-00000000e001";
    h.store.append({
      id: "0199dddd-0000-7000-8000-0000000000f1",
      org_id: ORG,
      branch_id: BRANCH,
      device_id: TILL,
      actor_user_id: "user-ayesha",
      device_created_at: 1_754_500_000_000,
      type: "order.line_added",
      schema_version: 1,
      payload: {
        order_id: orphan,
        line_id: "0199bbbb-0000-7000-8000-00000000e0a1",
        item_id: "i-orphan",
        qty: 1,
        unit_price_paisa: 45_000,
      },
      refs: [],
    });
    expect(() => h.entry.confirmed(orphan)).not.toThrow();
    expect(h.emitted).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §H — THE SEAM. **THE WAVE'S NAMED DEFECT, AND THE ONLY SECTION THAT CAN SEE IT.**
//
// Every assertion above constructs its own wiring, so all of them stay green against a host that
// never calls this module — and every foodpanda order in the product would still close at Rs 0.
// `pnpm seams:check` is structurally blind to it: a producer for an event type is neither an
// unreached export (Rule A) nor an unsupplied optional member (Rule B), which is exactly how
// `audit.print_acknowledged` sat in the registry with nothing emitting it.
//
// `main/index.ts` builds an Electron app at module scope and cannot be imported in a unit test, so
// these read source — the same weak instrument, for the same reason and under the same constraint,
// as `line-advance-seam.test.ts` §A and `print-ack-audit.test.ts` §A. It pins SHAPE deliberately;
// there is nothing else that can see a missing call.
//
// ── ⚠ THIS SECTION WAS DEFEATED BY A COMMENT, AND THAT IS WHY THE STRIPPER BELOW EXISTS ───────
//
// §H used to search the RAW source, prose included. **Measured twice:** delete
// `aggregator.confirmed(order_id)` from the confirm branch and write
// `// TODO(02-F30): the aggregator.confirmed(order_id) call belongs here` in its place, and this
// file was **22/22 GREEN** while the shipped product wrote no receivable for any foodpanda order.
// The only thing standing between the repo and that hole was a note in `main/index.ts` asking
// future sessions not to write the token in prose — *"a comment promising a protection that does
// not exist"*, which AGENTS.md names as strictly worse than no comment, because it retires the
// assertion someone would otherwise write.
//
// The fix is the repo's own standard, stated one rail over: **symbol-precise and comment-blind.**
// `scripts/check-seams.mjs` opens with *"blank comments, strings and regex literals so the parsers
// below cannot be fooled by an import written inside a doc comment (this file would trip its own
// rail)"* — the identical hazard, one tool over, already solved. `blankNonCode` below is that
// algorithm; it is a copy rather than an import because the rail is a script that `process.exit`s
// at module scope and cannot be imported at all. A copy is safe HERE in a way a copied *contract*
// would not be (`K-3`'s dead oracle): if the rail's algorithm changes, this file is unaffected,
// because what is shared is a technique and not a claim about the product.
//
// **Two views, and the difference is load-bearing.** `code` blanks comments and keeps string
// CONTENT, because the confirm branch is located by a string literal (`"order.confirmed"`).
// `strict` blanks string content too, and every "the app really calls it" assertion is made
// against `strict` — otherwise the identical defeat comes back one quote mark over, as
// `logger.debug("aggregator.confirmed skipped")`. Both preserve every byte position, which is what
// lets a range located in one be sliced out of the other; §H1 asserts that alignment rather than
// assuming it.
//
// ── MUTATION MATRIX FOR §H0+§H (2026-08-11) — control 29/29, 0 survivors ──────────────────────
//
// `main/index.ts` was mutated in a scratchpad COPY of this app, never in the worktree. **Every
// mutant below killed 0 PRE-EXISTING tests** — measured over the whole package, all 723 of them,
// not just this file. That number is the finding: nothing else in `apps/pos-electron` can see a
// missing aggregator seam, which is why §H is the only section that may not be weakened.
//
//   #      mutant (exactly one branch of main/index.ts)                     tests failed /29
//   H-M1   **THE MEASURED DEFEAT** — the call deleted, a comment in its     **1 — §H3**
//          place (this was 22/22 GREEN against the old §H)
//   H-M2   the same defeat one quote over — the token in a STRING literal   **1 — §H3**
//   H-M3   the call simply deleted, no prose at all                         1 — §H3
//   H-M4   the emitter constructed and never called                         1 — §H3
//   H-M5   the CONSTRUCTION replaced by a comment naming it                 2 — §H2, §H3
//   H-M6   PORT SUPPLIED WITH A STUB — `append: () => {}`, store kept       1 — §H2
//   H-M7   fired from the WRONG branch (`shift.closed`)                     1 — §H3
//   H-NC   **NEGATIVE CONTROL** — the binding renamed throughout and the    **0**
//          whole "do not write the token" comment deleted
//
// And the INSTRUMENT was mutated separately, because §H0 is a guard on a guard:
//
//   S-M1   the stripper EMPTIES the file                                    10 — all of §H0, §H1-3
//   S-M2   the stripper is a NO-OP (the raw source §H was defeated in)      3 — §H0×2, §H1
//   S-M3   comments DELETED rather than blanked (positions shift)           4 — §H0×3, §H1
//   S-M4   a stripper blind to strings                                      2 — §H0×2
//   S-M5   **the strict view silently degraded to the lenient one**         **1 — §H1**
//
// ⚠ **S-M5 is the row worth reading, because it SURVIVED the first version of this fix.** §H0
// exercises `blankNonCode` directly, so it stayed green while the CALL SITE passed the wrong flag —
// a suite that blesses an instrument is not a suite that blesses its use, which is this repo's own
// "a store was passed / the store durably works" lesson one layer up. §H1's last two expectations
// were added for it and kill it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Blank comments (and optionally string CONTENT) with spaces, preserving every newline and every
 * byte position. Regex literals are blanked whole: one can hold a lone quote (`/["']/`) that would
 * otherwise open a string and swallow the rest of the file.
 *
 * Adapted from `scripts/check-seams.mjs`'s `blankNonCode`, which is proven on this exact file —
 * `pnpm seams:check` roots its walk at every app's own `src`, this one included.
 */
const blankNonCode = (src: string, blankStrings = false): string => {
  const out = src.split("");
  const blank = (i: number): void => {
    if (src[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  let prevSignificant = "";
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") blank(i++);
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      blank(i++);
      blank(i++);
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) blank(i++);
      blank(i++);
      blank(i++);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++; // the opening quote stays, so `from "x"` is still a delimited literal
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          if (blankStrings) blank(i);
          i++;
          if (i < src.length) {
            if (blankStrings) blank(i);
            i++;
          }
          continue;
        }
        // `${…}` inside a template literal is CODE. Blanking it would hide a call made only in an
        // interpolation, which is the direction that loses a seam.
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          let braces = 1;
          while (i < src.length && braces > 0) {
            if (src[i] === "{") braces++;
            else if (src[i] === "}") braces--;
            i++;
          }
          continue;
        }
        if (blankStrings) blank(i);
        i++;
      }
      i++;
      prevSignificant = quote;
      continue;
    }
    if (c === "/" && /[=(,:[!&|?{};+\-*%~^<>]|^$/.test(prevSignificant)) {
      blank(i++);
      let inClass = false;
      while (i < src.length) {
        const d = src[i];
        if (d === "\\") {
          blank(i++);
          if (i < src.length) blank(i++);
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        else if (d === "\n") break;
        blank(i++);
      }
      blank(i++);
      prevSignificant = "/";
      continue;
    }
    if (c !== undefined && !/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out.join("");
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §H0 — THE INSTRUMENT ITSELF, on synthetic input.
//
// A stripper is a guard on a guard, and it has exactly two ways to fail, in opposite directions.
// **Emptying the file** makes every §H assertion below unfalsifiable — that is ROUND-2 PATTERN 2
// ("the guard passed by not looking") relocated one level down, and it is why the task that
// commissioned this fix asked for a tripwire in the same breath as the stripper. **Eating code**
// is the other half and is worse than useless: it reddens a correct `main/index.ts` and blocks the
// implementer, which AGENTS.md rates as damaging as a vacuous test.
//
// These run on strings this file owns, so they say something about the instrument no assertion
// over `main/index.ts` can: that instrument and subject are independent.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§H0 the comment stripper is aimed at the defeat, and does not eat code", () => {
  it("blanks the exact defeat this section was measured losing to — in both comment forms", () => {
    const line = "        // TODO(02-F30): the aggregator.confirmed(order_id) call belongs here\n";
    const block = "        /* the aggregator.confirmed(order_id) call belongs here */\n";
    for (const prose of [line, block]) {
      const view = blankNonCode(`const x = 1;\n${prose}const y = 2;\n`);
      expect(view).not.toContain("aggregator.confirmed");
      // and the code either side of the prose is untouched
      expect(view).toContain("const x = 1;");
      expect(view).toContain("const y = 2;");
    }
  });

  it("does NOT blank the call itself — the mutant where the stripper eats the code it guards", () => {
    const view = blankNonCode("      aggregator.confirmed(order_id);\n");
    expect(view).toContain("aggregator.confirmed(order_id);");
  });

  it("preserves every byte position, so a range found in one view slices the other", () => {
    const src = 'const a = "x"; // note\n/* two\n   lines */\nconst b = 2;\n';
    for (const view of [blankNonCode(src), blankNonCode(src, true)]) {
      expect(view).toHaveLength(src.length);
      expect(view.split("\n")).toHaveLength(src.split("\n").length);
    }
    // A stripper that DELETED comments instead of blanking them would shift every later index and
    // silently mis-slice the confirm block. This is the assertion that forbids it.
    expect(blankNonCode(src).indexOf("const b = 2;")).toBe(src.indexOf("const b = 2;"));
  });

  it("a source with no comments comes back byte-identical — the no-op case is a no-op", () => {
    const src = "const a = 1;\nfoo(a);\n";
    expect(blankNonCode(src)).toBe(src);
  });

  it("`//` inside a STRING is not a comment, and a regex holding a quote does not swallow the file", () => {
    const url = blankNonCode('const u = "https://example.test/a"; const c = 2;\n');
    expect(url).toContain("const c = 2;");
    const re = blankNonCode("const r = /[\"']/; const d = 3;\n");
    expect(re).toContain("const d = 3;");
  });

  it("the strict view blanks string CONTENT and keeps the code around it", () => {
    // The one-quote-over rerun of the same defeat: a token parked in a string literal.
    const src = 'log("aggregator.confirmed skipped"); foo();\n';
    expect(blankNonCode(src, true)).not.toContain("aggregator.confirmed");
    expect(blankNonCode(src, true)).toContain("foo();");
    // …and the lenient view keeps it, which is exactly why §H3 locates by string and asserts by
    // strict rather than doing both in one view.
    expect(blankNonCode(src)).toContain("aggregator.confirmed");
  });

  it("a template interpolation is CODE and survives even the strict view", () => {
    // Blanking a template's interpolation would hide a call made only there, and that is the
    // direction in which a seam is LOST rather than merely mis-reported.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder IS the fixture here.
    const src = "const s = `a ${emitter.confirmed(id)} b`;\n";
    expect(blankNonCode(src, true)).toContain("emitter.confirmed(id)");
  });
});

describe("§H 02-F30 — the shipped app reaches the emitter", () => {
  const MAIN = new URL("../index.ts", import.meta.url).pathname;
  const raw = readFileSync(MAIN, "utf8");
  /** Comments blanked; string CONTENT kept, because the confirm branch is found by a string. */
  const code = blankNonCode(raw);
  /** Comments AND string content blanked. Every "it really calls it" assertion is made here. */
  const strict = blankNonCode(raw, true);

  it("is actually reading the file it guards, and really stripped it", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string reports
    // clean. Anchored on lines that have nothing to do with this work — and asserted against the
    // STRIPPED view, so a stripper that empties the file fails here rather than passing everything.
    expect(strict, MAIN).toContain("app.whenReady()");
    expect(strict).toContain("createKotPrinter({");
    expect(raw.length).toBeGreaterThan(20_000);
    // Positions align across the three views, which is what makes the cross-view slicing in §H3
    // legitimate rather than lucky.
    expect(code).toHaveLength(raw.length);
    expect(strict).toHaveLength(raw.length);
    // And the stripper is not a no-op on this file: `main/index.ts` is prose-heavy, and a stripper
    // that quietly returned its input would restore the exact hole §H was defeated by.
    const blanked = [...raw].filter((ch, at) => ch !== code[at]).length;
    expect(blanked, "the comment stripper removed nothing from main/index.ts").toBeGreaterThan(
      1_000,
    );
    /**
     * ⚠ **AND THE TWO VIEWS REALLY ARE THE TWO VIEWS — measured, because §H0 could not see this.**
     * §H0 exercises `blankNonCode` directly, so it stays green when the helper is perfect and the
     * CALL SITE above passes the wrong flag. Dropping the `true` from `strict` was mutated and
     * **survived the whole suite** against a correct `main/index.ts`, re-opening the string-literal
     * rerun of the defeat (H-M2) with nothing to say so. That is this repo's own lesson one layer
     * up: a suite that blesses an instrument is not a suite that blesses its use.
     *
     * `"order.confirmed"` occurs exactly once in `main/index.ts` and only ever inside a string, so
     * it is present in the lenient view and absent from the strict one — in either direction this
     * fails loudly rather than degrading.
     */
    expect(code, "`code` is not the LENIENT view — §H3's anchor lives in a string").toContain(
      '"order.confirmed"',
    );
    expect(strict, "`strict` is not the STRICT view — string content survived it").not.toContain(
      "order.confirmed",
    );
  });

  it("constructs the emitter with the real store and an append that reaches the ledger", () => {
    const at = strict.indexOf("createAggregatorSettlement({");
    // Explicit, because `slice(-1)` on a miss yields the file's last character and NOT "" — the
    // old `expect(call).not.toBe("")` passed against a host with no construction at all, and the
    // failure surfaced two assertions later wearing the wrong name.
    expect(at, `no createAggregatorSettlement({ … }) construction in ${MAIN}`).toBeGreaterThan(-1);
    const args = strict.slice(at, strict.indexOf("\n  });", at));
    expect(args).toMatch(/\bstore[,:]/);
    // The "port supplied with a STUB" case AGENTS.md measures as invisible to every rail in this
    // repo: `append: () => {}` satisfies a required member and ships no money anywhere.
    expect(args).toContain("gateway.append(");
  });

  it("fires it from the order.confirmed append, beside the kitchen handoff", () => {
    // Located in the lenient view: the anchor IS a string literal, and `strict` has blanked it.
    const at = code.indexOf('confirm.data.type === "order.confirmed"');
    expect(at, `no order.confirmed append branch in ${MAIN}`).toBeGreaterThan(-1);
    const end = code.indexOf("\n    }\n", at);
    expect(end, "the order.confirmed branch never closes").toBeGreaterThan(at);
    // The SAME byte range out of the strict view — so nothing below can be satisfied by prose or
    // by a string literal. §H0 pins the position-preservation this line rests on.
    const block = strict.slice(at, end);
    // The neighbours, so this cannot pass by measuring the wrong block.
    expect(block).toContain("lines.confirmed(order_id)");
    expect(block).toContain("kot.confirmed(order_id)");
    // **The binding is READ, not assumed** — the host may name it anything; what is asserted is
    // that whatever `createAggregatorSettlement` returned is reached from the confirm branch.
    const bound = /const\s+(\w+)\s*=\s*createAggregatorSettlement\(/.exec(strict)?.[1];
    expect(bound, "nothing binds the result of createAggregatorSettlement").toBeTruthy();
    expect(block).toContain(`${bound as string}.`);
  });
});
