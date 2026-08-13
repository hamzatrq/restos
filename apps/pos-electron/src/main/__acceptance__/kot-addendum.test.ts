// ACCEPTANCE TESTS — `03-F55`: a line added AFTER "Send to kitchen" reaches the kitchen, and the
// lines already on paper are not cooked twice.
//
// Authored from spec text ONLY (`24 §3` step 2; read-only to the implementing session). No
// implementation of `03-F55` was read, because none exists — the FR landed first (commandment 9)
// and this file was written from it. `main/printing.ts` as it stands today WAS read, because the
// FR is written about a measured defect in it and an acceptance suite that could not describe the
// defect could not tell a fix from a rewrite.
//
// ⚠ **THE FIX TOUCHES `packages/escpos`, A PROTECTED PATH (`20 §4.4`, commandment 10)** — the chit
// gains one field and the shipped `kot` spec gains one band. SENIOR REVIEW IS REQUIRED, and the
// document half of the contract is asserted in `packages/escpos/src/__acceptance__/
// kot-addendum-document.test.ts`. This file owns the BEHAVIOUR: which lines go on which chit.
//
// ── THE DEFECT, AS MEASURED ──────────────────────────────────────────────────────────────────
//
// `main/printing.ts` builds `job_id = `${order_id}::${at}`` and skips a station whose job already
// exists. `gateway.addLine` does not refuse a confirmed order and `Counter.tsx` keeps the grid live
// after the confirm (the cart is the order until it is SETTLED), so:
//
//   ring → Send to kitchen → the KOT prints
//   the customer adds one more naan → the line IS added to the order and IS on the bill
//   Send to kitchen → the job id already exists → skip
//   → no ticket, no band, no event, and the control still reads "Send to kitchen".
//
// THE SPEC TEXT THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   03-F55 "What prints, per station: exactly the lines routed there that this device has not yet
//          committed to paper for this order. The first such chit at a station is an ordinary KOT;
//          every later one is an addendum, numbered from 1 … A station reached for the FIRST time
//          by an addition gets an ordinary KOT and not an addendum."
//   03-F55 "Where a station has nothing uncommitted, NOTHING is created — no bytes, no spooled job,
//          no attempt, no retry budget, no band, no `kot.print_failed`. A second press with nothing
//          new is silent."
//   03-F55 "'Committed to paper' means A JOB EXISTS, not that the job PRINTED … A document
//          `03-F34` refused is the opposite — no job was created, nothing was committed."
//   03-F55 "The device's record of what it has committed is the durable spool (`03-F4`), and it
//          must survive the power cut that FR is written about … The identifier of the FIRST chit
//          at a station is unchanged (`<order_id>::<station>`)."
//   03-F55 "The stamp is the order's confirm anchor, unchanged."
//   03-F2  "one `order.confirmed` fans out to N KOTs" — per STATION.
//   03-F4  the durable spool: "a crash or power loss … never drops it".
//   03-F5  "Silent KOT failure is forbidden" — and this FR must not weaken it.
//   03-F34 a document that cannot be rendered is REFUSED, loudly; nothing is enqueued.
//   03-F51 a station routed `screen` "enqueues no print job at all".
//   01-F17 "a sale is never blocked" — not by a printer, not by an addendum.
//
// ── NO PRINTER HAS EVER BEEN ATTACHED (K-8 owed in full) ─────────────────────────────────────
//
// Every assertion below is about bytes handed to an object and rows in a SQLite file. Nothing here
// is evidence about paper, about a cook, or about whether `ADDED 2` means anything to a human —
// `27-F35`'s ≥85% comprehension gate is untouched and `03-F55` says so about itself.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSpooler,
  DOCUMENT_SPECS,
  type JobRecord,
  MAX_TRANSMIT_ATTEMPTS,
  type PaperStatus,
  printerCapability,
  render,
  type Spooler,
  type SpoolerJobStore,
  type SpoolerTransport,
} from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openJobStore } from "../job-store";
import { createKotPrinter, type KotPrinterDeps } from "../printing";

const spec = DOCUMENT_SPECS.kot;
if (spec === undefined) throw new Error("@restos/escpos ships no `kot` DocumentSpec (03-F30)");

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
/** `gateway.ts`'s own short handle — `03-F3`'s "order number", eight characters. */
const TICKET = ORDER_ID.slice(0, 8);
/** `01-F43`'s branch stamp on the confirm anchor; `27-F62` puts it on the chit. */
const CONFIRM_AT = 1_754_300_000_000;

