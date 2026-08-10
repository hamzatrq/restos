// ACCEPTANCE TESTS — `03-F51`'s SEAM: the product asks the route, and `03-F5` stays loud.
//
// PROVENANCE (24 §3 step 2): authored by the session that wrote `03-F51` and implemented against
// it. Not the `24 §3` split; stated rather than glossed, and mitigated by mutation (see the
// session report's matrix, including the two mutants this file exists for).
//
// **This file owns the one distinction the whole feature rests on**, `03-F51`:
//
//   ABSENCE is decided BEFORE a job exists, from configuration.
//   FAILURE is decided AFTER a job exists, from a transport outcome.
//
// Collapsing them is the obvious way to get this wrong and it would look like a fix. §C is the
// assertion that must red under any implementation that makes a real printer failure silent, and
// §D is the assertion that must red under any implementation that lets configuration reach a job
// that already exists. Neither is expressible by `pnpm seams:check`: this is a field on a mapping
// and a position in a function, not an unreached export or an unsupplied optional.
//
// FRs: `03-F22`, `03-F51`, `03-F4`, `03-F5`, `03-F34`, `01-F1`, `01-F17`, `15-F14`, `24-F14`.

import { readFileSync } from "node:fs";
import { createSpooler, printerCapability, type Spooler } from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { createKotPrinter, type KotPrinterDeps } from "../printing";

// ── the fixture: ONE order that fans out to TWO stations (03-F2) ─────────────────────────────

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const CONFIRM_AT = 1_754_300_000_000;
/** `i-karahi` cooks at GRILL, `i-naan` at TANDOOR — so one confirm makes two candidate jobs. */
const STATIONS: Record<string, string> = { "i-karahi": "GRILL", "i-naan": "TANDOOR" };
const NAMES: Record<string, string> = { "i-karahi": "Chicken Karahi", "i-naan": "Garlic Naan" };

const TWO_STATIONS = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 2, unit_price_paisa: 45_000, states: ["confirmed"] },
  "line-b": { item_id: "i-naan", qty: 4, unit_price_paisa: 12_000, states: ["confirmed"] },
});

const stubStore = (): Pick<DeviceStore, "openOrders" | "kitchenQueue"> =>
  ({
    openOrders: () => [
      {
        order_id: ORDER_ID,
        channel: "counter",
        table_ids_json: "[]",
        json_lines: TWO_STATIONS,
        pay_total: 0,
      },
    ],
    kitchenQueue: () => [{ order_id: ORDER_ID, age_basis: CONFIRM_AT, channel: "counter" }],
  }) as unknown as Pick<DeviceStore, "openOrders" | "kitchenQueue">;

/**
 * The transport this device actually has today: one that never answers.
 *
 * Deliberately NOT `unattachedPrinter` imported from `../printing` — that would make this suite
 * agree with the shipped stub by construction, and the property under test is about a printer that
 * is EXPECTED and does not answer, which is a real broken TH230 as much as an absent one.
 */
const deadTransport = () => ({
  send: vi.fn(async () => ({ ok: false, state: "failed" }) as const),
  status: vi.fn(async () => ({ paper_out: false, near_end: "unsupported" }) as const),
});

type Harness = {
  printer: ReturnType<typeof createKotPrinter>;
  spooler: Spooler;
  appended: { type: string; payload: Record<string, unknown> }[];
  transport: ReturnType<typeof deadTransport>;
};

const harness = (opts: { routesToPaper?: (station: string) => boolean } = {}): Harness => {
  const transport = deadTransport();
  const spooler = createSpooler({ transport });
  const appended: { type: string; payload: Record<string, unknown> }[] = [];
  const deps: KotPrinterDeps = {
    spooler,
    store: stubStore(),
    catalog: (item_id) =>
      NAMES[item_id] === undefined ? null : { name: NAMES[item_id] as string },
    station: (item_id) => STATIONS[item_id] ?? "kitchen",
    capability: printerCapability("TH230"),
    append: (type, payload) => {
      appended.push({ type, payload });
    },
    ...(opts.routesToPaper === undefined ? {} : { routesToPaper: opts.routesToPaper }),
  };
  return { printer: createKotPrinter(deps), spooler, appended, transport };
};

