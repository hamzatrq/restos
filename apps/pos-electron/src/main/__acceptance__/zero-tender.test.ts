// ACCEPTANCE TESTS — `02-F48`: a tender of NOTHING is not a sale.
//
// **AUTHORED FROM SPEC TEXT ONLY.** Written by a session acting as `24 §3`'s test author, from the
// FR text quoted below and from nothing else. No implementation of `main/zero-tender-guard.ts`
// existed in the tree when these assertions were written; a plausible one was stood up OUT of the
// commit purely to run the mutation matrix and deleted before this file was committed. The suite
// is expected to be RED on arrival with `Cannot find module '../zero-tender-guard'`.
//
// ── THE RULING THIS FILE IS WRITTEN FROM ──────────────────────────────────────────────────────
//
//   02-F48  A `payment.recorded` of zero moves no money, discharges no part of the bill, changes
//           no total and leaves the order exactly where it was. There is no sale to block,
//           because nothing was tendered.
//           **REFUSED AT ORIGINATION, never at ingest, and never in the schema.** The decision is
//           made on the PAYLOAD ALONE, synchronously, consulting no shift, no day, no session
//           scope, no peer, no clock and no network.
//           **The schema is deliberately NOT tightened to `positive()`** — `payment.recorded`
//           parses at ingest and on every `01-F6` replay, this defect has SHIPPED, and a device
//           whose own ledger holds a Rs 0 payment must go on reopening its store and merging its
//           peers' history. Tightening a schema on an append-only log is retroactive.
//           **It is NOT `02-F13`'s partial tender.** A partial is a POSITIVE amount that does not
//           cover, recorded as itself with the remainder owed. Zero is not a small partial.
//   01-F60  *"`01-F17` forbids blocking a **sale**, not an item"* — the corpus's own reading of
//           the FR this ruling rests on.
//   01-F17  A sale is never blocked — not by inventory math, sync, or approval timeouts.
//   02-F37  Settling with no shift open SUCCEEDS, with a null shift reference. Never a modal,
//           never a block.
//   01-F1   Append-only: a refused tender appends nothing and unwinds nothing.
//   01-F37  A quarantined event is stored verbatim and excluded from folds.
//
// ── THE NEGATIVE CONTROL IS BUILT IN, AND IT IS THE POINT OF §B ────────────────────────────────
//
// The round-3 law's requirement, discharged inside the suite rather than only in the report: §B
// drives events that are legitimately ZERO and asserts they LAND. `day.opened` with a zero float
// (*"an empty drawer is legal and distinct from absent"*), `order.line_price_overridden` at zero
// (*"'this costs nothing' distinguished from 'somebody forgot'"*), and `cash.paid_out` at zero,
// which `02-F48` deliberately does not rule on. An implementation that refuses "zero" generally —
// the obvious over-broad guard — passes every assertion in §A and fails §B. Without it, §A cannot
// tell a guard aimed at a TENDER from a guard aimed at the number 0.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import type { AppendResult } from "../../shared/ipc";
import type { RendererWrites } from "../settlement-guard";
import { refuseZeroTender } from "../zero-tender-guard";

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const TILL_1 = "00000000-0000-7000-8000-000000000003";
const TILL_2 = "00000000-0000-7000-8000-000000000004";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const LINE_A = "0199aaaa-0000-7000-8000-00000000ff01";
const SHIFT_ID = "0199aaaa-0000-7000-8000-00000000551f";
const DAY_ID = "0199aaaa-0000-7000-8000-00000000d001";
const BILL_PAISA = 224_000;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Till = {
  store: DeviceStore;
  raw: (device_id: string, type: string, payload: Record<string, unknown>) => void;
  guarded: RendererWrites;
  /** Everything the guard let through to the ledger. */
  landed: { type: string; payload: Record<string, unknown> }[];
  ledgerLength: () => number;
  payTotal: () => number;
};

