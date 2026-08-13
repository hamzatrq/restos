// ACCEPTANCE TESTS — K-7: `order.confirmed` reaches the spooler, and a print failure is LOUD.
//
// PROVENANCE (24 §3 step 2): authored from spec text before `main/printing.ts` existed, by the
// session that then implemented against it. That is NOT the `24 §3` split and it is stated
// rather than glossed: the mitigation used here is the round-3 law — every assertion below was
// mutation-checked against a CONTROL implementation built out-of-tree, and the matrix is in the
// session report. A suite nobody has tried to break is a suite nobody knows the strength of.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   03-F2  "one `order.confirmed` fans out to N KOTs by category→printer rules".
//   03-F4  "every print job is persisted … BEFORE the first transmit attempt … Retry with
//          backoff (default 3 attempts over 30 s) on transport failure."
//   03-F5  "Silent KOT failure is forbidden. When retries exhaust: the host device raises a
//          loud alert … naming the printer and order ('KOT #142 did not print — grill printer
//          offline') … `kot.print_failed` is emitted … Testable: kill a printer mid-rush; the
//          alert shows within 45 s of confirm."
//   03-F34 "Failure is a hard refusal to print plus an S1 band (27-F11d), never a silent
//          degradation."
//   03-F41 a stall is NOT a failure: it "never counts toward the 3-attempt budget and never
//          re-transmits".
//   03-F49 the `kot` type declares 42 columns; below it the document is REFUSED, never squeezed.
//   03-F50 an unrouted line prints on the DEFAULT station's ticket rather than vanishing.
//   01-F17 "A sale is never blocked" — not by a printer, not by a full queue, not by an S1.
//   01-F54 an unknown item degrades to its identifier and never blocks.
//   02-F31 T1: `kot.printed` → lines `in_prep`. This suite asserts the EVENT is emitted; the
//          auto-advance itself needs T1 detection (a branch device registry) that does not
//          exist, and no assertion here may be read as claiming it.
//   27-F11d the S1 takes a BAND, never the screen. Asserted on the screen in
//          `renderer/print-alarm.dom.test.tsx`; this file owns the main-process half.
//
// ⚠ NO PRINTER HAS EVER BEEN ATTACHED (K-8 is owed in full). Every assertion below is about
// bytes handed to an object, calls made on a seam, and state transitions. Nothing here is
// evidence about paper, a cook, or a kitchen.

import { readFileSync } from "node:fs";
import {
  createSpooler,
  DOCUMENT_SPECS,
  type JobRecord,
  MAX_TRANSMIT_ATTEMPTS,
  type PaperStatus,
  printerCapability,
  RETRY_WINDOW_MS,
  render,
  type Spooler,
  type SpoolerTransport,
} from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { CHANNELS } from "../../shared/ipc";
import {
  createKotPrinter,
  type KotPrinterDeps,
  PUMP_INTERVAL_MS,
  unattachedPrinter,
} from "../printing";

// ── the fixture ─────────────────────────────────────────────────────────────────────────────

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
/** A SECOND order, for the rush case: a confirm landing while a pump is already in flight. */
const ORDER_ID_2 = "0199bbbb-0000-7000-8000-00000000ef01";
/** The same `reference` rule `gateway.ts` already applies — the counter's own short handle. */
const TICKET = ORDER_ID.slice(0, 8);
/** The confirm anchor `01-F43`/`27-F62` want stamped on the chit: branch time at APPEND. */
const CONFIRM_AT = 1_754_300_000_000;

const linesJson = (lines: Record<string, { item_id: string; qty: number }>): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(lines).map(([id, l]) => [
        id,
        { item_id: l.item_id, qty: l.qty, unit_price_paisa: 45_000, states: ["confirmed"] },
      ]),
    ),
  );

const TWO_STATIONS = linesJson({
  "line-a": { item_id: "i-karahi", qty: 2 },
  "line-b": { item_id: "i-naan", qty: 4 },
});
const ONE_STATION = linesJson({ "line-a": { item_id: "i-karahi", qty: 2 } });

const NAMES: Record<string, string> = { "i-karahi": "Chicken Karahi", "i-naan": "Garlic Naan" };
const STATIONS: Record<string, string> = { "i-karahi": "GRILL", "i-naan": "TANDOOR" };

