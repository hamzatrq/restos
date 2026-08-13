// ACCEPTANCE TESTS — C16's SEAM: a completed settlement reaches the spooler as `02-F15`'s receipt.
//
// PROVENANCE (24 §3 step 2): authored by the session that implemented `createReceiptPrinter`,
// which is NOT the `24 §3` split — stated rather than glossed, exactly as `kot-printing.test.ts`
// and `cash-slip-printing.test.ts` state it. The mitigation is the round-3 law: a CONTROL and
// single-branch mutants were run and each was confirmed to red the assertion that claims to own
// it. The matrix is in `packages/escpos/CLAUDE.md`.
//
// ⚠ THIS FILE'S REASON FOR EXISTING IS §D, NOT §A–§C. `packages/escpos` can prove the receipt
// renders correctly and prove NOTHING about whether this application ever asks it to — the wave's
// named defect, twelve instances and counting. §D asserts on `main/index.ts`'s SOURCE for that
// reason: a suite that injects every dependency never exercises the wiring, and reading a diff
// never finds it.
//
// THE FRs, quoted:
//   02-F15  "Receipt content: order number, channel, date/time, cashier; lines … totals; payment
//           method(s) and change".
//   02-F16  "Success emits `receipt.printed`; reprint is always logged with actor" — reprints are
//           a classic fraud vector.
//   02-F13  "Split payment across methods in one settlement".
//   02-F41  attribution is whoever's PIN is in.
//   01-F17  "A sale is never blocked" — and neither is a settlement, by a printer.
//   01-F30  billed_effective; "a fully-voided order nets to zero".
//   01-F31  a disputed attempt key "contributes ZERO to every total and is rendered, never picked".
//   01-F33  settlement is an ACT — and NOTHING in this product emits `order.settlement_closed`.
//   03-F4   the job is persisted BEFORE the first transmit; 3 attempts over 30 s.
//   03-F5   silent print failure is forbidden; the alert names the printer and the subject.
//   03-F12  "Receipts print through the same spooler and durability rules."
//   03-F42  a document is the transmitted UNIT, not the queue.
//   01 §4   the catalog carries `receipt.printed` — and `packages/domain` carries no schema for it.
//
// ⚠ NOT EVIDENCE FOR: any physical printer (K-8 is owed in full and none has ever been attached),
// nor that a customer can read the receipt (`27-F35`'s gate is measured on real people).

import { readFileSync } from "node:fs";
import {
  classifyTransmit,
  createSpooler,
  type JobRecord,
  type PrinterCapability,
  printerCapability,
  type Spooler,
  type SpoolerTransport,
} from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it } from "vitest";
import { CHANNELS } from "../../shared/ipc";
import { createReceiptPrinter, type ReceiptPrinterDeps } from "../printing";

// ── the fixtures ────────────────────────────────────────────────────────────────────────────────

const ORDER_ID = "5f3a9c21-0000-4000-8000-000000000001";
/** 2026-01-02 13:00 Asia/Karachi — a stamp that is DELIBERATELY NOT TODAY. */
const CONFIRMED_AT = Date.UTC(2026, 0, 2, 8, 0, 0);

/**
 * Two lines whose money tokens cannot be confused: `Rs 450` (unit), `Rs 900` (what an extended
 * line total would print) and `Rs 960` (the order total) are three distinct strings.
 */
const LINES = {
  "line-1": { item_id: "item-karahi", qty: 2, unit_price_paisa: 45_000, states: ["placed"] },
  "line-2": { item_id: "item-naan", qty: 1, unit_price_paisa: 6_000, states: ["placed"] },
};

type OrderOver = {
  pay_total?: number;
  pay_attempts_json?: string;
  json_lines?: string;
  confirmed_at?: number | null;
  channel?: string;
};

const attempt = (
  method: string,
  amount_paisa: number,
  purpose = "settles_order",
): Record<string, unknown> => ({ order_id: ORDER_ID, amount_paisa, method, purpose });

const PAID_IN_FULL = JSON.stringify({ "attempt-1": [attempt("cash", 96_000)] });

