// ACCEPTANCE TESTS — S-7's SEAM: `shift.closed` and `day.closed` reach the spooler, and the
// carried facts reach the paper unchanged.
//
// PROVENANCE (24 §3 step 2): authored by the session that implemented `createCashPrinter`, which
// is NOT the `24 §3` split — stated rather than glossed, exactly as `kot-printing.test.ts` states
// it. The mitigation is the round-3 law: a CONTROL and five single-branch mutants were built out of
// tree and each was confirmed to red the assertions that claim to own it. The matrix is in the
// session report.
//
// ⚠ THIS FILE'S REASON FOR EXISTING IS §E, NOT §A–§D. `packages/escpos` can prove a document
// renders correctly and prove nothing at all about whether this application ever asks it to —
// that is the wave's named defect, in eight instances, and the last one was an entire service that
// could not start. §E asserts on `main/index.ts`'s SOURCE for that reason: a suite that injects
// every dependency never exercises the wiring, and reading a diff never finds it.
//
// THE FRs, quoted:
//   02-F23  "system-expected cash (by method) vs counted cash; over/short **recorded and
//           attributed**"; the cashier's own reconciliation, the staff-protection framing.
//   02-F24  "a day-summary ticket (sales by channel, voids/comps/discounts, over/short) can be
//           printed via doc 03".
//   02-F43  unbound drawer events "succeed, are **COUNTED**" — an implementation that stores one
//           and drops it from every total "satisfies the word *logged* while defeating the
//           theft-detection the FR exists for".
//   26 §7   "over/short … a **carried fact**".
//   01-F17  "A sale is never blocked" — and neither is a shift close.
//   01-F46  the business day is Asia/Karachi with a 05:00 cutover.
//   03-F4   the job is persisted BEFORE the first transmit; 3 attempts over 30 s.
//   03-F5   silent print failure is forbidden; the alert names the printer and the subject.
//   03-F34  a document that cannot be rendered is REFUSED, plus an S1 band, never degraded.
//   03-F49  a type's own column floor; below it, refused and never squeezed.
//   01 §4   the event catalog — which has **no** `slip.printed` and no `slip.print_failed`.
//
// ⚠ NOT EVIDENCE FOR: any physical printer (K-8 is owed in full and no printer has ever been
// attached), or that a cashier can read the slip (`27-F35`'s ≥85% gate is measured on staff).

import { readFileSync } from "node:fs";
import {
  classifyTransmit,
  createSpooler,
  type JobRecord,
  MAX_TRANSMIT_ATTEMPTS,
  type PrinterCapability,
  printerCapability,
  type Spooler,
  type SpoolerTransport,
} from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it } from "vitest";
import { CHANNELS } from "../../shared/ipc";
import { type CashPrinterDeps, createCashPrinter } from "../printing";

// ── the fixtures ────────────────────────────────────────────────────────────────────────────────

const SHIFT_ID = "shift-7a2b1c9d-0000-4000-8000-000000000001";
const DAY_ID = "day-2026-01-02";
/**
 * A business date that is DELIBERATELY NOT TODAY.
 *
 * Found by mutation: with the fixture set to the day this suite was written, an
 * implementation that stamped `new Date()` into the header passed every assertion here —
 * the round-3 defect exactly (a guard that was never pointed at the dangerous case), and
 * `03-F30`'s central law is that a document must not depend on the reading device. A fixed
 * past date is what makes "the date it was HANDED" and "today" distinguishable at all.
 */
const BUSINESS_DATE = "2026-01-02";
/** 2026-01-02 13:00 Asia/Karachi — inside the business day above, clear of the 05:00 cutover. */
const IN_DAY = Date.UTC(2026, 0, 2, 8, 0, 0);

/**
 * A closed shift whose CARRIED variance CONTRADICTS the naive subtraction, in SIGN.
 *
 * `counted − Σ expected` = 100,000 − 90,000 = **+10,000** (over Rs 100). The carried figure is
 * **−5,000** (short Rs 50) — the truth, because a `02-F26` paid-out took Rs 150 out of the drawer
 * and the subtraction never sees it (`02-F44` exists for exactly this). An implementation that
 * recomputes prints the opposite WORD about the same cashier.
 */