type StoreOver = {
  json_lines?: string;
  channel?: string;
  table_ids_json?: string;
  queue?: boolean;
  /** A second confirmed order on the till — the rush case. */
  second?: boolean;
};

const stubStore = (over: StoreOver = {}): Pick<DeviceStore, "openOrders" | "kitchenQueue"> => {
  const ids = over.second === true ? [ORDER_ID, ORDER_ID_2] : [ORDER_ID];
  return {
    openOrders: () =>
      ids.map((order_id) => ({
        order_id,
        channel: over.channel ?? "counter",
        table_ids_json: over.table_ids_json ?? "[]",
        json_lines: over.json_lines ?? ONE_STATION,
        pay_total: 0,
      })),
    kitchenQueue: () =>
      over.queue === false
        ? []
        : ids.map((order_id) => ({ order_id, age_basis: CONFIRM_AT, channel: "counter" })),
  } as unknown as Pick<DeviceStore, "openOrders" | "kitchenQueue">;
};

/**
 * A transport whose behaviour a test drives directly. Three modes and nothing else, because
 * `classifyTransmit` (K-3) already owns the evidence→outcome decision and re-deriving it here
 * would make this fixture a second implementation of the thing under test.
 */
const fakeTransport = (mode: "ok" | "fail" | "stall" = "ok") => {
  const sent: Uint8Array[] = [];
  let current = mode;
  const t = {
    send: vi.fn(async (document: Uint8Array) => {
      sent.push(document);
      // One turn of the microtask queue before answering — enough that a second `pump()` can
      // start while this one is in flight, which is what the re-entrancy assertion needs.
      await Promise.resolve();
      if (current === "ok") return { ok: true } as const;
      if (current === "stall") return { ok: false, state: "stalled" } as const;
      return { ok: false, state: "failed" } as const;
    }),
    status: vi.fn(
      async (): Promise<PaperStatus> => ({
        paper_out: current === "stall",
        near_end: "unsupported",
      }),
    ),
    sent,
    set: (m: "ok" | "fail" | "stall") => {
      current = m;
    },
  };
  return t;
};

type Harness = {
  printer: ReturnType<typeof createKotPrinter>;
  spooler: Spooler;
  transport: ReturnType<typeof fakeTransport>;
  appended: { type: string; payload: Record<string, unknown> }[];
};

const harness = (
  opts: {
    mode?: "ok" | "fail" | "stall";
    store?: StoreOver;
    model?: string;
    station?: (item_id: string) => string;
    appendThrows?: boolean;
    transport?: SpoolerTransport;
  } = {},
): Harness => {
  const transport = fakeTransport(opts.mode ?? "ok");
  const spooler = createSpooler({ transport: opts.transport ?? transport });
  const appended: { type: string; payload: Record<string, unknown> }[] = [];
  const deps: KotPrinterDeps = {
    spooler,
    store: stubStore(opts.store),
    catalog: (item_id) =>
      NAMES[item_id] === undefined ? null : { name: NAMES[item_id] as string },
    station: opts.station ?? ((item_id) => STATIONS[item_id] ?? "kitchen"),
    capability: printerCapability(opts.model ?? "TH230"),
    append: (type, payload) => {
      appended.push({ type, payload });
      if (opts.appendThrows === true) throw new Error("the ledger refused this event");
    },
  };
  return { printer: createKotPrinter(deps), spooler, transport, appended };
};

/** Drive the spooler to its terminal state the way the interval in `main/index.ts` does. */
const pumpTo = async (h: Harness, times = MAX_TRANSMIT_ATTEMPTS): Promise<void> => {
  for (let i = 0; i < times; i += 1) await h.printer.pump();
};

const jobsOf = (s: Spooler): readonly JobRecord[] => s.jobs();

// ── A. the seam: `order.confirmed` reaches the spooler ───────────────────────────────────────