const NAMES: Record<string, string> = {
  "i-karahi": "Chicken Karahi",
  "i-tikka": "Chicken Tikka",
  "i-naan": "Garlic Naan",
};
const STATIONS: Record<string, string> = {
  "i-karahi": "GRILL",
  "i-tikka": "GRILL",
  "i-naan": "TANDOOR",
};

// ── the fixture: an order whose line set MOVES between presses ────────────────────────────────

type Cell = { item_id: string; qty: number };

/**
 * The order projection, mutable between calls — which is the whole subject.
 *
 * Every existing KOT suite in this package builds a FROZEN store, and that is exactly why none of
 * them can see this defect: a fixture whose lines cannot change cannot express "a line was added
 * after the confirm". The cells carry `unit_price_paisa` and `states` because the real projection
 * does; the KOT reads neither (`03-F32` — there is no money on a chit).
 */
const anOrder = (initial: Record<string, Cell>) => {
  const cells: Record<string, Cell> = { ...initial };
  const json = () =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(cells).map(([line_id, cell]) => [
          line_id,
          { item_id: cell.item_id, qty: cell.qty, unit_price_paisa: 45_000, states: ["confirmed"] },
        ]),
      ),
    );
  return {
    /** `gateway.addLine` on an order that is already confirmed — `02-F8` leaves this legal. */
    addLine: (line_id: string, item_id: string, qty = 1): void => {
      cells[line_id] = { item_id, qty };
    },
    store: {
      openOrders: () => [
        {
          order_id: ORDER_ID,
          channel: "counter",
          table_ids_json: "[]",
          json_lines: json(),
          pay_total: 0,
        },
      ],
      // The queue projection's rule is "row exists iff confirmed", and `age_basis` is the confirm
      // ANCHOR — the fold takes the EARLIEST confirm, so a second press does not move it. That is
      // `03-F55`'s "the stamp is the order's confirm anchor, unchanged", and this fixture cannot
      // express the alternative, which is the point.
      kitchenQueue: () => [{ order_id: ORDER_ID, age_basis: CONFIRM_AT, channel: "counter" }],
    } as unknown as Pick<DeviceStore, "openOrders" | "kitchenQueue">,
  };
};

const PAPER_IN: PaperStatus = { paper_out: false, near_end: "unsupported" };

const fakeTransport = (mode: "ok" | "fail" = "ok") => {
  const sent: Uint8Array[] = [];
  return {
    send: vi.fn(async (document: Uint8Array) => {
      sent.push(document);
      await Promise.resolve();
      return mode === "ok" ? ({ ok: true } as const) : ({ ok: false, state: "failed" } as const);
    }),
    status: vi.fn(async (): Promise<PaperStatus> => PAPER_IN),
    sent,
  };
};

type Harness = {
  printer: ReturnType<typeof createKotPrinter>;
  spooler: Spooler;
  transport: ReturnType<typeof fakeTransport>;
  appended: { type: string; payload: Record<string, unknown> }[];
};

const harness = (
  order: ReturnType<typeof anOrder>,
  opts: {
    mode?: "ok" | "fail";
    model?: string;
    store?: SpoolerJobStore;
    routesToPaper?: (station: string) => boolean;
    transport?: SpoolerTransport;
  } = {},
): Harness => {
  const transport = fakeTransport(opts.mode ?? "ok");
  const spooler = createSpooler({
    transport: opts.transport ?? transport,
    ...(opts.store === undefined ? {} : { store: opts.store }),
  });
  const appended: { type: string; payload: Record<string, unknown> }[] = [];
  const deps: KotPrinterDeps = {
    spooler,
    store: order.store,
    catalog: (item_id) =>
      NAMES[item_id] === undefined ? null : { name: NAMES[item_id] as string },
    station: (item_id) => STATIONS[item_id] ?? "kitchen",
    capability: printerCapability(opts.model ?? "TH230"),
    append: (type, payload) => appended.push({ type, payload }),
    ...(opts.routesToPaper === undefined ? {} : { routesToPaper: opts.routesToPaper }),
  };
  return { printer: createKotPrinter(deps), spooler, transport, appended };
};

/** One press of "Send to kitchen", driven all the way to a terminal spooler state. */
const sendToKitchen = async (h: Harness): Promise<void> => {
  h.printer.confirmed(ORDER_ID);
  for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS; i += 1) await h.printer.pump();
};