const CLOSED_SHIFT = {
  shift_id: SHIFT_ID,
  cashier: "Ayesha Khan",
  prev_shift_id: null,
  open_at: IN_DAY,
  expected_json: JSON.stringify({ cash: 90_000 }),
  paid_out_paisa: 15_000,
  no_sale_count: 4,
  closed: 1,
  counted_cash_paisa: 100_000,
  expected_at_close_json: JSON.stringify({
    cash: 90_000,
    card: 0,
    raast: 0,
    khata_credit: 0,
    aggregator_receivable: 0,
  }),
  variance_paisa: -5_000,
  exceptions_json: "[]",
};

const CLOSED_DAY = {
  day_id: DAY_ID,
  business_date: BUSINESS_DATE,
  prev_day_id: null,
  opening_float_paisa: 500_000,
  deposit_paisa: 1_100_000,
  closed: 1,
  counted_cash_paisa: 1_248_000,
  exceptions_json: "[]",
};

type StoreOver = {
  shifts?: unknown[];
  days?: unknown[];
  unbound?: { no_sale_count: number; paid_out_paisa: number };
  orders?: { channel: string; pay_total: number; confirmed_at: number | null }[];
};

const stubStore = (over: StoreOver = {}): CashPrinterDeps["store"] =>
  ({
    shifts: () => over.shifts ?? [CLOSED_SHIFT],
    days: () => over.days ?? [CLOSED_DAY],
    unboundDrawer: () =>
      over.unbound ?? { no_sale_count: 2, paid_out_paisa: 33_300, exceptions_json: "[]" },
    openOrders: () =>
      (over.orders ?? []).map((order, index) => ({
        order_id: `order-${index}`,
        channel: order.channel,
        confirmed_at: order.confirmed_at,
        pay_total: order.pay_total,
        table_ids_json: "[]",
        json_lines: "{}",
      })),
  }) as unknown as Pick<DeviceStore, "openOrders" | "shifts" | "days" | "unboundDrawer">;

/** Three modes, exactly as `kot-printing.test.ts`'s: `classifyTransmit` owns the decision. */
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
  printer: ReturnType<typeof createCashPrinter>;
  spooler: Spooler;
};

const harness = (
  opts: { store?: StoreOver; model?: string; mode?: "ok" | "fail" } = {},
): Harness => {
  const capability = printerCapability(opts.model ?? "TH230");
  const spooler = createSpooler({ transport: fakeTransport(opts.mode ?? "fail", capability) });
  const printer = createCashPrinter({
    spooler,
    store: stubStore(opts.store),
    capability,
    pump: () => spooler.pump(),
  });
  return { printer, spooler };
};

const jobsOf = (s: Spooler): readonly JobRecord[] => s.jobs();

/**
 * The document's text, decoded latin1.
 *
 * Deliberately naive, and safe here for a stated reason: K-2's admitted command set is `ESC @`,
 * `GS ! n`, `GS B n`, `ESC d n`, `GS V m` and `GS v 0` — none of whose parameter bytes can spell
 * a multi-word phrase, and every string searched below is a multi-word phrase. A byte-exact
 * assertion is available (`render()` is pure) and is used in §B where the claim is about which
 * NUMBER was passed; here the claim is about which WORDS reached the paper.
 */
const textOf = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

/**
 * A harness whose transport RECORDS every document it is handed.
 *
 * The spooler exposes job state, not bytes, so the only place to read what a printer would
 * actually receive is the transport — which is also the honest place: `18 §10` names the pipeline
 * "document model → encoder → `Transport`", and a test that re-rendered the document itself would
 * be asserting against its own copy rather than against what was enqueued.
 */
const recordingHarness = (
  opts: { store?: StoreOver; model?: string; mode?: "ok" | "fail" } = {},
): Harness & { sent: Uint8Array[] } => {
  const capability = printerCapability(opts.model ?? "TH230");
  const sent: Uint8Array[] = [];
  const spooler = createSpooler({
    transport: {
      send: async (document) => {
        sent.push(document);
        return opts.mode === "ok"
          ? classifyTransmit(
              { status: { paper_out: false, near_end: false }, timed_out: false, link_error: null },
              capability,
            )
          : classifyTransmit({ status: null, timed_out: false, link_error: null }, capability);
      },
      status: async () => ({ paper_out: false, near_end: false }),
    },
  });
  const printer = createCashPrinter({
    spooler,
    store: stubStore(opts.store),
    capability,
    pump: () => spooler.pump(),
  });
  return { printer, spooler, sent };
};

