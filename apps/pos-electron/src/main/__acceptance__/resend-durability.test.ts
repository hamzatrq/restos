// ACCEPTANCE TESTS — `03-F57`: a kitchen ticket that failed and was never re-sent is still
// re-sendable after the device restarts.
//
// PROVENANCE (`24 §3` step 2): **authored by a session that implemented none of it.** `03-F57` was
// written first (commandment 9 — the property had no covering FR; `03-F4`'s crash clause is about
// the spool RESUMING and says nothing about a human's recovery), and this file was written from it.
// `main/printing.ts` as it stands today WAS read, because the FR is written about a measured defect
// in it. Nothing outside `__acceptance__/` and `specs/03` was changed; every assertion in §B is RED
// on purpose.
//
// ── THE DEFECT, AS MEASURED ON THE RUNNING TILL (second dress rehearsal, August 2026) ────────
//
// `main/printing.ts:425` holds the raised bands in `const raised = new Map(...)` — process
// lifetime — and `:811` opens `resend` with `if (!raised.has(alarm_id)) return;`. The KOT printer
// seeds nothing from the spool at construction (deliberately: `reconcile(before)` takes its
// baseline from `spooler.jobs()` at the top of every `pump()`, so a restored terminal row differs
// from nothing and raises nothing — which is the fix that stopped staff arriving to yesterday's
// alarms). So after a relaunch the durable spool still holds the `failed` job, its bytes and its
// `03-F55` coverage, and **the only control that could reach it is gone, silently and for ever.**
//
// A power cut is precisely the event `03-F4`'s storage clause and `ops/startup/*.bat`'s `:loop`
// exist to survive. What it produced instead: a billed order the kitchen never heard about, with
// no second chance and nothing on the glass admitting it.
//
// ── THE SPEC TEXT THIS FILE IS WRITTEN FROM ──────────────────────────────────────────────────
//
//   03-F57  "A job whose state is `failed`, whose bytes are on `03-F4`'s durable row, and which no
//           later attempt has driven to `printed`, is re-sendable … What may not decide it is
//           whether this process happens to be holding a band."
//   03-F57  "a restart must send no bytes on its own account"; and "a restart appends no second
//           `kot.print_failed` for a failure that already has one".
//   03-F4   persisted before the first transmit attempt; a crash "resumes or reprints the job on
//           restart — never drops it".
//   03-F5   "Silent KOT failure is forbidden"; the alert repeats until acknowledged.
//   03-F41  a stall is not a failure, and "a duplicate KOT is a real kitchen error, not a cosmetic
//           one" — so `printed` and `stalled` stay refused after a restart exactly as before one.
//   03-F44  "the paper is not the record, so reprinting is always safe" — why this is safe rather
//           than generous.
//   03-F37  a reprint is a named fraud vector: the paper must say REPRINT.
//   03-F55  the resent chit keeps its ordinal and its coverage — it is the SAME chit.
//   01-F1   every `kot.print_failed` row is permanent; `15-F14` pages support on their rate.
//
// ── WHAT THIS FILE PINS THAT THE FR DOES NOT — declared, not discovered (`24 §3b`) ───────────
//
//  1. **The act is reached through `KotPrinter.resend(alarm_id)`, with the DURABLE job's own
//     `job_id` as the handle.** That is the shipped seam (`shared/ipc.ts`'s `CHANNELS.resendPrint`
//     calls it) and the job id is the only identifier that survives a restart at all — the band
//     that normally carries it does not. This file therefore says nothing about how an operator
//     REACHES the control after a relaunch: `03-F57` (c) leaves that to `03-F48`'s order-list
//     reprint and records it as owed. **A fix that makes `resend` eligible but gives the cashier
//     no button has closed half the defect, and this suite cannot tell the difference.**
//  2. **Nothing about the BAND at launch.** `03-F57` (a) leaves it open on purpose and
//     `kot-printing.test.ts`'s DEFERRED block already records why both directions need an FR that
//     does not exist (acknowledgement is persisted nowhere, so re-raising everything produces a
//     band staff cannot clear). §C asserts only what is resolved: a restart does not re-emit a
//     ledger row for a failure that already has one, and does not transmit on its own account.
//     **No assertion below requires a band to come back, and none forbids one** — an
//     implementation that re-raises today's failures and one that raises none both pass §A–§C.
//
// ── MUTATION MATRIX (the round-3 law: report the numbers, do not claim the tests bite) ───────
//
// Run OUT OF TREE — a scratchpad copy of this app with `node_modules` symlinked — because this
// session authored the tests and edits no implementation. The **CONTROL is a plausible fix in one
// branch**: `resend`'s ownership test reads the DURABLE spool (`spooler.job(alarm_id)`, with the
// `cash::`/`receipt::` deny-list `reconcile` already uses) instead of `raised.has(alarm_id)`.
// Both new suites (13 + 17 = 30 assertions) ran under every mutant.
//
//   CONTROL (a plausible fix)                                   30/30 PASS   killed: none
//   S1  the shipped gate restored — THE DEFECT VERBATIM         25/30        killed: §B1 §B2 §B3 §B7 §B8
//   S5  "the job exists, so send it" — every state gate dropped 28/30        killed: §B4 §B5
//   S6a the band re-raised at launch, NO event                  30/30 PASS   killed: none
//   S6b …the same, and it re-emits `kot.print_failed` too       28/30        killed: §C2 (+§B8 collaterally)
//   S7  a launch re-transmits terminal failed jobs by itself    25/30        killed: §C1 §C2 (+§A3 §B1 §B2)
//   S8  NEGATIVE CONTROL — a real refactor                      30/30 PASS   killed: none
//
// **CONTROL 30/30 is the number that matters most**: a correct implementation is not blocked.
// **S6a is the row this file was shaped around** — the alternative fix that re-raises bands at
// launch passes everything, so pin 2 is enforced by measurement and not by intention, and nothing
// here drags back the behaviour a previous fix deliberately removed. **S6b is its twin and the
// only thing separating them is a permanent ledger row**, which is exactly the line `03-F57` (a)
// draws between *still re-sendable* and *shouts about it every morning*.
//
// ⚠ **S5's FIRST DRAFT SURVIVED AT 13/13 AND READING WOULD NOT HAVE FOUND IT.** It removed only
// the `printed` refusal, and the ladder's trailing `job.state !== "failed"` catches `printed`
// anyway — so the mutant did not reproduce the defect it named. The row above drops all three
// state gates at once, which is what a session deleting "the gate" actually writes.
//
// Measured in-tree at authoring time: **5 of 13 RED**, and `pnpm -C apps/pos-electron exec vitest
// run src/main/__acceptance__` is `859 tests, 15 failed` — every failure in this file and its
// sibling, no pre-existing test disturbed.
//
// ⚠ **NO PRINTER HAS EVER BEEN ATTACHED** (K-8 owed in full). Every "power cut" is `close()` and
// a second open over the same directory; every "chit" is bytes handed to an object. Nothing here
// is evidence about paper, a torn write, WAL recovery, or what a cook does with two tickets.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSpooler,
  type JobRecord,
  MAX_TRANSMIT_ATTEMPTS,
  type PaperStatus,
  printerCapability,
  type Spooler,
  type SpoolerTransport,
} from "@restos/escpos";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { type OpenJobStore, openJobStore } from "../job-store";
import { createKotPrinter, type KotPrinter } from "../printing";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;
const ORDER_ID = "0199aaaa-0000-7000-8000-0000000000a1";
const LINE_A = "0199aaaa-0000-7000-8000-00000000001a";
const KARAHI = "i-karahi";
const STATION = "GRILL";
/** `printing.ts`'s own chit id for the first chit at a station (`03-F55` keeps it unchanged). */
const JOB_ID = `${ORDER_ID}::${STATION}`;