const stubStore = (over: OrderOver = {}): ReceiptPrinterDeps["store"] =>
  ({
    openOrders: () => [
      {
        order_id: ORDER_ID,
        channel: over.channel ?? "counter",
        order_type: "takeaway",
        confirmed_at: over.confirmed_at === undefined ? CONFIRMED_AT : over.confirmed_at,
        settled: 0,
        table_ids_json: "[]",
        table_conflict: 0,
        pay_total: over.pay_total ?? 96_000,
        repaid_total: 0,
        refund_total: 0,
        pay_attempts_json: over.pay_attempts_json ?? PAID_IN_FULL,
        refund_attempts_json: "{}",
        cap_violated: 0,
        exceptions_json: "[]",
        json_lines: over.json_lines ?? JSON.stringify(LINES),
      },
    ],
  }) as unknown as Pick<DeviceStore, "openOrders">;

const CATALOG: Record<string, string> = {
  "item-karahi": "Chicken Karahi",
  "item-naan": "Garlic Naan",
};

/** Three modes, exactly as the KOT's and the cash slips': `classifyTransmit` owns the decision. */
const fakeTransport = (mode: "ok" | "fail", caps: PrinterCapability): SpoolerTransport => ({
  send: async () =>
    mode === "ok"
      ? classifyTransmit(
          { status: { paper_out: false, near_end: false }, timed_out: false, link_error: null },
          caps,
        )
      : classifyTransmit({ status: null, timed_out: false, link_error: null }, caps),
  status: async () => ({ paper_out: false, near_end: false }),
});

type Harness = {
  printer: ReturnType<typeof createReceiptPrinter>;
  spooler: Spooler;
  sent: Uint8Array[];
};

const harness = (
  opts: {
    order?: OrderOver;
    model?: string;
    mode?: "ok" | "fail";
    cashier?: string | null;
    catalog?: Record<string, string>;
  } = {},
): Harness => {
  const capability = printerCapability(opts.model ?? "TH230");
  const sent: Uint8Array[] = [];
  const inner = fakeTransport(opts.mode ?? "ok", capability);
  const spooler = createSpooler({
    transport: {
      send: async (bytes) => {
        sent.push(bytes);
        return inner.send(bytes);
      },
      status: inner.status,
    },
  });
  const table = opts.catalog ?? CATALOG;
  const printer = createReceiptPrinter({
    spooler,
    store: stubStore(opts.order),
    // `01-F54`: `null` is "this device's catalog has never heard of the item", which is the case
    // the degrade-to-identifier path exists for.
    catalog: (item_id) => {
      const name = table[item_id];
      return name === undefined ? null : { name };
    },
    capability,
    pump: () => spooler.pump(),
    cashier: () => (opts.cashier === undefined ? "Ayesha Khan" : opts.cashier),
  });
  return { printer, spooler, sent };
};

const jobsOf = (s: Spooler): readonly JobRecord[] => s.jobs();

/**
 * The document's text, decoded latin1.
 *
 * Deliberately naive, and safe for `cash-slip-printing.test.ts`'s stated reason: K-2's admitted
 * command set is `ESC @`, `GS ! n`, `GS B n`, `ESC d n`, `GS V m` and `GS v 0` — none of whose
 * parameter bytes can spell a multi-word phrase, and every string searched below is one.
 */
const textOf = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

const paperOf = async (h: Harness): Promise<string> => {
  await h.spooler.pump();
  expect(h.sent.length, "nothing was ever handed to the transport").toBeGreaterThan(0);
  return textOf(h.sent[0] as Uint8Array);
};

// ── A. THE TRIGGER — 02-F15's receipt on a completed settlement ─────────────────────────────────

