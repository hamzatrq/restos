// Acceptance tests — K-6, `03-F4`'s OTHER half: **durability**. The clause `spooler.test.ts` could
// not reach, and said so twice.
//
// PROVENANCE, stated plainly (`24 §3` step 2): this file was written by a later session than
// `spooler.test.ts`, against the same spec text and still with no K-6 implementation in existence —
// `@restos/escpos` exports no spooler today and this suite is committed RED alongside its sibling.
// It exists because that sibling reported a hole in its own coverage, in its PIN 4 and again in its
// DEFERRED block, in these words:
//
//   "`SpoolerOptions` declares one member, `transport`; there is no store seam … so 'persisted' is
//   asserted only as an ORDER (recorded before the transport is touched) and never as durability.
//   This is a REAL GAP, not a covered one: **a spooler holding its jobs in a `Map` passes every
//   test in this file and loses the kitchen's tickets on a power cut.**"
//
// The FR it is a hole in names both the storage and the crash behaviour, so closing it is
// transcription, not design:
//
//   `03-F4`  — "Durable spooler: every print job is **persisted (SQLite, WAL)** with an explicit
//              state machine (`queued → transmitting → stalled? → printed | failed`) **before the
//              first transmit attempt**; **a crash or power loss mid-print resumes or reprints the
//              job on restart — never drops it.** Retry with backoff (default 3 attempts over 30 s)
//              on transport failure. (Instance of the canonical durable-local-queue pattern,
//              18 §4 — one implementation shared with the sync outbox 01-F8 and fiscal queue
//              16-F11.)"
//   `03-F41` — "a stalled printer is holding the job, not dropping it — so `03-F4`'s retry must not
//              fire … a stall never counts toward the 3-attempt budget and never re-transmits. A
//              timeout that flips a stall to `failed` and retries **double-prints the instant the
//              roll is loaded** — a duplicate KOT is a real kitchen error, not a cosmetic one."
//   `03-F5`  — silent KOT failure is forbidden; the alert names "the printer and order".
//   `01-F17` — a sale is NEVER blocked.
// `packages/sync-client/src/pin-attempts.ts` and its `pin-attempt-persistence.test.ts` were read as
// the repo's PRECEDENT for durable state behind a narrow seam (`openStore` → act → `close` →
// `openStore`, against a real file, because an in-memory database cannot fail that test). No K-6
// implementation was read; none exists.
//
// ── NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER, AND NOT ONE CUT POWER. ──
//
// Every "power cut" below is `store.close()` — an object after which writes stop reaching a file —
// and every "restart" is a second `openJobStore` over the same path plus a second `createSpooler`.
// Nothing here kills a process, pulls a plug, or writes to a printer. `03-F10`'s rig step and the
// physical crash pass are owed in full (K-8); no test name may be read as a measurement of either.
//
// ── WHAT THIS SUITE IS FOR, IN ONE SENTENCE ──
//
// The `Map`-backed spooler. It is a real, plausible, passing-everything implementation — it walks
// `03-F4`'s five states, honours `03-F41`'s stall, transmits whole documents, spends exactly three
// attempts — and at 02:40 when the branch loses power it loses every ticket the kitchen had not yet
// cooked. Every test below is written to be the one a `Map` cannot pass, and that was measured, not
// hoped: see the mutation record in this file's closing block.
//
// ── WHAT IS GREEN ON THE RED RUN, AND WHY (stated so the count is not read as coverage) ──
//
// TWO oracle self-tests pass on the RED run and neither observes a K-6 export. They exist because
// this whole suite rests on `openJobStore` being genuinely durable: if it quietly shared state
// between handles, "survives a restart" would be theatre and every assertion below would be
// satisfied by a store nothing was ever written through.
//
// ── FR AMBIGUITIES, PINNED RATHER THAN FILLED ──
//
//  1. **PIN — "resumes OR reprints" is the FR's own disjunction and nothing here picks one.**
//     `03-F4` permits either after a crash. In this software model they are not even
//     distinguishable at the transport (`03-F42` makes a document ONE `send`, so "resume from where
//     it stopped" and "send it again" are the same call), so what is asserted is what both readings
//     SHARE: the job is still there, it is NOT terminal, and pumping gets the document to the
//     printer exactly once. The label a restored job wears is never asserted for this case.
//  2. **PIN — the label a restored STALLED job wears BEFORE the first pump is not stated.** A
//     spooler that restores `stalled` from the row and one that restores it as non-terminal and
//     re-derives the stall from the next `status()` poll are both defensible, and both keep the
//     kitchen safe. What `03-F41` decides — and what is asserted — is that it is never `failed` and
//     that the printer is never sent to a second time.
//  3. **PIN — whether a `failed` job gets a FRESH budget after a restart is not asserted.**
//     `03-F4` gives 3 attempts and does not say whether a relaunch resets them. Unlike the printed
//     and stalled cases there is no duplicate-KOT hazard either way (the printer never took those
//     bytes), so both readings are safe and picking one here would red a correct implementation.
//  4. **PIN — the storage ENGINE is not asserted; the durability is.** `03-F4` says "SQLite, WAL".
//     The moment the store is a seam the host supplies, the engine stops being observable from this
//     package — see the declared interpretation on `openJobStore`. `18 §4`'s shared implementation
//     is where that clause is testable.
//  5. **PIN — `SpoolerOptions.store` is OPTIONAL and no test can catch a host that omits it.**
//     Inherited deliberately from `pin-attempt-persistence.test.ts`, which records the identical
//     hole against `createPinSession`'s `attempts` argument. K-7 is the first caller that could be
//     asserted on; there is none today.
//  6. **PIN — fsync, torn writes and WAL recovery are NOT modelled.** `openJobStore` writes a whole
//     file synchronously; a real power cut can leave a half-written one. That is the storage
//     engine's problem, it is the reason `03-F4` names WAL, and it belongs to `18 §4`.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as escpos from "../index.js";
import {
  createFakePrinter,
  createSpooler,
  type EscposK6Api,
  type FakePrinter,
  JOB_STATES_PER_03_F4,
  type JobState,
  type OpenJobStore,
  openJobStore,
  type PrintJob,
  type Spooler,
  type SpoolerTransport,
} from "./spooler-oracle-surface.js";
import type { PrinterCapabilityWithSensors } from "./transport-oracle-surface.js";

