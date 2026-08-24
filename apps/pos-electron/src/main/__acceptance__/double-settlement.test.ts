// ACCEPTANCE TESTS — `DEC-MONEY-009`: two cashiers settle one order and the cash DOUBLES.
//
// PROVENANCE (`24 §3` step 2), stated rather than glossed: authored and implemented by the same
// session, on the terms `line-advance.test.ts` and `report-scope.test.ts` already record. The
// mitigation is the round-3 law and not a claim of independence — every assertion below was
// mutation-tested against a CONTROL differing in exactly one branch, and the matrix is in the
// session's final message. Where an assertion could pass vacuously it is anchored on something
// the implementation cannot also supply: §A and §B run the REAL merge engine and the REAL
// `shift_cash` fold in a REAL store and read the MONEY back out, so a guard that satisfies this
// module's own idea of "settled" without changing the drawer fails there rather than here.
//
// THE RULING THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   DEC-MONEY-009  "RULED (founder, August 2026): refuse the second settlement at the till …
//                  the refusal is a LOCAL decision against the device's own converged fold,
//                  never a network round-trip. A till that must ask the cloud whether an order
//                  is settled is a till that stops selling when the WAN drops, which is exactly
//                  the break 01-F17 forbids; a till that reads its own state and declines to
//                  settle an order it already knows is settled is refusing a DUPLICATE, not
//                  blocking a sale … two tills partitioned from each other have not converged,
//                  so neither can know, and both will accept."
//   01-F17         a sale is never blocked — not by inventory math, sync, or approval timeouts.
//   00 §5.1        no in-branch feature may require WAN.
//   01-F31         every emission carries a UI-layer `settlement_attempt_id`; folds dedupe by
//                  attempt key. TWO CASHIERS ARE TWO GENUINE ATTEMPTS — the algebra is right.
//   01-F30         per order, `Σ tendering payments − Σ refunds = billed_total − …` once settled.
//   01-F33         settlement is an ACT: `order.settlement_closed`, cashier-emitted.
//   01-F1          append-only; a refusal appends nothing and unwinds nothing.
//   02-F13         split payment across methods IN ONE SETTLEMENT — so a partial tender is a
//                  first-class case and must never be refused.
//   DEC-MONEY-007  a khata repayment is `payment.recorded { purpose: repays_receivable }`.
//
// ⚠ WHAT THIS SUITE DOES NOT CLAIM, and §F asserts the limit rather than leaving it to prose:
//  1. **The defect is NOT closed.** Two PARTITIONED tills have not converged, so neither can see
//     the other's payment and both accept. §F drives exactly that and asserts the doubling still
//     happens — a passing test whose subject is the residual, so nobody can read this file as a
//     closure. The detection work `DEC-MONEY-009` names (an `01-F33` emitter, a scheduled
//     Auditor, a decision on `EXCESS_TENDER_IS_EXCEPTION`) stays owed.
//  2. **Nothing here is evidence about a second real till.** `apps/pos-electron` hardcodes
//     `DEV_IDENTITY` with no environment override, so two tills cannot be run at all today
//     (AGENTS.md's thirteenth instance). The two-device fixtures below are two ORIGINS inside one
//     store, which is what the fold actually merges — but a fixture is not a process.
//  3. **The Rs 0-tender defect is untouched.** §E pins that a Rs 0 tender against a real bill is
//     still recorded, because the guard's `billed > 0` narrowing keeps it out of scope.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import type { AppendResult } from "../../shared/ipc";
import type { Gateway } from "../gateway";
import {
  alreadySettled,
  refuseDoubleSettlement,
  type SettlementRefusedError,
} from "../settlement-guard";

/**
 * Local, because a shipping predicate for this would be an export no shipping code reaches — the
 * wave's named defect, and `pnpm seams:check` said so about the first draft of this file's
 * counterpart in `settlement-guard.ts`. See that module's note on `SettlementRefusedError`.
 */