describe("03-F2/03-F4 — a confirm puts the KOT in the durable spooler", () => {
  it("enqueues one job carrying 03-F5's two nouns, before any transmit", async () => {
    const h = harness();
    h.printer.confirmed(ORDER_ID);

    // `03-F4`: "persisted … BEFORE the first transmit attempt". `confirmed()` is synchronous, so
    // the row exists and NOTHING has been sent by the time it returns — which is also `01-F17`
    // at the type level: a confirm that awaited a printer would be a sale blocked by one.
    expect(h.transport.send).not.toHaveBeenCalled();

    const jobs = jobsOf(h.spooler);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.state).toBe("queued");
    // `03-F5`'s alert "names the printer and order", and K-6 carries both nouns through a
    // restart — so they have to be ON the job, not held beside it in this process's memory.
    expect(jobs[0]?.printer_name).toBe("TH230");
    expect(jobs[0]?.order_ref).toBe(ORDER_ID);
  });

  it("sends the bytes `render()` produces for THIS order's data — not a constant", async () => {
    // The `K-4` lesson, applied one layer up: a suite that never varies `data` is passed by an
    // implementation that ignores `data` entirely. So this asserts byte-identity against an
    // INDEPENDENTLY built `KotData`, and then asserts two different orders differ.
    const spec = DOCUMENT_SPECS.kot;
    if (spec === undefined) throw new Error("@restos/escpos ships no `kot` spec");
    const caps = printerCapability("TH230");

    const h = harness({ store: { json_lines: ONE_STATION } });
    h.printer.confirmed(ORDER_ID);
    await h.printer.pump();

    const expected = render(
      spec,
      {},
      {
        ticket_no: TICKET,
        // `03-F3`: "order number + table/channel". No table is assigned, so the value is the
        // order's channel — one field, as the FR writes it.
        table: "counter",
        station: "GRILL",
        // `27-F62`: "print what was true at APPEND time, stamped with `branch_created_at`".
        branch_created_at: CONFIRM_AT,
        reprint: false,
        // `01-F54`: the catalog supplies the word; `03-F3` wants qty beside it.
        lines: [{ quantity: 2, name: "Chicken Karahi", modifiers: [] }],
      },
      caps,
    );
    if (!expected.ok) throw new Error(`fixture does not render: ${expected.reason}`);
    expect(h.transport.sent[0]).toEqual(expected.bytes);

    // …and a DIFFERENT order must not produce those same bytes.
    const other = harness({
      store: { json_lines: linesJson({ x: { item_id: "i-naan", qty: 9 } }) },
    });
    other.printer.confirmed(ORDER_ID);
    await other.printer.pump();
    expect(other.transport.sent[0]).not.toEqual(expected.bytes);
  });

  it("03-F3 — a dine-in ticket carries its TABLE where one is assigned", async () => {
    const h = harness({ store: { table_ids_json: JSON.stringify(["T4"]), channel: "counter" } });
    h.printer.confirmed(ORDER_ID);
    await h.printer.pump();
    const spec = DOCUMENT_SPECS.kot;
    if (spec === undefined) throw new Error("no kot spec");
    const withTable = render(
      spec,
      {},
      {
        ticket_no: TICKET,
        table: "T4",
        station: "GRILL",
        branch_created_at: CONFIRM_AT,
        reprint: false,
        lines: [{ quantity: 2, name: "Chicken Karahi", modifiers: [] }],
      },
      printerCapability("TH230"),
    );
    if (!withTable.ok) throw new Error("fixture does not render");
    expect(h.transport.sent[0]).toEqual(withTable.bytes);
  });

  it("03-F2 — one confirm fans out to N tickets, one per station, each carrying only its lines", async () => {
    const h = harness({ store: { json_lines: TWO_STATIONS } });
    h.printer.confirmed(ORDER_ID);
    await h.printer.pump();

    const jobs = jobsOf(h.spooler);
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.order_ref === ORDER_ID)).toBe(true);

    // A ticket that carried BOTH lines would have to lie about `station` — `KotData.station` is
    // one field — and the grill would be handed a naan it never cooks. So the split has to be
    // visible in the BYTES, not merely in the job count.
    const spec = DOCUMENT_SPECS.kot;
    if (spec === undefined) throw new Error("no kot spec");
    const caps = printerCapability("TH230");
    const ticketFor = (station: string, line: { quantity: number; name: string }) => {
      const r = render(
        spec,
        {},
        {
          ticket_no: TICKET,
          table: "counter",
          station,
          branch_created_at: CONFIRM_AT,
          reprint: false,
          lines: [{ ...line, modifiers: [] }],
        },
        caps,
      );
      if (!r.ok) throw new Error("fixture does not render");
      return r.bytes;
    };
    const grill = ticketFor("GRILL", { quantity: 2, name: "Chicken Karahi" });
    const tandoor = ticketFor("TANDOOR", { quantity: 4, name: "Garlic Naan" });
    expect(h.transport.sent).toHaveLength(2);
    expect([...h.transport.sent].sort((a, b) => a.length - b.length || compare(a, b))).toEqual(
      [grill, tandoor].sort((a, b) => a.length - b.length || compare(a, b)),
    );
  });

  it("03-F50 — an unrouted line prints on the default station rather than vanishing", async () => {
    // "a line silently absent from every ticket is the one failure the paper cannot reveal."
    const h = harness({
      store: { json_lines: TWO_STATIONS },
      station: () => "kitchen",
    });
    h.printer.confirmed(ORDER_ID);
    await h.printer.pump();
    expect(jobsOf(h.spooler)).toHaveLength(1);
    // Both lines are on it — count the glyph runs by rendering the two-line ticket independently.
    const spec = DOCUMENT_SPECS.kot;
    if (spec === undefined) throw new Error("no kot spec");
    const both = render(
      spec,
      {},
      {
        ticket_no: TICKET,
        table: "counter",
        station: "kitchen",
        branch_created_at: CONFIRM_AT,
        reprint: false,
        lines: [
          { quantity: 2, name: "Chicken Karahi", modifiers: [] },
          { quantity: 4, name: "Garlic Naan", modifiers: [] },
        ],
      },
      printerCapability("TH230"),
    );
    if (!both.ok) throw new Error("fixture does not render");
    expect(h.transport.sent[0]).toEqual(both.bytes);
  });

  it("01-F54 — an item the catalog cannot name degrades to its identifier and still prints", async () => {
    const h = harness({
      store: { json_lines: linesJson({ z: { item_id: "i-unknown", qty: 1 } }) },
    });
    h.printer.confirmed(ORDER_ID);
    await h.printer.pump();
    expect(jobsOf(h.spooler)).toHaveLength(1);
    expect(jobsOf(h.spooler)[0]?.state).toBe("printed");
    // The identifier is on the paper — the cook gets a line to ask about, not a blank ticket.
    expect(decode(h.transport.sent[0] as Uint8Array)).toContain("i-unknown");
  });

  it("does not enqueue a SECOND ticket for an order it has already queued", async () => {
    // A duplicate KOT means the dish is cooked twice, and `03-F7`/`03-F37` make a reprint a
    // deliberate, logged, REPRINT-banded act — which an accidental second confirm is not.
    const h = harness();
    h.printer.confirmed(ORDER_ID);
    h.printer.confirmed(ORDER_ID);
    expect(jobsOf(h.spooler)).toHaveLength(1);
    await pumpTo(h);
    expect(h.transport.sent).toHaveLength(1);
  });

  it("does not REPRINT a ticket that has already printed, when the confirm is repeated", async () => {
    // ADDED BY MUTATION (the guard above survived its own removal): a deterministic `job_id`
    // already collapses two confirms that arrive BEFORE the first attempt, so the assertion
    // above passed with the duplicate check deleted. The case that needs the check is the one
    // after the paper has moved — `enqueue` overwrites its row unconditionally, so a re-confirm
    // would reset a `printed` job to `queued` and print the ticket a second time WITH NO REPRINT
    // BAND (`03-F3`/`03-F37`). "Send to kitchen" is tappable twice, because an order stays open
    // until it is settled, so this is an ordinary mis-tap and not an exotic one.
    const h = harness({ mode: "ok" });
    h.printer.confirmed(ORDER_ID);
    await pumpTo(h);
    expect(jobsOf(h.spooler)[0]?.state).toBe("printed");

    h.printer.confirmed(ORDER_ID);
    await pumpTo(h);
    expect(h.transport.sent).toHaveLength(1);
    expect(h.appended.filter((e) => e.type === "kot.printed")).toHaveLength(1);
  });
});