const api = escpos as unknown as EscposK6Api;

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

/** A KOT, carrying `03-F5`'s two nouns and the FR's own example strings. */
const kot = (over: Partial<PrintJob> = {}): PrintJob => {
  job_seq += 1;
  return {
    job_id: `k6-durable-${job_seq}`,
    document: Uint8Array.from([0x1b, 0x40, 0x4b, 0x4f, 0x54, 0x20, 0x23, 0x31, 0x34, 0x32, 0x0a]),
    printer_name: "grill printer",
    order_ref: "KOT #142",
    ...over,
  };
};

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

/**
 * A REAL path on a REAL filesystem — the whole property is that the rows outlive the object that
 * wrote them, and a store that never left memory cannot fail these tests.
 */
const spoolPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "restos-k6-spool-"));
  dirs.push(dir);
  return join(dir, "spool.db");
};

/**
 * One launch of the app: open the store off the disk, and build a spooler over it exactly as a host
 * must. `store` IS THE LINE UNDER TEST — omit it and the spooler is free to keep the kitchen's
 * tickets in a `Map` (see PIN 5).
 */
const launch = (path: string, transport: SpoolerTransport): [OpenJobStore, Spooler] => {
  const store = openJobStore(path);
  return [store, createSpooler(api, { transport, store })];
};