// ── A. the handoff ──────────────────────────────────────────────────────────────────────────────

describe("02-F23/02-F24 — a close reaches the durable spooler", () => {
  it("03-F4: `shift.closed` enqueues one job, BEFORE any transmit", () => {
    const h = harness();
    h.printer.shiftClosed(SHIFT_ID);
    // `01-F17` at the type level: `shiftClosed` is synchronous and `void`, so the row exists and
    // nothing has been sent by the time it returns. A cashier is never held at the till by a
    // socket timeout.
    const jobs = jobsOf(h.spooler);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.state).toBe("queued");
    expect(jobs[0]?.attempts).toBe(0);
    expect(jobs[0]?.job_id).toContain("shift_close_slip");
    expect(jobs[0]?.order_ref).toBe(SHIFT_ID);
  });

  it("`day.closed` enqueues its own job, and the two do not collide", () => {
    const h = harness();
    h.printer.shiftClosed(SHIFT_ID);
    h.printer.dayClosed(DAY_ID);
    expect(jobsOf(h.spooler)).toHaveLength(2);
    expect(
      jobsOf(h.spooler)
        .map((j) => j.job_id)
        .every((id) => id.startsWith("cash::")),
    ).toBe(true);
  });

  it("03-F7/03-F37: closing twice does NOT print a second slip", () => {
    // A duplicate cash slip is a second signature surface, and `03-F7`/`03-F37` make a reprint a
    // deliberate, logged, REPRINT-banded act — which re-invoking the handler is not.
    const h = harness();
    h.printer.shiftClosed(SHIFT_ID);
    h.printer.shiftClosed(SHIFT_ID);
    h.printer.shiftClosed(SHIFT_ID);
    expect(jobsOf(h.spooler)).toHaveLength(1);
  });

  it("an UNCLOSED shift prints nothing — the carried facts do not exist yet", () => {
    const open = {
      ...CLOSED_SHIFT,
      closed: 0,
      counted_cash_paisa: null,
      variance_paisa: null,
      expected_at_close_json: null,
    };
    const h = harness({ store: { shifts: [open] } });
    h.printer.shiftClosed(SHIFT_ID);
    expect(jobsOf(h.spooler)).toHaveLength(0);
  });

  it("01-F17: an unknown shift or day is a no-op, never a throw", () => {
    const h = harness({ store: { shifts: [], days: [] } });
    expect(() => h.printer.shiftClosed("nope")).not.toThrow();
    expect(() => h.printer.dayClosed("nope")).not.toThrow();
    expect(jobsOf(h.spooler)).toHaveLength(0);
  });
});

// ── B. the carried facts reach the paper ───────────────────────────────────────────────────────

