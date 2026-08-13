// Acceptance tests — K-6: the print spooler. `03-F4`'s durable state machine and retry budget,
// `03-F41`'s stall (the duplicate-KOT trap), `03-F42`'s whole-document rule, and `03-F40`'s health
// check.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `03-F4`  — "Durable spooler: every print job is persisted (SQLite, WAL) with an explicit state
//              machine (`queued → transmitting → stalled? → printed | failed`) before the first
//              transmit attempt; a crash or power loss mid-print resumes or reprints the job on
//              restart — never drops it. Retry with backoff (default 3 attempts over 30 s) on
//              transport failure."
//   `03-F41` — "a stalled printer is holding the job, not dropping it — so `03-F4`'s retry must not
//              fire … a stall never counts toward the 3-attempt budget and never re-transmits. A
//              timeout that flips a stall to `failed` and retries double-prints the instant the
//              roll is loaded — a duplicate KOT is a real kitchen error, not a cosmetic one."
//   `03-F42` — "A document is rendered whole, buffered, and transmitted as one unit … No I/O wait
//              may be interleaved inside a document."
//   `03-F40` — paper-out is read with the real-time `DLE EOT 4`, never `GS r`; "a health check
//              built on `GS r` reports 'paper present' forever, and a paper-out becomes a silent
//              KOT failure"; near-end is model-gated from the capability record.
//   `03-F5`  — "Silent KOT failure is forbidden. When retries exhaust: the host device raises a
//              loud alert … naming the printer and order."
//   `03-F34` — "a hard refusal to print plus an S1 band, never a silent degradation."
//   `03-F10` — the rig's paper-out step: "pull the roll mid-job and assert the spooler reports
//              `stalled` (03-F41) via `DLE EOT 4` (03-F40), then assert reloading prints the job
//              EXACTLY ONCE".
//   `01-F17` — a sale is NEVER blocked.
// K-1..K-5's landed code was read as the CONTRACT this layer composes over (their exports and
// their oracle surfaces). No K-6 implementation was read; none exists. `plans/wave-1/kot-printing.md`
// was deliberately NOT read beyond its task table.
//
// ── NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER. ──
//
// Every assertion here is about bytes handed to a JavaScript object, integers on a record, and
// transitions of a state machine. `03-F10`'s paper-out step is a RIG procedure on real hardware and
// is owed in full (K-8). `pullRoll()` below moves a boolean. No test name may be read as a
// measurement of a printer, and the two tests whose names carry "roll" are named for the FR's
// scenario, not for an event that happened to paper.
//
// ── THE ASSERTION THIS SUITE EXISTS FOR ──
//
// `03-F41`'s defect is a DUPLICATE KOT and it is invisible until the roll is replaced: the printer
// took the bytes and is holding them, so a spooler that re-transmits looks fine until paper returns
// and then prints the ticket twice. A test asserting "the job eventually succeeded" passes against
// that broken spooler. So the test that matters — `THE TRAP` below — drives a stall, then a
// recovery, and asserts **exactly one** document reached the printer. The kitchen consequence is
// why the count and not the outcome is asserted: a duplicate KOT cooks the dish twice, a dropped
// KOT never cooks it at all, and both are worse than the visible failure `03-F34` demands.
//
// ── WHAT IS GREEN ON THE RED RUN, AND WHY (stated so the count is not read as coverage) ──
//
// TWO of the tests below pass on the RED run and neither observes a K-6 export:
//   * ONE ORACLE SELF-TEST on the fake printer's partial-document spies. Without it, "the spooler
//     never called `write()`" is satisfied by a fake that has no `write()` — the ban would be
//     vacuous, which is round 2's pattern 2 exactly.
//   * ONE ORACLE SELF-TEST feeding `03-F40`'s `GS r` map (K-3's counter-example decoder, never the
//     implementation's) the paper-out fixture, showing it answers "paper present". A
//     counter-example nobody demonstrated is worth nothing.
//
// ── FR AMBIGUITIES, PINNED RATHER THAN FILLED ──
//
//  1. **PIN — does the transmit that STALLED consume one attempt?** `03-F41` says "a stall never
//     counts toward the 3-attempt budget"; the transmit itself still physically happened. Reading
//     (a): `attempts` counts transmits made, so it is 1 after a stall. Reading (b): `attempts`
//     counts budget spent, so it is 0. K-3's DEFERRED note reads it as (b) ("ZERO attempts
//     consumed"); that is another oracle session's reading, not FR text. Nothing below decides it:
//     the stall tests assert that `attempts` does not MOVE across further stalled pumps and stays
//     strictly below the budget, which is true under both. **Measured, not assumed:** a spooler
//     built to reading (a) was run against this suite out-of-tree and passed 32/32, and a spooler
//     whose stalled poll spends budget until the job flips to `failed` — `03-F41`'s named defect —
//     failed two tests. The gap is exactly the width of the ambiguity and no wider.
//  2. **PIN — the state of a job between a failed attempt and its retry is unnamed.** `03-F4`'s
//     five states have no `retrying`, so a retryable job is either back at `queued` or still at
//     `transmitting`. Both are defensible; the FR picks neither. The retry tests assert only that
//     such a job is NON-TERMINAL, and the terminal outcomes are asserted exactly.
//  3. **PIN — whether the spooler pre-flights `status()` before the first transmit is not stated.**
//     `03-F4` says the job is persisted before the first transmit attempt and says nothing about a
//     health query. The stall tests are written to hold under both readings: they assert the
//     transport-observed totals (`attempts().length`, `received().length`) at the END of the
//     scenario, where both readings agree on ONE, and never a count mid-scenario, where they
//     disagree.
//  4. **PIN — `03-F4`'s crash/restart half is NOT asserted BY THIS FILE.** "a crash or power loss
//     mid-print resumes or reprints the job on restart" needs a store seam, and when this suite was
//     written `SpoolerOptions` declared only a transport. **That gap is now closed next door:**
//     `spooler-durability.test.ts` added `SpoolerJobStore` to the surface and drives it. Nothing
//     below changed, and the measurement is the reason to say so out loud — a spooler holding its
//     jobs in a `Map` still passes ALL 32 tests in this file and fails 8 in that one. Read the two
//     together before calling `03-F4` covered.
//  5. **PIN — `RETRY_WINDOW_MS`'s 30 s is asserted as a CONSTANT and never as elapsed time.** The
//     oracle surface's `pump()` puts the schedule in the caller (K-7); a timing assertion here
//     would be flaky by construction (`24-F12`). The BUDGET is asserted; the SPACING is not.
//  6. **PIN — near-end's consequence is a declared interpretation, not FR text.** `03-F40`
//     model-gates the sensor and never says what a positive reading does. `01-F17` decides it in
//     the oracle surface — near-end warns, it does not stop — with the alternative named there.