/** Spend `03-F4`'s whole three-attempt budget, the way `main/index.ts`'s interval does. */
const exhaust = async (h: Harness): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await h.printer.pump();
};

const SRC = (name: string): string => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

// ── A. THE HARM REMOVED — a screen-only station makes NO JOB ─────────────────────────────────

describe("A. 03-F51 — a station routed to a screen enqueues nothing at all", () => {
  it("no job, no bytes, no band, no permanent kot.print_failed", async () => {
    // The whole measured harm, in one assertion. Before `03-F51`: every transmit reports no
    // answer, `03-F4`'s budget exhausts, `03-F5` bands for ever with a repeating sound, a
    // PERMANENT `kot.print_failed` lands in an append-only ledger (`01-F1`) per exhausted job,
    // `05-F3` alarms the manager and `15-F14` pages vendor support on `kot.print_failed` RATES.
    const h = harness({ routesToPaper: () => false });
    h.printer.confirmed(ORDER_ID);
    await exhaust(h);

    expect(h.spooler.jobs()).toEqual([]);
    expect(h.transport.send).not.toHaveBeenCalled();
    expect(h.printer.alarms()).toEqual([]);
    expect(h.appended).toEqual([]);
  });

  it("is PER STATION — 03-F22's own words — and the paper half is untouched", async () => {
    // A branch-wide flag could not express this, which is `DEC-HW-003`'s argument (c) as a test.
    const h = harness({ routesToPaper: (station) => station !== "TANDOOR" });
    h.printer.confirmed(ORDER_ID);

    expect(h.spooler.jobs().map((j) => j.job_id)).toEqual([`${ORDER_ID}::GRILL`]);
  });
});

// ── B. the DEFAULT: an omitted dep is the pre-03-F51 product ─────────────────────────────────

describe("B. the optional dep defaults to paper everywhere", () => {
  it("a caller that supplies nothing prints every station, exactly as before", async () => {
    // `routesToPaper` is optional so two pre-existing oracles keep compiling (`24 §3` step 2).
    // The default must therefore be the OLD behaviour or the omission would be a silent change.
    const h = harness();
    h.printer.confirmed(ORDER_ID);

    expect(
      h.spooler
        .jobs()
        .map((j) => j.job_id)
        .sort(),
    ).toEqual([`${ORDER_ID}::GRILL`, `${ORDER_ID}::TANDOOR`].sort());
  });
});

// ── C. 03-F5 IS NOT WEAKENED — the mutant this section exists to kill ────────────────────────

describe("C. a printer that is EXPECTED and does not answer is still loud", () => {
  it("a paper-routed station still bands and still appends kot.print_failed", async () => {
    // If this ever goes green under an implementation that suppresses a failed transmit, `03-F5`
    // has been weakened and the feature has shipped the defect it was written to avoid.
    const h = harness({ routesToPaper: () => true });
    h.printer.confirmed(ORDER_ID);
    await exhaust(h);

    const alarms = h.printer.alarms();
    expect(alarms.length).toBe(2);
    // `03-F5`'s own sentence shape: the order AND the printer, because either alone is
    // unactionable.
    expect(alarms[0]?.message).toContain("did not print");
    expect(alarms[0]?.message).toContain("TH230");
    expect(h.appended.filter((e) => e.type === "kot.print_failed").length).toBe(2);
  });

  it("ONE order proves both halves at once — screen silent, paper loud, same confirm", async () => {
    // The strongest single fixture in this file: a mixed kitchen. An implementation that
    // suppressed failures globally fails the second expectation; one that ignored the route
    // fails the first. Neither mutant can satisfy both.
    const h = harness({ routesToPaper: (station) => station === "GRILL" });
    h.printer.confirmed(ORDER_ID);
    await exhaust(h);

    const failed = h.appended.filter((e) => e.type === "kot.print_failed");
    expect(failed.length).toBe(1);
    expect(h.printer.alarms().length).toBe(1);
    // and the one that failed is the PAPER one, not whichever came first
    expect(h.printer.alarms()[0]?.id).toBe(`${ORDER_ID}::GRILL`);
  });
});