describe("§A C16/02-F15 — a completed settlement queues a receipt, and a partial one does not", () => {
  it("03-F4/03-F12: a settled order's receipt is PERSISTED before any transmit is attempted", async () => {
    const h = harness();
    h.printer.settled(ORDER_ID);
    // Synchronous: `01-F17` makes the enqueue happen before this call returns, so a customer is
    // never held at the counter while a socket times out.
    const queued = jobsOf(h.spooler);
    expect(queued.length, "the settlement produced no print job at all").toBe(1);
    expect(queued[0]?.attempts, "a transmit was attempted before the job was recorded").toBe(0);
    expect(queued[0]?.order_ref).toBe(ORDER_ID);
  });

  it("02-F13/01-F30: a PARTIAL settlement queues NOTHING — one receipt per order, at the end", async () => {
    // A split settles across several `payment.recorded`s. A receipt per tender would hand the
    // customer a document that understates what they paid, and `02-F16` makes every extra copy a
    // fraud vector rather than a courtesy.
    const partial = harness({
      order: {
        pay_total: 50_000,
        pay_attempts_json: JSON.stringify({ "attempt-1": [attempt("cash", 50_000)] }),
      },
    });
    partial.printer.settled(ORDER_ID);
    expect(jobsOf(partial.spooler).length, "a half-paid order printed a receipt").toBe(0);
  });

  it("02-F13: the LAST tender of a split completes it, and the receipt shows BOTH methods", async () => {
    const split = harness({
      order: {
        pay_total: 96_000,
        pay_attempts_json: JSON.stringify({
          "attempt-1": [attempt("cash", 50_000)],
          "attempt-2": [attempt("raast", 46_000)],
        }),
      },
    });
    split.printer.settled(ORDER_ID);
    const paper = await paperOf(split);
    expect(paper).toContain("Cash Rs 500");
    expect(paper).toContain("Raast Rs 460");
  });

  it("02-F16/03-F4: a SECOND settled call prints nothing — the job id is deterministic", () => {
    // A double-tapped TAKE CASH, a re-delivered `payment.recorded` and a relaunch over a durable
    // spool all resolve to one job. The only route to a second copy is `03-F37`'s banded reprint.
    const h = harness();
    h.printer.settled(ORDER_ID);
    h.printer.settled(ORDER_ID);
    h.printer.settled(ORDER_ID);
    expect(jobsOf(h.spooler).length).toBe(1);
  });

  it("01-F17: an order this device cannot find settles anyway — nothing throws", () => {
    const h = harness();
    expect(() => h.printer.settled("an-order-that-is-not-here")).not.toThrow();
    expect(jobsOf(h.spooler).length).toBe(0);
  });

  it("01-F31: a DIVERGENT attempt key is not tendered — it contributes zero to the total too", () => {
    // "a disputed key contributes ZERO to every total and is rendered, never picked". `pay_total`
    // already excludes it, so a receipt that printed one of its members would show money the
    // order's own total does not contain.
    const contested = harness({
      order: {
        pay_total: 0,
        pay_attempts_json: JSON.stringify({
          "attempt-1": [attempt("cash", 96_000), attempt("card", 96_000)],
        }),
      },
    });
    contested.printer.settled(ORDER_ID);
    expect(jobsOf(contested.spooler).length, "a contested settlement printed a receipt").toBe(0);
  });

  it("DEC-MONEY-007: a khata REPAYMENT is not a settlement of this order", () => {
    const repayment = harness({
      order: {
        pay_total: 0,
        pay_attempts_json: JSON.stringify({
          "attempt-1": [attempt("cash", 96_000, "repays_receivable")],
        }),
      },
    });
    repayment.printer.settled(ORDER_ID);
    expect(jobsOf(repayment.spooler).length).toBe(0);
  });
});

// ── B. THE CONTENT — 02-F15's four groups, off the fold ─────────────────────────────────────────

