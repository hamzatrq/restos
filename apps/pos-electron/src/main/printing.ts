import {
  classifyTransmit,
  DOCUMENT_SPECS,
  type KotData,
  MAX_TRANSMIT_ATTEMPTS,
  type PrinterCapability,
  RETRY_WINDOW_MS,
  render,
  type Spooler,
  type SpoolerTransport,
} from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import type { Alarm } from "../shared/ipc";
import type { CatalogResolver } from "./gateway";

/**
 * K-7 — the wire between `order.confirmed` and the paper, and `03-F5`'s band on the counter.
 *
 * `packages/escpos` had the whole module and no caller: the encoder, the layout, the pure
 * `render()` and a 244-test durable spooler, none of which any shipped code path reached. That
 * is this wave's named defect (AGENTS.md), and it is why this file's own acceptance suite spends
 * as much of itself on `main/index.ts`'s source as on the logic below.
 *
 * The FRs this file exists to satisfy, and the shape each one forces:
 *
 *   * `03-F2` — "one `order.confirmed` fans out to N KOTs". So `confirmed()` groups by station
 *     and enqueues one job per group: `KotData.station` is ONE field, and a chit carrying two
 *     stations' lines would have to lie in it.
 *   * `03-F4` — the job is persisted before the first transmit, and `01-F17` makes `enqueue`
 *     synchronous. `confirmed()` therefore returns before any I/O has been attempted.
 *   * `03-F5` — a silent failure is forbidden. When the retry budget exhausts, an S1 naming the
 *     printer and the order is raised HERE, on the host device, and `kot.print_failed` is
 *     appended for doc 05 (`05-F3`).
 *   * `03-F34` — a document that cannot be rendered is REFUSED, loudly. A refusal enqueues
 *     nothing at all and raises the same band; there is no degraded ticket.
 *   * `03-F41` — a stall is not a failure. Nothing here inspects `stalled`, which is how it
 *     stays that way: the printer is holding the bytes, and a band would send a cashier to
 *     reprint a ticket that is about to appear.
 *
 * **NO PRINTER HAS EVER BEEN ATTACHED (K-8).** `unattachedPrinter` below is this device's real
 * transport today and it reports a failed transmit every time, because that is the truth: no
 * USB, Bluetooth or 9100 transport exists (`18 §10`). Nothing in this file is evidence about
 * paper or about a kitchen.
 */

/**
 * `03-F50` — the station that cooks a line, resolved up the `01-F21` chain. A function seam for
 * the same reason `CatalogResolver` and `PriceResolver` are: this file must test without a
 * database, and the resolution itself belongs to `sync-client`'s catalog (`DEFAULT_STATION` is
 * ITS constant, not a second copy here).
 */
export type StationResolver = (item_id: string) => string;

export type KotPrinterDeps = {
  /** `03-F4`'s durable queue. CONSTRUCTED BY THE HOST, so `main/index.ts` is its caller. */
  spooler: Spooler;
  /** Two fold projections: the confirm anchor (`kitchenQueue`) and the lines (`openOrders`). */
  store: Pick<DeviceStore, "openOrders" | "kitchenQueue">;
  /** `01-F54` — an unknown item degrades to its identifier rather than vanishing off the chit. */
  catalog: CatalogResolver;
  station: StationResolver;
  /** `03 §7` layer 3. `03-F49`'s column floor is checked against this, inside `render()`. */
  capability: PrinterCapability;
  /**
   * `03-F5`'s ledger consequence and `02-F31`'s precondition. A plain `(type, payload)` rather
   * than the store, because this file must not own envelope stamping — `gateway.append` already
   * does, including `02-F41`'s read-at-append attribution.
   */
  append: (type: string, payload: Record<string, unknown>) => void;
};

export type KotPrinter = {
  /**
   * An `order.confirmed` has landed. Renders, enqueues, and kicks the first attempt.
   *
   * **Synchronous and `void`, and that is `01-F17` at the type level.** A sale is never blocked
   * by a printer; a `Promise` here would invite the append path to await one, and the cashier
   * would be watching a spinner over a socket timeout with a customer in front of her.
   */
  confirmed: (order_id: string) => void;
  /** Advance every live job by at most one transport interaction. Never rejects. */
  pump: () => Promise<void>;
  /** `03-F5`'s unacknowledged S1s, oldest first (`27-F11d` renders the head plus a count). */
  alarms: () => readonly Alarm[];
  acknowledge: (alarm_id: string) => void;
};

/**
 * How often the host must pump for `03-F4`'s budget to be spent over `03-F4`'s window.
 *
 * `03-F4` says "3 attempts over 30 s" and `03-F5` says the alert shows "within 45 s of confirm".
 * The spooler advances a job by at most one attempt per `pump()` and deliberately owns no clock
 * (`RETRY_WINDOW_MS`'s own comment: "the BUDGET is enforced here; the SPACING is not"), so the
 * spacing is exactly this constant. Derived rather than typed as `10_000` so that changing
 * either FR constant cannot silently leave the schedule describing the old one.
 */