const isSettlementRefusal = (error: unknown): error is SettlementRefusedError =>
  error instanceof Error && "already_settled" in error;

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
/** TWO devices, because the whole defect is two tills against one order (`02-F11`). */
const TILL_1 = "00000000-0000-7000-8000-000000000003";
const TILL_2 = "00000000-0000-7000-8000-000000000004";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const LINE_A = "0199aaaa-0000-7000-8000-00000000ff01";
const SHIFT_ID = "0199aaaa-0000-7000-8000-00000000551f";
const DAY_ID = "0199aaaa-0000-7000-8000-00000000d001";

/** The measured case: a Rs 2,240 bill (`DEC-MONEY-009`'s own figures, in paisa). */
const BILL_PAISA = 224_000;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Till = {
  store: DeviceStore;
  /** Append straight into the ledger — what a device with no guard does. */
  raw: (device_id: string, type: string, payload: Record<string, unknown>) => void;
  /** The shipped guard, wrapping a minimal gateway that appends for `TILL_2`. */
  guarded: Pick<
    Gateway,
    "append" | "addLine" | "toggleAvailability" | "recordCustomer" | "linkCustomer"
  >;
  /** Every request the guard let through to the ledger. */
  landed: { type: string; payload: Record<string, unknown> }[];
  /** `02-F23`'s system-expected cash for the open shift, in paisa — THE MONEY. */
  cashInDrawer: () => number;
};

/**
 * A real store holding an open day, an open shift and one Rs 2,240 order, plus the SHIPPED guard
 * wired over a gateway that appends into that same store.
 *
 * The order is priced through `order.line_added` at the real `unit_price_paisa`, so
 * `billed_effective` is the merge engine's own derivation and not a number this file typed in.
 */