// ── D. absence is decided BEFORE a job exists — the positional law ───────────────────────────

describe("D. 03-F51 — configuration may never reach a job that already exists", () => {
  it("re-routing a station AFTER its job was enqueued does not silence the failure", async () => {
    // The behavioural form of the law, and the reason it is behavioural rather than a source
    // check: a suite that hand-copied the guard's position would be `K-3`'s dead oracle. Here the
    // resolver flips to screen-only WHILE the job is in flight. `03-F5` must still fire, because
    // the job exists and its outcome is a transport fact.
    let paper = true;
    const h = harness({ routesToPaper: () => paper });
    h.printer.confirmed(ORDER_ID);
    expect(h.spooler.jobs().length).toBe(2);

    paper = false;
    await exhaust(h);

    expect(h.printer.alarms().length).toBe(2);
    expect(h.appended.filter((e) => e.type === "kot.print_failed").length).toBe(2);
  });

  it("the failure path in printing.ts does not consult the route at all", () => {
    // Structural, and narrow on purpose: it asserts only that the symbol is ABSENT downstream of
    // the enqueue, never what the guard says. A route read inside `reconcile` would be the
    // collapse this FR forbids, and it would look reasonable in a diff.
    const src = SRC("printing.ts");
    const reconcileAt = src.indexOf("const reconcile =");
    expect(reconcileAt).toBeGreaterThan(0); // 24-F14: an EMPTY MATCH is a failure, not a pass
    expect(src.slice(reconcileAt)).not.toContain("routesToPaper");
  });

  it("the route is consulted exactly once, and before anything is enqueued", () => {
    const src = SRC("printing.ts");
    const calls = src.split("routesToPaper(").length - 1;
    expect(calls).toBe(1);
    expect(src.indexOf("routesToPaper(")).toBeLessThan(src.indexOf("spooler.enqueue("));
  });
});

// ── E. THE SEAM — main/index.ts wires the REAL resolution ────────────────────────────────────

describe("E. main/index.ts supplies the route, and supplies the real one", () => {
  const main = SRC("index.ts");

  it("the KOT printer is constructed with routesToPaper", () => {
    // **This assertion is the ONLY guard on this seam, and that was measured rather than assumed.**
    // `seams:check` Rule B opens with `if (groupOf(mod.file) !== "packages") continue;`, so a
    // factory declared in an APP has no Rule-B candidates at all: the rail is exit-0 CLEAN both
    // with this argument deleted and with it replaced by `() => true`, and reports the same
    // "5 optional seams" in each case. Delete this test and the seam has nothing holding it.
    const call = main.slice(main.indexOf("createKotPrinter({"));
    expect(call.indexOf("createKotPrinter({")).toBe(0); // 24-F14
    const body = call.slice(0, call.indexOf("\n  });"));
    expect(body).toContain("routesToPaper:");
    expect(body).toContain("stationRouting()");
  });

  it("the resolution reads 00 §7 layer 2's key rather than a literal", () => {
    expect(main).toContain("resolveStationRouting({");
    expect(main).toContain("process.env[STATION_ROUTES_ENV]");
  });

  it("an ASSUMED tier is passed as null, not as T1 — 03-F51's 'unknown is not a blessing'", () => {
    // `DEC-HW-003`: the tier may not decide whether hardware exists. Feeding an assumption into
    // the validator as a fact would make every shipped device REFUSE a screen-only kitchen today,
    // which is this work's own harm with the sign flipped.
    expect(main).toContain('source === "assumed" ? null :');
  });

  it("the boot line reports the routing (00 §5.7)", () => {
    expect(main).toContain("describeStationRouting(stationRouting())");
  });
});