const till = (opts: { openShift?: boolean } = {}): Till => {
  const dir = mkdtempSync(join(tmpdir(), "restos-zero-tender-"));
  dirs.push(dir);
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL_1 },
  });
  let n = 0;
  let peerLamport = 0;

  const raw = (device_id: string, type: string, payload: Record<string, unknown>): void => {
    n += 1;
    const id = `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`;
    const device_created_at = 1_754_300_000_000 + n;
    if (device_id === TILL_1) {
      store.append({
        id,
        org_id: ORG,
        branch_id: BRANCH,
        device_id,
        actor_user_id: "user-ayesha",
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
  if (opts.openShift !== false)
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
  const writes: RendererWrites = {
    append: (req: unknown): AppendResult => {
      const r = req as { type: string; payload: Record<string, unknown> };
      landed.push(r);
      raw(TILL_1, r.type, r.payload);
      return { id: `landed-${landed.length}` };
    },
    addLine: () => ({ id: "unused" }),
    toggleAvailability: () => ({ id: "unused" }),
    recordCustomer: () => ({ id: "unused" }),
    // `02-F64` stub — this fixture has no opinion about a customer link.
    linkCustomer: () => ({ id: "unused" }),
  };

  return {
    store,
    raw,
    guarded: refuseZeroTender({ writes }),
    landed,
    ledgerLength: () => store.readAllEvents().length,
    payTotal: () => store.openOrders().find((o) => o.order_id === ORDER_ID)?.pay_total ?? -1,
  };
};

let attempt = 0;
const tender = (amount_paisa: number, over: Record<string, unknown> = {}) => {
  attempt += 1;
  return {
    type: "payment.recorded",
    payload: {
      order_id: ORDER_ID,
      amount_paisa,
      method: "cash",
      settlement_attempt_id: `0199aaaa-0000-7000-8000-${String(attempt).padStart(12, "0")}`,
      purpose: "settles_order",
      shift_id: SHIFT_ID,
      ...over,
    },
    refs: [] as string[],
  };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE REFUSAL. The defect, and the ruling on it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F48 — a Rs 0 tender is refused at origination", () => {
  it("refuses it, appends NOTHING, and leaves the bill exactly where it was", () => {
    // THE DEFECT: an empty keypad is zero, and pressing the primary action recorded a permanent
    // `payment.recorded` worth nothing on an append-only ledger — one accidental tap per shift,
    // one phantom settlement in `02-F23`'s reconciliation for ever.
    //
    // MUTATION THIS CATCHES: no guard at all, which is the shipped product today.
    const t = till();
    const before = t.ledgerLength();

    expect(() => t.guarded.append(tender(0))).toThrow();

    expect(t.landed, "a Rs 0 tender reached the ledger").toHaveLength(0);
    expect(t.ledgerLength(), "01-F1: a refusal appends nothing").toBe(before);
    expect(t.payTotal()).toBe(0);
  });

  it("refuses it whatever the bill is — including against an order already fully covered", () => {
    // The OTHER branch of the same defect, and the one a reader misses: when the bill is already
    // covered the panel's `coversBill` is `0 >= 0` and it tenders the REMAINDER, which is also 0.
    // Same permanent row, reached down the opposite arm.
    const t = till();
    t.raw(TILL_1, "payment.recorded", tender(BILL_PAISA).payload);
    const before = t.ledgerLength();

    expect(() => t.guarded.append(tender(0))).toThrow();
    expect(t.ledgerLength()).toBe(before);
  });

  it("refuses a zero REPAYMENT too — `02-F48` rules the event, not one purpose", () => {
    // `DEC-MONEY-007`'s other purpose. A zero repayment states nothing a positive one could not,
    // and no operator ever means it. MUTATION THIS CATCHES: a guard narrowed to `settles_order`,
    // which reads as careful scoping and leaves the identical hole one discriminator over.
    const t = till();
    expect(() => t.guarded.append(tender(0, { purpose: "repays_receivable" }))).toThrow();
    expect(t.landed).toHaveLength(0);
  });

  it("the refusal names the reason, so it cannot be confused with any other refusal", () => {
    // `F60`'s amendment-test defect, avoided by construction: an assertion that something merely
    // threw cannot tell "refused for being nothing" from "refused for being a duplicate", and
    // `main/settlement-guard.ts` throws on this same channel for a different reason.
    const t = till();
    let refusal: unknown;
    try {
      t.guarded.append(tender(0));
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(Error);
    expect(String((refusal as Error).message)).toMatch(/02-F48/);
    expect(
      String((refusal as Error).message),
      "the message must not claim the bill is already settled",
    ).not.toMatch(/already tendered|already settled/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE NEGATIVE CONTROL. What the guard must NOT touch. `01-F17` lives here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F17 / 02-F13 — everything else still lands", () => {
  it("ONE PAISA lands — a partial is a positive amount, however small", () => {
    // The sharpest line in the suite. `02-F13`: a split is what happens when the first tender
    // does not cover, and the remainder stays owed. MUTATION THIS CATCHES: `amount < 100` (a
    // "less than a rupee is a mistake" guard), and `!coversBill` — either of which turns the
    // ruling into the `01-F17` break it was written to avoid.
    const t = till();
    expect(() => t.guarded.append(tender(1))).not.toThrow();
    expect(t.payTotal()).toBe(1);
  });

  it("a full tender lands", () => {
    const t = till();
    t.guarded.append(tender(BILL_PAISA));
    expect(t.payTotal()).toBe(BILL_PAISA);
  });

  it("02-F37 — settling with NO SHIFT OPEN still succeeds, with a null shift reference", () => {
    // The measured warning in `02-F48`'s own text: the plausible repair that killed six `02-F37`
    // tests gated on an OPEN SHIFT, and every one of those tests types a real amount. A guard on
    // the amount is orthogonal to all of them, and this asserts that rather than trusting it.
    //
    // MUTATION THIS CATCHES: any guard that reads a shift, a day or a session — the exact repair
    // `apps/pos-electron/CLAUDE.md` warns about.
    const t = till({ openShift: false });
    expect(() => t.guarded.append(tender(BILL_PAISA, { shift_id: null }))).not.toThrow();
    expect(t.payTotal()).toBe(BILL_PAISA);
    expect(t.landed[0]?.payload.shift_id).toBeNull();
  });

  it("a zero OPENING FLOAT lands — an empty drawer is a stated fact (02-F22)", () => {
    // NEGATIVE CONTROL. `day.opened.opening_float_paisa` accepts 0 by design: *"cash is physically
    // placed in the drawer, and 0 (an empty drawer) is legal and distinct from absent"*.
    // MUTATION THIS CATCHES: a guard that refuses any `amount`-shaped zero on any event.
    const t = till();
    expect(() =>
      t.guarded.append({
        type: "day.opened",
        payload: {
          day_id: "0199aaaa-0000-7000-8000-00000000d002",
          opening_float_paisa: 0,
          prev_day_id: DAY_ID,
        },
        refs: [],
      }),
    ).not.toThrow();
    expect(t.landed).toHaveLength(1);
  });

  it("a zero PRICE OVERRIDE lands — 'this costs nothing' is not 'somebody forgot' (01-F60)", () => {
    // NEGATIVE CONTROL. `order.line_price_overridden` accepts 0 deliberately, and the registry
    // says so in as many words: a line given away is a real act the ledger must hold.
    const t = till();
    expect(() =>
      t.guarded.append({
        type: "order.line_price_overridden",
        payload: {
          order_id: ORDER_ID,
          line_id: LINE_A,
          unit_price_paisa: 0,
          reason: "manager comped the karahi",
          approver_user_id: "user-manager",
          supersedes: [],
          // `01-F83` (R56), required on all four escalatable writes since August 2026. Fixture-
          // only: this control is about the ZERO price being accepted, which is unchanged.
          adjustment_attempt_id: "0193b0f0-1111-7000-8000-0000000000a1",
        },
        refs: [],
      }),
    ).not.toThrow();
    expect(t.landed).toHaveLength(1);
  });

  it("a zero PAID-OUT lands — `02-F48` rules `payment.recorded` and nothing else", () => {
    // NEGATIVE CONTROL and a scope statement. The same argument would arguably apply to a zero
    // paid-out; `02-F48` does not make it, so an implementation that does has ruled something the
    // corpus did not (commandment 2).
    const t = till();
    expect(() =>
      t.guarded.append({
        type: "cash.paid_out",
        payload: {
          amount_paisa: 0,
          reason: "nil",
          receipt_photo_ref: "photo-nil",
          shift_id: SHIFT_ID,
        },
        refs: [],
      }),
    ).not.toThrow();
    expect(t.landed).toHaveLength(1);
  });

  it("the other three write channels are untouched", () => {
    // `addLine`, `toggleAvailability` and `recordCustomer` carry no tender. A decorator that
    // wrapped them would be a guard with a blast radius nobody asked for.
    const t = till();
    expect(t.guarded.addLine({}).id).toBe("unused");
    expect(t.guarded.toggleAvailability({}).id).toBe("unused");
    expect(t.guarded.recordCustomer({}).id).toBe("unused");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE INGEST HALF STAYS OPEN. This is what "never in the schema" means, executably.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F48 / 01-F1 / 01-F6 — history keeps parsing", () => {
  it("a PEER's Rs 0 payment still ingests and merges — it is not quarantined", () => {
    // THE ASSERTION THAT CATCHES THE MOST TEMPTING WRONG FIX: tightening `payment.recorded`'s
    // `amount_paisa` to `positive()` in `packages/domain`. That is one character of diff, it makes
    // §A pass, and it is retroactive — every device in the fleet that already holds a Rs 0 payment
    // (the defect has SHIPPED) would quarantine its peers' real history, and `01-F37` excludes a
    // quarantined event from folds. A rule about what a till may ORIGINATE must not become a rule
    // about what the fleet may MERGE.
    const t = till();
    expect(() =>
      t.raw(TILL_2, "payment.recorded", {
        order_id: ORDER_ID,
        amount_paisa: 0,
        method: "cash",
        settlement_attempt_id: "0199aaaa-0000-7000-8000-0000000zer0",
        purpose: "settles_order",
        shift_id: SHIFT_ID,
      }),
    ).not.toThrow();

    const merged = t.store
      .readAllEvents()
      .filter((e) => e.type === "payment.recorded" && e.device_id === TILL_2);
    expect(merged, "a peer's Rs 0 payment was refused at INGEST").toHaveLength(1);
  });

  it("a store whose own ledger already holds a Rs 0 payment REOPENS and replays it", () => {
    // `01-F6`: reopening replays the surviving ledger. The retroactivity argument, made
    // executable — a schema tightened for §A's sake would make this store unopenable by the very
    // build that shipped the fix, which is a device that cannot start.
    const dir = mkdtempSync(join(tmpdir(), "restos-zero-replay-"));
    dirs.push(dir);
    const path = join(dir, "device.db");
    const identity = { org_id: ORG, branch_id: BRANCH, device_id: TILL_1 };
    let store = openStore({ path, identity });
    store.append({
      id: "0199cccc-0000-7000-8000-00000000aa01",
      org_id: ORG,
      branch_id: BRANCH,
      device_id: TILL_1,
      actor_user_id: "user-ayesha",
      device_created_at: 1_754_300_000_001,
      type: "order.created",
      schema_version: 1,
      payload: { order_id: ORDER_ID, channel: "counter", order_type: "takeaway" },
      refs: [],
    });
    store.append({
      id: "0199cccc-0000-7000-8000-00000000aa02",
      org_id: ORG,
      branch_id: BRANCH,
      device_id: TILL_1,
      actor_user_id: "user-ayesha",
      device_created_at: 1_754_300_000_002,
      type: "payment.recorded",
      schema_version: 1,
      payload: {
        order_id: ORDER_ID,
        amount_paisa: 0,
        method: "cash",
        settlement_attempt_id: "0199aaaa-0000-7000-8000-00000000hist",
        purpose: "settles_order",
        shift_id: null,
      },
      refs: [],
    });
    store.close();

    store = openStore({ path, identity });
    expect(store.readAllEvents().filter((e) => e.type === "payment.recorded")).toHaveLength(1);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `00 §5.1`. The decision is made on the payload alone.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 00 §5.1 / 01-F17 — the guard consults nothing", () => {
  it("takes no store, no session and no clock: its only dependency is the writes it wraps", () => {
    // `02-F48`: *"consulting no shift, no day, no session scope, no peer, no clock and no
    // network"*. A guard that reached for any of them could refuse a tender because the WAN was
    // down, which is the break the ruling exists to stay clear of.
    //
    // MUTATION THIS CATCHES: adding a `store` (or `uplink`, or `session`) member — the shape
    // `main/settlement-guard.ts` legitimately has and this one must not, so the two guards cannot
    // be conflated by a later reader.
    const touched = new Set<string>();
    const writes: RendererWrites = {
      append: () => ({ id: "ok" }),
      addLine: () => ({ id: "ok" }),
      toggleAvailability: () => ({ id: "ok" }),
      recordCustomer: () => ({ id: "ok" }),
      // `02-F64` stub — this fixture has no opinion about a customer link.
      linkCustomer: () => ({ id: "ok" }),
    };
    const deps = new Proxy(
      { writes },
      {
        get(o, k, r) {
          if (typeof k === "string") touched.add(k);
          return Reflect.get(o, k, r);
        },
      },
    );

    const guard = refuseZeroTender(deps as Parameters<typeof refuseZeroTender>[0]);
    expect(() => guard.append(tender(0))).toThrow();
    guard.append(tender(BILL_PAISA));

    expect([...touched].sort()).toEqual(["writes"]);
  });

  it("a malformed request is passed THROUGH, not refused — fail-open here, fail-closed downstream", () => {
    // `main/settlement-guard.ts`'s own posture, and the reason for it: `req` is `unknown` from an
    // untrusted renderer, so a narrowing that misses must hand the request to the real validator
    // rather than invent a refusal. Refusing here would report the wrong reason for the right
    // rejection, which is exactly what §A's message assertion exists to prevent.
    //
    // Over an INERT sink rather than the ledger-backed one: a malformed request handed to a real
    // store throws from the store, and this assertion is about what the GUARD does with it.
    const seen: unknown[] = [];
    const guard = refuseZeroTender({
      writes: {
        append: (req: unknown) => {
          seen.push(req);
          return { id: "passed-through" };
        },
        addLine: () => ({ id: "unused" }),
        toggleAvailability: () => ({ id: "unused" }),
        recordCustomer: () => ({ id: "unused" }),
        // `02-F64` stub — this fixture has no opinion about a customer link.
        linkCustomer: () => ({ id: "unused" }),
      },
    });

    expect(() => guard.append({ type: "payment.recorded" })).not.toThrow();
    expect(() => guard.append("not an object")).not.toThrow();
    expect(seen, "a malformed request was swallowed instead of passed on").toHaveLength(2);
  });
});