describe("§B 02-F15 — what the fold holds is what the paper says", () => {
  it("02-F15: the order number, the channel word, the stamp and the cashier all reach the paper", async () => {
    const h = harness();
    h.printer.settled(ORDER_ID);
    const paper = await paperOf(h);
    expect(paper).toContain("RECEIPT 5f3a9c21");
    expect(paper).toContain("Channel Counter");
    expect(paper).toContain("Date 2026-01-02 13:00");
    expect(paper).toContain("Ayesha Khan");
  });

  it("02-F41: the CASHIER is read at print time, so a handover attributes the next receipt correctly", async () => {
    const h = harness({ cashier: "Hina" });
    h.printer.settled(ORDER_ID);
    expect(await paperOf(h)).toContain("Hina");
  });

  it("02-F45: no session means NOT ATTRIBUTED, never a blank where a name belongs", async () => {
    const h = harness({ cashier: null });
    h.printer.settled(ORDER_ID);
    expect(await paperOf(h)).toContain("NOT ATTRIBUTED");
  });

  it("01-F53/01-F54: each line prints its quantity, its NAME and its captured unit price", async () => {
    const h = harness();
    h.printer.settled(ORDER_ID);
    const paper = await paperOf(h);
    expect(paper).toContain("2 Chicken Karahi Rs 450 each");
    expect(paper).toContain("1 Garlic Naan Rs 60 each");
  });

  it("01-F54: an item the catalog does not know degrades to its IDENTIFIER, never off the bill", async () => {
    // The money came from the EVENT (`01-F53`), so a stale catalog costs a word and never a rupee
    // — and a line silently absent from a receipt is money the customer paid with nothing to show.
    const h = harness({ catalog: {} });
    h.printer.settled(ORDER_ID);
    const paper = await paperOf(h);
    expect(paper).toContain("2 item-karahi Rs 450 each");
    expect(paper).toContain("Total Rs 960");
  });

  it("01-F30/26 §8: the TOTAL is the fold's billed_effective, not a sum of the printed lines", async () => {
    // THE MONEY ASSERTION, pointed at the case where the two differ. `01-F30`: "a fully-voided
    // order nets to zero" — an exited line still appears on the bill and contributes nothing, so a
    // renderer or a caller that added the lines up would disagree with the ledger. The fixture
    // voids the karahi line: the paper still lists it, and the total is the naan alone.
    const voided = harness({
      order: {
        json_lines: JSON.stringify({
          "line-1": { ...LINES["line-1"], states: ["voided"] },
          "line-2": LINES["line-2"],
        }),
        pay_total: 6_000,
        pay_attempts_json: JSON.stringify({ "attempt-1": [attempt("cash", 6_000)] }),
      },
    });
    voided.printer.settled(ORDER_ID);
    const paper = await paperOf(voided);
    expect(paper).toContain("Total Rs 60");
    expect(
      paper,
      "the total was re-derived from the lines instead of read off the fold",
    ).not.toContain("Total Rs 960");
    // And the voided line is still ON the paper — the customer sees what was rung.
    expect(paper).toContain("Chicken Karahi");
  });

  it("00 §5.7: an order that never reached the kitchen has no branch stamp, and says so", async () => {
    const h = harness({ order: { confirmed_at: null } });
    h.printer.settled(ORDER_ID);
    expect(await paperOf(h)).toContain("Date NOT RECORDED");
  });

  it("02-F12: NO change line — nothing in the ledger records what was handed over", async () => {
    // `payment.recorded.amount_paisa` is the amount APPLIED. THIS FAILS THE DAY A PLACEHOLDER IS
    // ADDED, which is the point: a `Change Rs 0` on a customer's copy is a claim the ledger cannot
    // support, and `02-F43` names that exact shape as the failure to avoid.
    const h = harness();
    h.printer.settled(ORDER_ID);
    expect(await paperOf(h)).not.toMatch(/change/i);
  });
});

// ── C. FAILURE — 03-F5's band, and 03-F34's refusal ─────────────────────────────────────────────