// ── B. 01-F17 — a sale is never blocked ──────────────────────────────────────────────────────

describe("01-F17 — the sale is never blocked by the printer", () => {
  it("confirmed() returns without throwing when the transport throws", () => {
    const exploding: SpoolerTransport = {
      send: () => {
        throw new Error("EPIPE");
      },
      status: async () => ({ paper_out: false, near_end: "unsupported" }),
    };
    const h = harness({ transport: exploding });
    expect(() => h.printer.confirmed(ORDER_ID)).not.toThrow();
  });

  it("pump() never rejects, even when the transport throws — an interval cannot be poisoned", async () => {
    const exploding: SpoolerTransport = {
      send: () => {
        throw new Error("EPIPE");
      },
      status: async () => ({ paper_out: false, near_end: "unsupported" }),
    };
    const h = harness({ transport: exploding });
    h.printer.confirmed(ORDER_ID);
    await expect(h.printer.pump()).resolves.toBeUndefined();
  });

  it("a ledger append that FAILS still leaves the S1 raised", async () => {
    // `03-F5`'s three consequences are independent: the alert is what a human acts on, the event
    // is what doc 05 reads. Losing the second must never cost the first — that is the silent
    // failure this FR exists to forbid, arriving through the back door.
    const h = harness({ mode: "fail", appendThrows: true });
    h.printer.confirmed(ORDER_ID);
    await pumpTo(h);
    expect(h.printer.alarms()).toHaveLength(1);
  });

  it("a render refusal on one order leaves the printer working for the next", async () => {
    const h = harness({ model: "BC-58U" });
    h.printer.confirmed(ORDER_ID);
    expect(jobsOf(h.spooler)).toHaveLength(0);
    expect(() => h.printer.confirmed(ORDER_ID)).not.toThrow();
  });
});