import { describe, expect, it } from "vitest";
import * as escpos from "../index.js";
import {
  ATTEMPTS_PER_03_F4,
  checkPrinterHealth,
  createFakePrinter,
  createSpooler,
  type EscposK6Api,
  type FakePrinter,
  functionMembers,
  JOB_STATES_PER_03_F4,
  type JobState,
  maxTransmitAttempts,
  PARTIAL_DOCUMENT_MEMBERS,
  type PrintJob,
  printerHealthQuery,
  RETRY_WINDOW_MS_PER_03_F4,
  retryWindowMs,
  type Spooler,
  type SpoolerTransport,
  spoolerJobStates,
} from "./spooler-oracle-surface.js";
import {
  decodeWithGsRMap,
  type PrinterCapabilityWithSensors,
  RESPONSE_NEAR_END,
  RESPONSE_PAPER_OUT,
  RESPONSE_PAPER_PRESENT,
} from "./transport-oracle-surface.js";

const api = escpos as unknown as EscposK6Api;

/** A capability record. `has_near_end_sensor` defaults ON — `03-F40`'s gated-in case. */
const caps = (over: Partial<PrinterCapabilityWithSensors> = {}): PrinterCapabilityWithSensors => ({
  model_id: "K6-TEST-80MM",
  dots: 576,
  dpi: 203,
  cols_font_a: 42,
  cols_font_b: 56,
  has_native_qr: false,
  has_cutter: true,
  raster_ok: true,
  has_near_end_sensor: true,
  ...over,
});

let job_seq = 0;

/**
 * A KOT as the spooler receives it. `printer_name` and `order_ref` are `03-F5`'s two nouns and they
 * carry the FR's own example string so that a record which loses one is obvious in the diff.
 */