/**
 * The document this suite says should have crossed the seam, rendered INDEPENDENTLY.
 *
 * Byte-identity against a separately built document rather than a substring check, because the
 * `K-4` lesson at this layer is that an implementation ignoring a field is passed by any assertion
 * that never varies it — and `addendum` is a field whose whole job is to vary.
 *
 * `data` is deliberately NOT written `satisfies KotData`: `03-F55`'s field is not in the contract
 * until the implementing session puts it there, `render`'s `data` parameter is `unknown` by design
 * (`03-F30` — the TYPE owns its own contract), and a suite that cannot be written before the
 * contract exists is a suite the implementer writes, which is the split `24 §3` exists to prevent.
 */
const chit = (station: string, lines: { quantity: number; name: string }[], addendum: number) => {
  const result = render(
    spec,
    {},
    {
      ticket_no: TICKET,
      // `03-F3`'s one field: no table is assigned, so the value is the order's channel.
      table: "counter",
      station,
      branch_created_at: CONFIRM_AT,
      reprint: false,
      addendum,
      lines: lines.map((line) => ({ ...line, modifiers: [] })),
    },
    printerCapability("TH230"),
  );
  if (!result.ok) throw new Error(`fixture does not render: ${result.reason}`);
  return result.bytes;
};

/** ASCII only — `00 §5.6` makes chit text English; this reads glyph bytes, never layout. */
const decode = (bytes: Uint8Array): string =>
  [...bytes].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : " ")).join("");

const jobsOf = (s: Spooler): readonly JobRecord[] => s.jobs();

// ── §A — THE DEFECT ITSELF ───────────────────────────────────────────────────────────────────

describe("03-F55 — a line added after the confirm reaches the kitchen", () => {
  it("a second press after a line is added produces a SECOND chit", async () => {
    // THE HEADLINE. This is the whole task stated as one assertion: ring, send, add, send. Today
    // the second press produces nothing at all and the naan is cooked by nobody.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    expect(h.transport.sent).toHaveLength(1);

    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);

    expect(jobsOf(h.spooler)).toHaveLength(2);
    expect(h.transport.sent).toHaveLength(2);
  });

  it("the second chit carries ONLY the new line, marked as the first addendum", async () => {
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    order.addLine("line-b", "i-tikka", 2);
    await sendToKitchen(h);

    expect(h.transport.sent[1]).toEqual(chit("GRILL", [{ quantity: 2, name: "Chicken Tikka" }], 1));
  });

  it("the lines already on paper are NOT on the second chit — nothing is cooked twice", async () => {
    // The inverse of the assertion above, made as a claim about the WHOLE run rather than about
    // one document: the karahi crosses the seam exactly once, ever. An implementation that fixes
    // the silence by re-sending the whole order passes the two assertions above and doubles every
    // dish in the kitchen, which `03-F41` calls "a real kitchen error, not a cosmetic one".
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);

    const carrying = h.transport.sent.filter((doc) => decode(doc).includes("Chicken Karahi"));
    expect(carrying).toHaveLength(1);
    expect(decode(h.transport.sent[1] as Uint8Array)).not.toContain("Chicken Karahi");
  });

  it("the FIRST chit is untouched by the later addition", async () => {
    // `03-F44` — paper is never the record, so a chit already in the kitchen cannot be amended;
    // whatever the second press does, the first document must still be the document that printed.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    const first = h.transport.sent[0];
    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);
    expect(first).toEqual(chit("GRILL", [{ quantity: 1, name: "Chicken Karahi" }], 0));
    expect(h.transport.sent[0]).toEqual(first);
  });

  it("the ORDINAL counts up, and two identical additions are still distinguishable", async () => {
    // `03-F55`'s stated reason for putting a number on the paper: "A family that asks for one naan
    // and then, five minutes later, one more naan produces two chits with identical bodies."
    // Constructed exactly — two separate lines, same item, same quantity — so the ONLY thing that
    // can tell the two chits apart is the ordinal, and an implementation that hard-codes `1` (or
    // omits the number) fails here and nowhere else.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);
    order.addLine("line-c", "i-tikka", 1);
    await sendToKitchen(h);

    expect(h.transport.sent).toHaveLength(3);
    const body = [{ quantity: 1, name: "Chicken Tikka" }];
    expect(h.transport.sent[1]).toEqual(chit("GRILL", body, 1));
    expect(h.transport.sent[2]).toEqual(chit("GRILL", body, 2));
    expect(h.transport.sent[2]).not.toEqual(h.transport.sent[1]);
  });

  it("kot.printed is appended for the addendum too — 02-F31's precondition still holds", async () => {
    // `03-F55`: "a second `kot.printed` for the same order is TRUE rather than duplicated". The
    // added line is at `confirmed` and `02-F31`'s auto-advance moves it to `in_prep` off this
    // event; without it the new line never enters the workflow the pass screen reads.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);
    const printed = h.appended.filter((e) => e.type === "kot.printed");
    expect(printed).toHaveLength(2);
    expect(printed.every((e) => e.payload.order_id === ORDER_ID)).toBe(true);
  });
});