describe("§C 03-F5/03-F34/03-F12 — a receipt that does not print is never silent", () => {
  it("03-F5/03-F12: an exhausted retry budget raises an S1 naming the DOCUMENT and the printer", async () => {
    const h = harness({ mode: "fail" });
    h.printer.settled(ORDER_ID);
    for (let i = 0; i < 5; i += 1) {
      await h.spooler.pump();
      h.printer.reconcile();
    }
    const alarms = h.printer.alarms();
    expect(alarms.length, "a receipt failed to print and the counter was told nothing").toBe(1);
    expect(alarms[0]?.message).toContain("Receipt");
    expect(alarms[0]?.message).toContain("5f3a9c21");
    expect(alarms[0]?.message).toContain("TH230");
  });

  it("03-F5: the band clears on acknowledgement, and only for a band this printer holds", async () => {
    const h = harness({ mode: "fail" });
    h.printer.settled(ORDER_ID);
    for (let i = 0; i < 5; i += 1) {
      await h.spooler.pump();
      h.printer.reconcile();
    }
    const id = h.printer.alarms()[0]?.id as string;
    h.printer.acknowledge("cash::shift_close_slip::not-mine");
    expect(h.printer.alarms().length, "it dismissed a band belonging to another printer").toBe(1);
    h.printer.acknowledge(id);
    expect(h.printer.alarms().length).toBe(0);
  });

  it("03-F41: a STALL is not a failure — the printer is holding the bytes, and no band is raised", async () => {
    const capability = printerCapability("TH230");
    const spooler = createSpooler({
      transport: {
        send: async () =>
          classifyTransmit(
            { status: { paper_out: true, near_end: true }, timed_out: false, link_error: null },
            capability,
          ),
        status: async () => ({ paper_out: true, near_end: true }),
      },
    });
    const printer = createReceiptPrinter({
      spooler,
      store: stubStore(),
      catalog: (id) => {
        const n = CATALOG[id];
        return n === undefined ? null : { name: n };
      },
      capability,
      pump: () => spooler.pump(),
      cashier: () => "Ayesha Khan",
    });
    printer.settled(ORDER_ID);
    for (let i = 0; i < 5; i += 1) {
      await spooler.pump();
      printer.reconcile();
    }
    expect(printer.alarms().length, "a held job was reported as a failure — 03-F41").toBe(0);
  });

  it("03-F34/03-F49: below the receipt's own floor NOTHING is enqueued and the band says why", () => {
    // `03-F49` puts the receipt's floor at 32 and a printer below it is refused, never squeezed.
    // `UNKNOWN` defaults conservatively to 32, so the probe is a capability record under it.
    const capability: PrinterCapability = { ...printerCapability("TH230"), cols_font_a: 20 };
    const spooler = createSpooler({ transport: fakeTransport("ok", capability) });
    const printer = createReceiptPrinter({
      spooler,
      store: stubStore(),
      catalog: (id) => {
        const n = CATALOG[id];
        return n === undefined ? null : { name: n };
      },
      capability,
      pump: () => spooler.pump(),
      cashier: () => "Ayesha Khan",
    });
    printer.settled(ORDER_ID);
    expect(jobsOf(spooler).length, "a document that cannot be rendered was still enqueued").toBe(0);
    const alarms = printer.alarms();
    expect(alarms.length).toBe(1);
    expect(alarms[0]?.subject).toContain("min_columns_not_met");
    expect(alarms[0]?.subject).toContain("needs 32 columns");
  });
});

// ── D. THE SEAM — the production caller, which is why this file exists ──────────────────────────

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