const kot = (over: Partial<PrintJob> = {}): PrintJob => {
  job_seq += 1;
  return {
    job_id: `k6-job-${job_seq}`,
    document: Uint8Array.from([0x1b, 0x40, 0x4b, 0x4f, 0x54, 0x20, 0x23, 0x31, 0x34, 0x32, 0x0a]),
    printer_name: "grill printer",
    order_ref: "KOT #142",
    ...over,
  };
};

const rig = (
  over: Partial<PrinterCapabilityWithSensors> = {},
): { printer: FakePrinter; spooler: Spooler } => {
  const printer = createFakePrinter({ capability: caps(over) });
  return { printer, spooler: createSpooler(api, { transport: printer }) };
};

/**
 * Always RE-READ through `job()`; never hold the record `enqueue()` returned. Whether that record
 * is live or a snapshot is not stated anywhere, and a suite that assumed one would be asserting the
 * implementation's aliasing rather than `03-F4`'s state machine.
 */
const recordOf = (spooler: Spooler, job_id: string) => {
  const record = spooler.job(job_id);
  if (record === undefined) {
    throw new Error(
      `03-F4: job ${job_id} is not in the spooler — a persisted job is resumed or reprinted, never dropped`,
    );
  }
  return record;
};

const stateOf = (spooler: Spooler, job_id: string): JobState => recordOf(spooler, job_id).state;

const pumpTimes = async (spooler: Spooler, times: number): Promise<void> => {
  for (let index = 0; index < times; index += 1) {
    await spooler.pump();
  }
};

describe("03-F4 — the state machine and the budget are the FR's, verbatim", () => {
  it("ships exactly `queued → transmitting → stalled? → printed | failed`, in that order", () => {
    // A list, not a set: `03-F41`'s whole subject is that `stalled` is NOT `failed`. A spooler
    // shipping four states has collapsed that distinction; one shipping six has invented a word the
    // FR does not have (Commandment 2).
    expect(spoolerJobStates(api)).toEqual([...JOB_STATES_PER_03_F4]);
  });

  it("declares `03-F4`'s default of 3 attempts", () => {
    expect(maxTransmitAttempts(api)).toBe(ATTEMPTS_PER_03_F4);
    expect(maxTransmitAttempts(api)).toBe(3);
  });

  it("declares `03-F4`'s 30 s retry window as a constant (never measured — 24-F12)", () => {
    expect(retryWindowMs(api)).toBe(RETRY_WINDOW_MS_PER_03_F4);
    expect(retryWindowMs(api)).toBe(30_000);
  });
});

describe("03-F4 — a job is persisted BEFORE the first transmit attempt", () => {
  it("records the job as `queued` with an unspent budget and transmits NOTHING", () => {
    const { printer, spooler } = rig();
    const job = kot();

    const returned = spooler.enqueue(job);

    // "before the first transmit attempt" is an ORDER, and both halves of it are asserted: the
    // record exists, and the transport has not been touched. A spooler that transmits first and
    // records in the callback satisfies neither, and loses the job entirely on a crash in between —
    // which is the clause `03-F4` spends its second sentence on.
    expect(returned.state).toBe("queued");
    expect(returned.attempts).toBe(0);
    expect(recordOf(spooler, job.job_id).state).toBe("queued");
    expect(printer.calls()).toEqual([]);
    expect(printer.attempts()).toEqual([]);
  });

  it("carries `03-F5`'s two nouns onto the record — the printer and the order", () => {
    const { spooler } = rig();
    const job = kot({ printer_name: "grill printer", order_ref: "KOT #142" });

    spooler.enqueue(job);

    const record = recordOf(spooler, job.job_id);
    expect(record.printer_name).toBe("grill printer");
    expect(record.order_ref).toBe("KOT #142");
    expect(record.job_id).toBe(job.job_id);
  });

  it("lists every enqueued job, so a job can never be silently absent (03-F5)", () => {
    const { spooler } = rig();
    const first = kot();
    const second = kot();

    spooler.enqueue(first);
    spooler.enqueue(second);

    expect(spooler.jobs().map((record) => record.job_id)).toEqual([first.job_id, second.job_id]);
  });
});

