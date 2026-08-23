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
import { totalPaisaOrNull } from "@restos/domain";
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
import { TAX_POSTURE_ENV, TAX_RATE_BPS_ENV } from "../tax-posture";

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
    // ⚠ THIS TEST USED TO CLOSE `expect(paper).toContain("Chicken Karahi")` UNDER THE COMMENT
    // "And the voided line is still ON the paper — the customer sees what was rung." That was a
    // deliberate reading and it was disproved by paper: printed, the row carries `Rs 450 each`
    // above a total of Rs 60, and a receipt whose rows do not close is the hazard
    // `receipt-document.ts` names on `ReceiptLine.unit_price_paisa` in its own words. The
    // assertion is INVERTED rather than deleted, so the property it was pointed at still has a
    // guard: the row is gone, and the total is still the fold's rather than a sum of what remains.
    expect(paper, "a VOIDED line printed as if it had been sold").not.toContain("Chicken Karahi");
    expect(paper).toContain("Garlic Naan");
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

// ── F. THE DOCUMENT RECONCILES — measured on the BYTES, not on the render helper ───────────────
//
// PROVENANCE: authored by the session that fixed the defect (`20 §4.3` as amended by R66 — tests
// alongside the code for an app-layer path). The mitigation is the round-3 law: every assertion
// below was run against a deliberately-broken implementation and confirmed to red. The matrix is
// in the session report.
//
// ⚠ THE REASON THIS SECTION EXISTS RATHER THAN A RENDER-HELPER ASSERTION. The defect it pins was
// found by reading the ESC/POS bytes of a real receipt on 2026-08-23 and adding the four printed
// line figures up by hand — Rs 913 over a `Subtotal Rs 853` — while every arithmetic assertion in
// this repo was green, because each one checks a figure against the fold and none checks the
// figures against EACH OTHER. So these read the emitted bytes and do the reader's arithmetic.

/** One printed item row, parsed back out of the emitted bytes: `<qty> <name> Rs <amount> each`. */
const ITEM_ROW = /(\d+) ([A-Za-z][A-Za-z -]*?) Rs ([\d,]+(?:\.\d{2})?) each/g;

/** `Rs 1,234.50` → 123_450 paisa. The reader's own parse, deliberately not `domain`'s inverse. */
const paisaOf = (token: string): number =>
  Math.round(Number.parseFloat(token.replace(/,/g, "")) * 100);

/** Every item row the paper carries, in order. */
const itemRowsOf = (paper: string): { qty: number; name: string; paisa: number }[] =>
  [...paper.matchAll(ITEM_ROW)].map((m) => ({
    qty: Number(m[1]),
    name: (m[2] as string).trim(),
    paisa: paisaOf(m[3] as string),
  }));

/**
 * What the READER gets by doing what the paper tells her to: `N × Rs P`, added up.
 *
 * The extension is a REPETITION and not a multiplication, and the addition is `domain`'s —
 * `DEC-MONEY-005` bans raw arithmetic on a money value and the ban fires here, correctly. Writing
 * `qty * unit` in a test would be exactly the float-product hazard `billedCellPaisa` takes BigInt
 * to avoid, one layer over, and `27-F57`'s `each` means "this figure, once per unit" — so the
 * expansion is the FR's own reading of the row rather than a way round the rule.
 */
const readerSum = (paper: string): number =>
  totalPaisaOrNull(
    itemRowsOf(paper).flatMap((r) => Array.from({ length: r.qty }, () => r.paisa)),
  ) as number;

/** The value of a labelled money row, or `null` when the document does not carry one. */
const rowPaisa = (paper: string, label: string): number | null => {
  const found = paper.match(new RegExp(`${label} Rs ([\\d,]+(?:\\.\\d{2})?)`));
  return found === null ? null : paisaOf(found[1] as string);
};

/**
 * The four-order service day of 2026-08-23, as the ledger held it — one VOIDED line among four.
 * The figures are the run's own: Rs 449 + 325 + 79 billed, Rs 60 rung and voided.
 */