const recordOf = (spooler: Spooler, job_id: string) => {
  const record = spooler.job(job_id);
  if (record === undefined) {
    throw new Error(
      `03-F4: job ${job_id} did not survive the restart — a persisted job is resumed or reprinted, never dropped`,
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

/**
 * The printer OUTLIVES the host crash, and every scenario below reuses one.
 *
 * That is not a convenience, it is the whole of `03-F41`: the printer is a separate device on
 * separate power that "goes offline and **holds** until the roll is replaced". A test that handed
 * the restarted spooler a fresh printer would have quietly reset the one piece of state the
 * duplicate KOT is counted on — `received()` — and the double-print would become invisible again.
 */
const printerRig = (over: Partial<PrinterCapabilityWithSensors> = {}): FakePrinter =>
  createFakePrinter({ capability: caps(over) });

describe("ORACLE SELF-TESTS — the restart below is real (both pass on the RED run)", () => {
  it("puts BYTES ON DISK: a second handle reads back what the first one wrote", () => {
    const path = spoolPath();
    const first = openJobStore(path);

    first.put({
      job_id: "self-test-1",
      state: "queued",
      attempts: 0,
      printer_name: "grill printer",
      order_ref: "KOT #142",
      document: Uint8Array.from([0x1b, 0x40, 0x41]),
    });
    first.close();

    // The file itself, not the object: if `openJobStore` kept a module-level cache keyed by path,
    // every "survives a restart" assertion in this file would be satisfied by a store nothing was
    // ever written through — vacuous in exactly the way round 2's pattern 2 describes.
    expect(readFileSync(path, "utf8")).toContain("self-test-1");

    const second = openJobStore(path);
    const rows = second.load();
    expect(rows.map((row) => row.job_id)).toEqual(["self-test-1"]);
    expect(rows[0]?.document).toEqual(Uint8Array.from([0x1b, 0x40, 0x41]));
    expect(rows[0]?.state).toBe("queued");
  });

  it("stops taking writes once the power is cut, so an abandoned spooler cannot cheat", () => {
    const path = spoolPath();
    const first = openJobStore(path);
    const row = {
      job_id: "self-test-2",
      state: "queued" as const,
      attempts: 0,
      printer_name: "grill printer",
      order_ref: "KOT #142",
      document: Uint8Array.from([0x1b, 0x40]),
    };

    first.close();
    first.put(row);

    // A power cut that still accepted writes would let a spooler that persists LATE look durable:
    // its write would land after the crash and the "restart" would find it. Dropped, not thrown —
    // a process that has lost power does not get to observe an error.
    expect(first.droppedWrites()).toBe(1);
    expect(openJobStore(path).load()).toEqual([]);
  });
});

describe("03-F4 — persisted BEFORE the first transmit attempt, on the disk and not just in order", () => {
  it("has the row on disk by the time the FIRST `send` begins", async () => {
    const path = spoolPath();
    const printer = printerRig();
    let on_disk: readonly string[] = [];
    // A SECOND handle, opened from inside the transmit and reading the file fresh. It observes the
    // disk at the one instant `03-F4` legislates about — "before the first transmit attempt" — and
    // a spooler that records in the send's callback has written nothing at this line.
    const transport: SpoolerTransport = {
      send: async (document) => {
        on_disk = openJobStore(path)
          .load()
          .map((row) => row.job_id);
        return printer.send(document);
      },
      status: async () => printer.status(),
    };
    const [, spooler] = launch(path, transport);
    const job = kot();

    spooler.enqueue(job);
    await spooler.pump();

    expect(on_disk).toContain(job.job_id);
    // PIN: WHICH state is on the row at that instant is not asserted — `queued` and `transmitting`
    // are both defensible readings of an in-flight document and `03-F4` names neither.
    expect(printer.received()).toHaveLength(1);
  });

  it("keeps the whole document, so the ticket can be reprinted at all", async () => {
    const path = spoolPath();
    const printer = printerRig();
    // A document with structure, so a row that stored a length, a hash or an empty array is caught.
    const document = Uint8Array.from([0x1b, 0x40, 0x47, 0x52, 0x49, 0x4c, 0x4c, 0x0a, 0x1d, 0x56]);
    const job = kot({ document });

    const [first, spooler] = launch(path, printer);
    spooler.enqueue(job);
    first.close();

    // `03-F4`'s "reprints the job on restart" is impossible for a store that kept the metadata and
    // dropped the bytes: the state machine survives, the ticket does not, and the kitchen gets a
    // record of a KOT nobody can print.
    const [, restarted] = launch(path, printer);
    await pumpTimes(restarted, 3);

    expect(printer.attempts()).toHaveLength(1);
    expect(printer.attempts()[0]).toEqual(document);
  });
});

describe("03-F4 — a crash or power loss resumes or reprints the job — NEVER drops it", () => {
  it("prints a job that was enqueued and never pumped when the power went", async () => {
    const path = spoolPath();
    const printer = printerRig();
    const job = kot();

    const [first, spooler] = launch(path, printer);
    spooler.enqueue(job);
    expect(recordOf(spooler, job.job_id).state).toBe("queued");
    // The power cut. The confirm returned, the cashier walked away, the ticket had not gone yet —
    // which is the ordinary case, not the exotic one: `03-F4` records the job before it transmits
    // precisely so that this window is survivable.
    first.close();

    const [, restarted] = launch(path, printer);
    // Present at all. A `Map`-backed spooler has already lost here, before a single assertion about
    // what state the job is in.
    expect(restarted.jobs().map((record) => record.job_id)).toContain(job.job_id);

    await pumpTimes(restarted, 3);

    expect(printer.received()).toHaveLength(1);
    expect(printer.attempts()).toHaveLength(1);
    expect(stateOf(restarted, job.job_id)).toBe("printed");
  });

  it("brings a job cut off MID-TRANSMIT back non-terminal, and gets it to the printer", async () => {
    const path = spoolPath();
    const printer = printerRig();
    const job = kot();

    const [first, spooler] = launch(path, printer);
    spooler.enqueue(job);
    printer.hang();
    // Deliberately NOT awaited: the document is in flight and will never resolve. This is the FR's
    // own words — "a crash or power loss **mid-print**" — and the state the sibling suite proves a
    // job occupies while its bytes are on the wire.
    void spooler.pump();
    first.close();

    const [, restarted] = launch(path, printer);
    const restored = recordOf(restarted, job.job_id);

    // See PIN 1: `03-F4` permits "resumes OR reprints" and this asserts only what both readings
    // share. `printed` would be the silent KOT failure `03-F5` forbids by name — the ticket never
    // reached paper. `failed` would be "drops it", which the FR forbids in the same sentence.
    expect(JOB_STATES_PER_03_F4).toContain(restored.state);
    expect(restored.state).not.toBe("printed");
    expect(restored.state).not.toBe("failed");

    await pumpTimes(restarted, 3);

    // The hung transmit never reached the printer (the fake records it in `attempts`, never in
    // `received`), so the recovered job is the only document the kitchen ever gets.
    expect(printer.received()).toHaveLength(1);
    expect(stateOf(restarted, job.job_id)).toBe("printed");
  });

  it("carries `03-F5`'s two nouns through the restart — the printer and the order", () => {
    const path = spoolPath();
    const printer = printerRig();
    const job = kot({ printer_name: "grill printer", order_ref: "KOT #142" });

    const [first, spooler] = launch(path, printer);
    spooler.enqueue(job);
    first.close();

    // `03-F5`'s alert reads "KOT #142 did not print — grill printer offline". A restart that
    // recovers the bytes and loses the nouns can still raise an alert nobody can act on, which is
    // the silent KOT failure wearing a name badge.
    const [, restarted] = launch(path, printer);
    const record = recordOf(restarted, job.job_id);
    expect(record.printer_name).toBe("grill printer");
    expect(record.order_ref).toBe("KOT #142");
  });
});

describe("03-F41 — a power cut must not become the duplicate KOT", () => {
  it("does not print a job again that had already PRINTED before the crash", async () => {
    const path = spoolPath();
    const printer = printerRig();
    const job = kot();

    const [first, spooler] = launch(path, printer);
    spooler.enqueue(job);
    await spooler.pump();
    expect(stateOf(spooler, job.job_id)).toBe("printed");
    expect(printer.received()).toHaveLength(1);
    first.close();

    // The restart. A spooler that persists its jobs but not their STATE brings this one back as
    // `queued` and cooks the dish twice — `03-F41`'s duplicate KOT, arriving through the crash
    // clause instead of through the stall. The ticket is already on the spike in the kitchen.
    const [, restarted] = launch(path, printer);
    expect(stateOf(restarted, job.job_id)).toBe("printed");

    await pumpTimes(restarted, 5);

    expect(printer.received()).toHaveLength(1);
    expect(printer.attempts()).toHaveLength(1);
  });

  it("brings a STALLED job back held — never demoted to `failed`, never re-transmitted", async () => {
    const path = spoolPath();
    const printer = printerRig();
    const job = kot();

    const [first, spooler] = launch(path, printer);
    spooler.enqueue(job);
    printer.pullRoll();
    await spooler.pump();
    expect(stateOf(spooler, job.job_id)).toBe("stalled");
    first.close();

    // The roll is STILL out — the printer did not get its paper back while the host was down, and
    // it is still holding the bytes it took.
    const [, restarted] = launch(path, printer);
    const restored = recordOf(restarted, job.job_id);

    // See PIN 2: the label before the first poll is not asserted. `failed` is, and that is
    // `03-F41`'s named sequence in its first move — "a timeout that flips a stall to `failed` and
    // retries double-prints the instant the roll is loaded".
    expect(restored.state).not.toBe("failed");
    expect(restored.state).not.toBe("printed");

    await pumpTimes(restarted, 5);

    expect(stateOf(restarted, job.job_id)).toBe("stalled");
    // "and never re-transmits" — across a power cut and five pumps, the one transmit that stalled.
    expect(printer.attempts()).toHaveLength(1);
    expect(recordOf(restarted, job.job_id).attempts).toBeLessThan(3);
  });

  it("THE TRAP, with a power cut in the middle: stall → crash → reload prints EXACTLY ONCE", async () => {
    const path = spoolPath();
    const printer = printerRig();
    const job = kot();

    const [first, spooler] = launch(path, printer);
    spooler.enqueue(job);
    printer.pullRoll();
    await spooler.pump();
    expect(stateOf(spooler, job.job_id)).toBe("stalled");
    first.close();

    const [, restarted] = launch(path, printer);
    printer.loadRoll();
    // Beyond `03-F4`'s whole 3-attempt budget, so a spooler that re-transmits after the restart has
    // every opportunity to do it.
    await pumpTimes(restarted, 5);

    // THE assertion, and it is the sibling suite's TRAP with a crash inserted at the worst moment.
    // Two entries is the duplicate KOT: the printer was holding the first copy across the whole
    // outage and prints both the instant paper returns, so the line cooks the dish twice. Zero is
    // the dropped ticket and the customer waits forever.
    expect(printer.received()).toHaveLength(1);
    expect(printer.attempts()).toHaveLength(1);
    expect(stateOf(restarted, job.job_id)).toBe("printed");
  });
});

// ── DEFERRED: what this suite could NOT assert, and who owns it ──────────────────────────────────
//
// * **THE STORAGE ENGINE.** `03-F4` says "SQLite, WAL"; the seam makes the engine the host's and
//   only the durability observable here (PIN 4). `18 §4`'s shared durable-local-queue — one
//   implementation with `01-F8` and `16-F11` — is where that clause can be a test.
// * **TORN WRITES, fsync AND WAL RECOVERY (PIN 6).** `openJobStore` writes a whole file
//   synchronously. A real power cut can land inside that write, and nothing here models it. This is
//   the reason the FR names WAL and it is `18 §4`'s to prove.
// * **A HOST THAT FORGETS `store` (PIN 5).** `SpoolerOptions.store` is optional, so a spooler
//   constructed without it may keep the kitchen's tickets in a `Map` and no test anywhere goes red.
//   Identical in shape to the hole `pin-attempt-persistence.test.ts` records against
//   `createPinSession`'s `attempts`; K-7 is the first caller that could be asserted on.
// * **THE PHYSICAL CRASH PASS IS OWED IN FULL (K-8).** Every "power cut" here is `store.close()`.
//   Nothing below kills a process, and a process killed mid-`writeFileSync` is a different event
//   from an object that stopped accepting writes. `03-F10`'s rig owns the real one.
// * **CONCURRENT HANDLES.** Two spoolers open over one path is not tested and not specified: the
//   FR describes one host device with one spool. A second one would be a design question for
//   `18 §4`, not a gap in `03-F4`.
// * **WHETHER A `failed` JOB GETS A FRESH BUDGET AFTER A RESTART (PIN 3).** Unasserted on purpose:
//   `03-F4` does not say, and unlike the printed and stalled cases neither reading double-prints.
//
// ── THE MUTATION RECORD (`24 §3`'s bar — measured, not hoped) ────────────────────────────────────
//
// A plausible K-6 spooler was built OUT OF TREE (a scratchpad copy of this package; nothing in-tree
// was implemented, and the copy is gone) and taken green against `spooler.test.ts` AND this file —
// 42/42 — as the CONTROL. Each row below differs from that control in exactly ONE branch, and the
// counts are the measured ones:
//
//   CONTROL   correct spooler .......................... 42 pass  ( 0 fail)
//   MUTANT A  jobs held in a `Map`; the store is
//             never touched ............................ 34 pass  ( 8 fail)
//   MUTANT B  the row is written only AFTER
//             `transport.send` resolves ................ 37 pass  ( 5 fail)
//   MUTANT C  restart replays every row as `queued` .... 39 pass  ( 3 fail)
//   MUTANT D  restart demotes a restored `stalled` row
//             to `queued` and re-transmits it .......... 40 pass  ( 2 fail)
//   VARIANT   restores a `stalled` row as non-terminal
//             and re-derives the stall from the next
//             `status()` poll — the OTHER defensible
//             reading of PIN 2 ......................... 42 pass  ( 0 fail)
//
// MUTANT A is the defect this file exists for, and its row is the finding: **all 32 of
// `spooler.test.ts`'s tests pass against it**, and the only 8 that fail are the 8 assertions below
// that touch a restart. (The other two here are the oracle self-tests, which observe no spooler and
// are declared above as passing on the RED run.) The `Map` spooler is now distinguishable from a
// correct one, and it was not before.
//
// MUTANT B kills the first five — "before the first transmit attempt" as durability rather than as
// ordering. MUTANT C kills the three `03-F41` tests, MUTANT D only the two stall ones. Kill counts
// that shrink as the mutation narrows is what attribution looks like; a mutation that killed
// everything would have proved nothing about which assertion was load-bearing.
//
// The VARIANT is the row that matters most in the other direction: a test that stays RED under a
// CORRECT implementation is as damaging as a vacuous one, and PIN 2 names a second defensible
// reading of a restored stall. It passes 42/42. Nothing here pins the label — only that a held job
// is never `failed` and never re-transmitted.
