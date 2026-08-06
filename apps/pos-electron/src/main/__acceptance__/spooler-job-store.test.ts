// `03-F4`'s crash clause, on the store this app actually ships.
//
// **Why this file exists at all.** `packages/escpos`'s `spooler-durability.test.ts` proves the
// SPOOLER honours a durable store — it mutation-proved that a `Map`-backed spooler fails eight of
// its tests where a real store passes. It cannot prove anything about the store the product hands
// over, because the store is a seam and `SpoolerOptions.store` is optional: a host that forgets the
// argument gets a process-lifetime queue and no test anywhere goes red. That is precisely what
// happened — K-7 wired `createSpooler` into `main/index.ts` and passed no store — and it is the
// wave's named defect (AGENTS.md), in its fifth instance. The seam itself is asserted in
// `kot-printing.test.ts` §G; what is asserted HERE is that the thing being passed is genuinely
// durable, so the seam assertion cannot be satisfied by wiring up a decorative object.
//
// ⚠ **NO PHYSICAL PRINTER EXISTS** (K-8 owed). Every "power cut" below is `store.close()` and a
// second `openJobStore` over the same path. Nothing here is evidence about paper, hardware, fsync,
// a torn write, or WAL recovery from a real plug-pull — `00 §5.2`'s physical pass owns those and is
// owed in full.
//
// `03-F4` permits "resumes **or** reprints", and this suite deliberately asserts only what the two
// readings SHARE: the job is still there, its bytes are the bytes, and its state is one the pump
// will act on. Which of the two happens is the implementation's to choose.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSpooler,
  type PaperStatus,
  type PrintJob,
  type SpoolerTransport,
} from "@restos/escpos";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openJobStore } from "../job-store";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "restos-spool-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const PAPER_IN: PaperStatus = { paper_out: false, near_end: false };

/** A printer that takes everything. Enough to drive a job to `printed`. */
const acceptingPrinter = (): SpoolerTransport => ({
  send: async () => ({ ok: true }) as const,
  status: async () => PAPER_IN,
});

/** A printer that is not there — the shipped one's shape (`18 §10`, K-8 owed). */
const deadLink = (): SpoolerTransport => ({
  send: async () => ({ ok: false, state: "failed" }) as const,
  status: async () => PAPER_IN,
});

/** An accepting printer that keeps every document it was handed. */
const recorder = (into: Uint8Array[]): SpoolerTransport => ({
  send: async (document) => {
    into.push(document);
    return { ok: true } as const;
  },
  status: async () => PAPER_IN,
});

const aJob = (over: Partial<PrintJob> = {}): PrintJob => ({
  job_id: "job-1",
  document: Uint8Array.from([0x1b, 0x40, 0x4b, 0x4f, 0x54, 0x0a]),
  printer_name: "grill",
  order_ref: "142",
  ...over,
});