describe("01-F17 — a sale is never blocked, not by printing", () => {
  it("enqueues synchronously: the confirm path has nothing to await", () => {
    const { spooler } = rig();

    const returned: unknown = spooler.enqueue(kot());

    expect(returned).not.toBeInstanceOf(Promise);
    expect(typeof (returned as { then?: unknown }).then).not.toBe("function");
  });

  it("accepts the next KOT while a printer that never answers still holds the first", () => {
    const { printer, spooler } = rig();
    const first = kot();
    const second = kot();
    printer.hang();

    spooler.enqueue(first);
    // Deliberately NOT awaited: the fake's `hang()` returns a promise that never settles, which is
    // a printer that is simply not there. If a sale had to wait on this, it would wait forever.
    void spooler.pump();
    const returned = spooler.enqueue(second);

    expect(returned.state).toBe("queued");
    expect(spooler.jobs()).toHaveLength(2);
    expect(recordOf(spooler, second.job_id).job_id).toBe(second.job_id);
  });
});

describe("03-F41 — a stall is the printer HOLDING the job, not dropping it", () => {
  it("reports `stalled` when the roll runs out — never `failed` (03-F10)", async () => {
    const { printer, spooler } = rig();
    const job = kot();
    spooler.enqueue(job);

    printer.pullRoll();
    await spooler.pump();

    // `03-F10`'s own words: "pull the roll mid-job and assert the spooler reports `stalled`".
    // `failed` here is not a wrong label, it is the duplicate-KOT defect's first move — `03-F41`
    // names the sequence: flip to `failed`, retry, double-print.
    expect(stateOf(spooler, job.job_id)).toBe("stalled");
  });

  it("THE TRAP: a stall then a recovery transmits EXACTLY ONE document", async () => {
    const { printer, spooler } = rig();
    const job = kot();
    spooler.enqueue(job);

    printer.pullRoll();
    await spooler.pump();
    expect(stateOf(spooler, job.job_id)).toBe("stalled");

    printer.loadRoll();
    // Five pumps — beyond `03-F4`'s whole 3-attempt budget, so a spooler that re-transmits on
    // recovery has every opportunity to do it.
    await pumpTimes(spooler, 5);

    // THE assertion. `received` is what the printer took and printed; two entries is the duplicate
    // KOT `03-F41` is written about, and the line cooks the dish twice. Zero is the dropped KOT and
    // the customer waits forever. A test that asserted only `state === "printed"` would pass
    // against the spooler that double-prints.
    expect(printer.received()).toHaveLength(1);
    // "never re-transmits", stated on the other array: one `send()` call in the whole scenario.
    expect(printer.attempts()).toHaveLength(1);
    // And not dropped: the held job is released once paper returns.
    expect(stateOf(spooler, job.job_id)).toBe("printed");
  });

  it("never spends the retry budget, however long the roll is out", async () => {
    const { printer, spooler } = rig();
    const job = kot();
    spooler.enqueue(job);

    printer.pullRoll();
    await spooler.pump();
    const after_first_stall = recordOf(spooler, job.job_id).attempts;

    await pumpTimes(spooler, 5);

    // See PIN 1: whether the stalled transmit itself counted is not decided here. What IS decided
    // is that no FURTHER budget is spent and that the budget is never exhausted by stalling — six
    // stalled pumps against a 3-attempt budget.
    expect(recordOf(spooler, job.job_id).attempts).toBe(after_first_stall);
    expect(after_first_stall).toBeLessThan(ATTEMPTS_PER_03_F4);
    expect(stateOf(spooler, job.job_id)).toBe("stalled");
    // "and never re-transmits": at most the one transmit that stalled, across all six pumps.
    expect(printer.attempts().length).toBeLessThanOrEqual(1);
  });

  it("keeps a stalled job out of `failed`, so `03-F5`'s alert is not raised on a held job", async () => {
    const { printer, spooler } = rig();
    const job = kot();
    spooler.enqueue(job);
    printer.pullRoll();

    await pumpTimes(spooler, 8);

    // `03-F5` fires "when retries exhaust". A stall that exhausts retries raises a false alarm AND
    // arms the double-print; `03-F41` forbids both with one sentence.
    expect(stateOf(spooler, job.job_id)).not.toBe("failed");
    expect(stateOf(spooler, job.job_id)).toBe("stalled");
  });
});

