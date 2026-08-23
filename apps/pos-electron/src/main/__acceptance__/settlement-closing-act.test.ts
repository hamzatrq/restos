// ACCEPTANCE TESTS — `01-F63`: the closing act's EMISSION contract.
//
// **AUTHORED FROM SPEC TEXT ONLY.** Written by a session acting as `24 §3`'s test author, from the
// FR text quoted below and from nothing else. No implementation of `main/settlement-closer.ts`
// existed in the tree when these assertions were written; the module was stood up OUT of the
// commit purely to run the mutation matrix, and deleted before this file was committed. The suite
// is expected to be RED on arrival with `Cannot find module '../settlement-closer'`, which is the
// `24 §3` contract: tests exist first, committed RED, implemented against.
//
// ── THE RULING THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with ───────────
//
//   01-F33  Settlement is an **act, not a derivation**: `order.settlement_closed` (cashier-
//           emitted, offline-legal) closes the money side as a monotone fact — nothing arithmetic
//           settles or un-settles an order, and a late line-add raises `uncovered_addition`
//           rather than reopening. Order "reopening" does not exist.
//   01-F63  **WHO:** the till that appends the tender which completes the cover; the envelope's
//           `actor_user_id` is that cashier's live PIN session.
//           **WHEN:** on the edge into "tendered for in full" and on no other trigger —
//           `pay_total >= billed_effective`, with `billed_effective > 0`, the SAME reading
//           `printing.ts` and `line-advance.ts` already make. A `02-F13` split closes ONCE.
//           **AT MOST ONE PER ORDER**, and the emitter — not the fold — is what makes that true.
//           **OFFLINE-LEGAL:** one row of this device's own projection; no WAN, no hub, no clock,
//           no ordering metadata. Emitted AFTER the money is in the ledger; a failure to emit
//           costs a conservation check, never a customer.
//           **PAYLOAD, PINNED:** `order_id`, `billed_paisa`, `tendered_paisa`, `refunded_paisa`,
//           `settlement_attempt_ids`. **No actor field** — `02-F45` forbids a second source for
//           one fact.
//           **A snapshot is an ATTESTATION:** absent asserts no ceiling, attested `0` is a real
//           ceiling, invalid raises `close_snapshot_invalid` and the act still settles.
//   01-F34  Device folds read **no ordering metadata** — no `global_seq`, no `lamport_seq`, no
//           device clock. Property-tested by bijective relabeling and clock injection: equal
//           delivered set ⇒ byte-equal projection.
//   01-F17  A sale is never blocked. / `00 §5.1` no in-branch feature may require WAN.
//   01-F1   Append-only. Every emission is permanent.
//   02-F45  Attribution rides the envelope's `actor_user_id`, never a duplicated payload field.
//   02-F13  Split payment across methods in one settlement.
//
// ── WHAT THIS SUITE DOES NOT CLAIM. §G asserts the limits rather than leaving them to prose ────
//
//  1. **`DEC-MONEY-009`'s PARTITION residual is not closed and this makes it worse in one way
//     that is worth seeing.** Two tills that never converged both accept a settlement AND now both
//     emit a closing act. §G1 drives exactly that and asserts it — a passing test whose subject is
//     the residual, so nobody may read this file as a closure.
//  2. **`01-F30`'s three missing right-hand terms are untouched** (`DEC-MONEY-010`). §G2 pins that
//     a comped order still reads as a conservation shortfall. What `01-F63` buys is that the
//     equation RUNS at all, which is the prerequisite those terms were owed behind — not the terms.
//  3. **Nothing here is evidence about two real tills.** `apps/pos-electron` hardcodes
//     `DEV_IDENTITY` with no environment override, so two tills cannot be run as two processes.
//     The two-device fixtures are two ORIGINS inside one store, which is what the fold merges.
//  4. **The closer's placement in `main/index.ts` is not asserted here** and cannot be: that file
//     builds an Electron app at module scope and no suite in this package can import it. The
//     wiring is a source read elsewhere; this file owns the module's BEHAVIOUR.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  billedEffectiveFromJsonLines,
  type DeviceStore,
  type OpenOrderRow,
  openStore,
} from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import type { AppendResult } from "../../shared/ipc";
import type { Gateway } from "../gateway";
import { createSettlementCloser } from "../settlement-closer";

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const TILL_1 = "00000000-0000-7000-8000-000000000003";
/** A PEER origin, because `01-F2` refuses a foreign identity through `append`. */
const TILL_2 = "00000000-0000-7000-8000-000000000004";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const LINE_A = "0199aaaa-0000-7000-8000-00000000ff01";
const LINE_B = "0199aaaa-0000-7000-8000-00000000ff02";
const SHIFT_ID = "0199aaaa-0000-7000-8000-00000000551f";
const DAY_ID = "0199aaaa-0000-7000-8000-00000000d001";