// ── C. 03-F5 — retries exhaust, and the failure is LOUD ──────────────────────────────────────

describe("03-F5 — a silent KOT failure is forbidden", () => {
  it("raises NOTHING while the 03-F4 budget is still unspent", async () => {
    // A band on the first failed attempt is a band that cries wolf, and `27-F11d`'s whole
    // argument is that an alarm staff learn to ignore is worse than none.
    const h = harness({ mode: "fail" });
    h.printer.confirmed(ORDER_ID);
    for (let i = 1; i < MAX_TRANSMIT_ATTEMPTS; i += 1) {
      await h.printer.pump();
      expect(h.printer.alarms(), `after attempt ${i}`).toHaveLength(0);
      expect(h.appended.filter((e) => e.type === "kot.print_failed")).toHaveLength(0);
    }
    expect(jobsOf(h.spooler)[0]?.state).toBe("queued");
  });

  it("a ticket queued while a pump is IN FLIGHT does not raise a band of its own", async () => {
    // ADDED BY MUTATION. The test above compares each job's state before and after a pump, so an
    // implementation that raised on `queued` as well as `failed` still passed it — a job that
    // was queued and is queued again never registers as a change. The escape is the rush case:
    // a confirm landing mid-pump is a job the previous snapshot has never seen, and a band
    // naming an order that has not even been attempted yet is `27-F11d`'s alarm staff learn to
    // ignore, arriving on the busiest surface in the building.
    const h = harness({ mode: "fail", store: { second: true } });
    h.printer.confirmed(ORDER_ID);
    const inflight = h.printer.pump();
    h.printer.confirmed(ORDER_ID_2);
    await inflight;
    expect(jobsOf(h.spooler)).toHaveLength(2);
    expect(h.printer.alarms()).toHaveLength(0);
  });

  it("a repeated confirm on a REFUSING printer does not append a second kot.print_failed", async () => {
    // ADDED BY MUTATION, and it found a live defect rather than only a weak assertion: the
    // refusal path enqueues nothing, so it has no spooler row to de-duplicate against, and every
    // tap of "Send to kitchen" wrote another `kot.print_failed` into a ledger `01-F1` forbids
    // correcting in place. The band was always single (a `Map` key), which is exactly why
    // reading the code did not show it.
    const h = harness({ model: "BC-58U" });
    h.printer.confirmed(ORDER_ID);
    h.printer.confirmed(ORDER_ID);
    expect(h.printer.alarms()).toHaveLength(1);
    expect(h.appended.filter((e) => e.type === "kot.print_failed")).toHaveLength(1);
  });

  it("when retries exhaust: ONE alarm naming the printer AND the order, and kot.print_failed", async () => {
    const h = harness({ mode: "fail" });
    h.printer.confirmed(ORDER_ID);
    await pumpTo(h);

    expect(jobsOf(h.spooler)[0]?.state).toBe("failed");

    const alarms = h.printer.alarms();
    expect(alarms).toHaveLength(1);
    const shown = `${alarms[0]?.message} ${alarms[0]?.subject}`;
    // BOTH nouns, in the text a human reads. `03-F5` names them together for a reason: "KOT #142
    // did not print" without the printer sends a cashier hunting, and "grill printer offline"
    // without the order does not say which food is not being cooked.
    expect(shown).toContain(TICKET);
    expect(shown).toContain("TH230");

    const failed = h.appended.filter((e) => e.type === "kot.print_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.payload.order_id).toBe(ORDER_ID);
    expect(failed[0]?.payload.printer_name).toBe("TH230");
    // A failed KOT is not a printed one.
    expect(h.appended.filter((e) => e.type === "kot.printed")).toHaveLength(0);
  });

  it("repeated pumps after the failure do not duplicate the alarm or the ledger event", async () => {
    // `01-F1` — a duplicated event cannot be deleted, only corrected; and a band that multiplied
    // once per pump would become `27-F11d`'s "band that has become the screen".
    const h = harness({ mode: "fail" });
    h.printer.confirmed(ORDER_ID);
    await pumpTo(h, MAX_TRANSMIT_ATTEMPTS + 4);
    expect(h.printer.alarms()).toHaveLength(1);
    expect(h.appended.filter((e) => e.type === "kot.print_failed")).toHaveLength(1);
  });

  it("acknowledgement clears the band, and only the acknowledged one", async () => {
    const h = harness({ mode: "fail", store: { json_lines: TWO_STATIONS } });
    h.printer.confirmed(ORDER_ID);
    await pumpTo(h);
    const alarms = h.printer.alarms();
    expect(alarms).toHaveLength(2);
    h.printer.acknowledge(alarms[0]?.id as string);
    expect(h.printer.alarms().map((a) => a.id)).toEqual([alarms[1]?.id]);
  });

  it("03-F5's 45-second bound is met by the schedule this app actually runs", () => {
    // "Testable: kill a printer mid-rush; the alert shows within 45 s of confirm." The first
    // attempt is immediate at confirm, so the last of `MAX_TRANSMIT_ATTEMPTS` lands after
    // (MAX - 1) intervals. Asserted against the exported constant so a schedule change that
    // breaks the FR reddens here rather than in a kitchen.
    expect((MAX_TRANSMIT_ATTEMPTS - 1) * PUMP_INTERVAL_MS).toBeLessThanOrEqual(45_000);
    // …and it must genuinely spend `03-F4`'s 30 s window rather than burning the budget in one
    // tick, which would turn a printer that was merely slow into a failed one.
    expect(MAX_TRANSMIT_ATTEMPTS * PUMP_INTERVAL_MS).toBe(RETRY_WINDOW_MS);
  });
});

// ── D. the printed path, and 03-F41's stall ──────────────────────────────────────────────────

describe("02-F31/03-F41 — printed is printed, and a stall is not a failure", () => {
  it("a successful transmit appends kot.printed once and raises nothing", async () => {
    const h = harness({ mode: "ok" });
    h.printer.confirmed(ORDER_ID);
    await pumpTo(h, 3);
    expect(jobsOf(h.spooler)[0]?.state).toBe("printed");
    const printed = h.appended.filter((e) => e.type === "kot.printed");
    expect(printed).toHaveLength(1);
    expect(printed[0]?.payload.order_id).toBe(ORDER_ID);
    expect(h.printer.alarms()).toHaveLength(0);
  });

  it("a stalled printer raises NO band, emits NOTHING, and prints once when the roll returns", async () => {
    // `03-F41`: the printer is HOLDING the bytes. An S1 here would send a cashier to reprint a
    // ticket that is about to come out of the machine — the duplicate KOT by a human route.
    const h = harness({ mode: "stall" });
    h.printer.confirmed(ORDER_ID);
    await pumpTo(h, MAX_TRANSMIT_ATTEMPTS + 2);
    expect(jobsOf(h.spooler)[0]?.state).toBe("stalled");
    expect(jobsOf(h.spooler)[0]?.attempts).toBe(0);
    expect(h.printer.alarms()).toHaveLength(0);
    expect(h.appended).toHaveLength(0);

    h.transport.set("ok");
    await h.printer.pump();
    expect(jobsOf(h.spooler)[0]?.state).toBe("printed");
    expect(h.appended.filter((e) => e.type === "kot.printed")).toHaveLength(1);
    // Exactly one document ever crossed the seam — the whole point of `03-F41`.
    expect(h.transport.sent).toHaveLength(1);
  });

  it("concurrent pumps do not double-transmit one job", async () => {
    const h = harness({ mode: "ok" });
    h.printer.confirmed(ORDER_ID);
    await Promise.all([h.printer.pump(), h.printer.pump()]);
    expect(h.transport.sent).toHaveLength(1);
  });
});

// ── E. 03-F34 — a hard refusal, never a silent degradation ───────────────────────────────────

describe("03-F34/03-F49 — a document that cannot be rendered is REFUSED, loudly", () => {
  it("a 58 mm printer gets NO bytes, an S1 naming the reason, and kot.print_failed", async () => {
    // `03-F49`: `kot` declares 42 columns and a BC-58U reports 32. Squeezing it is the banned
    // behaviour; printing nothing and saying nothing is the other banned behaviour.
    const h = harness({ model: "BC-58U" });
    h.printer.confirmed(ORDER_ID);

    expect(jobsOf(h.spooler)).toHaveLength(0);
    expect(h.transport.send).not.toHaveBeenCalled();

    const alarms = h.printer.alarms();
    expect(alarms).toHaveLength(1);
    const shown = `${alarms[0]?.message} ${alarms[0]?.subject}`;
    expect(shown).toContain(TICKET);
    expect(shown).toContain("BC-58U");
    // The CAUSE is on the band. `render()` distinguishes its refusals precisely so the band can
    // say which one happened; collapsing them sends the operator to read a spec.
    expect(shown).toContain("min_columns_not_met");

    const failed = h.appended.filter((e) => e.type === "kot.print_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.payload.printer_name).toBe("BC-58U");
  });

  it("an order the fold does not hold as CONFIRMED prints nothing and raises nothing", async () => {
    // The queue projection's own rule is "row exists iff confirmed". No confirm, no chit — and
    // no alarm either, because nothing has failed.
    const h = harness({ store: { queue: false } });
    h.printer.confirmed(ORDER_ID);
    expect(jobsOf(h.spooler)).toHaveLength(0);
    expect(h.printer.alarms()).toHaveLength(0);
    expect(h.appended).toHaveLength(0);
  });
});

// ── F. the transport this device actually ships with ─────────────────────────────────────────

describe("18 §10 — the device has no printer link, and says so through the normal path", () => {
  it("unattachedPrinter reports a FAILED transmit (never ok, never stalled)", async () => {
    const caps = printerCapability("TH230");
    const t = unattachedPrinter(caps);
    const outcome = await t.send(Uint8Array.from([0x1b, 0x40]));
    expect(outcome.ok).toBe(false);
    // `03-F41`: answering `stalled` would make the spooler hold the job forever and NEVER raise
    // `03-F5`'s band — a silent KOT failure produced by the one seam that stands in for hardware.
    expect(outcome.ok === false ? outcome.state : null).toBe("failed");
  });

  it("drives the whole 03-F5 path end to end", async () => {
    const h = harness({ transport: unattachedPrinter(printerCapability("TH230")) });
    h.printer.confirmed(ORDER_ID);
    await pumpTo(h);
    expect(h.printer.alarms()).toHaveLength(1);
    expect(h.appended.filter((e) => e.type === "kot.print_failed")).toHaveLength(1);
  });
});

// ── G. THE SEAM — the production caller, which is the whole point of K-7 ──────────────────────

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

describe("the wave's recurring defect — this subsystem has a PRODUCTION caller", () => {
  const mainSrc = readSrc("index.ts");
  const preloadSrc = readSrc("../preload/index.ts");

  it("is actually reading the two files it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string
    // reports clean. Anchored on lines that have nothing to do with printing, so this check
    // cannot be satisfied by the very code it is guarding.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc.length).toBeGreaterThan(4_000);
    expect(preloadSrc).toContain("contextBridge.exposeInMainWorld");
  });

  it("main/index.ts CONSTRUCTS the spooler and the printer", () => {
    // `createSpooler` shipped with 244 tests and zero production callers. So did
    // `createPinSession`. This assertion is the one that would have caught both.
    expect(mainSrc).toMatch(/createSpooler\s*\(/);
    expect(mainSrc).toMatch(/createKotPrinter\s*\(/);
  });

  // ── ADDED August 2026 — the SAME defect, one argument along ────────────────────────────────
  // K-7 closed "`createSpooler` has no production caller" and opened "the production caller
  // passes no store": `SpoolerOptions.store` is optional, so the shipped queue was
  // process-lifetime, `03-F4`'s crash clause was unmet, a relaunch lost every queued ticket, and
  // every gate stayed green — because a host that forgets the argument is invisible to
  // `packages/escpos`, which is exactly what K-6's own oracle says about it. Behaviour is
  // asserted in `spooler-job-store.test.ts`; this is the SEAM, and it is the assertion that
  // would have caught the four-month-old version of this same mistake in `store.pinAttempts`.
  it("main/index.ts passes a DURABLE STORE to the spooler — 03-F4's crash clause", () => {
    expect(
      mainSrc,
      "03-F4 — a spooler constructed without a store loses the kitchen's tickets on a power cut",
    ).toMatch(/createSpooler\s*\(\s*\{[^}]*\bstore\s*:/);
    // And the store is a real one over a real path, not an object literal that satisfies the
    // regex above. `userData` is Electron's per-install writable directory; an in-memory or
    // temp-dir spool is the same defect with a file in front of it.
    expect(mainSrc).toMatch(/openJobStore\s*\(/);
    expect(mainSrc).toContain('app.getPath("userData")');
  });

  it("main/index.ts calls the printer FROM the order.confirmed append path", () => {
    expect(mainSrc).toContain("order.confirmed");
    expect(mainSrc).toMatch(/\.confirmed\s*\(/);
  });

  it("main/index.ts drives the pump on a schedule, so retries actually exhaust", () => {
    // Without a driver the job sits `queued` forever: no bytes, no failure, no band — the
    // silent KOT failure `03-F5` forbids, produced by an absent `setInterval`.
    expect(mainSrc).toMatch(/setInterval\s*\(/);
    expect(mainSrc).toContain("PUMP_INTERVAL_MS");
    expect(mainSrc).toMatch(/\.pump\s*\(/);
  });

  it("both alarm channels are served in main and exposed in the preload bridge", () => {
    for (const src of [mainSrc, preloadSrc]) {
      expect(src).toContain("CHANNELS.alarms");
      expect(src).toContain("CHANNELS.acknowledgeAlarm");
    }
    // And the channel names exist on the contract at all.
    expect(CHANNELS.alarms).toBe("restos:alarms");
    expect(CHANNELS.acknowledgeAlarm).toBe("restos:acknowledge-alarm");
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────────────────────

const compare = (a: Uint8Array, b: Uint8Array): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/** ASCII only — `00 §5.6` makes chit text English, and this reads the glyph bytes, not layout. */
const decode = (bytes: Uint8Array): string =>
  [...bytes].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : " ")).join("");

// ── DEFERRED — what this suite could NOT assert, and who owns it ─────────────────────────────
//
// * **K-8, the physical pass.** No printer exists. Nothing here is evidence about paper.
// * **`03-F5`'s acknowledgement log.** The FR says the ack is logged (`audit.*`), and `01-F5`'s
//   closed set has no subtype for it (`login`, `drawer_opened`, `reprint`, `threshold_override`,
//   `settings_changed`). Inventing one is Commandment 2, so the ack is in-memory only and this
//   suite asserts no log. Owed: a spec PR to `01-F5`/`03-F5`.
// * **An S1 raised and not acknowledged before a restart is LOST.** Alarms are raised from
//   observed state transitions, and a restored `failed` job is already terminal. The named
//   alternative — re-raise for every restored `failed` job — was rejected because an ack that is
//   not persisted anywhere (see the bullet above) would make the band un-clearable across
//   restarts. Both directions need the same missing FR.
// * **`02-F31`'s auto-advance to `in_prep`.** This suite asserts `kot.printed` is emitted; the
//   advance needs T1 detection (a branch device registry) that does not exist.
// * **`03-F6`'s one-tap reroute and `03-F48`'s one-tap reprint.** Both need a printer registry
//   (`03-F2`'s routing table, doc 14) that does not exist. The band is read-only today.
// * **Who prints a confirm that arrived from a PEER device.** `03-F2` fans out per branch, not
//   per device; this wiring prints only what this device appended.