const till = (): Till => {
  const dir = mkdtempSync(join(tmpdir(), "restos-double-settle-"));
  dirs.push(dir);
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL_1 },
  });
  let n = 0;
  let peerLamport = 0;
  /**
   * `TILL_1` is this store's own device and appends; `TILL_2` is a PEER and is INGESTED.
   *
   * `01-F2` refuses a foreign identity through `append` ("one device, one store"), and taking the
   * lazy way out — writing both payments under one `device_id` — would be fold-equivalent but
   * would stop the fixture being what the defect is: two ORIGINS merging into one projection. It
   * is still two origins inside one process and not two processes; see this file's non-claim 2.
   */
  const raw = (device_id: string, type: string, payload: Record<string, unknown>): void => {
    n += 1;
    const id = `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`;
    const actor_user_id = device_id === TILL_1 ? "user-ayesha" : "user-bilal";
    const device_created_at = 1_754_300_000_000 + n;
    if (device_id === TILL_1) {
      store.append({
        id,
        org_id: ORG,
        branch_id: BRANCH,
        device_id,
        actor_user_id,
        device_created_at,
        type,
        schema_version: 1,
        payload,
        refs: [],
      });
      return;
    }
    peerLamport += 1;
    store.ingest({
      id,
      org_id: ORG,
      branch_id: BRANCH,
      device_id,
      actor_user_id,
      lamport_seq: peerLamport,
      device_created_at,
      branch_created_at: device_created_at,
      time_basis: "branch",
      server_received_at: null,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  raw(TILL_1, "day.opened", { day_id: DAY_ID, opening_float_paisa: 500_000, prev_day_id: null });
  raw(TILL_1, "shift.opened", { shift_id: SHIFT_ID, prev_shift_id: null });
  raw(TILL_1, "order.created", { order_id: ORDER_ID, channel: "counter", order_type: "takeaway" });
  raw(TILL_1, "order.line_added", {
    order_id: ORDER_ID,
    line_id: LINE_A,
    item_id: "i-karahi",
    qty: 1,
    unit_price_paisa: BILL_PAISA,
  });

  const landed: { type: string; payload: Record<string, unknown> }[] = [];
  const appends: Pick<
    Gateway,
    "append" | "addLine" | "toggleAvailability" | "recordCustomer" | "linkCustomer"
  > = {
    append: (req: unknown): AppendResult => {
      const r = req as { type: string; payload: Record<string, unknown> };
      landed.push(r);
      raw(TILL_2, r.type, r.payload);
      return { id: `landed-${landed.length}` };
    },
    addLine: () => ({ id: "unused" }),
    toggleAvailability: () => ({ id: "unused" }),
    // `02-F27`/`02-F47` — the fourth member of the trusted write surface (August 2026). Not a
    // tender, so `DEC-MONEY-009` passes it straight through; stubbed here like the two above.
    recordCustomer: () => ({ id: "unused" }),
    // `02-F64` stub — this fixture has no opinion about a customer link.
    linkCustomer: () => ({ id: "unused" }),
  };

  return {
    store,
    raw,
    guarded: refuseDoubleSettlement({ writes: appends, store }),
    landed,
    cashInDrawer: () => {
      const shift = store.shifts().find((s) => s.shift_id === SHIFT_ID);
      const expected: Record<string, number> = JSON.parse(shift?.expected_json ?? "{}");
      return Object.values(expected).reduce((a, b) => a + b, 0);
    },
  };
};

const tender = (over: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  order_id: ORDER_ID,
  amount_paisa: BILL_PAISA,
  method: "cash",
  // `01-F31` — a DIFFERENT key per attempt, which is what makes the two payments two genuine
  // attempts rather than a double-tap. Using one key here would test `DEC-MONEY-008` instead.
  settlement_attempt_id: "0199aaaa-0000-7000-8000-0000000a0001",
  purpose: "settles_order",
  shift_id: SHIFT_ID,
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE DEFECT, REPRODUCED. Read this section's number before reading anything else.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A DEC-MONEY-009 — the measured defect: one bill, two cashiers, DOUBLE the cash", () => {
  it("puts Rs 4,480 in the drawer for a Rs 2,240 order, with nothing flagged", () => {
    // Both tills key the full bill and settle. No guard anywhere — this is the shipped product as
    // it stood on 2026-08-10, and it is also exactly what two PARTITIONED tills still produce.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender());
    t.raw(TILL_2, "payment.recorded", {
      ...tender(),
      settlement_attempt_id: "0199aaaa-0000-7000-8000-0000000a0002",
    });

    // THE MONEY, off the real `shift_cash` fold — `02-F23`'s "system-expected cash (by method)".
    expect(t.cashInDrawer()).toBe(448_000); // Rs 4,480 against a Rs 2,240 bill.

    // And the second half of what made it invisible: every screen agrees. The order reads fully
    // paid, so `DUE Rs 0` on both tills, and `01-F31`'s keyed sum is doing exactly its job —
    // two distinct attempt keys, both counted, nothing disputed and nothing to flag.
    const row = t.store.openOrders().find((o) => o.order_id === ORDER_ID);
    expect(row?.pay_total).toBe(448_000);
    expect(JSON.parse(row?.exceptions_json ?? "[]")).toEqual([]);
    expect(row?.cap_violated).toBe(0);

    // `01-F33`'s closing act is why no `01-F30` conservation check runs on it: the column is 0 on
    // every order in this product because nothing emits `order.settlement_closed`. That is
    // recorded as OWED and is deliberately not built here (defining a closing act is a founder
    // question), which is also why the guard cannot be built on this column.
    expect(row?.settled).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE RULING. The same two cashiers, with the shipped guard on the second till.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B DEC-MONEY-009 — the second settlement is REFUSED and the drawer is right", () => {
  it("leaves Rs 2,240 in the drawer and one payment in the ledger", () => {
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender()); // the first cashier, converged to till 2

    expect(() =>
      t.guarded.append({
        type: "payment.recorded",
        payload: { ...tender(), settlement_attempt_id: "0199aaaa-0000-7000-8000-0000000a0002" },
        refs: [],
      }),
    ).toThrow(/already tendered for in full/i);

    expect(t.cashInDrawer()).toBe(BILL_PAISA); // Rs 2,240 — the bill, once.
    expect(t.store.openOrders().find((o) => o.order_id === ORDER_ID)?.pay_total).toBe(BILL_PAISA);
  });

  it("appends NOTHING and unwinds nothing (commandment 1 / 01-F1)", () => {
    // A refusal is a UI act. The first settlement stands, no correction event is written, and the
    // ledger is exactly one payment longer than it was before the refused tap.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender());
    const before = t.store.openOrders().find((o) => o.order_id === ORDER_ID);

    try {
      t.guarded.append({ type: "payment.recorded", payload: tender(), refs: [] });
    } catch {
      /* the refusal under test */
    }

    expect(t.landed).toEqual([]);
    expect(t.store.openOrders().find((o) => o.order_id === ORDER_ID)).toEqual(before);
  });

  it("carries the two money facts on the refusal, so a caller can tell it from a DENY", () => {
    // `authorize.ts` attaches `refusal` for a permission outcome; this attaches `already_settled`.
    // A caller that could not tell them apart would offer a manager-PIN pad for a duplicate.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender());
    try {
      t.guarded.append({ type: "payment.recorded", payload: tender(), refs: [] });
      expect.unreachable("the guard must refuse");
    } catch (error) {
      expect(isSettlementRefusal(error)).toBe(true);
      expect(isSettlementRefusal(error) && error.already_settled).toEqual({
        order_id: ORDER_ID,
        billed_paisa: BILL_PAISA,
        paid_paisa: BILL_PAISA,
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — COMMANDMENT 4. The refusal is LOCAL, and this is the section that holds the ruling's
//      load-bearing constraint. A guard that reaches the network is the `01-F17` break the
//      ruling exists to avoid, and it would look exactly like a correct one to every other test.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F17/00 §5.1 — the decision touches nothing but this device's own fold", () => {
  it("reads exactly one member of the store, and no other dependency", () => {
    // THE MUTANT THIS EXISTS FOR: a consult of an uplink, a mesh peer, a hub or a clock. Any of
    // them needs a dependency, and this Proxy records every member ever touched. `openOrders` is
    // the whole list — so a round-trip added later reddens BY NAME rather than by review.
    const t = till();
    const touched = new Set<string>();
    const watched = new Proxy(t.store as unknown as Record<string, unknown>, {
      get(target, prop) {
        if (typeof prop === "string") touched.add(prop);
        return target[prop as string];
      },
    }) as unknown as DeviceStore;

    const guard = refuseDoubleSettlement({
      writes: {
        append: () => ({ id: "x" }),
        addLine: () => ({ id: "x" }),
        toggleAvailability: () => ({ id: "x" }),
        recordCustomer: () => ({ id: "x" }),
        // `02-F64` stub — this fixture has no opinion about a customer link.
        linkCustomer: () => ({ id: "x" }),
      },
      store: watched,
    });
    // Drive BOTH outcomes, so neither branch can be the one that reaches further.
    guard.append({ type: "payment.recorded", payload: tender(), refs: [] });
    t.raw(TILL_1, "payment.recorded", tender());
    try {
      guard.append({ type: "payment.recorded", payload: tender(), refs: [] });
    } catch {
      /* the refusal */
    }

    expect([...touched]).toEqual(["openOrders"]);
  });

  it("answers SYNCHRONOUSLY — there is no await for a network to hide in", () => {
    // A round-trip cannot be made synchronously in Node. This is a structural claim, and it is
    // stated as one: it does not prove the absence of a blocking socket read, which is what the
    // dependency assertion above is for. The two together are the guard.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender());
    let thrown: unknown;
    try {
      t.guarded.append({ type: "payment.recorded", payload: tender(), refs: [] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { then?: unknown }).then).toBeUndefined();
  });

  it("SETTLES A FRESH ORDER WITH NO CONNECTIVITY OF ANY KIND (01-F17)", () => {
    // The mutant that matters most in the other direction: a refusal that fires because the
    // device has not heard from anyone is worse than the defect. There is no transport, no mesh
    // session and no cloud session anywhere in this fixture — `lan`, `hub` and `cloud` are all
    // down by construction — and the sale lands.
    const t = till();
    expect(() =>
      t.guarded.append({ type: "payment.recorded", payload: tender(), refs: [] }),
    ).not.toThrow();
    expect(t.landed).toHaveLength(1);
    expect(t.cashInDrawer()).toBe(BILL_PAISA);
  });

  it("SETTLES AN ORDER THIS DEVICE HAS NEVER HEARD OF (01-F17)", () => {
    // ⚠ **THIS ASSERTION EXISTS BECAUSE A MUTANT SURVIVED WITHOUT IT**, and it is the round-3
    // law's shape exactly: the mechanism was built and the guard was never pointed at the
    // dangerous case. A device that has not converged has NO ROW for the order — that is what
    // "hasn't heard from anyone" looks like from inside `openOrders()` — and the plausible wrong
    // implementation is *"if I do not know about this order, refuse"*. It reads like caution and
    // it is the `01-F17` break the ruling exists to avoid: a till that stops selling because it
    // is behind. Absence of knowledge is not knowledge of a duplicate.
    //
    // Every other assertion in this file settles an order the fixture created, so all of them
    // passed under that mutant. This is the one that kills it.
    const t = till();
    expect(() =>
      t.guarded.append({
        type: "payment.recorded",
        payload: { ...tender(), order_id: "0199aaaa-0000-7000-8000-00000000dead" },
        refs: [],
      }),
    ).not.toThrow();
    expect(t.landed).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — WHAT IT MUST NOT REFUSE. Each of these is a live flow the ruling says nothing about, and
//      refusing any of them is an `01-F17` break wearing this fix's clothes.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F17 — the refusal is narrow, and these four still land", () => {
  it("a 02-F13 PARTIAL tender — part cash now, the rest in a moment", () => {
    const t = till();
    t.raw(TILL_1, "payment.recorded", { ...tender(), amount_paisa: 100_000 });
    expect(() =>
      t.guarded.append({
        type: "payment.recorded",
        payload: {
          ...tender(),
          amount_paisa: 124_000,
          // A DIFFERENT attempt key, because `01-F31` makes the key the identity of an INTENT:
          // two partials sharing one key are two divergent members of one attempt, the fold
          // marks it disputed and BOTH contribute zero. The first draft of this fixture reused
          // the key and read Rs 0 in the drawer — the algebra was right and the fixture was not.
          settlement_attempt_id: "0199aaaa-0000-7000-8000-0000000a0009",
        },
        refs: [],
      }),
    ).not.toThrow();
    expect(t.cashInDrawer()).toBe(BILL_PAISA);
  });

  it("a DEC-MONEY-007 khata repayment against an order already tendered for", () => {
    // `pay_total` excludes `repays_receivable`, so this order reads covered — and refusing the
    // repayment would break a flow this ruling never looked at. Only a TENDER can be a duplicate.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender());
    expect(() =>
      t.guarded.append({
        type: "payment.recorded",
        payload: { ...tender(), purpose: "repays_receivable", method: "khata_credit" },
        refs: [],
      }),
    ).not.toThrow();
  });

  it("an order with NO billable lines — including the open Rs 0-tender defect, untouched", () => {
    // `0 >= 0` would make every empty order read as settled. `billed > 0` is what stops the guard
    // refusing a sale that has not happened — and it is also why the recorded `TAKE CASH`-on-an-
    // empty-entry defect stays exactly where it is: OPEN, and not this ruling's to close.
    const t = till();
    const EMPTY = "0199aaaa-0000-7000-8000-00000000e0e0";
    t.raw(TILL_1, "order.created", { order_id: EMPTY, channel: "counter", order_type: "takeaway" });
    expect(() =>
      t.guarded.append({
        type: "payment.recorded",
        payload: { ...tender(), order_id: EMPTY, amount_paisa: 0 },
        refs: [],
      }),
    ).not.toThrow();
    // And a Rs 0 tender against a REAL bill is still recorded, which is the defect's own shape.
    expect(() =>
      t.guarded.append({
        type: "payment.recorded",
        payload: { ...tender(), amount_paisa: 0 },
        refs: [],
      }),
    ).not.toThrow();
  });

  it("every event type that is not a payment, and a payload it cannot read", () => {
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender());
    // A non-payment against a fully settled order is none of this guard's business.
    expect(() =>
      t.guarded.append({ type: "order.confirmed", payload: { order_id: ORDER_ID }, refs: [] }),
    ).not.toThrow();

    // Fail-OPEN here and fail-CLOSED downstream. A malformed request still throws — it must —
    // but it throws from the REAL validator for the REAL reason. The assertion is on WHICH
    // refusal it is, because a guard that swallowed a schema error into "already settled" would
    // send a cashier to look for a payment that was never the problem.
    let thrown: unknown;
    try {
      t.guarded.append({ nonsense: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(isSettlementRefusal(thrown)).toBe(false);
    expect(String(thrown)).not.toMatch(/already tendered/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — the predicate, driven directly. `alreadySettled` is exported so the wrapper cannot drift
//      from what a test asserts (the `K-3` dead-oracle shape).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E — alreadySettled, over one projected row", () => {
  const row = (pay_total: number, unit_price_paisa = BILL_PAISA) => ({
    order_id: ORDER_ID,
    pay_total,
    json_lines: JSON.stringify({
      [LINE_A]: { item_id: "i-karahi", qty: 1, unit_price_paisa, states: ["placed"] },
    }),
  });

  it("is null below the bill, a fact at or above it", () => {
    expect(alreadySettled(row(BILL_PAISA - 1))).toBeNull();
    expect(alreadySettled(row(BILL_PAISA))).toEqual({
      order_id: ORDER_ID,
      billed_paisa: BILL_PAISA,
      paid_paisa: BILL_PAISA,
    });
    // Over-tender is still settled. `EXCESS_TENDER_IS_EXCEPTION` is false at v1 and this ruling
    // did not change it — a bill that is more than covered is covered.
    expect(alreadySettled(row(BILL_PAISA + 5_000))?.paid_paisa).toBe(BILL_PAISA + 5_000);
  });

  it("is null on a zero bill however much was tendered", () => {
    expect(alreadySettled(row(0, 0))).toBeNull();
    expect(alreadySettled(row(50_000, 0))).toBeNull();
  });

  it("reads the ENGINE's billed derivation, so a voided line moves the answer", () => {
    // `billedCellPaisa`'s rule: a decided exited line contributes nothing (`01-F30` — "a fully
    // voided order nets to zero"). A hand-rolled `Σ qty × price` here would disagree, which is
    // the reason this module calls `billedEffectiveFromJsonLines` rather than summing.
    const voided = {
      order_id: ORDER_ID,
      pay_total: 1,
      json_lines: JSON.stringify({
        [LINE_A]: { item_id: "i", qty: 1, unit_price_paisa: BILL_PAISA, states: ["voided"] },
      }),
    };
    expect(alreadySettled(voided)).toBeNull(); // billed is 0, so there is nothing to duplicate
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — THE RESIDUAL, ASSERTED. This test PASSES on the doubling, deliberately.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F DEC-MONEY-009 — the PARTITION case is still open, by construction", () => {
  it("doubles the cash when neither till has seen the other's payment", () => {
    // Two tills, each holding only its OWN payment — the fold has not converged, so each device's
    // `open_orders` row says the bill is unpaid and each guard correctly lets its cashier settle.
    // Refusal closes the common case (both tills online); it cannot close this one, and no
    // assertion in this repo may claim otherwise.
    const a = till();
    const b = till();
    expect(() =>
      a.guarded.append({ type: "payment.recorded", payload: tender(), refs: [] }),
    ).not.toThrow();
    expect(() =>
      b.guarded.append({
        type: "payment.recorded",
        payload: { ...tender(), settlement_attempt_id: "0199aaaa-0000-7000-8000-0000000a0002" },
        refs: [],
      }),
    ).not.toThrow();

    // Now the partition heals: both events reach one device, and the drawer reads DOUBLE. The
    // guard never saw a converged fold, so it never had a decision to make.
    const merged = till();
    merged.raw(TILL_1, "payment.recorded", tender());
    merged.raw(TILL_2, "payment.recorded", {
      ...tender(),
      settlement_attempt_id: "0199aaaa-0000-7000-8000-0000000a0002",
    });
    expect(merged.cashInDrawer()).toBe(448_000);

    // What is OWED for it, named here so the gap has a home in code and not only in a decision
    // row: an emitter for `01-F33`'s closing act, a scheduled Auditor, and a decision on
    // `EXCESS_TENDER_IS_EXCEPTION`. Until those land the residual is silent, permanent under
    // `01-F1`, and agreed upon by every screen.
    expect(merged.store.openOrders().find((o) => o.order_id === ORDER_ID)?.settled).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — THE SEAM. AGENTS.md's named defect of this wave is a correct subsystem the product never
//      reaches, and `seams:check` is structurally blind to this shape: `refuseDoubleSettlement`
//      IS an exported value reached by shipping code, and `authorizeWrites`' `writes` member is
//      REQUIRED — so Rule A is satisfied by the import and Rule B has no optional to miss. The
//      only thing separating the wired product from `writes: gateway` is written by hand, here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G — main/index.ts puts the guard between the renderer and the ledger", () => {
  // A SOURCE READ, and stating that plainly is the point: `main/index.ts` builds an Electron app
  // at module scope and no suite in this package can import it, so this is the same weak
  // instrument `line-advance-seam.test.ts` §A already uses for `lines.settled`, for the same
  // reason. It is one guard, not two, and M10 of that file's producer round is the standing
  // warning about what a source string alone is worth. Everything BEHAVIOURAL about the guard is
  // §A–§F above, driven through the real module.
  const mainSrc = readFileSync(new URL("../index.ts", import.meta.url).pathname, "utf8");

  it("constructs it over the RAW gateway", () => {
    expect(mainSrc).toMatch(/refuseDoubleSettlement\(\{\s*writes:\s*gateway,\s*store\s*\}\)/);
  });

  it("hands the RESULT to authorizeWrites, so commandment 8 still runs first", () => {
    // The dangerous wiring is `authorizeWrites({ writes: gateway, … })` beside a guard nobody
    // reaches — the wave's defect exactly. `writes:` must name a GUARDED object, and the chain
    // from the authorized surface down to the raw gateway must pass through this guard.
    //
    // ⚠ **THIS ASSERTION WAS `writes:\s*settlementGuarded` AND WAS CORRECTED IN AUGUST 2026, NOT
    // WEAKENED.** `02-F48` added a second wrapper (`main/zero-tender-guard.ts`) between the matrix
    // and this guard, so the chain is now **matrix → amount → duplicate → ledger** and the object
    // `authorizeWrites` is handed is the zero-tender guard, which is handed THIS one. Pinning only
    // the outermost name would have gone green on a chain that dropped this guard entirely, so the
    // whole chain is pinned instead — every link, in order — which is strictly stronger than what
    // stood here. The negative control is unchanged and still the point.
    // ⚠ **THE INNER NAME MOVED IN AUGUST 2026 AND THE ASSERTION MOVED WITH IT.** The chain
    // gained `voidExitsLine` between the matrix and the amount guard (`02-F20`'s post-confirm
    // void appends the line's `01 §4` exit as part of one authorized act, so it must sit
    // INSIDE commandment 8 and OUTSIDE the two guards that refuse by throwing). Both links
    // are pinned rather than just the new outermost one — pinning the outermost alone is what
    // this test's own comment above says goes green on a chain that dropped a middle link.
    expect(mainSrc).toMatch(/voidExitsLine\(\{\s*writes:\s*tenderGuarded,\s*store\s*\}\)/);
    expect(mainSrc).toMatch(/authorizeWrites\(\{\s*writes:\s*voidGuarded,/);
    expect(mainSrc).toMatch(/refuseZeroTender\(\{\s*writes:\s*settlementGuarded\s*\}\)/);
    expect(mainSrc).not.toMatch(/authorizeWrites\(\{\s*writes:\s*gateway,/);
    expect(mainSrc).not.toMatch(/refuseZeroTender\(\{\s*writes:\s*gateway\s*\}\)/);
  });

  it("is what the renderer's append channel reaches", () => {
    // `writes.append` is the channel `ipcMain.handle(CHANNELS.append, …)` calls. If that ever
    // becomes `gateway.append` the guard is decorative and every gate stays green.
    expect(mainSrc).toMatch(/CHANNELS\.append[\s\S]{0,200}writes\.append\(req\)/);
  });
});