// ── §B — the second press with NOTHING new is SILENT ─────────────────────────────────────────

describe("03-F55 — where a station has nothing uncommitted, nothing is created", () => {
  it("a second press that adds nothing prints nothing, bands nothing and appends nothing", async () => {
    // The guard `03-F55` refuses to delete. A duplicate KOT means the dish is cooked twice, and
    // `03-F7`/`03-F37` make a reprint a deliberate, logged, REPRINT-banded act — which a
    // mis-tapped confirm is not.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    const before = h.appended.length;

    await sendToKitchen(h);

    expect(jobsOf(h.spooler)).toHaveLength(1);
    expect(h.transport.sent).toHaveLength(1);
    expect(h.printer.alarms()).toHaveLength(0);
    expect(h.appended).toHaveLength(before);
  });

  it("a double-tap BEFORE the first attempt is still one chit", async () => {
    // The counter has wet hands (`27-F8`'s whole argument), and the order stays open until it is
    // settled, so two presses inside one second is an ordinary mis-tap rather than an exotic one.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    h.printer.confirmed(ORDER_ID);
    h.printer.confirmed(ORDER_ID);
    expect(jobsOf(h.spooler)).toHaveLength(1);
    await h.printer.pump();
    expect(h.transport.sent).toHaveLength(1);
  });

  it("a press after an ADDENDUM, with nothing further added, is silent too", async () => {
    // The same guard one chit along. An implementation that keys "already sent" off the ORIGINAL
    // ticket only would re-send the addendum for ever, one chit per tap.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);
    expect(h.transport.sent).toHaveLength(2);

    await sendToKitchen(h);
    expect(jobsOf(h.spooler)).toHaveLength(2);
    expect(h.transport.sent).toHaveLength(2);
  });
});

// ── §C — 03-F2: the fan-out is PER STATION ───────────────────────────────────────────────────

describe("03-F2/03-F55 — an addition reaches only the station that cooks it", () => {
  it("the station with nothing new gets NOTHING, and the other gets its addendum", async () => {
    const order = anOrder({
      "line-a": { item_id: "i-karahi", qty: 1 },
      "line-b": { item_id: "i-naan", qty: 2 },
    });
    const h = harness(order);
    await sendToKitchen(h);
    expect(h.transport.sent).toHaveLength(2);

    order.addLine("line-c", "i-tikka", 1);
    await sendToKitchen(h);

    expect(h.transport.sent).toHaveLength(3);
    expect(h.transport.sent[2]).toEqual(chit("GRILL", [{ quantity: 1, name: "Chicken Tikka" }], 1));
    // The tandoor is not handed a second naan. An implementation that recomputes the whole fan-out
    // and marks every station's chit an addendum passes §A entirely and cooks the naan twice.
    const naans = h.transport.sent.filter((doc) => decode(doc).includes("Garlic Naan"));
    expect(naans).toHaveLength(1);
  });

  it("a station reached for the FIRST time by an addition gets an ORDINARY chit", async () => {
    // `03-F55`: "a tandoor that has never seen this ticket is not being handed an addition to
    // anything." The discriminating case for the ordinal's meaning — the number counts chits at a
    // STATION, not additions to an order, and the two differ exactly here.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    order.addLine("line-b", "i-naan", 2);
    await sendToKitchen(h);

    expect(h.transport.sent).toHaveLength(2);
    expect(h.transport.sent[1]).toEqual(chit("TANDOOR", [{ quantity: 2, name: "Garlic Naan" }], 0));
  });
});

// ── §D — 03-F4: the record of what is on paper survives the power cut ────────────────────────