describe("03-F4 — the queued ticket outlives the process that queued it", () => {
  it("is writing to a REAL file, and a different path is a different queue", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking". If `openJobStore` kept a
    // module-level map keyed by nothing, every assertion below would pass against a store that
    // never touched a disk. Two anchors: the file exists, and a fresh path is empty.
    const path = join(dir, "spool.db");
    const store = openJobStore({ path });
    store.put({ ...aJob(), state: "queued", attempts: 0 });
    store.close();

    expect(existsSync(path), "03-F4 names SQLite — this must be a file on a disk").toBe(true);
    expect(openJobStore({ path: join(dir, "other.db") }).load()).toEqual([]);
  });

  it("a job queued and never transmitted is STILL THERE after the power cut", async () => {
    // The case `03-F4` is written about, and the one the shipped app failed: the cashier
    // confirms, the KOT is queued, the power goes before the first transmit. "Resumes or
    // reprints" both require the job to exist; only "never drops it" is asserted here.
    const path = join(dir, "spool.db");
    const before = openJobStore({ path });
    createSpooler({ transport: deadLink(), store: before }).enqueue(aJob());
    before.close(); // ← the power cut. No printer was involved; nothing was pumped.

    const after = openJobStore({ path });
    const relaunched = createSpooler({ transport: acceptingPrinter(), store: after });

    const restored = relaunched.job("job-1");
    expect(restored, "03-F4 — never drops it").toBeDefined();
    expect(
      restored?.state,
      "03-F4 — resumes or reprints: either way the pump must still act on it",
    ).not.toBe("failed");
    expect(restored?.printer_name).toBe("grill");
    expect(restored?.order_ref).toBe("142");

    // And the BYTES came back, not just the row. A store that persisted the state machine and
    // dropped the document leaves the kitchen with a record of a ticket nobody can print.
    await relaunched.pump();
    expect(relaunched.job("job-1")?.state).toBe("printed");
  });

  it("the document survives byte-identically, whatever is in it", async () => {
    // A KOT is arbitrary binary — ESC/POS control bytes, and `03-F8`'s raster path puts 0x00 and
    // 0xff runs in the middle of it. A store that round-tripped through a string would mangle
    // exactly these and pass a test written with ASCII.
    const path = join(dir, "spool.db");
    const document = Uint8Array.from([0x00, 0x1b, 0x40, 0xff, 0x0a, 0x00, 0x80, 0x7f]);
    const before = openJobStore({ path });
    createSpooler({ transport: deadLink(), store: before }).enqueue(aJob({ document }));
    before.close();

    const sent: Uint8Array[] = [];
    await createSpooler({ transport: recorder(sent), store: openJobStore({ path }) }).pump();

    expect(sent).toEqual([document]);
  });

  it("a PRINTED job does not come back queued — the ticket on the spike is not reprinted", async () => {
    // The mirror hazard, and the reason the store carries STATE and not just bytes. `03-F41` is
    // written about the duplicate KOT; a store that restored every row as `queued` produces one
    // on every relaunch, and the cook has no way to tell it from a real second order.
    const path = join(dir, "spool.db");
    const before = openJobStore({ path });
    const spooler = createSpooler({ transport: acceptingPrinter(), store: before });
    spooler.enqueue(aJob());
    await spooler.pump();
    expect(spooler.job("job-1")?.state).toBe("printed");
    before.close();

    const sent: Uint8Array[] = [];
    await createSpooler({ transport: recorder(sent), store: openJobStore({ path }) }).pump();

    expect(sent, "03-F41 — a relaunch must not re-transmit a printed ticket").toEqual([]);
  });

  it("the attempt count survives, so the 3-attempt budget can actually exhaust", async () => {
    // `03-F4` caps retries at 3 and `03-F5` forbids the failure being silent. If `attempts`
    // reset on every relaunch, a dead printer would never reach `failed`, the band naming the
    // printer and the order would never appear, and the KOT would fail silently forever — by a
    // route no test inside `packages/escpos` can see, because the reset happens in the store.
    const path = join(dir, "spool.db");
    const before = openJobStore({ path });
    const spooler = createSpooler({ transport: deadLink(), store: before });
    spooler.enqueue(aJob());
    await spooler.pump();
    await spooler.pump();
    expect(spooler.job("job-1")?.attempts).toBe(2);
    before.close();

    const relaunched = createSpooler({ transport: deadLink(), store: openJobStore({ path }) });
    expect(relaunched.job("job-1")?.attempts).toBe(2);
    await relaunched.pump();
    expect(relaunched.job("job-1")?.state, "03-F4 — 3 attempts, then stop, loudly").toBe("failed");
  });

  it("load() keeps FIRST-write order across a transition, not last-write order", () => {
    // `SpoolerJobStore.load`'s contract, and it is `03-F2`'s fan-out that cares: three stations
    // queued from one confirm must come back in the order they were queued, not reshuffled by
    // whichever happened to transition last. Ordering by `job_id` passes a two-job test written
    // with sorted ids, which is why these are deliberately unsorted.
    const path = join(dir, "spool.db");
    const store = openJobStore({ path });
    for (const job_id of ["job-tandoor", "job-grill", "job-cold"]) {
      store.put({ ...aJob({ job_id }), state: "queued", attempts: 0 });
    }
    store.put({ ...aJob({ job_id: "job-tandoor" }), state: "printed", attempts: 1 });
    store.close();

    expect(
      openJobStore({ path })
        .load()
        .map((row) => row.job_id),
    ).toEqual(["job-tandoor", "job-grill", "job-cold"]);
  });
});