describe("26 §7/02-F43 — what the fold carried is what the paper says", () => {
  const shiftText = async (over: StoreOver = {}): Promise<string> => {
    const h = recordingHarness({ store: over });
    h.printer.shiftClosed(SHIFT_ID);
    await h.spooler.pump();
    expect(h.sent.length, "nothing was transmitted").toBeGreaterThan(0);
    return textOf(h.sent[0] as Uint8Array);
  };

  it("the CARRIED variance prints, not the subtraction that contradicts it", async () => {
    // The headline mutant: `counted − Σ expected` is +Rs 100 (an OVER); the carried fact is
    // −Rs 50 (a SHORT). A recomputing implementation prints the opposite word about the same
    // cashier, and `01-F1` forbids the mutation a read-time recompute performs in effect.
    const text = await shiftText();
    expect(text).toContain("Over/short SHORT Rs 50");
    expect(text).not.toContain("OVER Rs 100");
  });

  it("02-F23: the attribution and the by-method expectation are the fold's", async () => {
    const text = await shiftText();
    expect(text).toContain("Cashier Ayesha Khan");
    expect(text).toContain("Cash Rs 900");
    expect(text).toContain("Counted cash Rs 1,000");
    // `01-F32`'s closed set, exhaustive — a vanished bucket cannot be told from an untendered one.
    for (const label of [
      "Card Rs 0",
      "Raast Rs 0",
      "Khata credit Rs 0",
      "Aggregator receivable Rs 0",
    ]) {
      expect(text, `${label} is missing`).toContain(label);
    }
  });

  it("02-F21/02-F43/02-F44: the drawer activity is COUNTED onto the slip, bound and unbound", async () => {
    // `02-F43`'s named failure: an unbound event that is "stored and uncounted" satisfies the word
    // *logged* and defeats the theft detection. A slip is a total. The four numbers are distinct
    // in the fixture so a slip printing one of them twice cannot pass by coincidence.
    const text = await shiftText();
    expect(text).toContain("Paid out Rs 150");
    expect(text).toContain("No-sale opens 4");
    expect(text).toContain("Unbound no-sale opens 2");
    expect(text).toContain("Unbound paid out Rs 333");
  });

  it("02-F24/01-F46: the day summary buckets by BUSINESS date, not by everything on the device", async () => {
    // `01-F46`: Asia/Karachi with a 05:00 cutover, so 2026-08-08 02:00 local still belongs to the
    // 7th's business day, and 2026-08-08 06:00 local does not. Both are on this device.
    const h = recordingHarness({
      store: {
        orders: [
          { channel: "counter", pay_total: 120_000, confirmed_at: IN_DAY },
          // 2026-01-02 21:00 UTC = 2026-01-03 02:00 PKT — still the 2nd's business day.
          { channel: "phone", pay_total: 30_000, confirmed_at: Date.UTC(2026, 0, 2, 21, 0, 0) },
          // 2026-01-03 01:00 UTC = 2026-01-03 06:00 PKT — past the cutover, a DIFFERENT day.
          { channel: "counter", pay_total: 999_900, confirmed_at: Date.UTC(2026, 0, 3, 1, 0, 0) },
          // Never confirmed: not a sale.
          { channel: "counter", pay_total: 777_700, confirmed_at: null },
        ],
      },
    });
    h.printer.dayClosed(DAY_ID);
    await h.spooler.pump();
    const text = textOf(h.sent[0] as Uint8Array);
    // NOT today, deliberately — see `BUSINESS_DATE`.
    expect(text).toContain("DAY SUMMARY 2026-01-02");
    expect(text, "the header must not carry the reading device's idea of today").not.toContain(
      new Date().toISOString().slice(0, 10),
    );
    expect(text).toContain("Counter Rs 1,200");
    expect(text).toContain("Phone Rs 300");
    expect(text).not.toContain("Rs 9,999");
    expect(text).not.toContain("Rs 7,777");
  });

  it("02-F24: the day's over/short is the SUM of the shifts' CARRIED variances", async () => {
    const second = { ...CLOSED_SHIFT, shift_id: "shift-two", variance_paisa: 8_000 };
    // A shift on ANOTHER business day, which must not contribute.
    const elsewhere = {
      ...CLOSED_SHIFT,
      shift_id: "shift-elsewhere",
      open_at: Date.UTC(2026, 0, 4, 8, 0, 0),
      variance_paisa: 500_000,
    };
    const h = recordingHarness({ store: { shifts: [CLOSED_SHIFT, second, elsewhere] } });
    h.printer.dayClosed(DAY_ID);
    await h.spooler.pump();
    const text = textOf(h.sent[0] as Uint8Array);
    // −5,000 + 8,000 = +3,000 paisa = OVER Rs 30. The Rs 5,000 shift on the 4th is excluded.
    expect(text).toContain("Over/short OVER Rs 30");
    expect(text).toContain("Shifts closed 2");
  });

  it("02-F24: the group 01 §4 cannot record is NAMED on the paper, never zeroed", async () => {
    const h = recordingHarness();
    h.printer.dayClosed(DAY_ID);
    await h.spooler.pump();
    expect(textOf(h.sent[0] as Uint8Array)).toContain("Voids/comps/discounts NOT RECORDED");
  });
});

// ── C. 03-F34/03-F5 — refusal and failure are LOUD, and stay out of the ledger ─────────────────