export const PUMP_INTERVAL_MS = RETRY_WINDOW_MS / MAX_TRANSMIT_ATTEMPTS;

/** One cell of the order projection's `json_lines`, as `gateway.ts` reads it too. */
type LineCell = { item_id: string; qty: number };

/** `03-F3`: "order number + table/channel in large type" — ONE field, filled in that order. */
const tableOf = (table_ids_json: string, channel: string): string => {
  const ids = JSON.parse(table_ids_json) as string[];
  return ids[0] ?? channel;
};

export const createKotPrinter = ({
  spooler,
  store,
  catalog,
  station,
  capability,
  append,
}: KotPrinterDeps): KotPrinter => {
  const spec = DOCUMENT_SPECS.kot;
  if (spec === undefined) {
    // At construction, so it surfaces in `main/index.ts`'s startup dialog rather than as a
    // ticket that quietly never prints. `03-F30` ships the specs as code, so this cannot fire.
    throw new Error(
      "@restos/escpos ships no `kot` DocumentSpec (03-F30) — this device cannot print",
    );
  }
  const printer_name = capability.model_id;
  /** Oldest first: `AlarmBand` renders the head and counts the tail (`27-F11d`). */
  const raised = new Map<string, Alarm>();
  let pumping = false;

  /**
   * `01-F17` — a failed ledger write must not cost the band. `03-F5`'s three consequences are
   * independent: the alert is what a human acts on, the event is what doc 05 reads, and losing
   * the second silently is survivable where losing the first is exactly the harm the FR names.
   * The same swallow, and the same reason, as `createPinAuditSink`'s in `main/index.ts`.
   */
  const emit = (type: string, payload: Record<string, unknown>): void => {
    try {
      append(type, payload);
    } catch {
      // No FR names a surface that owns "the ledger record could not be written".
    }
  };

  const raise = (id: string, order_ref: string, why: string): void => {
    // Keyed by job, so a pump that runs every 10 s cannot multiply one failure into a band that
    // "has become the screen" (`27-F11d`), and an acknowledged one stays acknowledged.
    if (raised.has(id)) return;
    raised.set(id, {
      // `03-F5`'s own sentence: "KOT #142 did not print — grill printer offline". Both nouns in
      // the line a cashier reads first, because either one alone is unactionable — the order
      // without the printer sends her hunting, the printer without the order does not say which
      // food is not being cooked.
      message: `KOT ${order_ref.slice(0, 8)} did not print — ${printer_name}`,
      subject: why,
      id,
    });
  };

  const confirmed = (order_id: string): void => {
    // The queue projection's own rule is "row exists iff confirmed", and its `age_basis` IS the
    // confirm anchor — which is what `27-F62` wants stamped on the chit ("print what was true at
    // APPEND time, stamped with `branch_created_at`"). Reading branch time here instead would
    // stamp the moment the printer got round to it.
    const queued = store.kitchenQueue().find((row) => row.order_id === order_id);
    if (queued === undefined) return;
    const order = store.openOrders().find((row) => row.order_id === order_id);
    if (order === undefined) return;

    const table = tableOf(order.table_ids_json, order.channel);
    // `03-F2`'s fan-out. `03-F50`: a line whose station resolves nowhere lands on the default
    // station's ticket rather than vanishing — the resolver owns that fallback, not this loop.
    const byStation = new Map<string, KotData["lines"][number][]>();
    for (const cell of Object.values(JSON.parse(order.json_lines) as Record<string, LineCell>)) {
      const at = station(cell.item_id);
      const lines = byStation.get(at) ?? [];
      lines.push({
        quantity: cell.qty,
        // `01-F54` — the identifier is a poor word and a blank line is a dish nobody cooks.
        name: catalog(cell.item_id)?.name ?? cell.item_id,
        // The read models carry no modifier detail yet (`gateway.ts` says the same); empty is
        // honest, and inventing it here would be fold logic outside the engine (`26 §8`).
        modifiers: [],
      });
      byStation.set(at, lines);
    }

    for (const [at, lines] of byStation) {
      const job_id = `${order_id}::${at}`;
      // A duplicate KOT means the dish is cooked twice, and `03-F7`/`03-F37` make a reprint a
      // deliberate, logged, REPRINT-banded act — which a second `order.confirmed` for the same
      // order is not. Deterministic ids make that check possible at all.
      if (spooler.job(job_id) !== undefined) continue;

      const result = render(
        spec,
        // No owner profile: `03-F30`'s customisation surface is doc 14's and does not exist yet,
        // so every declared slot takes its shipped default (an empty note).
        {},
        {
          ticket_no: order_id.slice(0, 8),
          table,
          station: at,
          branch_created_at: queued.age_basis,
          reprint: false,
          lines,
        } satisfies KotData,
        capability,
      );
      if (!result.ok) {
        // `03-F34`: "a hard refusal to print plus an S1 band, never a silent degradation". So
        // NOTHING is enqueued — there are no bytes a caller could print anyway — and the band
        // carries the cause, because `render()` distinguishes its refusals precisely so it can.
        const measured =
          result.required_columns === undefined || result.available_columns === undefined
            ? ""
            : ` — needs ${result.required_columns} columns, this printer has ${result.available_columns}`;
        emit("kot.print_failed", { order_id, printer_name });
        raise(job_id, order_id, `refused: ${result.reason}${measured}`);
        continue;
      }
      spooler.enqueue({
        job_id,
        document: result.bytes,
        printer_name,
        // The FULL id, not the eight-character handle: K-6 carries this through a restart and a
        // truncated reference cannot key `kot.print_failed`'s `order_id`. The band shortens it.
        order_ref: order_id,
      });
    }

    // The first attempt immediately — `03-F5`'s 45 s bound is measured from the confirm, and a
    // job that waited for the next 10 s tick would spend a third of the budget doing nothing.
    //
    // `queueMicrotask`, not a bare `void pump()`, and the difference is `01-F17` rather than
    // style: `await transport.send(...)` INVOKES `send` synchronously before it suspends, so a
    // direct call would reach the socket inside this function — on the stack of the IPC handler
    // that has not yet answered the cashier's confirm. Deferring by one microtask means the
    // append is acknowledged first and the printer is never on the sale's critical path.
    queueMicrotask(() => void pump());
  };

  const reconcile = (before: ReadonlyMap<string, string>): void => {
    for (const job of spooler.jobs()) {
      if (before.get(job.job_id) === job.state) continue;
      if (job.state === "printed") {
        // `02-F31`'s precondition — T1 advances lines to `in_prep` off this event. The advance
        // itself needs a branch device registry that does not exist; this is the fact it needs.
        emit("kot.printed", { order_id: job.order_ref });
        continue;
      }
      if (job.state === "failed") {
        emit("kot.print_failed", { order_id: job.order_ref, printer_name: job.printer_name });
        raise(job.job_id, job.order_ref, `printing failed after ${job.attempts} attempts`);
      }
      // `stalled` is deliberately absent (`03-F41`): the printer TOOK the bytes and is holding
      // them until the roll is replaced. A band here is the duplicate KOT arriving by a human.
    }
  };

  const pump = async (): Promise<void> => {
    // One pump at a time. The interval and `confirmed()`'s immediate kick can overlap on a slow
    // link, and two concurrent passes would hand one job's document to the transport twice.
    if (pumping) return;
    pumping = true;
    const before = new Map(spooler.jobs().map((job) => [job.job_id, job.state] as const));
    try {
      await spooler.pump();
    } catch {
      // `01-F17`: a transport that throws instead of answering (a non-conforming one — `18 §10`
      // says `send` REPORTS its outcome) must not poison the interval, which is the only thing
      // driving these retries toward `03-F5`'s band.
    } finally {
      pumping = false;
    }
    reconcile(before);
  };

  return {
    confirmed,
    pump,
    alarms: () => [...raised.values()],
    acknowledge: (alarm_id) => {
      // `03-F5` also says the acknowledgement is logged (`audit.*`) — and `01-F5`'s closed set
      // has no subtype for it (`login`, `drawer_opened`, `reprint`, `threshold_override`,
      // `settings_changed`). Inventing one is Commandment 2, so the ack is in-memory only and
      // that half of the FR is OWED, named here rather than left to look intentional.
      raised.delete(alarm_id);
    },
  };
};

/**
 * The transport this device actually has: none.
 *
 * `18 §10`'s USB, Bluetooth and TCP-9100 transports are unbuilt and K-8 — the physical pass — is
 * owed in full, so every transmit reports that the printer did not answer. That is not a stub
 * standing in for hardware; it is the honest reading of a device with no printer link (`00 §5.7`
 * — the device reports what it knows), and it routes through `03-F4`'s ordinary retry budget to
 * `03-F5`'s band, which is exactly what the operator should see: nothing is printing, and the
 * counter is told so within 45 s.
 *
 * `classifyTransmit` decides the outcome rather than a literal, so this cannot drift from K-3's
 * classifier. Note which one it produces: **`failed`, never `stalled`.** A stall would make the
 * spooler hold the job forever and never exhaust the budget — a silent KOT failure manufactured
 * by the one seam that stands in for hardware.
 */
export const unattachedPrinter = (capability: PrinterCapability): SpoolerTransport => ({
  send: async () =>
    classifyTransmit({ status: null, timed_out: false, link_error: null }, capability),
  status: async () => ({
    paper_out: false,
    near_end: capability.has_near_end_sensor ? false : "unsupported",
  }),
});