describe("§D the wave's recurring defect — the receipt has a PRODUCTION caller", () => {
  const mainSrc = readSrc("index.ts");

  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string reports
    // clean. Anchored on lines that have nothing to do with receipt printing.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc.length).toBeGreaterThan(4_000);
  });

  it("main/index.ts CONSTRUCTS the receipt printer, unconditionally, on the SAME spooler", () => {
    // `createSpooler` shipped with 244 tests and zero production callers; so did `createPinSession`
    // and `domain`'s permission matrix. This is the assertion that would have caught all three,
    // pointed at the document `03-F31` has declared since July and nothing has ever printed.
    expect(mainSrc).toMatch(/createReceiptPrinter\s*\(/);
    expect(mainSrc).toMatch(/createReceiptPrinter\s*\(\s*\{[^}]*\bspooler\b/);
  });

  it("main/index.ts calls it from the APPEND path, on `payment.recorded`", () => {
    // The whole of C16, in four lines of `index.ts`. `01-F33`'s `order.settlement_closed` would be
    // the better trigger and NOTHING in this product emits it, so the observable completion of a
    // settlement is the payment that finishes it.
    expect(mainSrc).toContain("payment.recorded");
    expect(mainSrc).toMatch(/receipts\.settled\s*\(/);
  });

  it("main/index.ts drives receipt reconcile on the pump schedule, so a failure gets its band", () => {
    // Without this the job queues, fails and says nothing — a silent print failure produced by an
    // absent call, which is the shape `03-F5` forbids and the shape a durability suite cannot see.
    expect(mainSrc).toMatch(/receipts\.reconcile\s*\(/);
    expect(mainSrc).toContain("PUMP_INTERVAL_MS");
  });

  it("main/index.ts serves the receipt's bands on the counter's ONE alarm channel", () => {
    expect(mainSrc).toMatch(/receipts\.alarms\s*\(/);
    expect(mainSrc).toMatch(/receipts\.acknowledge\s*\(/);
    expect(CHANNELS.alarms).toBe("restos:alarms");
  });

  it("main/index.ts passes a LIVE session read for the cashier, not a captured value", () => {
    // `01-F26`'s session moves on a handover. A value captured at construction would attribute
    // every receipt for the rest of the day to whoever unlocked the till first (`02-F41`).
    expect(mainSrc).toMatch(/cashier:\s*\(\)\s*=>/);
    expect(mainSrc).toMatch(/cashier:\s*\(\)\s*=>\s*session\(\)/);
  });

  it("the KOT printer's reconcile SKIPS receipt jobs — the two share a spooler and not a ledger", () => {
    // Without this line a printed receipt appends `kot.printed` for its order, permanently, into a
    // ledger `01-F1` forbids correcting in place — and `02-F31`'s T1 auto-advance reads that event
    // to move lines to `in_prep`, so a receipt would tell the product the food was being cooked.
    const src = readSrc("printing.ts");
    expect(src.length, "the guard is reading an empty file").toBeGreaterThan(4_000);
    expect(src).toMatch(/if\s*\(isReceiptJob\(job\.job_id\)\)\s*continue;/);
  });

  it("01 §4: the receipt printer appends NOTHING — the gap is structural, not a discipline", () => {
    // `receipt.printed` IS in the `01 §4` catalog and `packages/domain/src/registry.ts` carries no
    // payload schema for it, so `01-F4` makes emitting it a runtime error. There is no seam through
    // which this printer could append, which is stronger than not using one. When the schema lands,
    // THIS assertion is what has to change first.
    const deps: (keyof ReceiptPrinterDeps)[] = [
      "spooler",
      "store",
      "catalog",
      "capability",
      "pump",
      "cashier",
    ];
    expect(deps).not.toContain("append");
    const src = readSrc("printing.ts");
    const half = src.slice(src.indexOf("export const createReceiptPrinter"));
    expect(half.length, "the slice found nothing to scan").toBeGreaterThan(1_000);
    expect(half).not.toContain("kot.printed");
    expect(half).not.toContain("kot.print_failed");
  });
});

// ── DEFERRED ────────────────────────────────────────────────────────────────────────────────────
//
//  * **`02-F16`'s `receipt.printed` IS NOT EMITTED.** Two measured blockers, both protected paths:
//    `packages/domain/src/registry.ts` has no payload schema (`01-F4` refuses the emit), and adding
//    one makes the type an `OrderKeyedEventType` in `packages/sync-client/src/folds/merge.ts`,
//    whose `assertNever` exhaustiveness guard then fails to compile until an oracle pins a merge
//    rule. Neither is this task's, and the ack for a receipt band is unrecorded for the same
//    reason.
//  * **`C17`, the reprint ACT.** The BAND ships (`03-F37`, asserted in `packages/escpos`); the act
//    needs `receipt.reprint_requested` (same missing schema), a recall surface (`02-F10`) and
//    `audit.reprint`.
//  * **`01-F33`'s TRIGGER.** `order.settlement_closed` is the act a receipt should hang off and
//    nothing emits it. When something does, `receipts.settled` should move to that event.
//  * **K-8, THE PHYSICAL PASS.** No printer has ever been attached; the shipped transport reports a
//    failed transmit every time, which is the truth about this device. Nothing here is evidence
//    about paper, a cutter, or a customer's ability to read what was printed.