const RUN_LINES = {
  "line-1": { item_id: "item-biryani", qty: 1, unit_price_paisa: 44_900, states: ["confirmed"] },
  "line-2": { item_id: "item-kebab", qty: 1, unit_price_paisa: 32_500, states: ["confirmed"] },
  "line-3": { item_id: "item-drink", qty: 1, unit_price_paisa: 7_900, states: ["confirmed"] },
  "line-4": { item_id: "item-raita", qty: 1, unit_price_paisa: 6_000, states: ["voided"] },
};
const RUN_CATALOG: Record<string, string> = {
  "item-biryani": "Chicken Biryani",
  "item-kebab": "Seekh Kebab",
  "item-drink": "Soft Drink",
  "item-raita": "Raita",
};
/** Rs 449 + 325 + 79 — what the fold bills, and what the paper must add up to. */
const RUN_BILLED = 85_300;

const runHarness = (over: Record<string, unknown> = {}): Harness =>
  harness({
    catalog: RUN_CATALOG,
    order: {
      json_lines: JSON.stringify({ ...RUN_LINES, ...over }),
      pay_total: 1_000_000,
      pay_attempts_json: JSON.stringify({ "attempt-1": [attempt("cash", 1_000_000)] }),
    },
  });

describe("§F 01-F30/02-F15 — the printed rows CLOSE against the printed total", () => {
  it("01-F30: THE MEASURED DEFECT — a VOIDED dish is not on the customer's copy at any price", async () => {
    const h = runHarness();
    h.printer.settled(ORDER_ID);
    const paper = await paperOf(h);
    const rows = itemRowsOf(paper);
    expect(rows.map((r) => r.name)).toEqual(["Chicken Biryani", "Seekh Kebab", "Soft Drink"]);
    // Not just the row: the WORD. A voided dish on a customer's copy is a dish they can be asked
    // to pay for, whatever column its figure sits in.
    expect(paper, "the voided item's name reached the customer's copy").not.toContain("Raita");
    expect(paper, "the voided line's money token reached the paper").not.toContain("Rs 60");
  });

  it("02-F15: the item rows ADD UP to the total the same document prints — the reader's own sum", async () => {
    // The assertion the whole run turned on, and the one no existing test made: every money figure
    // in this repo is checked against the fold, and none is checked against the figure beside it.
    // Under `16-F1`'s default posture there is no Subtotal row, so the closing figure is `Total`.
    const h = runHarness();
    h.printer.settled(ORDER_ID);
    const paper = await paperOf(h);
    const summed = readerSum(paper);
    expect(summed, "the rows do not sum to what the fold billed").toBe(RUN_BILLED);
    expect(rowPaisa(paper, "Total"), "the printed rows and the printed total disagree").toBe(
      summed,
    );
  });

  it("16-F5/02-F63: with tax ON the rows close against SUBTOTAL, and the void is still absent", async () => {
    // The run's own configuration: `exclusive` at 1600 bps with whole-rupee charge rounding, where
    // `Total` is deliberately NOT the sum of the rows (`01-F82` puts tax inside it) and `Subtotal`
    // is. Both halves are asserted, so an implementation that made `Total` the row sum would fail
    // here even though it would satisfy the test above.
    process.env[TAX_POSTURE_ENV] = "exclusive";
    process.env[TAX_RATE_BPS_ENV] = "1600";
    try {
      const h = runHarness();
      h.printer.settled(ORDER_ID);
      const paper = await paperOf(h);
      const summed = readerSum(paper);
      expect(summed).toBe(RUN_BILLED);
      expect(rowPaisa(paper, "Subtotal")).toBe(summed);
      const total = rowPaisa(paper, "Total") as number;
      expect(total, "tax did not reach the amount charged").toBeGreaterThan(summed);
      expect(paper).not.toContain("Raita");
    } finally {
      delete process.env[TAX_POSTURE_ENV];
      delete process.env[TAX_RATE_BPS_ENV];
    }
  });

  it("01-F60: a line priced at ZERO is NOT a voided line, and it stays on the paper", async () => {
    // `01-F60` permits an explicit zero precisely so *free* is distinguishable from *forgotten*,
    // and both a free line and a voided one contribute nothing. An implementation that filtered on
    // "contributes nothing" alone would take the customer's evidence of a complimentary item off
    // the document — a different defect wearing this one's costume.
    const h = runHarness({
      "line-5": { item_id: "item-raita", qty: 1, unit_price_paisa: 0, states: ["confirmed"] },
    });
    h.printer.settled(ORDER_ID);
    const paper = await paperOf(h);
    expect(paper, "a deliberately free line was dropped with the voided one").toContain(
      "1 Raita Rs 0 each",
    );
    // And it still closes: a zero adds nothing to either side.
    const summed = readerSum(paper);
    expect(summed).toBe(RUN_BILLED);
    expect(rowPaisa(paper, "Total")).toBe(summed);
  });

  it("01-F30: an order whose every line was voided prints NOTHING — there is no sale to receipt", async () => {
    // "a fully-voided order nets to zero". The cover test then reads `0 >= 0` with no agreed
    // tender, so the guard that already exists holds — asserted rather than assumed, because the
    // filter above is what makes `lines` empty and an empty-lines receipt would be a document
    // claiming a customer bought nothing.
    const allVoided = Object.fromEntries(
      Object.entries(RUN_LINES).map(([id, cell]) => [id, { ...cell, states: ["voided"] }]),
    );
    const h = harness({
      catalog: RUN_CATALOG,
      order: {
        json_lines: JSON.stringify(allVoided),
        pay_total: 0,
        pay_attempts_json: "{}",
      },
    });
    h.printer.settled(ORDER_ID);
    expect(jobsOf(h.spooler).length, "a receipt was printed for an order with no sale on it").toBe(
      0,
    );
  });
});