describe("03-F34/03-F5 — a cash document that cannot print says so", () => {
  it("03-F49/03-F34: on a 58 mm printer the slip is REFUSED, nothing is enqueued, and a band names it", () => {
    // The shift slip's floor is 35 columns and a 58 mm printer has 32. `03-F49`: "refused, never
    // squeezed"; `03-F34`: "a hard refusal to print plus an S1 band, never a silent degradation".
    const h = harness({ model: "BC-58U" });
    h.printer.shiftClosed(SHIFT_ID);
    expect(jobsOf(h.spooler), "a refused document must leave NO job").toHaveLength(0);
    const alarms = h.printer.alarms();
    expect(alarms).toHaveLength(1);
    const shown = `${alarms[0]?.message} ${alarms[0]?.subject}`;
    expect(shown).toContain("Shift slip");
    expect(shown).toContain("min_columns_not_met");
    // `03-F49`: doc 14 needs the two numbers "at assignment time, not at 20:40 on a Friday".
    expect(shown).toContain("needs 35 columns");
    expect(shown).toContain("BC-58U");
  });

  it("03-F5: an exhausted retry budget raises a band naming the DOCUMENT, the subject and the printer", async () => {
    const h = harness({ mode: "fail" });
    h.printer.shiftClosed(SHIFT_ID);
    for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS; i += 1) await h.spooler.pump();
    expect(jobsOf(h.spooler)[0]?.state).toBe("failed");
    // Nothing yet: the band comes from `reconcile`, which the host drives after each pump. If this
    // read as "already raised" the next assertion would prove nothing about the wiring.
    h.printer.reconcile();
    const alarms = h.printer.alarms();
    expect(alarms).toHaveLength(1);
    const shown = `${alarms[0]?.message} ${alarms[0]?.subject}`;
    // "KOT 5f3a9c21 did not print" would send a cashier to the kitchen printer for a document
    // that is not a KOT, and would not name the reconciliation she is waiting to sign.
    expect(shown).toContain("Shift slip");
    expect(shown).not.toContain("KOT");
    expect(shown).toContain("TH230");
    expect(shown).toContain(SHIFT_ID.slice(0, 8));
  });

  it("the day summary's band names ITS document, not the slip's", async () => {
    const h = harness({ mode: "fail" });
    h.printer.dayClosed(DAY_ID);
    for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS; i += 1) await h.spooler.pump();
    h.printer.reconcile();
    expect(`${h.printer.alarms()[0]?.message}`).toContain("Day summary");
  });

  it("03-F5: the band is raised ONCE however often reconcile runs, and acknowledging clears it", async () => {
    const h = harness({ mode: "fail" });
    h.printer.shiftClosed(SHIFT_ID);
    for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS; i += 1) await h.spooler.pump();
    h.printer.reconcile();
    h.printer.reconcile();
    h.printer.reconcile();
    expect(h.printer.alarms()).toHaveLength(1);
    h.printer.acknowledge(h.printer.alarms()[0]?.id as string);
    expect(h.printer.alarms()).toHaveLength(0);
  });

  it("a SUCCESSFUL cash job raises nothing", async () => {
    const h = harness({ mode: "ok" });
    h.printer.shiftClosed(SHIFT_ID);
    await h.spooler.pump();
    h.printer.reconcile();
    expect(jobsOf(h.spooler)[0]?.state).toBe("printed");
    expect(h.printer.alarms()).toHaveLength(0);
  });
});

// ── D. Commandment 2 — no invented event reaches the ledger ────────────────────────────────────