const PAPER_IN: PaperStatus = { paper_out: false, near_end: "unsupported" };

/**
 * The link, as one mutable knob rather than three fixed transports.
 *
 * `dead` = not there (three transmits report no answer, `03-F4`'s budget); `live` = on the wire;
 * `stalled` = `03-F41`'s printer holding the job for a new roll, which is NOT a failure.
 *
 * **Mutable on purpose, and it is the fixture's most load-bearing property.** The printer that was
 * dead when the chit failed is the one a cashier plugs back in *before* pressing SEND AGAIN, so a
 * harness that fixed the transport at construction could only ever assert that a resend fails
 * again — the case that proves nothing about eligibility.
 */
type Link = { mode: "dead" | "live" | "stalled" };

const transportOver = (link: Link, sent: Uint8Array[]): SpoolerTransport => ({
  send: async (document) => {
    sent.push(document);
    await Promise.resolve();
    if (link.mode === "live") return { ok: true } as const;
    return { ok: false, state: link.mode === "stalled" ? "stalled" : "failed" } as const;
  },
  status: async () =>
    link.mode === "stalled" ? { paper_out: true, near_end: "unsupported" } : PAPER_IN,
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Till = {
  readonly store: DeviceStore;
  readonly jobs: OpenJobStore;
  readonly spooler: Spooler;
  readonly kot: KotPrinter;
  /** Documents THIS process handed the transport. A restart starts it empty, which §C1 needs. */
  readonly sent: Uint8Array[];
  readonly link: Link;
  readonly job: () => JobRecord | undefined;
  /** The DURABLE row, bytes included — `JobRecord` carries no document, the spool's row does. */
  readonly persisted: () => { state: string; document: Uint8Array } | undefined;
  readonly failures: () => number;
  readonly close: () => void;
};

/**
 * One process's worth of till over a directory that outlives it — REAL device store, REAL `03-F4`
 * job store, REAL spooler, REAL KOT printer.
 *
 * The ledger is real too (`store.append` through the printer's `append` seam) because §C2's claim
 * is about ROWS, and a counter incremented by the fixture would prove only that the fixture
 * counts. `03-F5`'s `kot.print_failed` is emitted by the printer under test.
 */
const openTill = (dir: string, link: Link): Till => {
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const jobs = openJobStore({ path: join(dir, "print-jobs.db") });
  const sent: Uint8Array[] = [];
  const spooler = createSpooler({ transport: transportOver(link, sent), store: jobs });
  let n = 0;
  const kot = createKotPrinter({
    spooler,
    store,
    catalog: (id) => (id === KARAHI ? { name: "Chicken Karahi" } : null),
    station: () => STATION,
    capability: printerCapability("TH230"),
    append: (type, payload) => {
      n += 1;
      store.append({
        id: `0199bbbb-0000-7000-8000-${String(Date.now() % 1e6).padStart(6, "0")}${String(n).padStart(6, "0")}`,
        ...IDENTITY,
        actor_user_id: "u-ayesha",
        device_created_at: Date.now(),
        type,
        schema_version: 1,
        payload,
        refs: [],
      });
    },
  });
  return {
    store,
    jobs,
    spooler,
    kot,
    sent,
    link,
    job: () => spooler.jobs().find((j) => j.job_id === JOB_ID),
    persisted: () => jobs.load().find((j) => j.job_id === JOB_ID),
    failures: () => store.readAllEvents().filter((e) => e.type === "kot.print_failed").length,
    close: () => {
      store.close();
      jobs.close();
    },
  };
};

/** The order, appended straight to the store — this file is not about the counter's write path. */
const ringAndConfirm = (till: Till): void => {
  let n = 0;
  const put = (type: string, payload: Record<string, unknown>): void => {
    n += 1;
    till.store.append({
      id: `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`,
      ...IDENTITY,
      actor_user_id: "u-ayesha",
      device_created_at: 1_754_300_000_000 + n,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  put("order.created", { order_id: ORDER_ID, channel: "counter", order_type: "dine_in" });
  put("order.line_added", {
    order_id: ORDER_ID,
    line_id: LINE_A,
    item_id: KARAHI,
    qty: 1,
    unit_price_paisa: 45_000,
  });
  put("order.confirmed", { order_id: ORDER_ID });
};

/** Spend `03-F4`'s whole budget, as the host's interval does. */
const settle = async (till: Till): Promise<void> => {
  for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS + 1; i += 1) await till.kot.pump();
};

/**
 * A directory that outlives its process, and the power cut.
 *
 * `restart()` closes BOTH SQLite handles and opens both files again — the strongest statement this
 * suite can make without launching Electron, and the same instrument `spooler-job-store.test.ts`
 * uses for `03-F4`'s crash clause. What it is not: a plug-pull, a torn write, or WAL recovery.
 * Those are `00 §5.2`'s physical pass and are owed in full.
 *
 * The link survives the restart because a printer does: unplugging the till does not repair the
 * cable, and `restart(mode)` is how a scenario says the cashier fixed it (or did not).
 */
const bench = (mode: Link["mode"] = "dead") => {
  const dir = mkdtempSync(join(tmpdir(), "restos-resend-durable-"));
  dirs.push(dir);
  const link: Link = { mode };
  let till = openTill(dir, link);
  return {
    till: () => till,
    link,
    restart: (next?: Link["mode"]) => {
      till.close();
      if (next !== undefined) link.mode = next;
      till = openTill(dir, link);
      return till;
    },
  };
};

const decode = (bytes: Uint8Array): string =>
  [...bytes].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : " ")).join("");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — CONTROLS. What already works, so a red in §B is attributable to the memory-only gate.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A CONTROL — the failure, the band and the in-process resend", () => {
  it("§A1 03-F4/03-F5 — three attempts, a failed job, a band with a resend control", async () => {
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());

    expect(b.till().sent).toHaveLength(MAX_TRANSMIT_ATTEMPTS);
    expect(b.till().job()?.state).toBe("failed");
    const alarms = b.till().kot.alarms();
    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.id).toBe(JOB_ID);
    // `03-F6` — the band carries the recovery, because there is something to recover.
    expect(alarms[0]?.action).toBeDefined();
  });

  it("§A2 03-F6 — in THIS process the resend reaches paper", async () => {
    // The path that already ships. If this reddens, §B is measuring a broken resend rather than a
    // resend that a restart made unreachable.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());
    // The cashier plugs the printer back in, then presses SEND AGAIN.
    b.link.mode = "live";
    b.till().sent.length = 0;

    b.till().kot.resend(JOB_ID);
    await settle(b.till());

    expect(b.till().sent).toHaveLength(1);
    expect(decode(b.till().sent[0] as Uint8Array)).toContain("Chicken Karahi");
  });

  it("§A3 03-F4 — the failed job and its bytes are still on the spool in the NEXT process", async () => {
    // `03-F4`'s "never drops it", read back through the store the app ships. This is what makes the
    // defect a missing CONTROL rather than a lost ticket: everything needed is on disk.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());

    const after = b.restart();
    const job = after.job();
    expect(job?.state).toBe("failed");
    expect(job?.covers).toEqual([LINE_A]);
    // The BYTES, read off the durable row rather than off `JobRecord` (which carries none):
    // `03-F4`'s crash clause is about resuming or REPRINTING, and a row without its document
    // leaves the kitchen a record of a ticket nobody can print.
    expect((after.persisted()?.document.length ?? 0) > 0).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE DANGEROUS CASE. The ticket must still be re-sendable in the next process.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F57 — a failed ticket survives the power cut as a RE-SENDABLE ticket", () => {
  it("§B1 — after a restart, the resend reaches paper", async () => {
    // THE HEADLINE, and the whole blocker as one assertion. Today `resend` opens with
    // `if (!raised.has(alarm_id)) return;`, the map is empty in a fresh process, and this call is a
    // silent no-op — so a billed order the kitchen never heard about is stranded permanently.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());
    expect(b.till().job()?.state).toBe("failed");

    const after = b.restart("live");
    after.kot.resend(JOB_ID);
    await settle(after);

    expect(
      after.sent,
      "03-F57: the durable spool still holds this failed chit, its bytes and its coverage, and " +
        "the relaunched till refuses to send it — the order is billed and the kitchen was never told",
    ).toHaveLength(1);
    expect(decode(after.sent[0] as Uint8Array)).toContain("Chicken Karahi");
  });

  it("§B2 03-F37 — the resent chit says REPRINT, exactly as it does in-process", async () => {
    // `03-F37`: "reprints are a named fraud vector — the paper must say so", and `03-F41`'s cook
    // holding two identical chits is why. A restart may not quietly turn a reprint into a fresh
    // ticket — that is the same double-cook hazard arriving by a third route.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());

    const after = b.restart("live");
    after.kot.resend(JOB_ID);
    await settle(after);

    expect(decode(after.sent[0] as Uint8Array)).toContain("REPRINT");
  });

  it("§B3 03-F55 — it is the SAME chit: same job id, same coverage, no new row", async () => {
    // `printing.ts` re-uses the job id on purpose — `confirmed()` counts the station's rows to get
    // the next addendum ordinal, so a resend that added a row would silently renumber the next
    // addition. A durable fix must not reach that property by a different door.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());

    const after = b.restart("live");
    after.kot.resend(JOB_ID);
    await settle(after);

    expect(after.spooler.jobs()).toHaveLength(1);
    expect(after.job()?.job_id).toBe(JOB_ID);
    expect(after.job()?.covers).toEqual([LINE_A]);
    expect(after.job()?.state).toBe("printed");
  });

  it("§B4 03-F41 — a chit that PRINTED is still refused after a restart", async () => {
    // **THE ANTI-FIX ASSERTION.** The cheapest way to pass §B1 is to delete the gate. That also
    // deletes the guard on a job that already reached paper, and `03-F41` calls the resulting
    // duplicate "a real kitchen error, not a cosmetic one". Nothing may be transmitted here.
    const b = bench("live");
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());
    expect(b.till().job()?.state).toBe("printed");

    const after = b.restart("live");
    after.kot.resend(JOB_ID);
    await settle(after);

    expect(
      after.sent,
      "03-F41/03-F57: a restarted till re-sent a ticket that had already printed — the dish is " +
        "cooked twice",
    ).toHaveLength(0);
  });

  it("§B5 03-F41 — a STALLED chit is still refused after a restart", async () => {
    // The other half of the same anti-fix: the printer TOOK those bytes and is holding them for a
    // roll, so re-transmitting "double-prints the instant the roll is loaded". A stall is not a
    // failure and a restart does not make it one.
    const b = bench("stalled");
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());
    expect(b.till().job()?.state).toBe("stalled");

    const after = b.restart("stalled");
    after.kot.resend(JOB_ID);
    await settle(after);

    expect(after.sent).toHaveLength(0);
    expect(after.job()?.state).toBe("stalled");
  });

  it("§B6 03-F57 — a job that was never enqueued is not made up out of an id", async () => {
    // An `alarm_id` with no durable job behind it is `03-F34`'s refusal, whose lines were never
    // committed and whose recovery is the next press of *Send to kitchen* (`03-F55`). A gate that
    // reads "not in the map ⇒ allow" would render something here out of nothing.
    const b = bench();
    ringAndConfirm(b.till());

    const after = b.restart("live");
    after.kot.resend(JOB_ID);
    await settle(after);

    expect(after.sent).toHaveLength(0);
    expect(after.spooler.jobs()).toHaveLength(0);
  });

  it("§B7 03-F57 — a SECOND restart does not use it up: still re-sendable", async () => {
    // The property is "for as long as the durable spool holds it", not "once". A `:loop` launcher
    // after a power cut can restart the till several times before anybody reaches the counter, and
    // a one-shot allowance consumed by a launch nobody saw is the same defect with a delay.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());

    b.restart("dead");
    const after = b.restart("live");
    after.kot.resend(JOB_ID);
    await settle(after);

    expect(after.sent).toHaveLength(1);
  });

  it("§B8 03-F5 — a resend that fails AGAIN is not silent: a band and a fresh ledger row", async () => {
    // `03-F5`: "silent KOT failure is forbidden". A durable eligibility gate must not become a
    // path that swallows the second outcome — the counter has to be told the printer is still
    // dead, and doc 05 has to be able to read it.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());
    const before = b.till().failures();
    expect(before).toBe(1);

    const after = b.restart("dead");
    after.kot.resend(JOB_ID);
    await settle(after);

    expect(after.job()?.state).toBe("failed");
    expect(after.kot.alarms().length).toBeGreaterThan(0);
    expect(after.failures()).toBe(before + 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE OTHER ANTI-FIX: still re-sendable is not "shouts about it again every morning".
//
// A previous fix deliberately stopped historic failed jobs re-raising on launch, because staff who
// arrive to yesterday's alarms learn to dismiss the band without reading it — which defeats
// `03-F5` rather than serving it. Nothing in §A or §B requires a band to come back, and §C is what
// stops a fix reaching for one as the easy route to eligibility. **Neither assertion here forbids
// a band**: both are about bytes and about permanent ledger rows.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F57 — a restart is not an event", () => {
  it("§C1 03-F4/03-F41 — a launch transmits nothing on its own account", async () => {
    // `03-F4` grants three attempts and `03-F5` hands what is left to a human. A launch that spent
    // a fourth would double-print the moment a printer that was merely unplugged came back — and
    // under a `:loop` launcher it would do it once per restart, unattended, at 05:00.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());

    const after = b.restart("live");
    await settle(after);

    expect(
      after.sent,
      "03-F57: the relaunched till re-transmitted a terminal job by itself — nobody asked it to",
    ).toHaveLength(0);
    expect(after.job()?.state).toBe("failed");
  });

  it("§C2 01-F1/15-F14 — a launch appends no second `kot.print_failed` for the same failure", async () => {
    // The row is permanent (`01-F1`) and `15-F14` pages vendor support on `kot.print_failed`
    // RATES, so one dead printer plus a restart loop would manufacture a rising failure rate out
    // of a single event. The event belongs to the transition, and a restored row transitioned
    // nowhere. This is the ledger-side statement of "does not shout every morning" — it holds
    // whether or not the implementation chooses to re-raise the band.
    const b = bench();
    ringAndConfirm(b.till());
    b.till().kot.confirmed(ORDER_ID);
    await settle(b.till());
    expect(b.till().failures()).toBe(1);

    const after = b.restart("dead");
    await settle(after);
    await settle(after);

    expect(
      after.failures(),
      "03-F57: each launch appended another `kot.print_failed` for one failure — permanent under " +
        "01-F1 and read as a rising rate by 15-F14",
    ).toBe(1);
  });
});

// ── DEFERRED — what this suite could NOT assert, and who owns it ─────────────────────────────
//
// * **Whether the BAND comes back at launch.** `03-F57` (a) leaves it open and says why: `03-F5`'s
//   alert "repeats until acknowledged", acknowledgement is persisted nowhere (`01-F5`'s closed
//   `audit.*` subtypes have no member for it — `kot-printing.test.ts`'s DEFERRED block records the
//   same gap), so re-raising every restored failure produces a band staff cannot clear and
//   re-raising none loses the notice. Both directions need one missing FR. **Deliberately not
//   asserted in either direction** (pin 2): §C is about bytes and ledger rows only.
// * **Which restored jobs are still LIVE.** `03-F57` (b): no FR gives a spooled job a lifetime,
//   `03-F4` has no compaction clause and this store has no `DELETE`, so "yesterday's failed chit"
//   has no defined status. Every scenario above is one business day. Owed to `22`/`25`'s retention
//   question.
// * **How the operator REACHES the control after a restart** — `03-F57` (c), pin 1. This file
//   drives `KotPrinter.resend` with the durable job's id, which no surface currently offers when
//   the band is gone. `03-F48`'s one-tap reprint on the counter's order list is the corpus's own
//   answer and is OWED; **a fix that makes the resend eligible and gives the cashier no button
//   passes every assertion here and leaves the ticket just as stranded.** That is the single most
//   important thing to check by hand on the running till.
// * **The wiring in `main/index.ts`.** It builds an Electron app at module scope and no suite here
//   can import it. This file constructs the printer directly, so it proves the PRINTER is durable
//   and not that the shipped process constructs it that way; `startup-integrity.test.ts` is the
//   precedent for the instrument that could, and a `03-F57` rung of it is owed.
// * **`03-F6`'s reroute.** A second printer needs `03-F2`'s routing registry (doc 14), which does
//   not exist; the band offers resend only.
// * **K-8.** No printer has printed any of this, and no plug has actually been pulled.