describe("03-F4/03-F55 — the coverage is DURABLE, because the relaunch is when it bites", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "restos-addendum-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("is writing to a REAL file, and a different path is a different spool", () => {
    // ROUND-2 PATTERN 2, "the guard that passed by not looking": if `openJobStore` kept a
    // module-level map, both assertions below would pass against a store that never touched a
    // disk, and the durability claim would be about nothing.
    const a = openJobStore({ path: join(dir, "a.db") });
    const b = openJobStore({ path: join(dir, "b.db") });
    a.put({
      job_id: "probe",
      state: "printed",
      attempts: 1,
      printer_name: "TH230",
      order_ref: ORDER_ID,
      document: Uint8Array.from([0x1b, 0x40]),
    });
    a.close();
    expect(openJobStore({ path: join(dir, "a.db") }).load()).toHaveLength(1);
    expect(b.load()).toHaveLength(0);
    b.close();
  });

  it("after a power cut, a line added reaches the kitchen and the old lines do not", async () => {
    // THE ASSERTION THAT DECIDES WHERE THE COVERAGE LIVES. Held in the process, it is defeated by
    // the relaunch — and the relaunch is precisely when both failures appear: a spool re-read
    // without it either reprints a chit already on the spike in the kitchen, or loses the addition.
    const path = join(dir, "spool.db");
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });

    const first = openJobStore({ path });
    const before = harness(order, { store: first });
    await sendToKitchen(before);
    expect(before.transport.sent).toHaveLength(1);
    first.close();

    order.addLine("line-b", "i-tikka", 3);

    const second = openJobStore({ path });
    const after = harness(order, { store: second });
    await sendToKitchen(after);
    second.close();

    // Exactly one document crossed the seam in the second process, and it is the addendum.
    expect(after.transport.sent).toHaveLength(1);
    expect(after.transport.sent[0]).toEqual(
      chit("GRILL", [{ quantity: 3, name: "Chicken Tikka" }], 1),
    );
    expect(decode(after.transport.sent[0] as Uint8Array)).not.toContain("Chicken Karahi");
  });

  it("after a power cut with NOTHING added, a press is still silent", async () => {
    // The other half, and the more dangerous one: a coverage record lost on restart makes every
    // relaunch reprint every open order's chits — the duplicate KOT arriving by a third route
    // (`03-F41`'s own phrase for it).
    const path = join(dir, "spool.db");
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });

    const first = openJobStore({ path });
    const before = harness(order, { store: first });
    await sendToKitchen(before);
    first.close();

    const second = openJobStore({ path });
    const after = harness(order, { store: second });
    await sendToKitchen(after);
    const jobs = jobsOf(after.spooler);
    second.close();

    expect(after.transport.sent).toHaveLength(0);
    expect(jobs).toHaveLength(1);
  });
});

// ── §E — 03-F5/03-F34: committed is not the same as printed ──────────────────────────────────

describe("03-F55 — 'committed to paper' means a JOB EXISTS, not that it printed", () => {
  it("a chit whose retries EXHAUSTED still counts as committed", async () => {
    // `03-F55`: its lines "belong to that chit and to `03-F6`'s reroute and `03-F48`'s reprint, and
    // repeating them on the next addendum would put one dish on two chits in a kitchen that has
    // been told to expect exactly one." The tempting implementation — coverage = what PRINTED —
    // passes every assertion in §A and doubles the karahi the first time a cable is loose.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order, { mode: "fail" });
    await sendToKitchen(h);
    expect(jobsOf(h.spooler)[0]?.state).toBe("failed");
    expect(h.printer.alarms()).toHaveLength(1);

    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);

    expect(jobsOf(h.spooler)).toHaveLength(2);
    const documents = h.transport.sent.map(decode);
    expect(documents.filter((d) => d.includes("Chicken Karahi"))).toHaveLength(
      MAX_TRANSMIT_ATTEMPTS,
    );
    // …and the addendum, however many times it was retried, never carries the karahi.
    expect(documents.filter((d) => d.includes("Chicken Tikka"))).not.toHaveLength(0);
    for (const document of documents.filter((d) => d.includes("Chicken Tikka"))) {
      expect(document).not.toContain("Chicken Karahi");
    }
  });

  it("03-F34 — a REFUSED document commits nothing, and the refusal stays single", async () => {
    // The mirror case. `03-F49`: a 58 mm printer cannot print a KOT at all, so no job is created
    // and nothing is committed — the lines are still owed to the kitchen and the next press renders
    // them again. `03-F55` keeps the FIRST chit's identifier unchanged precisely so the band and
    // the ledger record stay single across that repetition: `01-F1` makes every extra
    // `kot.print_failed` permanent, and the existing suite already pins the no-change case.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order, { model: "BC-58U" });
    await sendToKitchen(h);
    expect(jobsOf(h.spooler)).toHaveLength(0);
    expect(h.transport.send).not.toHaveBeenCalled();

    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);

    expect(jobsOf(h.spooler)).toHaveLength(0);
    expect(h.transport.send).not.toHaveBeenCalled();
    expect(h.printer.alarms()).toHaveLength(1);
    expect(h.appended.filter((e) => e.type === "kot.print_failed")).toHaveLength(1);
  });

  it("03-F51 — a screen-only station makes no job on the first press or on any later one", async () => {
    // "no bytes, no attempt, no retry budget, no band, no `kot.print_failed`" — and an addendum is
    // not a way back in. `03-F55` and `03-F51` decide absence at the same moment, before a job
    // exists, which is why neither can turn a transport outcome into silence.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order, { routesToPaper: () => false });
    await sendToKitchen(h);
    order.addLine("line-b", "i-tikka", 1);
    await sendToKitchen(h);

    expect(jobsOf(h.spooler)).toHaveLength(0);
    expect(h.transport.send).not.toHaveBeenCalled();
    expect(h.printer.alarms()).toHaveLength(0);
    expect(h.appended).toHaveLength(0);
  });
});