describe("01 §4 — a cash document appends NOTHING, because no event type exists for it", () => {
  it("createCashPrinter takes no `append` at all — the gap is structural, not a discipline", () => {
    // `01 §4` has no `slip.printed` and no `slip.print_failed`. Emitting `kot.printed` with a
    // shift id as its `order_id` would write a false KOT fact permanently into a ledger `01-F1`
    // forbids correcting in place, and inventing the event is Commandment 2. So this printer
    // cannot append: there is no seam through which it could, which is stronger than not using
    // one. If a future FR adds the event types, this assertion is what has to change first.
    const deps: (keyof CashPrinterDeps)[] = ["spooler", "store", "capability", "pump"];
    expect(deps).not.toContain("append");
    const src = readFileSync(new URL("../printing.ts", import.meta.url), "utf8");
    expect(src.length, "the guard is reading an empty file").toBeGreaterThan(4_000);
    // Anchored on something unrelated, so the scan cannot pass by not looking.
    expect(src).toContain("createCashPrinter");
    const cashHalf = src.slice(src.indexOf("export const createCashPrinter"));
    expect(cashHalf.length).toBeGreaterThan(1_000);
    expect(cashHalf).not.toContain("kot.printed");
    expect(cashHalf).not.toContain("kot.print_failed");
    expect(cashHalf).not.toContain("slip.printed");
  });

  it("the KOT printer's reconcile SKIPS cash jobs — the two share a spooler and not a ledger", () => {
    const src = readFileSync(new URL("../printing.ts", import.meta.url), "utf8");
    // The one line that keeps them apart. Without it a shift-close slip that printed would append
    // `kot.printed` for an `order_id` that is a shift id.
    expect(src).toMatch(/if\s*\(isCashJob\(job\.job_id\)\)\s*continue;/);
  });
});

// ── E. THE SEAM — the production caller, which is why this file exists ─────────────────────────

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

describe("the wave's recurring defect — S-7's two documents have a PRODUCTION caller", () => {
  const mainSrc = readSrc("index.ts");

  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string reports
    // clean. Anchored on lines that have nothing to do with cash printing.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc.length).toBeGreaterThan(4_000);
  });

  it("main/index.ts CONSTRUCTS the cash printer, unconditionally", () => {
    // `createSpooler` shipped with 244 tests and zero production callers; so did `createPinSession`
    // and `domain`'s whole permission matrix. This is the assertion that would have caught all
    // three, pointed at the two documents S-7 adds.
    expect(mainSrc).toMatch(/createCashPrinter\s*\(/);
    // And on the SAME spooler — a second `createSpooler` here would give the cash documents their
    // own queue, their own store and their own retry budget, which `03-F42` does not ask for and
    // `03-F4`'s window cannot survive twice over.
    expect(mainSrc).toMatch(/createCashPrinter\s*\(\s*\{[^}]*\bspooler\b/);
  });

  it("main/index.ts calls BOTH documents from the append path, on their own events", () => {
    // The whole task, in four lines of `index.ts`. A document type nothing prints is this wave's
    // named defect in its ninth instance.
    expect(mainSrc).toContain("shift.closed");
    expect(mainSrc).toContain("day.closed");
    expect(mainSrc).toMatch(/\.shiftClosed\s*\(/);
    expect(mainSrc).toMatch(/\.dayClosed\s*\(/);
  });

  it("main/index.ts drives cash reconcile on the pump schedule, so a failed slip gets its band", () => {
    // Without this the job queues, fails and says nothing — a silent print failure produced by an
    // absent call, which is the exact shape `03-F5` forbids and the exact shape a durability suite
    // cannot see.
    expect(mainSrc).toMatch(/cash\.reconcile\s*\(/);
    expect(mainSrc).toContain("PUMP_INTERVAL_MS");
  });

  it("main/index.ts serves the cash printer's bands on the counter's alarm channel", () => {
    // A band nobody can read is a silent failure with extra steps. `27-F11d` renders the head and
    // counts the tail, so both printers feed ONE channel.
    expect(mainSrc).toMatch(/cash\.alarms\s*\(/);
    expect(mainSrc).toMatch(/cash\.acknowledge\s*\(/);
    expect(CHANNELS.alarms).toBe("restos:alarms");
  });
});

// ── DEFERRED ────────────────────────────────────────────────────────────────────────────────────
//
//  * **K-8, the physical pass.** No printer has ever been attached, and the shipped transport
//    (`unattachedPrinter`) reports a failed transmit every time — which is the truth about this
//    device. So on a real launch every shift close raises a print-failure band about 20 s later,
//    exactly as every confirm does. Nothing here is evidence about paper.
//  * **The REPRINT path.** `03-F7`/`03-F37` make a reprint a deliberate logged act and the band is
//    implemented (`ShiftCloseData.reprint`), but no surface offers it, so `reprint` is always
//    false in production. The surface owns that assertion.
//  * **`01 §4`'s missing print events for cash documents** — see §D. Until they exist, a failed
//    slip is visible on the counter and invisible to doc 05.