/** `DEC-MONEY-009`'s own measured figure, in paisa: a Rs 2,240 bill. */
const BILL_PAISA = 224_000;

const CASHIER = "user-ayesha";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Landed = { type: string; payload: Record<string, unknown> };

type Till = {
  store: DeviceStore;
  /** Straight into the ledger, bypassing every guard — what the world does TO this device. */
  raw: (device_id: string, type: string, payload: Record<string, unknown>) => void;
  /** The shipped closer, over a gateway that appends into this same store as `TILL_1`. */
  closer: { settled: (order_id: string) => void };
  /** Everything the closer put through `append`. */
  landed: Landed[];
  row: () => OpenOrderRow | undefined;
  /** Every `order.settlement_closed` in the LEDGER for `ORDER_ID` — the append-only truth. */
  closes: () => { payload: Record<string, unknown>; actor_user_id: string | null }[];
};

/**
 * A real store with a real merge engine, an open day and shift, and one Rs 2,240 order priced
 * through `order.line_added` — so `billed_effective` is the ENGINE's derivation and never a
 * number this file typed in.
 *
 * `opts.clockBase` and `opts.reverse` exist for §D: the same delivered SET under a different
 * clock and a different delivery ORDER.
 */
const till = (opts: { clockBase?: number; lines?: readonly number[] } = {}): Till => {
  const dir = mkdtempSync(join(tmpdir(), "restos-closing-act-"));
  dirs.push(dir);
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL_1 },
  });
  let n = 0;
  let peerLamport = 0;
  const clockBase = opts.clockBase ?? 1_754_300_000_000;

  const raw = (device_id: string, type: string, payload: Record<string, unknown>): void => {
    n += 1;
    const id = `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`;
    const device_created_at = clockBase + n;
    if (device_id === TILL_1) {
      store.append({
        id,
        org_id: ORG,
        branch_id: BRANCH,
        device_id,
        actor_user_id: CASHIER,
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
      actor_user_id: "user-bilal",
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
  for (const [i, price] of (opts.lines ?? [BILL_PAISA]).entries()) {
    raw(TILL_1, "order.line_added", {
      order_id: ORDER_ID,
      line_id: i === 0 ? LINE_A : LINE_B,
      item_id: `i-${i}`,
      qty: 1,
      unit_price_paisa: price,
    });
  }

  const landed: Landed[] = [];
  const writes: Pick<Gateway, "append"> = {
    append: (req: unknown): AppendResult => {
      const r = req as Landed;
      landed.push({ type: r.type, payload: r.payload });
      raw(TILL_1, r.type, r.payload);
      return { id: `landed-${landed.length}` };
    },
  };

  return {
    store,
    raw,
    closer: createSettlementCloser({ store, writes }),
    landed,
    row: () => store.openOrders().find((o) => o.order_id === ORDER_ID),
    closes: () =>
      store
        .readAllEvents()
        .filter(
          (e) =>
            e.type === "order.settlement_closed" &&
            (e.payload as { order_id?: string }).order_id === ORDER_ID,
        )
        .map((e) => ({
          payload: e.payload as Record<string, unknown>,
          actor_user_id: e.actor_user_id ?? null,
        })),
  };
};

let attempt = 0;
const tender = (
  amount_paisa: number,
  over: Record<string, unknown> = {},
): Record<string, unknown> => {
  attempt += 1;
  return {
    order_id: ORDER_ID,
    amount_paisa,
    method: "cash",
    settlement_attempt_id: `0199aaaa-0000-7000-8000-${String(attempt).padStart(12, "0")}`,
    purpose: "settles_order",
    shift_id: SHIFT_ID,
    ...over,
  };
};

/** Pay the bill through the ledger, then run the closer exactly as `index.ts` would. */
const settleInFull = (t: Till): void => {
  t.raw(TILL_1, "payment.recorded", tender(BILL_PAISA));
  t.closer.settled(ORDER_ID);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE PRODUCER EXISTS. This is the whole point of `01-F63` and it is what is false today.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F63 — the closing act finally has a producer", () => {
  it("puts exactly one order.settlement_closed in the LEDGER when the bill is tendered for in full", () => {
    // MUTATION THIS CATCHES: no emitter at all — which is the state of this product today, and
    // the reason `01-F30`'s conservation equation has never executed on a real order. Asserted
    // against the append-only ledger rather than against `landed`, so a closer that "returns" an
    // act without writing it fails here.
    const t = till();
    expect(t.closes(), "the fixture must start with no closing act").toHaveLength(0);

    settleInFull(t);

    expect(t.closes()).toHaveLength(1);
    expect(t.closes()[0]?.payload.order_id).toBe(ORDER_ID);
  });

  it("moves the fold's `settled` column from 0 to 1 — the act settles, not the arithmetic", () => {
    // MUTATION THIS CATCHES: emitting a malformed act the merge engine declines to fold (a wrong
    // type name, a missing `order_id`). The ledger row would exist and `settled` would stay 0,
    // which is exactly the shape that made this defect survive: a subsystem with no seam.
    //
    // It is also the 01-F33 half in the other direction: BEFORE the closer runs the bill is
    // already fully covered, and `settled` is still 0. Nothing arithmetic settles an order.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender(BILL_PAISA));
    expect(t.row()?.pay_total, "the bill is covered before the act").toBe(BILL_PAISA);
    expect(t.row()?.settled, "arithmetic must not settle an order (01-F33)").toBe(0);

    t.closer.settled(ORDER_ID);

    expect(t.row()?.settled).toBe(1);
  });

  it("02-F45 — the CASHIER is on the envelope and nowhere in the payload", () => {
    // MUTATION THIS CATCHES: `closed_by_user` (or `cashier`, `closed_by`, `actor_user_id`) in the
    // payload — the obvious first draft, and the one `02-F45` names by shape: a second source for
    // one fact, in a ledger with no rule for which of two disagreeing copies wins.
    const t = till();
    settleInFull(t);

    const close = t.closes()[0];
    expect(close?.actor_user_id, "the envelope must carry the actor").toBe(CASHIER);
    for (const forbidden of ["closed_by_user", "closed_by", "cashier", "actor_user_id", "user_id"])
      expect(Object.hasOwn(close?.payload ?? {}, forbidden), `payload carried ${forbidden}`).toBe(
        false,
      );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — WHEN. The edge into "tendered for in full", and no other trigger.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F63 — the trigger is the EDGE, never the tender", () => {
  it("a PARTIAL tender closes nothing — the remainder is still owed", () => {
    // MUTATION THIS CATCHES: emitting on every `payment.recorded`. That closer would close a bill
    // on its first Rs 500 against Rs 2,240, and `01-F33` says reopening does not exist — so the
    // order would be permanently settled with Rs 1,740 uncollected and no way back.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender(50_000));
    t.closer.settled(ORDER_ID);

    expect(t.closes()).toHaveLength(0);
    expect(t.row()?.settled).toBe(0);
  });

  it("02-F13 — a SPLIT closes exactly ONCE, on the tender that covers", () => {
    // The case `02-F13` exists for: part cash, part RAAST, part cash again. Three payments, one
    // settlement. MUTATION THIS CATCHES: an emitter that fires per payment (three acts, three
    // permanent rows each claiming to close one bill) and one that fires on the FIRST payment.
    const t = till();
    for (const part of [50_000, 100_000]) {
      t.raw(TILL_1, "payment.recorded", tender(part, { method: "raast" }));
      t.closer.settled(ORDER_ID);
      expect(t.closes(), "closed before the bill was covered").toHaveLength(0);
    }
    t.raw(TILL_1, "payment.recorded", tender(74_000));
    t.closer.settled(ORDER_ID);

    expect(t.closes()).toHaveLength(1);
    expect(t.row()?.settled).toBe(1);
  });

  it("an EXCESS tender still closes — the test is `>=`, not equality", () => {
    // A customer hands Rs 3,000 for a Rs 2,240 bill and the cashier keys what she was handed on
    // a device that records the excess. MUTATION THIS CATCHES: `pay_total === billed`, which
    // leaves every over-tendered order permanently unsettled and unconserved.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender(300_000));
    t.closer.settled(ORDER_ID);

    expect(t.closes()).toHaveLength(1);
  });

  it("an order with NOTHING billable does NOT close, even though `0 >= 0`", () => {
    // The narrowing `main/settlement-guard.ts` already makes for the same reason: an order with no
    // billable lines satisfies `pay_total >= billed` trivially, and closing it would settle a sale
    // that has not happened. MUTATION THIS CATCHES: dropping the `billed > 0` guard — which reads
    // as a simplification and permanently settles every empty order the counter ever opens.
    const t = till({ lines: [] });
    expect(billedEffectiveFromJsonLines(t.row()?.json_lines ?? "{}")).toBe(0);
    t.closer.settled(ORDER_ID);

    expect(t.closes()).toHaveLength(0);
    expect(t.row()?.settled).toBe(0);
  });

  it("an unknown order id closes nothing and throws nothing", () => {
    // `01-F10`'s straggler shape one layer up: the closer is called from an IPC handler and a
    // throw there reaches the cashier as a failed sale (§F).
    const t = till();
    expect(() => t.closer.settled("0199aaaa-0000-7000-8000-0000000dead1")).not.toThrow();
    expect(t.landed).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — AT MOST ONE PER ORDER. The fold converges either way; the LEDGER does not.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F63 — at most one closing act per order (01-F1)", () => {
  it("a second call appends nothing", () => {
    // MUTATION THIS CATCHES: no idempotence check. `settled` would still read 1 — the fold's
    // monotone OR absorbs it — so nothing in the projection can tell you this went wrong. The
    // damage is in the ledger: N permanent rows each attesting a different closing snapshot,
    // with no rule for which is true (`01-F1`).
    const t = till();
    settleInFull(t);
    t.closer.settled(ORDER_ID);
    t.closer.settled(ORDER_ID);

    expect(t.closes()).toHaveLength(1);
  });

  it("a re-delivered duplicate payment does not produce a second act", () => {
    // `01-F31`: a double-tap or crash-retry bearing the SAME attempt key is one payment. The
    // closer runs again on re-delivery. MUTATION THIS CATCHES: keying idempotence on the payment
    // rather than on the ORDER.
    const t = till();
    const dup = tender(BILL_PAISA);
    t.raw(TILL_1, "payment.recorded", dup);
    t.closer.settled(ORDER_ID);
    t.raw(TILL_2, "payment.recorded", { ...dup });
    t.closer.settled(ORDER_ID);

    expect(t.closes()).toHaveLength(1);
  });

  it("a refund and then a fresh tender that re-covers the bill does NOT close it again", () => {
    // The sharp one. `01-F29`/`01-F33`: post-settlement corrections are linked event pairs and
    // reopening does not exist — so an order that dips below cover and comes back was never
    // un-settled, and there is nothing to close a second time.
    //
    // MUTATION THIS CATCHES: idempotence implemented as "has it been covered since I last looked"
    // — a closer holding an in-memory `Set` of orders it has closed, or comparing `pay_total`
    // against a remembered value, both pass every other test in this section and fail here.
    const t = till();
    settleInFull(t);
    expect(t.closes()).toHaveLength(1);

    t.raw(TILL_1, "payment.refunded", {
      order_id: ORDER_ID,
      amount_paisa: 100_000,
      method: "cash_out",
      settlement_attempt_id: "0199aaaa-0000-7000-8000-00000000ref1",
      payment_attempt_id: `0199aaaa-0000-7000-8000-${String(attempt).padStart(12, "0")}`,
    });
    t.raw(TILL_1, "payment.recorded", tender(100_000));
    t.closer.settled(ORDER_ID);

    expect(t.closes(), "an order that dipped below cover was closed twice").toHaveLength(1);
    expect(t.row()?.settled).toBe(1);
  });

  it("an order already closed by a PEER is not closed again by this till", () => {
    // Two tills converge; the other one got there first. The closer reads its own converged fold
    // (`01-F63`), so the peer's act is already in it. MUTATION THIS CATCHES: idempotence held in
    // process memory instead of read from the projection — which is invisible on one device and
    // doubles the rows on every branch that has two.
    const t = till();
    t.raw(TILL_2, "payment.recorded", tender(BILL_PAISA));
    t.raw(TILL_2, "order.settlement_closed", {
      order_id: ORDER_ID,
      billed_paisa: BILL_PAISA,
      tendered_paisa: BILL_PAISA,
      refunded_paisa: 0,
      settlement_attempt_ids: [],
    });
    expect(t.row()?.settled).toBe(1);

    t.closer.settled(ORDER_ID);

    expect(t.closes()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — LAW 1 (`01-F34`) and `00 §5.1`. The decision reads converged state and nothing else.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F34 / 00 §5.1 — no ordering metadata, no clock, no network", () => {
  it("byte-identical payload under a REVERSED delivery order of the same set", () => {
    // The `01-F34` property applied to the emitter rather than to a fold: equal delivered set ⇒
    // equal act. Two split tenders delivered in each order.
    //
    // MUTATION THIS CATCHES: `settlement_attempt_ids` built in insertion/delivery order instead of
    // sorted — which passes every assertion in §E, converges nowhere, and makes two tills that saw
    // the same three payments attest two different closing acts for one bill.
    const attempts = ["aaaa", "bbbb"];
    const payload = (order: readonly string[]): string => {
      const t = till();
      for (const a of order) {
        t.raw(TILL_1, "payment.recorded", {
          order_id: ORDER_ID,
          amount_paisa: 112_000,
          method: "cash",
          settlement_attempt_id: `0199aaaa-0000-7000-8000-0000000${a}`,
          purpose: "settles_order",
          shift_id: SHIFT_ID,
        });
      }
      t.closer.settled(ORDER_ID);
      return JSON.stringify(t.closes()[0]?.payload ?? null);
    };

    const forward = payload(attempts);
    const reversed = payload([...attempts].reverse());
    expect(forward, "the fixture produced no act to compare").not.toBe("null");
    expect(reversed).toBe(forward);
  });

  it("byte-identical payload under an INJECTED clock", () => {
    // `01-F45`/`01-F34`: `device_created_at` is an untrusted forensic hint with one sanctioned
    // reader, and this is not it. MUTATION THIS CATCHES: a `closed_at` field, or any snapshot
    // derived from a stamp — including the plausible "record when the bill was closed", which
    // reads as an obviously useful audit field and is a law-1 break.
    // A FIXED attempt key in both runs: the two fixtures must differ in the CLOCK and in nothing
    // else, and `tender()` mints a fresh key per call — which is a difference in the delivered
    // SET, not in the clock, and would make this assertion fail for a reason it is not about.
    const forward = (base: number): string => {
      const t = till({ clockBase: base });
      t.raw(TILL_1, "payment.recorded", {
        order_id: ORDER_ID,
        amount_paisa: BILL_PAISA,
        method: "cash",
        settlement_attempt_id: "0199aaaa-0000-7000-8000-00000000c10c",
        purpose: "settles_order",
        shift_id: SHIFT_ID,
      });
      t.closer.settled(ORDER_ID);
      return JSON.stringify(t.closes()[0]?.payload ?? null);
    };

    const now = forward(1_754_300_000_000);
    const skewed = forward(1_400_000_000_000);
    expect(now, "the fixture produced no act to compare").not.toBe("null");
    expect(skewed).toBe(now);
  });

  it("touches ONLY `openOrders` on the store and `append` on the writes", () => {
    // `00 §5.1`/`01-F17`: a till that asks the network whether an order is closed stops selling
    // when the WAN drops. The dependency net makes a future consult of an uplink, a peer, a
    // session or a clock red by NAME rather than by review — the shape `double-settlement.test.ts`
    // uses for `DEC-MONEY-009`'s identical constraint.
    const t = till();
    const touchedStore = new Set<string>();
    const touchedWrites = new Set<string>();
    const spy = <T extends object>(target: T, into: Set<string>): T =>
      new Proxy(target, {
        get(o, k, r) {
          if (typeof k === "string") into.add(k);
          return Reflect.get(o, k, r);
        },
      });

    const sink: Pick<Gateway, "append"> = { append: (): AppendResult => ({ id: "spied" }) };
    const closer = createSettlementCloser({
      store: spy(t.store, touchedStore),
      writes: spy(sink, touchedWrites),
    } as Parameters<typeof createSettlementCloser>[0]);
    t.raw(TILL_1, "payment.recorded", tender(BILL_PAISA));
    closer.settled(ORDER_ID);

    expect([...touchedStore].sort()).toEqual(["openOrders"]);
    expect([...touchedWrites].sort()).toEqual(["append"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE PAYLOAD. Pinned by `01-F63`, and proved through the fold's OWN consumer of it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F63 — what the act attests", () => {
  it("attests the fold's own billed / tendered / refunded, and the attempt keys, SORTED", () => {
    // MUTATION THIS CATCHES: any of the three read off the wrong column (`repaid_total` for
    // `refunded_paisa` is the near miss `DEC-MONEY-007` exists about), and a hardcoded `0`.
    const t = till();
    const first = tender(150_000);
    const second = tender(80_000);
    t.raw(TILL_1, "payment.recorded", first);
    t.raw(TILL_1, "payment.recorded", second);
    t.raw(TILL_1, "payment.refunded", {
      order_id: ORDER_ID,
      amount_paisa: 6_000,
      method: "cash_out",
      settlement_attempt_id: "0199aaaa-0000-7000-8000-00000000ref2",
      payment_attempt_id: String(first.settlement_attempt_id),
    });
    t.closer.settled(ORDER_ID);

    const p = t.closes()[0]?.payload ?? {};
    expect(p.billed_paisa).toBe(BILL_PAISA);
    expect(p.tendered_paisa).toBe(230_000);
    expect(p.refunded_paisa).toBe(6_000);
    expect(p.settlement_attempt_ids).toEqual(
      [String(first.settlement_attempt_id), String(second.settlement_attempt_id)].sort(),
    );
  });

  it("the attested `billed_paisa` is a REAL ceiling — a correct close raises no exception", () => {
    // The two-sided half of the snapshot contract, and the reason this assertion cannot pass
    // vacuously: the merge engine reads `billed_paisa` as `uncovered_addition`'s ceiling. An act
    // attesting `0` — the plausible "fill in the required field" mutant — would make a Rs 2,240
    // order breach its own ceiling THE MOMENT IT CLOSES.
    const t = till();
    settleInFull(t);

    expect(JSON.parse(t.row()?.exceptions_json ?? "[]")).toEqual([]);
  });

  it("01-F33 — a line added AFTER the close raises `uncovered_addition` and does NOT reopen", () => {
    // The other side of the same ceiling, and the FR's own words: *"a late line-add raises
    // `uncovered_addition` rather than reopening"*. MUTATION THIS CATCHES: omitting `billed_paisa`
    // entirely — an absent snapshot asserts NO ceiling, so the late line lands silently and the
    // order stays settled with money nobody is ever asked for.
    const t = till();
    settleInFull(t);
    t.raw(TILL_1, "order.line_added", {
      order_id: ORDER_ID,
      line_id: LINE_B,
      item_id: "i-late",
      qty: 1,
      unit_price_paisa: 30_000,
    });

    expect(JSON.parse(t.row()?.exceptions_json ?? "[]")).toContain("uncovered_addition");
    expect(t.row()?.settled, "a late line-add reopened the order").toBe(1);
  });

  it("01-F4 — the act parses against the registry", () => {
    // An unparseable act is unemittable. Asserted by round-tripping the emitted payload through a
    // fresh store's INGEST path, which is the merge engine's own schema gate.
    const t = till();
    settleInFull(t);
    const emitted = t.closes()[0]?.payload ?? {};

    const fresh = till();
    expect(() =>
      fresh.raw(TILL_2, "order.settlement_closed", emitted as Record<string, unknown>),
    ).not.toThrow();
    expect(fresh.row()?.settled).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — `01-F17`. The money is already in the ledger when this runs.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F17 — a failure to close never costs a customer", () => {
  it("a throwing append does not propagate: the payment stands and the till keeps working", () => {
    // `01-F63`: *"a failure to emit costs a conservation check, never a customer"*. The closer is
    // called from the same IPC handler that returns the append result, so a throw here reaches the
    // renderer as a FAILED SALE for money that is already permanently in the ledger — the worst
    // possible lie a counter can tell.
    //
    // MUTATION THIS CATCHES: letting the append's error escape. This is the one assertion whose
    // absence is invisible until a printer, a disk or a schema change makes the append fail in
    // the field.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender(BILL_PAISA));
    const closer = createSettlementCloser({
      store: t.store,
      writes: {
        append: () => {
          throw new Error("ledger unavailable");
        },
      },
    } as Parameters<typeof createSettlementCloser>[0]);

    expect(() => closer.settled(ORDER_ID)).not.toThrow();
    expect(t.row()?.pay_total, "the payment was unwound").toBe(BILL_PAISA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — WHAT `01-F63` DOES NOT CLOSE. Passing tests whose subject is the residual.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G — the residuals, asserted so this file cannot be read as a closure", () => {
  it("DEC-MONEY-009: two PARTITIONED tills both settle AND both close — the doubling survives", () => {
    // The ruling's own stated limit: two tills that have not converged cannot see each other, so
    // neither guard fires and neither closer is deterred. This asserts the residual is still
    // there, one act per till, and the drawer still doubles.
    const a = till();
    const b = till();
    for (const t of [a, b]) {
      t.raw(TILL_1, "payment.recorded", tender(BILL_PAISA));
      t.closer.settled(ORDER_ID);
      expect(t.closes()).toHaveLength(1);
      expect(t.row()?.pay_total).toBe(BILL_PAISA);
    }
    // Merged after the partition heals, both payments land against one bill.
    const merged = till();
    merged.raw(TILL_1, "payment.recorded", tender(BILL_PAISA));
    merged.raw(TILL_2, "payment.recorded", tender(BILL_PAISA));
    expect(merged.row()?.pay_total, "the partition residual has been closed by something").toBe(
      BILL_PAISA * 2,
    );
  });

  it("DEC-MONEY-010: a COMPED order still reads as a conservation shortfall once closed", () => {
    // `01-F30`'s `void_value` / `comp_value` / `discounts` terms are still ABSENT, and this is
    // what that costs: Rs 1,000 billed, Rs 450 comped, Rs 550 taken, closed — and the residual
    // reads +45000 as if Rs 450 had walked out of the door. `01-F63` makes the equation RUN on a
    // real order; it does not make the terms appear, and `DEC-MONEY-010` is the gate for that.
    //
    // ⚠ WHEN THAT GATE OPENS THIS TEST MUST CHANGE. It is written to be found: it defends the
    // present rule deliberately, which is `catalog-pricing.test.ts:394`'s failure committed with
    // its eyes open and a note attached, rather than by accident and for three weeks.
    const t = till({ lines: [100_000] });
    t.raw(TILL_1, "comp.recorded", {
      order_id: ORDER_ID,
      amount_paisa: 45_000,
      reason: "kitchen remade the karahi",
      approver_user_id: "user-manager",
      // `01-F83` (R56) closes `DEC-MONEY-010`'s gate condition (ii) and ONLY that one: (i) still
      // has no emitter and (iii) still owes a `26 §7` merge rule, so the terms stay ABSENT and
      // this test's shortfall is unchanged. Fixture-only.
      adjustment_attempt_id: "0193b0f0-1111-7000-8000-0000000000a1",
    });
    t.raw(TILL_1, "payment.recorded", tender(55_000));
    t.closer.settled(ORDER_ID);

    // The comp is projection-inert, so the bill is untouched by it and the cover is short.
    expect(t.row()?.pay_total).toBe(55_000);
    expect(billedEffectiveFromJsonLines(t.row()?.json_lines ?? "{}")).toBe(100_000);
    // Which means the closer does not even close it: the order is not tendered for in full.
    expect(t.closes(), "a comped order closed, so the terms must now exist").toHaveLength(0);
  });
});