// ── G. THE RULING ON COMP AND DISCOUNT — what the receipt does NOT say, and why ────────────────
//
// `02-F20`'s comp and discount both have a producer as of `plans/v0.md` gap 1
// (`renderer/LineCorrection.tsx` → `comp.recorded` / `discount.recorded`, both with `01 §4` payload
// schemas). Neither MOVES the bill: `merge.ts`'s two `case` labels are projection-inert while
// `DEC-MONEY-010`'s gate condition (iii) — "an oracle-pinned merge rule in `26 §7`" — is unmet, so
// `01-F30`'s `comp_value` and `discounts` terms do not exist. The customer was therefore charged in
// full and paid in full, and the receipt says so.
//
// **THE RULING, and it is a DECLARED INTERPRETATION (`24 §3b`) on the half the corpus leaves open.**
// `02-F15` lists "discount lines" among receipt content and names no comp line at all, so the
// discount surface IS specified and the comp one is NOT — stated rather than glossed. Neither is
// printed today and the reason is the same for both: `16-F33` (c) gives a settled receipt exactly
// ONE total, and a `Discount Rs 200` row above a total it did not reduce is a second, implied total
// — a customer subtracting it would compute a figure nobody was ever charged. The row lands the day
// `01-F30`'s term does, and it must move `billed_total` before it may move this paper;
// `receipt-document.ts` argues exactly that and only its PREMISE ("no payload schema at all") went
// stale. The minimum that keeps the document reconcilable is silence, and no vocabulary is invented
// for either act.
//
// These assertions FAIL THE DAY A ROW IS ADDED, which is the point: an unsubtracted money row on a
// customer's copy is the defect, not the fix.

describe("§G 16-F33 (c)/DEC-MONEY-010 — one total, and no row that does not move it", () => {
  it("16-F33 (c): a settled receipt carries exactly ONE total figure", async () => {
    const h = runHarness();
    h.printer.settled(ORDER_ID);
    const paper = await paperOf(h);
    expect(paper.match(/Total Rs /g) ?? []).toHaveLength(1);
  });

  it("DEC-MONEY-010: no comp or discount row — neither has moved `billed_total`", async () => {
    const h = runHarness();
    h.printer.settled(ORDER_ID);
    const paper = await paperOf(h);
    expect(paper, "a discount row was printed above a total it does not reduce").not.toMatch(
      /discount/i,
    );
    expect(paper, "a comp row was printed above a total it does not reduce").not.toMatch(/\bcomp/i);
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