describe("03-F4 — retry with backoff on TRANSPORT failure, and the budget ends it", () => {
  it("retries a broken link within the budget and prints once", async () => {
    const { printer, spooler } = rig();
    const job = kot();
    spooler.enqueue(job);
    printer.failLink(2);

    await pumpTimes(spooler, 3);

    expect(printer.attempts()).toHaveLength(3);
    // The two link errors never reached the printer, so only one document was ever taken. This is
    // the counterpart to the stall test: retrying IS correct here, and the same "exactly one"
    // holds because the printer never received the failed ones.
    expect(printer.received()).toHaveLength(1);
    expect(stateOf(spooler, job.job_id)).toBe("printed");
  });

  it("leaves a retryable job non-terminal between attempts", async () => {
    const { printer, spooler } = rig();
    const job = kot();
    spooler.enqueue(job);
    printer.failLink(1);

    await spooler.pump();

    // See PIN 2: `03-F4` has no name for "waiting to retry", so the exact label is not asserted —
    // only that the job has not been given up on and has not been declared printed.
    const state = stateOf(spooler, job.job_id);
    expect(state).not.toBe("failed");
    expect(state).not.toBe("printed");
    expect(JOB_STATES_PER_03_F4).toContain(state);
  });

  it("stops at 3 attempts — there is no fourth transmit", async () => {
    const { printer, spooler } = rig();
    const job = kot();
    spooler.enqueue(job);
    printer.failLink(99);

    await pumpTimes(spooler, 6);

    expect(printer.attempts()).toHaveLength(ATTEMPTS_PER_03_F4);
    expect(printer.received()).toEqual([]);
    expect(recordOf(spooler, job.job_id).attempts).toBe(ATTEMPTS_PER_03_F4);
    expect(stateOf(spooler, job.job_id)).toBe("failed");
  });

  it("03-F5/03-F34: an exhausted job fails LOUDLY and still names the printer and the order", async () => {
    const { printer, spooler } = rig();
    const job = kot({ printer_name: "grill printer", order_ref: "KOT #142" });
    spooler.enqueue(job);
    printer.failLink(99);

    await pumpTimes(spooler, 6);

    const record = recordOf(spooler, job.job_id);
    // `03-F34`: a hard refusal, never a silent degradation. A job that reports `printed` after
    // three failures is the silent KOT failure `03-F5` forbids by name.
    expect(record.state).toBe("failed");
    // `03-F5`'s alert reads "KOT #142 did not print — grill printer offline". Both nouns have to
    // survive to whoever raises it (K-7), so both are on the terminal record.
    expect(record.printer_name).toBe("grill printer");
    expect(record.order_ref).toBe("KOT #142");
    // And it is still listed: a failed job that vanished from `jobs()` is a silent failure too.
    expect(spooler.jobs().map((entry) => entry.job_id)).toContain(job.job_id);
  });

  it("never re-transmits a terminal job", async () => {
    const { printer, spooler } = rig();
    const printed = kot();
    const failed = kot();
    spooler.enqueue(printed);
    await spooler.pump();
    expect(stateOf(spooler, printed.job_id)).toBe("printed");

    spooler.enqueue(failed);
    printer.failLink(99);
    await pumpTimes(spooler, 6);
    const after_terminal = printer.attempts().length;
    await pumpTimes(spooler, 3);

    // A `printed` job re-sent is the duplicate KOT by another route; a `failed` job re-sent past
    // its budget is `03-F4`'s "3 attempts" meaning nothing.
    expect(printer.attempts()).toHaveLength(after_terminal);
    expect(printer.received()).toHaveLength(1);
    expect(stateOf(spooler, printed.job_id)).toBe("printed");
    expect(stateOf(spooler, failed.job_id)).toBe("failed");
  });
});