// ── §F — 01-F17: none of this may cost the sale ──────────────────────────────────────────────

describe("01-F17 — the addendum path never blocks a sale", () => {
  it("a transport that throws does not make the second press throw", async () => {
    const exploding: SpoolerTransport = {
      send: () => {
        throw new Error("EPIPE");
      },
      status: async () => PAPER_IN,
    };
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order, { transport: exploding });
    h.printer.confirmed(ORDER_ID);
    await h.printer.pump();
    order.addLine("line-b", "i-tikka", 1);
    expect(() => h.printer.confirmed(ORDER_ID)).not.toThrow();
    await expect(h.printer.pump()).resolves.toBeUndefined();
  });

  it("confirmed() still returns before ANY byte is transmitted — 03-F4's order of operations", async () => {
    // `03-F4` persists the job before the first transmit and `01-F17` makes the call synchronous;
    // an addendum that had to consult the spool asynchronously would put a socket on the stack of
    // the IPC handler that has not yet answered the cashier.
    const order = anOrder({ "line-a": { item_id: "i-karahi", qty: 1 } });
    const h = harness(order);
    await sendToKitchen(h);
    order.addLine("line-b", "i-tikka", 1);

    h.printer.confirmed(ORDER_ID);
    expect(h.transport.sent).toHaveLength(1);
    expect(jobsOf(h.spooler)).toHaveLength(2);
    expect(jobsOf(h.spooler)[1]?.state).toBe("queued");
    expect(jobsOf(h.spooler)[1]?.order_ref).toBe(ORDER_ID);
  });
});

// ── DEFERRED — what this suite could NOT assert, and who owns it ──────────────────────────────
//
// * **K-8, the physical pass.** No printer has printed an addendum, and `27-F35`'s comprehension
//   gate on real staff is what decides whether `ADDED 2` means anything to a cook.
// * **`03-F55`'s OWED (1) — the counter cannot see that it owes the kitchen anything.** The control
//   reads *Send to kitchen* whether or not there is something to send, so a cashier who never
//   presses it a second time still loses the line and nothing here stops her. That surface is doc
//   02's and doc 27's, and it is the remaining half of this defect.
// * **A spool written by the PREVIOUS version.** `03-F55` requires the first chit's identifier to
//   stay `<order_id>::<station>` so an upgrade does not reprint an open order's tickets. Asserting
//   it would mean seeding a row in the old shape, and a correct implementation that adds a column
//   to `print_jobs` would then red on the seed rather than on the behaviour — the round-3 law's
//   "a test RED under a correct implementation is as damaging as a vacuous one". The property is in
//   the FR; the assertion is owed to whoever writes the migration, if one is ever needed.
// * **A line VOIDED after its chit printed.** `02-F8` sends post-confirm removal through
//   `void.recorded`, which has no producer in this product, and `27-F56`'s `CANCEL`/`VOID` banners
//   have never been rendered. `03-F55` names it as owed rather than deciding it here.
// * **A confirm that arrived from a PEER device.** `03-F2` fans out per branch, not per device, and
//   this wiring prints only what this device appended — unchanged by this FR, and unreachable while
//   `01-F15`'s LAN mesh is hosted by nothing.