describe("03-F42 — a document is rendered whole, buffered, and transmitted as ONE unit", () => {
  it("hands the WHOLE document to a single `send`", async () => {
    const { printer, spooler } = rig();
    const document = Uint8Array.from([0x1b, 0x40, 0x47, 0x52, 0x49, 0x4c, 0x4c, 0x0a, 0x1d, 0x56]);
    const job = kot({ document });
    spooler.enqueue(job);

    await spooler.pump();

    expect(printer.attempts()).toHaveLength(1);
    expect(printer.attempts()[0]).toEqual(document);
  });

  it("interleaves NO transport call inside a document, across a queue of three", async () => {
    const { printer, spooler } = rig();
    spooler.enqueue(kot());
    spooler.enqueue(kot());
    spooler.enqueue(kot());

    await pumpTimes(spooler, 4);

    // `03-F42`'s cost is physical: "if data is interrupted for two seconds or more, the printer
    // automatically feeds to the reserved cut position and cuts" — the ticket is cut in half. This
    // is asserted BY CONSTRUCTION rather than by clock (`24-F12`): anything the spooler does while
    // a `send()` is in flight is recorded, so a status poll, a second document on the same
    // transport, or an awaited anything inside the document shows up here as a call. The elapsed
    // time is never measured and never needs to be.
    expect(printer.callsDuringSend()).toEqual([]);
    expect(printer.received()).toHaveLength(3);
  });

  it("interleaves nothing even when the roll is out and a link is breaking", async () => {
    const { printer, spooler } = rig();
    spooler.enqueue(kot());
    spooler.enqueue(kot());
    printer.failLink(1);
    await spooler.pump();
    printer.pullRoll();
    await pumpTimes(spooler, 2);
    printer.loadRoll();
    await pumpTimes(spooler, 3);

    expect(printer.callsDuringSend()).toEqual([]);
  });

  it("never reaches for a partial-document member of the transport", async () => {
    const { printer, spooler } = rig();
    const job = kot();
    spooler.enqueue(job);
    printer.failLink(1);
    await spooler.pump();
    printer.pullRoll();
    await spooler.pump();
    printer.loadRoll();
    await pumpTimes(spooler, 3);

    // A DENYLIST, and the oracle surface says so: a second write path called something nobody
    // guessed would pass. It is the strongest thing available without an FR that closes the seam.
    expect(printer.calls().filter((name) => name !== "send" && name !== "status")).toEqual([]);
    for (const member of PARTIAL_DOCUMENT_MEMBERS) {
      expect(printer.calls()).not.toContain(member);
    }
  });

  it("ORACLE SELF-TEST: the partial-document spies exist and are loud (passes on the RED run)", () => {
    // Without this, "the spooler never called `write()`" is satisfied by a fake printer that has no
    // `write()` at all — a ban nobody can violate is a ban nobody is keeping. Round 2's pattern 2.
    const printer = createFakePrinter({ capability: caps() });
    const members = functionMembers(printer);

    for (const member of PARTIAL_DOCUMENT_MEMBERS) {
      expect(members).toContain(member);
    }
    const write = (printer as unknown as { write: () => void }).write;
    expect(typeof write).toBe("function");
    expect(() => {
      write();
    }).toThrow(/03-F42/);
    expect(printer.calls()).toContain("write");
  });
});

describe("03-F40 — the health check reads `DLE EOT 4`, never `GS r`", () => {
  it("queries with `DLE EOT 4` and carries no `GS r` opcode", () => {
    const query = printerHealthQuery(api);

    expect(query).toEqual(Uint8Array.from([0x10, 0x04, 0x04]));
    // The FR's physical claim is why: paper-end takes the printer OFFLINE, and an offline printer
    // "does not execute `GS r` at all" — so a health check built on it reports "paper present"
    // forever. `DLE` (0x10) is a real-time command and is answered while offline by design.
    expect(query[0]).toBe(0x10);
    for (let index = 0; index + 1 < query.length; index += 1) {
      expect([query[index], query[index + 1]]).not.toEqual([0x1d, 0x72]);
    }
  });

  it("uses K-3's landed query rather than a second copy of the same three bytes", () => {
    // Two copies that nothing ties together drift silently — the mistake K-3's own header records
    // making with `Transport`. One of the two copies being `GS r` is the whole of `03-F40`.
    expect(printerHealthQuery(api)).toEqual(escpos.PAPER_STATUS_QUERY);
  });

  it("ORACLE SELF-TEST: the `GS r` map calls a paper-out byte 'paper present' (passes on the RED run)", () => {
    // K-3's counter-example decoder, never the implementation's. Without demonstrating that the
    // wrong map is wrong ON THIS FIXTURE, "the health check agrees with `DLE EOT 4`" could be true
    // of a check that ignores its input.
    expect(decodeWithGsRMap(RESPONSE_PAPER_OUT).out).toBe(false);
  });

  it("refuses on paper-out", () => {
    expect(checkPrinterHealth(api, RESPONSE_PAPER_OUT, caps())).toEqual({
      ready: false,
      reason: "paper_out",
      near_end: false,
    });
  });

  it("refuses on silence — no answer is not health (03-F34)", () => {
    // The `GS r` defect's shape is a reading that can never become bad. A verdict that answers
    // `ready` to a printer that said nothing has the same shape by a different route, and `03-F34`
    // wants the refusal loud.
    //
    // PIN 7: what `near_end` reads on a printer that answered NOTHING is not stated by `03-F40` and
    // is not asserted. Both `false` and `"unsupported"` are defensible for "there is no reading",
    // and picking one here would red a correct implementation that picked the other.
    const health = checkPrinterHealth(api, null, caps());
    expect(health.ready).toBe(false);
    expect(health.reason).toBe("no_response");
  });

  it("is ready when the roll is present", () => {
    expect(checkPrinterHealth(api, RESPONSE_PAPER_PRESENT, caps())).toEqual({
      ready: true,
      reason: null,
      near_end: false,
    });
  });

  it("warns on near-end without stopping the sale (01-F17)", () => {
    // Declared interpretation, see PIN 6 and the oracle surface: a roll near its end is still
    // feeding, so refusing to print on it stops service for a condition that has not happened.
    expect(checkPrinterHealth(api, RESPONSE_NEAR_END, caps())).toEqual({
      ready: true,
      reason: null,
      near_end: true,
    });
  });

  it("reports `unsupported` near-end on a model with no sensor — never `false`", () => {
    const without = caps({ has_near_end_sensor: false });

    // A `false` that can never become `true` is `03-F40`'s own defect wearing a different name.
    expect(checkPrinterHealth(api, RESPONSE_PAPER_PRESENT, without).near_end).toBe("unsupported");
    // And the gate covers only near-end: paper-out is universal and still refuses.
    expect(checkPrinterHealth(api, RESPONSE_PAPER_OUT, without)).toEqual({
      ready: false,
      reason: "paper_out",
      near_end: "unsupported",
    });
  });
});

describe("03-F4 — the state machine is WALKED, not decorated", () => {
  it("holds the job in `transmitting` while the document is in flight", async () => {
    const printer = createFakePrinter({ capability: caps() });
    const job = kot();
    const seen: (JobState | undefined)[] = [];
    let spooler: Spooler | undefined;
    const transport: SpoolerTransport = {
      send: async (document) => {
        seen.push(spooler?.job(job.job_id)?.state);
        return printer.send(document);
      },
      status: async () => printer.status(),
    };

    const built = createSpooler(api, { transport });
    spooler = built;
    built.enqueue(job);
    await built.pump();

    // `03-F4` names five states and a state no job ever occupies is a state that does not exist.
    // This is also the state a crash must be recoverable FROM — "a crash or power loss mid-print
    // resumes or reprints the job on restart" is a sentence about a job that was `transmitting`.
    expect(seen).toEqual(["transmitting"]);
  });

  it("reaches every one of the five — the list is not vacuous", async () => {
    const seen = new Set<JobState>();
    const note = (state: JobState | undefined): void => {
      if (state !== undefined) seen.add(state);
    };

    const printer = createFakePrinter({ capability: caps() });
    const printedJob = kot();
    let observed: Spooler | undefined;
    const transport: SpoolerTransport = {
      send: async (document) => {
        note(observed?.job(printedJob.job_id)?.state);
        return printer.send(document);
      },
      status: async () => printer.status(),
    };
    const built = createSpooler(api, { transport });
    observed = built;
    note(built.enqueue(printedJob).state);
    await built.pump();
    note(stateOf(built, printedJob.job_id));

    const held = rig();
    const stalledJob = kot();
    held.spooler.enqueue(stalledJob);
    held.printer.pullRoll();
    await held.spooler.pump();
    note(stateOf(held.spooler, stalledJob.job_id));

    const dead = rig();
    const failedJob = kot();
    dead.spooler.enqueue(failedJob);
    dead.printer.failLink(99);
    await pumpTimes(dead.spooler, 6);
    note(stateOf(dead.spooler, failedJob.job_id));

    expect([...seen].sort()).toEqual([...JOB_STATES_PER_03_F4].sort());
  });
});

// ── DEFERRED: what this suite could NOT assert, and who owns it ──────────────────────────────────
//
// * **`03-F4`'s CRASH/RESTART CLAUSE IS NOT ASSERTED BY THIS FILE — see `spooler-durability.
//   test.ts`, which now does.** "every print job is persisted (SQLite, WAL) … a crash or power loss
//   mid-print resumes or reprints the job on restart — never drops it" is half of this FR and
//   NOTHING below observes it: when this suite was written `SpoolerOptions` declared one member,
//   `transport`, so there was no store seam to hand a second spooler the first one's rows and
//   "persisted" could be asserted only as an ORDER (recorded before the transport is touched),
//   never as durability. A later session added `SpoolerJobStore` to the oracle surface and the
//   restart tests beside it; the report on that gap stands unchanged for THIS file, and it was
//   measured — a spooler holding its jobs in a `Map` still passes all 32 tests here. What is still
//   open either way is the ENGINE: `03-F4` names SQLite/WAL and a seam the host supplies cannot
//   show it, so `18 §4`'s shared durable-local-queue (one implementation with `01-F8` and `16-F11`)
//   remains where that clause becomes testable.
// * **THE BACKOFF SCHEDULE IS NOT ASSERTED.** `03-F4` says "3 attempts over 30 s". The budget is
//   asserted exactly; the SPACING is not asserted at all, because the oracle surface's `pump()`
//   puts the clock in the caller and `24-F12` bans the flaky timing test that would follow. Whoever
//   builds K-7 owns the schedule, and it is untested until something drives it.
// * **`03-F5`'s ALERT IS NOT RAISED HERE AND IS NOT OBSERVED HERE.** This suite asserts that an
//   exhausted job lands in `failed` carrying the printer name and the order ref. Whether a
//   full-screen banner and a repeating sound actually appear on the counter within 45 s of confirm
//   is K-7's and `packages/ui`'s, and no assertion below is evidence for it.
// * **`03-F42`'s 2-SECOND NUMBER IS NEVER MEASURED.** The FR's mechanism is a firmware timeout —
//   "if data is interrupted for two seconds or more, the printer automatically feeds to the
//   reserved cut position and cuts". Nothing here waits two seconds or could. The rule is enforced
//   structurally (one document, one argument, one call, nothing interleaved) and that is a
//   statement about the spooler's control flow, never about a printer's timer.
// * **`03-F10`'s RIG STEP IS OWED IN FULL (K-8).** "Pull the roll mid-job … then assert reloading
//   prints the job EXACTLY ONCE" is a hardware procedure. `THE TRAP` above runs the SOFTWARE shape
//   of it against a fake printer whose holding behaviour is the oracle's model of firmware, not
//   firmware. The two have already disagreed once in this FR's own history — that is what `GS r`
//   is — so no line of this file may be read as having pulled a roll.
// * **PAPER-OUT ARRIVING MID-DOCUMENT.** `03-F42` makes a document one transmitted unit, so the
//   software model has no state between "sent" and "not sent". A roll that runs out halfway through
//   the bytes is the rig's, and `03-F41`'s "stops after the current printing completes" is a
//   firmware sentence nothing here can check.
// * **`DLE ENQ n=2` HAS NO OBSERVED CALLER.** K-3 landed the bytes and recorded that `03-F41` never
//   says who sends them or when. It is still true: no test below drives a recoverable/cutter error,
//   because the fake printer has no such condition and the FR gives no policy to assert. Round 2's
//   pattern 4 ("correct in isolation, unconnected in fact"), named rather than left to be found.
// * **THE 4-QUERY CAP IS STILL UNCONNECTED.** K-3 named this and it has not changed: the health
//   check here is a pure function over one response byte and does not go through
//   `createRealtimeQueryWindow`. Whoever writes the real transport owns tying them together.
// * **`03-F41`'s LINK ERROR *DURING* A PAPER-OUT.** K-3 refused to decide it and so does this
//   suite: no scenario below sets `failLink` and `pullRoll` simultaneously. The two answers have
//   different costs — a wrongly-classified stall double-prints, a wrongly-classified failure loses
//   the alert — and the FR chooses neither.
// * **NOTHING HERE ENFORCES `18 §10`'s "DIRECT TRANSPORT WRITES FROM APP CODE ARE BANNED".** That
//   is a discipline scan over app code and it belongs with K-7, where an app first has a transport
//   it could reach around. A scan run today would find nothing, report green, and mean nothing.
