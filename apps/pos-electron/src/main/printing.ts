import {
  businessDate,
  ORDER_CHANNELS,
  type OrderChannel,
  PAYMENT_METHODS,
  type PaymentMethod,
  totalPaisaOrNull,
} from "@restos/domain";
import {
  classifyTransmit,
  type DaySummaryData,
  DOCUMENT_SPECS,
  type KotData,
  MAX_TRANSMIT_ATTEMPTS,
  type PrinterCapability,
  RETRY_WINDOW_MS,
  type ReceiptData,
  render,
  type ShiftCloseData,
  type Spooler,
  type SpoolerTransport,
} from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { billedEffectiveFromJsonLines } from "@restos/sync-client";
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

/**
 * `03-F22`/`03-F51` — does this station take paper?
 *
 * A function seam for `StationResolver`'s reason (this file must test without a config source), and
 * a BOOLEAN rather than `FulfilmentRoute` on purpose: the printer's only legitimate question is
 * whether to make a job. A printer that could read `"screen"` is a printer that could grow a second
 * opinion about what a screen-only station means, and `station-routing.ts` would stop being the one
 * place that decides.
 */
export type PaperRouteResolver = (station: string) => boolean;

export type KotPrinterDeps = {
  /** `03-F4`'s durable queue. CONSTRUCTED BY THE HOST, so `main/index.ts` is its caller. */
  spooler: Spooler;
  /** Two fold projections: the confirm anchor (`kitchenQueue`) and the lines (`openOrders`). */
  store: Pick<DeviceStore, "openOrders" | "kitchenQueue">;
  /** `01-F54` — an unknown item degrades to its identifier rather than vanishing off the chit. */
  catalog: CatalogResolver;
  station: StationResolver;
  /**
   * `03-F51` — the per-station fulfilment route, as the one boolean this file may ask.
   *
   * **OPTIONAL, defaulting to `paper` everywhere, and the reason is `24 §3` step 2 rather than
   * design taste.** `__acceptance__/kot-printing.test.ts` and `__acceptance__/print-ack-audit.
   * test.ts` both construct this printer and both predate this dep; they are oracles this session
   * may not edit, so a REQUIRED member would redden two suites for a surface neither exercises.
   * The default is `() => true`, which is the behaviour of every branch before `03-F51` existed —
   * so an omission cannot change what any existing caller does.
   *
   * That makes it exactly the shape AGENTS.md warns about (an optional seam nobody supplies), and
   * **`pnpm seams:check` DOES NOT HOLD IT — measured, not assumed.** Rule B's loop opens with
   * `if (groupOf(mod.file) !== "packages") continue;` (`scripts/check-seams.mjs`), so it only ever
   * examines factories declared under `packages/`. Every factory in this file is in an APP, so
   * none of their optional members is a Rule-B candidate at all. Both mutants were run: deleting
   * the supply in `main/index.ts` outright, and replacing it with `() => true`. `pnpm seams:check`
   * is **exit 0 and CLEAN under both**, and its own summary line reports the same `5 optional
   * seams` either way — this member was never counted.
   *
   * So the ONLY thing standing between this seam and the wave's named defect is the hand-written
   * `__acceptance__/station-routing-seam.test.ts` §E, which drives the host's own construction.
   * (⚠ `CashPrinterDeps.append` below carries the opposite claim about Rule B, written before this
   * was measured. It is wrong for the same reason and is a finding for that dep's owner, not a
   * drive-by edit here.)
   */
  routesToPaper?: PaperRouteResolver;
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

/**
 * The same cell with `01-F53`'s captured price, which the KOT deliberately never reads (`03-F32`:
 * "prices are simply not in the chit data model") and the receipt must.
 */
type BilledCell = LineCell & { unit_price_paisa: number };

/** `03-F3`: "order number + table/channel in large type" — ONE field, filled in that order. */
const tableOf = (table_ids_json: string, channel: string): string => {
  const ids = JSON.parse(table_ids_json) as string[];
  return ids[0] ?? channel;
};

/**
 * S-7 — the namespace that tells a CASH job, and now a RECEIPT job, from a KOT job. It is
 * load-bearing rather than tidy.
 *
 * All four document types share this device's ONE spooler (`03-F42` makes a document the unit, not
 * the queue), so `reconcile` sees every state — and `01 §4` has **no emittable print event for any
 * of them but the KOT**. There is no `slip.printed`; `receipt.printed` is in the catalog but
 * carries no payload schema in `packages/domain`, so `01-F4` makes emitting it a runtime error.
 * Emitting `kot.printed` for one of them would write a KOT fact about an id that is a shift id, a
 * day id or a settled order's receipt, permanently, into a ledger `01-F1` forbids correcting in
 * place. Commandment 2 forbids inventing the event, so those jobs' outcomes reach the COUNTER
 * (`03-F5`'s band) and nothing else — an owed gap, named here rather than papered over.
 *
 * **The pair below is a DENY-LIST and every new document type must extend it.** A KOT job id is
 * `<order_id>::<station>` and carries no marker of its own, so "is this a KOT" can only be asked
 * as "is it none of the others" — which means a namespaced document added without touching the
 * KOT's `reconcile` is misread as a KOT and appends `kot.printed` about a document that is not
 * one. `C16` is the first time that trap was live: with only `isCashJob` in place, every printed
 * receipt would have written a `kot.printed` for its order.
 *
 * A PREFIX rather than an in-memory set, because the spool is durable (`03-F4`): a relaunch
 * re-reads jobs it did not enqueue, and a set built at construction would classify every surviving
 * job as a KOT.
 */
const CASH_JOB_PREFIX = "cash::";
const RECEIPT_JOB_PREFIX = "receipt::";
const isCashJob = (job_id: string): boolean => job_id.startsWith(CASH_JOB_PREFIX);
const isReceiptJob = (job_id: string): boolean => job_id.startsWith(RECEIPT_JOB_PREFIX);

/**
 * **`03-F5`'s third consequence, and until August 2026 it was the one nothing produced.**
 *
 * The FR's own words: *"acknowledgment is logged (`audit.*`)"*. `01-F5` gained the subtype for it
 * — `audit.print_acknowledged`, its sixth — and `packages/domain` carries the schema, and NOTHING
 * EMITTED IT: the ack was a `raised.delete(id)` and a comment saying so. Dismissing the band left
 * no record anywhere, which is the wave's named defect (a correct subsystem with no seam) sitting
 * on top of the exact harm `01-F5` puts this event in the hash-chained family for — *"silently
 * dismissing the band loses a kitchen ticket with nobody accountable, and the hash chain is what
 * makes a quiet dismissal detectable"*.
 *
 * ── The payload, and what of it the FR actually requires ────────────────────────────────────
 *
 * **`03-F5` NAMES NO FIELDS.** `01-F5`'s v1 payload contract for the whole `audit.*` family is
 * `prev_audit_hash` alone, the schema is a `looseObject` so additive extras are legal, and WHO
 * comes from the envelope's `actor_user_id` (`02-F41`, stamped at append). So as specified, this
 * event records *that* a band was dismissed and *by whom*, and is **not linkable to the failed
 * job at all**.
 *
 * The three fields below are therefore an INTERPRETATION and are named as one: making the ack
 * answer "which ticket" is a `03`/`01-F5` amendment, not something this file may decide. They are
 * carried because the spooler already holds both nouns across a restart (`03-F4`), so the choice
 * is between recording them and discarding facts already in hand:
 *
 *   * `alarm_id` — the spooler JOB id, which is the finest handle that exists. `03-F2` fans one
 *     confirm out to N station tickets, so `order_id` alone cannot say which station's chit was
 *     the one nobody cooked.
 *   * `order_id` — `03-F5`'s own subject noun, and only on the KOT path. The cash printer omits
 *     it deliberately: its subject is a shift or a day id, and writing one into a field called
 *     `order_id` is the same permanent lie `CASH_JOB_PREFIX` refuses to tell with `kot.printed`.
 *   * `printer_name` — the same field name `kot.print_failed` already carries, so the ack and the
 *     failure it acknowledges can be joined on it without a second vocabulary.
 *
 * **`prev_audit_hash` is absent on purpose** — `01-F5` makes the chain store-owned and a
 * caller-supplied value a loud refusal with nothing persisted. And nothing here goes near a
 * credential: `01-F1` has no redaction path, so a PIN that reached a payload would be published
 * to every device that syncs and never retractable.
 */
const PRINT_ACK = "audit.print_acknowledged";

/**
 * `03-F5`'s alert has to name the DOCUMENT as well as the printer and the subject — "KOT #142 did
 * not print" is unactionable if what failed was the shift-close slip a cashier is waiting to sign.
 */
const DOCUMENT_NOUNS = {
  kot: "KOT",
  receipt: "Receipt",
  shift_close_slip: "Shift slip",
  day_summary: "Day summary",
} as const;

/**
 * `01-F46`'s business day, applied to a delivered timestamp.
 *
 * The arithmetic is `domain`'s and is declared once (`18 §2`) — the same helper the `shift_cash`
 * fold uses for `days.business_date`, so a shift and the day it is bucketed into cannot disagree
 * about which night they belong to. It reads a DELIVERED field (`01-F43` stamps branch time at
 * append), never this device's clock, so `03-F30`/`01-F34` are both intact.
 */
const onBusinessDate = (stamp: number, date: string): boolean => businessDate(stamp) === date;

/**
 * A signed integer-paisa total, BigInt-exact (`DEC-MONEY-005`, standing law 3).
 *
 * `totalPaisaOrNull` rather than a running `+`: float `+` is non-associative near 2^53, so a
 * plain accumulator would let row order decide a printed money figure. `null` (inexact) prints
 * zero rather than throwing — `01-F17`'s spirit on the print path, where a shift close must
 * complete whatever the arithmetic says, and the figure it would replace does not exist anyway.
 */
const totalOf = (values: readonly number[]): number => totalPaisaOrNull(values) ?? 0;

export const createKotPrinter = ({
  spooler,
  store,
  catalog,
  station,
  // `03-F51` — see `KotPrinterDeps.routesToPaper`. The default is the pre-`03-F51` product: every
  // station prints. It is `true` and not `false` because the fallback must be the LOUD one — a
  // branch whose configuration never arrived gets paper it may not be able to print, which
  // `03-F5` reports within 45 s, rather than silence nothing can report.
  routesToPaper = () => true,
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
  /**
   * Oldest first: `AlarmBand` renders the head and counts the tail (`27-F11d`).
   *
   * The value is the band PLUS the subject it is about, rather than the `Alarm` alone. `Alarm` is
   * the IPC shape and carries `03-F5`'s two nouns inside a SENTENCE ("KOT 5f3a9c21 did not print
   * — TH230"); the ack needs them as data, and re-parsing an operator-facing string to recover
   * them is how a wording change silently empties a ledger field.
   */
  const raised = new Map<string, { alarm: Alarm; order_id: string }>();
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

  /**
   * Raise an S1 for a job, and answer whether this call is the one that raised it.
   *
   * The boolean is load-bearing rather than convenience: the refusal path uses it to decide
   * whether to append `kot.print_failed`. Tapping "Send to kitchen" twice appends two
   * `order.confirmed`s (the order stays open until it is settled), and on the refusal path there
   * is no spooler row to de-duplicate against — so without this the ledger collects one
   * `kot.print_failed` per tap, permanently, under `01-F1`. Found by mutation: the guard below
   * survived removal because the `Map` key already de-duplicates the BAND, which is exactly how
   * a dead-looking line hides a live defect one caller over.
   */
  const raise = (id: string, order_ref: string, why: string): boolean => {
    if (raised.has(id)) return false;
    raised.set(id, {
      alarm: {
        // `03-F5`'s own sentence: "KOT #142 did not print — grill printer offline". Both nouns in
        // the line a cashier reads first, because either one alone is unactionable — the order
        // without the printer sends her hunting, the printer without the order does not say which
        // food is not being cooked.
        message: `${DOCUMENT_NOUNS.kot} ${order_ref.slice(0, 8)} did not print — ${printer_name}`,
        subject: why,
        id,
      },
      order_id: order_ref,
    });
    return true;
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
      // ── `03-F51`'s ROUTING SEAM, and its position in this loop is the whole design ────────────
      //
      // A station configured screen-only makes NO JOB: no bytes, no `spooler.enqueue`, no attempt,
      // no retry budget, no exhaustion, no `03-F5` band, no `kot.print_failed`. There is nothing to
      // suppress, because nothing was created — which is why this is not a weakening of `03-F5`.
      //
      // It sits BEFORE `render()` and before `spooler.job()` deliberately. `03-F51`: absence is
      // decided before a job exists, from configuration; failure is decided after a job exists,
      // from a transport outcome. Move this check any later — into `reconcile`, into the transport,
      // into a band filter — and the two collapse, and the first real printer that dies at 20:40 on
      // a Friday goes silent. `03-F5`'s "silent KOT failure is forbidden" is about a job that
      // FAILED; this is about a job nobody asked for.
      //
      // `03-F34`'s refusal is likewise unreachable here and that is correct: a document that was
      // never rendered cannot be refused for want of columns, and a 58 mm printer at a screen-only
      // station is not a fact about anything (`03-F49`).
      if (!routesToPaper(at)) continue;
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
        // The band FIRST, and the ledger record only if the band is new: `raise` is what makes a
        // repeated confirm idempotent here, the way `spooler.job(job_id)` does on the path below.
        if (raise(job_id, order_id, `refused: ${result.reason}${measured}`)) {
          emit("kot.print_failed", { order_id, printer_name });
        }
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
      // S-7 — THE ONE LINE THAT KEEPS THIS FILE'S PRINTERS APART, and it is not tidiness.
      //
      // `03-F42` makes a DOCUMENT the unit, not the queue, so all four types share this device's
      // one durable spooler and this loop sees all four. But `01 §4` has **no emittable print
      // event for any of them but the KOT**, and emitting `kot.printed` here would append a KOT
      // fact whose `order_id` is a shift id or a receipt's, permanently, into a ledger `01-F1`
      // forbids correcting in place. Commandment 2 forbids inventing the event. So the cash and
      // receipt printers below own their own reconciliation and their own band; this one owns the
      // KOT's. See `CASH_JOB_PREFIX` for why these two lines are a DENY-LIST that every new
      // document type must extend — `C16` is the first time that trap was live.
      if (isCashJob(job.job_id)) continue;
      if (isReceiptJob(job.job_id)) continue;
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
    alarms: () => [...raised.values()].map((band) => band.alarm),
    acknowledge: (alarm_id) => {
      const band = raised.get(alarm_id);
      // Acknowledging a band this device does not hold records nothing. The IPC handler calls
      // BOTH printers' `acknowledge` for one tap (the ids are namespaced, so exactly one owns
      // any given band), and without this every dismissal would write two acks — one of them
      // about a band that never existed, permanently (`01-F1`).
      if (band === undefined) return;
      // The band goes FIRST and unconditionally. `03-F5`'s alert "repeats until acknowledged",
      // and `01-F17`'s rule is that a ledger write may not cost the operator the act: an ack that
      // only cleared the screen if its append succeeded would leave a full-screen repeating
      // banner on the counter because the ledger was busy. `emit` swallows for the same reason.
      raised.delete(alarm_id);
      emit(PRINT_ACK, { alarm_id, order_id: band.order_id, printer_name });
    },
  };
};

// ── S-7 — 02-F23's shift-close slip and 02-F24's day summary ────────────────────────────────────

export type CashPrinterDeps = {
  /** The SAME durable spooler the KOT uses — `03-F42` makes a document the unit, not the queue. */
  spooler: Spooler;
  /**
   * The `shift_cash` fold's rows, plus `openOrders` for `02-F24`'s sales by channel.
   *
   * `authorizeReads`' scoped `cashState()` is deliberately NOT the source, even though it carries
   * the same rows. That read is narrowed to `reportScope`'s Appendix A reach so a cashier cannot
   * read a colleague's drawer off her own till (`02-F23`). A PRINTER is not a subject: the paper
   * is the shift's own slip and the manager's own day summary, and routing it through a
   * session-scoped read would make what prints depend on who was signed in when the close landed.
   */
  store: Pick<DeviceStore, "openOrders" | "shifts" | "days" | "unboundDrawer">;
  /** `03 §7` layer 3 — `03-F49`'s per-type floor is checked against this, inside `render()`. */
  capability: PrinterCapability;
  /**
   * The KOT printer's `pump`, injected rather than re-implemented.
   *
   * `03-F4`'s budget is "3 attempts over 30 s" and the spooler owns no clock, so the SPACING is
   * the host's `PUMP_INTERVAL_MS` interval. A second pump loop over the same spooler would spend
   * that budget twice as fast and turn `03-F5`'s 45 s bound into ~20 s — so there is exactly one
   * driver on this device and this is how a queued slip reaches it immediately.
   */
  pump: () => Promise<void>;
  /**
   * `03-F5`'s acknowledgement, for the bands THIS printer raises. Same signature as the KOT
   * printer's `append`, and the same reason: envelope stamping belongs to `gateway.append`.
   *
   * **It appends the ack and nothing else** — no `slip.printed`, no `slip.print_failed`, because
   * `01 §4` carries neither (see `CASH_JOB_PREFIX`). An `audit.*` subtype is a different question
   * from a print event: it records that a HUMAN dismissed a `03-F5` band, and one tap on one IPC
   * channel dismisses either printer's band. Recording only the KOT's would make whether the
   * dismissal is auditable depend on which printer happened to own the alarm — invisible to the
   * operator and to the Auditor both.
   *
   * **OPTIONAL and always supplied**, which is the shape `01-F60` warns about and is taken here
   * for a stated reason: `__acceptance__/cash-slip-printing.test.ts` predates this dep and is an
   * oracle this session may not edit (`24 §3` step 2), so a required member reds a suite for a
   * surface it does not exercise. `pnpm seams:check`'s Rule B is what keeps the omission from
   * becoming permanent — an optional member no call site passes is a finding — and
   * `__acceptance__/print-ack-audit.test.ts` §A asserts on the construction in `main/index.ts`.
   */
  append?: (type: string, payload: Record<string, unknown>) => void;
};

export type CashPrinter = {
  /**
   * `02-F23` — a `shift.closed` has landed, so the paper form of *"I'm clean"* is queued.
   *
   * Synchronous and `void` for `01-F17`'s reason exactly as `confirmed` is: the close is already
   * in the ledger when this runs, and a cashier finishing her shift may not be held at the till
   * by a socket timeout. A device with no printer still closes shifts.
   */
  shiftClosed: (shift_id: string) => void;
  /** `02-F24` — a `day.closed` has landed; the day-summary ticket. Same contract as above. */
  dayClosed: (day_id: string) => void;
  /**
   * Raise `03-F5`'s band for any cash job that has reached `failed` since the last look.
   *
   * Separate from `pump` because this printer must not drive the spooler (see `pump` above): the
   * host calls it after each pump, and it only READS job state.
   */
  reconcile: () => void;
  alarms: () => readonly Alarm[];
  acknowledge: (alarm_id: string) => void;
};

export const createCashPrinter = ({
  spooler,
  store,
  capability,
  pump,
  append,
}: CashPrinterDeps): CashPrinter => {
  const printer_name = capability.model_id;
  const raised = new Map<string, Alarm>();
  const seen = new Map<string, string>();

  /** `01-F17`, exactly as the KOT printer's: a failed ledger write must not cost the act. */
  const emit = (type: string, payload: Record<string, unknown>): void => {
    try {
      append?.(type, payload);
    } catch {
      // No FR names a surface that owns "the ledger record could not be written".
    }
  };

  /**
   * Render, enqueue and kick — the same three steps `confirmed()` takes, and the same refusal
   * path. Shared between the two cash types so `03-F34`'s "hard refusal to print plus an S1 band,
   * never a silent degradation" cannot hold for one and quietly not hold for the other.
   */
  const queue = (
    kind: "shift_close_slip" | "day_summary",
    ref: string,
    data: ShiftCloseData | DaySummaryData,
  ): void => {
    const spec = DOCUMENT_SPECS[kind];
    // `03-F30` ships the specs as code, so this cannot fire. Unlike the KOT's construction-time
    // throw it is a quiet return: a missing cash spec must not stop the app from starting, and a
    // shift still closes in the ledger with or without paper (`01-F17`).
    if (spec === undefined) return;
    // A shift closes ONCE (`shift.closed` is monotone in the fold — "nothing un-closes"), but the
    // renderer can re-invoke the handler and the spool is DURABLE across a relaunch. A
    // deterministic id is what makes a second copy impossible without `03-F7`'s deliberate,
    // REPRINT-banded reprint act — a duplicate cash slip is a second signature surface.
    const job_id = `${CASH_JOB_PREFIX}${kind}::${ref}`;
    if (spooler.job(job_id) !== undefined) return;
    // No owner profile: doc 14's editing surface does not exist, so every declared slot takes its
    // shipped default (an empty note) — exactly as the KOT above.
    const result = render(spec, {}, data, capability);
    if (!result.ok) {
      const measured =
        result.required_columns === undefined || result.available_columns === undefined
          ? ""
          : ` — needs ${result.required_columns} columns, this printer has ${result.available_columns}`;
      // `03-F34`: NOTHING is enqueued. No ledger record either — see `CASH_JOB_PREFIX`.
      raise(job_id, DOCUMENT_NOUNS[kind], ref, `refused: ${result.reason}${measured}`);
      return;
    }
    spooler.enqueue({ job_id, document: result.bytes, printer_name, order_ref: ref });
    // `queueMicrotask` for `01-F17`'s reason, not style: `await transport.send(...)` invokes
    // `send` synchronously before it suspends, so a direct call would reach the socket on the
    // stack of the IPC handler that has not yet answered the cashier.
    queueMicrotask(() => void pump());
  };

  const raise = (id: string, noun: string, ref: string, why: string): void => {
    if (raised.has(id)) return;
    raised.set(id, {
      // `03-F5` requires the alert to name the printer and the subject — and the DOCUMENT, because
      // "KOT 5f3a9c21 did not print" sends a cashier to the kitchen printer for a slip that is not
      // a KOT and does not tell her the reconciliation she is waiting to sign never appeared.
      message: `${noun} ${ref.slice(0, 8)} did not print — ${printer_name}`,
      subject: why,
      id,
    });
  };

  /**
   * `02-F23` — the slip, assembled from the `shift_cash` fold.
   *
   * **Every money figure here is CARRIED (`26 §7`) and nothing is recomputed.** `variance_paisa`
   * is the fold's snapshot off `shift.closed` and `expected_at_close_json` is the expectation the
   * cashier signed against, not the live one — a late payment must not move a number on a slip
   * that has already been printed, which is what `01-F1` forbids and what a read-time recompute
   * performs in effect.
   *
   * An UNCLOSED shift prints nothing: the three carried facts are null until the close lands, and
   * a slip with an empty variance says nothing about the drawer.
   */
  const shiftClosed = (shift_id: string): void => {
    const shift = store.shifts().find((row) => row.shift_id === shift_id);
    if (shift === undefined) return;
    if (
      shift.expected_at_close_json === null ||
      shift.counted_cash_paisa === null ||
      shift.variance_paisa === null
    ) {
      return;
    }
    const carried = JSON.parse(shift.expected_at_close_json) as Partial<
      Record<PaymentMethod, number>
    >;
    // `01-F32`'s closed tender set, EXHAUSTIVE. `domain`'s `expectedPaisaByMethod` is a strict
    // object over all five, so a missing key cannot come off a conforming `shift.closed` — the
    // `?? 0` is the honest render if a non-conforming writer ever produced one, never a bucket
    // this device decided to drop (`02-F43`'s silent path).
    const expected_by_method = Object.fromEntries(
      PAYMENT_METHODS.map((method) => [method, carried[method] ?? 0]),
    ) as ShiftCloseData["expected_by_method"];
    // `02-F43` — the branch's unbound drawer activity, COUNTED onto the slip. Dropping it would
    // satisfy `02-F21`'s word "logged" while defeating the theft detection the FR exists for.
    const unbound = store.unboundDrawer();
    queue("shift_close_slip", shift_id, {
      // The eight-character handle, as `03-F5`'s band and the KOT's ticket number use: a UUID is
      // 36 columns and `03-F49`'s floor for this document is 35.
      shift_id: shift_id.slice(0, 8),
      cashier: shift.cashier,
      expected_by_method,
      counted_cash_paisa: shift.counted_cash_paisa,
      variance_paisa: shift.variance_paisa,
      paid_out_paisa: shift.paid_out_paisa,
      no_sale_count: shift.no_sale_count,
      unbound_no_sale_count: unbound.no_sale_count,
      unbound_paid_out_paisa: unbound.paid_out_paisa,
      // `03-F7`/`03-F37`: a reprint is a deliberate, logged act, and the close that triggers this
      // is not one. The reprint path is owed with the surface that offers it.
      reprint: false,
    });
  };

  /**
   * `02-F24` — "a day-summary ticket (sales by channel, voids/comps/discounts, over/short)".
   *
   * Two of the three groups are assembled below and the third does not exist: `01 §4` has no
   * void/comp/discount event (`26 §7` states it outright), so the document names the gap instead
   * of printing a zero. See `DaySummaryData`.
   *
   * **The day's over/short is a SUM of CARRIED shift variances, never a day-level recompute.**
   * `day.closed` carries a count and no expectation, so "expected minus counted" for a whole day
   * is not a carried fact at all — deriving one here is the exact defect `26 §7` removes, and the
   * sum of the figures the cashiers already signed is what is actually true.
   */
  const dayClosed = (day_id: string): void => {
    const day = store.days().find((row) => row.day_id === day_id);
    if (day === undefined || day.counted_cash_paisa === null) return;
    // `01-F46` binds a shift and an order to a business day through the SAME `domain` helper the
    // fold used for `days.business_date`, off a delivered branch-time stamp (`01-F43`). There is
    // no `day_id` on a shift row or an order row to join by, and `26 §7` is explicit that this
    // class of question "needs a TIME SOURCE" — not an ordering one, and not this device's clock.
    const shifts = store.shifts().filter((row) => onBusinessDate(row.open_at, day.business_date));
    const sales = new Map<OrderChannel, number[]>();
    for (const channel of ORDER_CHANNELS) sales.set(channel, []);
    for (const order of store.openOrders()) {
      if (order.confirmed_at === null) continue;
      if (!onBusinessDate(order.confirmed_at, day.business_date)) continue;
      // `02-F42` closed the channel set. A row outside it cannot be bucketed and is NOT folded
      // into another channel: a mis-bucketed sale is worse than a missing one on a document a
      // manager reconciles against a deposit.
      const bucket = sales.get(order.channel as OrderChannel);
      if (bucket === undefined) continue;
      bucket.push(order.pay_total);
    }
    queue("day_summary", day_id, {
      business_date: day.business_date,
      sales_by_channel: Object.fromEntries(
        ORDER_CHANNELS.map((channel) => [channel, totalOf(sales.get(channel) ?? [])]),
      ) as DaySummaryData["sales_by_channel"],
      opening_float_paisa: day.opening_float_paisa,
      deposit_paisa: day.deposit_paisa,
      counted_cash_paisa: day.counted_cash_paisa,
      over_short_paisa: totalOf(
        shifts
          .filter((row) => row.variance_paisa !== null)
          .map((row) => row.variance_paisa as number),
      ),
      shifts_closed: shifts.filter((row) => row.closed === 1).length,
      shifts_open: shifts.filter((row) => row.closed === 0).length,
      reprint: false,
    });
  };

  return {
    shiftClosed,
    dayClosed,
    reconcile: () => {
      for (const job of spooler.jobs()) {
        if (!isCashJob(job.job_id)) continue;
        if (seen.get(job.job_id) === job.state) continue;
        seen.set(job.job_id, job.state);
        // `03-F41`: `stalled` is deliberately absent. The printer TOOK the bytes and is holding
        // them until the roll is replaced, and a band here sends someone to reprint a document
        // that is about to appear — on a cash slip, a duplicate signature surface.
        if (job.state !== "failed") continue;
        const kind = job.job_id.startsWith(`${CASH_JOB_PREFIX}day_summary::`)
          ? DOCUMENT_NOUNS.day_summary
          : DOCUMENT_NOUNS.shift_close_slip;
        raise(job.job_id, kind, job.order_ref, `printing failed after ${job.attempts} attempts`);
      }
    },
    alarms: () => [...raised.values()],
    acknowledge: (alarm_id) => {
      // Only for a band this printer actually holds — the handler calls both, and an ack for a
      // KOT band written twice would be two permanent records of one tap (`01-F1`).
      if (!raised.delete(alarm_id)) return;
      // NO `order_id`. This band's subject is a shift id or a day id (`CASH_JOB_PREFIX`), and
      // putting one in a field called `order_id` writes a permanent lie into a ledger that has no
      // edit path. `alarm_id` IS the spool job id, so which document was dismissed is still said.
      emit(PRINT_ACK, { alarm_id, printer_name });
    },
  };
};

// ── C16 — 02-F15's receipt, printed when the settlement completes ───────────────────────────────

export type ReceiptPrinterDeps = {
  /** The SAME durable spooler — `03-F42` makes a document the unit, not the queue. */
  spooler: Spooler;
  /** `01-F30`'s billed lines and `01-F31`'s keyed tender sums, both off the order projection. */
  store: Pick<DeviceStore, "openOrders">;
  /** `01-F54` — an unknown item degrades to its identifier rather than vanishing off the bill. */
  catalog: CatalogResolver;
  /** `03 §7` layer 3. `03-F49`'s floor for `receipt` is 32 and is checked inside `render()`. */
  capability: PrinterCapability;
  /** The KOT printer's `pump`, injected for `CashPrinterDeps.pump`'s reason: ONE driver, one budget. */
  pump: () => Promise<void>;
  /**
   * `02-F15`'s "cashier", as a display name.
   *
   * A FUNCTION and not a value, because `01-F26`'s session moves: a till hands over mid-shift and
   * a name captured at construction would attribute every receipt for the rest of the day to
   * whoever unlocked it first. `02-F41` rules that attribution is whoever's PIN is in, and the
   * settle this fires on is the act that read it.
   *
   * **DECLARED INTERPRETATION (`24 §3b`).** The named alternative is the envelope's
   * `actor_user_id` on the `payment.recorded` that triggered the print, which is the ledger's own
   * answer and is strictly better. It is not taken because the order projection carries no
   * attribution — `OpenOrderRow` has fifteen keys and none of them is an actor — so reading it
   * would need a fold change in a protected package. The two answers coincide for every print this
   * seam can make: the session that authorised the append is the session this reads, one
   * synchronous call later.
   */
  cashier: () => string | null;
};

export type ReceiptPrinter = {
  /**
   * A `payment.recorded` has landed. If the order is now settled, the customer's copy is queued.
   *
   * Synchronous and `void` for `01-F17`'s reason, exactly as `confirmed` and `shiftClosed` are:
   * the settlement is already in the ledger when this runs, and a customer may not be held at the
   * counter by a socket timeout. A device with no printer still takes money.
   */
  settled: (order_id: string) => void;
  /** Raise `03-F5`'s band for any receipt job that has reached `failed` since the last look. */
  reconcile: () => void;
  alarms: () => readonly Alarm[];
  acknowledge: (alarm_id: string) => void;
};

/** One tender member as the fold renders it into `pay_attempts_json` (payload minus its key). */
type PayMember = { amount_paisa: number; method: string; purpose: string };

/**
 * `C16` — "**Print the receipt** · Settlement completes · **0 taps — automatic on settle**"
 * (`plans/wave-1/role-task-inventories.md`), which is why this file gains a printer and the
 * counter gains no control. `27-F4` makes the chrome immutable and a receipt nobody has to ask for
 * is the only design that costs a cashier nothing at the moment she is handing over change.
 *
 * **What "settlement completes" MEANS here, stated because `01-F33` does not settle it for us.**
 * `order.settlement_closed` is the cashier-emitted closing act and **nothing in this product emits
 * it** — measured: the type has a schema in `packages/domain`, a fold arm in `merge.ts`, and zero
 * production emitters, so `OpenOrderRow.settled` is `0` for every order this device has ever held.
 * Waiting for it would mean no receipt ever prints. So the trigger is the observable fact `02-F15`
 * describes: the order has been TENDERED FOR IN FULL — `pay_total >= billed_effective`, both off
 * the fold's own keyed sums, with at least one agreed tender. When `01-F33`'s act gains an emitter
 * this should move to it, and that is a better trigger rather than a different one.
 */
export const createReceiptPrinter = ({
  spooler,
  store,
  catalog,
  capability,
  pump,
  cashier,
}: ReceiptPrinterDeps): ReceiptPrinter => {
  const printer_name = capability.model_id;
  const raised = new Map<string, Alarm>();
  const seen = new Map<string, string>();

  const raise = (id: string, ref: string, why: string): void => {
    if (raised.has(id)) return;
    raised.set(id, {
      // `03-F5`'s sentence shape, with the DOCUMENT named: "Receipt 5f3a9c21 did not print — TH230"
      // sends a cashier to the right piece of paper, where "KOT … did not print" would send her to
      // the kitchen for a document the kitchen never sees.
      message: `${DOCUMENT_NOUNS.receipt} ${ref.slice(0, 8)} did not print — ${printer_name}`,
      subject: why,
      id,
    });
  };

  const settled = (order_id: string): void => {
    const spec = DOCUMENT_SPECS.receipt;
    // `03-F30` ships the specs as code, so this cannot fire. A quiet return rather than the KOT's
    // construction-time throw, for `createCashPrinter`'s reason: a missing document spec must not
    // stop the app from starting, and a sale completes in the ledger with or without paper.
    if (spec === undefined) return;
    const order = store.openOrders().find((row) => row.order_id === order_id);
    if (order === undefined) return;

    const total_paisa = billedEffectiveFromJsonLines(order.json_lines);
    // `01-F31`'s keyed sum, computed by the fold: a disputed attempt contributes ZERO to it and is
    // rendered, never picked. The receipt must agree with that or it would claim money the ledger
    // does not count. `pay_total` also excludes `repays_receivable` (`DEC-MONEY-007`), so a khata
    // tab repaid later can never read as settling the original order twice.
    if (order.pay_total < total_paisa) return;

    // `02-F15`'s "payment method(s)", aggregated over `PAYMENT_METHODS`' DECLARED order (`27-F4`).
    // Never over the attempt-id key order: `pay_attempts_json` is keyed by `settlement_attempt_id`
    // and iterating it would let an id sort decide what a customer reads, which is the shape of
    // the `01-F34` break law 1 exists to prevent even where the values themselves are unchanged.
    const byMethod = new Map<PaymentMethod, number[]>();
    const attempts = JSON.parse(order.pay_attempts_json) as Record<string, PayMember[]>;
    for (const members of Object.values(attempts)) {
      // A DIVERGENT attempt (two devices, one key, different payloads) is `01-F31`'s contested
      // head: it contributes zero to `pay_total`, so printing one of its members would put a
      // figure on the customer's copy that the order's own total does not contain.
      if (members.length !== 1) continue;
      const member = members[0] as PayMember;
      if (member.purpose !== "settles_order") continue;
      const method = member.method as PaymentMethod;
      if (!PAYMENT_METHODS.includes(method)) continue;
      const amounts = byMethod.get(method) ?? [];
      amounts.push(member.amount_paisa);
      byMethod.set(method, amounts);
    }
    const tenders = PAYMENT_METHODS.filter((method) => byMethod.has(method)).map((method) => ({
      method,
      // BigInt-exact (`DEC-MONEY-005`, standing law 3): a running double `+` is non-associative
      // near 2^53, so a plain accumulator would let delivery order decide a printed money figure.
      amount_paisa: totalOf(byMethod.get(method) ?? []),
    }));
    // A settled order always has one. Guarding rather than asserting keeps `01-F17` intact: a
    // projection this device cannot read must not stop the next sale.
    if (tenders.length === 0) return;

    // ONE receipt per order, for ever — the id is deterministic and the spool is durable
    // (`03-F4`), so a relaunch, a second `payment.recorded` on a split settlement, or a
    // double-tapped TAKE CASH all resolve to the same job. `02-F16` makes a second copy a named
    // fraud vector, which is why the only way to a second one is `03-F37`'s banded reprint act.
    const job_id = `${RECEIPT_JOB_PREFIX}${order_id}`;
    if (spooler.job(job_id) !== undefined) return;

    const lines = Object.values(JSON.parse(order.json_lines) as Record<string, BilledCell>).map(
      (cell) => ({
        quantity: cell.qty,
        // `01-F54` — an unsynced or renamed item degrades to its identifier. The money came from the
        // EVENT (`01-F53`), so a stale catalog costs a word on the paper and never a rupee.
        name: catalog(cell.item_id)?.name ?? cell.item_id,
        unit_price_paisa: cell.unit_price_paisa,
      }),
    );

    const result = render(
      spec,
      // No owner profile: `02-F15`'s configurable header/footer is doc 14's editing surface and
      // does not exist yet, so every declared slot takes its shipped default (an empty note).
      {},
      {
        receipt_no: order_id.slice(0, 8),
        channel: order.channel as ReceiptData["channel"],
        // `27-F62` — the DELIVERED branch stamp (`01-F43`), never this device's clock. The confirm
        // anchor is the only one an order carries here; an order settled without ever being sent
        // to the kitchen has none, and the document says so rather than inventing one.
        branch_created_at: order.confirmed_at,
        cashier: cashier(),
        lines,
        total_paisa,
        tenders,
        // `03-F7`/`03-F37`: a reprint is a deliberate, logged act and a settlement is not one.
        // `C17` is owed with the surface that offers it.
        reprint: false,
      } satisfies ReceiptData,
      capability,
    );
    if (!result.ok) {
      const measured =
        result.required_columns === undefined || result.available_columns === undefined
          ? ""
          : ` — needs ${result.required_columns} columns, this printer has ${result.available_columns}`;
      // `03-F34`: NOTHING is enqueued, and no ledger record either — `01 §4` carries no
      // `receipt.print_failed` (see `RECEIPT_JOB_PREFIX`).
      raise(job_id, order_id, `refused: ${result.reason}${measured}`);
      return;
    }
    spooler.enqueue({ job_id, document: result.bytes, printer_name, order_ref: order_id });
    // `queueMicrotask` for `01-F17`'s reason, not style: `await transport.send(...)` invokes `send`
    // synchronously before it suspends, so a direct call would reach the socket on the stack of the
    // IPC handler that has not yet answered the cashier's settlement.
    queueMicrotask(() => void pump());
  };

  return {
    settled,
    reconcile: () => {
      for (const job of spooler.jobs()) {
        if (!isReceiptJob(job.job_id)) continue;
        if (seen.get(job.job_id) === job.state) continue;
        seen.set(job.job_id, job.state);
        // `03-F41`: `stalled` is deliberately absent. The printer TOOK the bytes and is holding
        // them until the roll is replaced; a band here sends a cashier to reprint a document that
        // is about to appear, and on a receipt that is `02-F16`'s fraud vector by accident.
        if (job.state !== "failed") continue;
        // `03-F12` puts receipts under "the same spooler and durability rules" as the KOT, and
        // `03-F5`'s argument — a silent failure is forbidden — is what the band delivers. Reading
        // `03-F5` as KOT-only would leave a cashier believing a customer has a receipt they do not
        // have, which is the same harm one document over. Same declared reading as S-7's slips.
        raise(job.job_id, job.order_ref, `printing failed after ${job.attempts} attempts`);
      }
    },
    alarms: () => [...raised.values()],
    acknowledge: (alarm_id) => {
      // Only for a band this printer holds — the IPC handler calls every printer's `acknowledge`
      // for one tap, and an ack written twice would be two permanent records of one act (`01-F1`).
      //
      // It appends NOTHING. `audit.print_acknowledged` is the KOT's and the cash printer's because
      // each was handed an `append`; this printer is deliberately handed none, since the only
      // ledger fact it could write about a receipt is `02-F16`'s `receipt.printed` and that has no
      // payload schema. The ack for a receipt band is therefore UNRECORDED — a named gap with the
      // same owner as the event itself, not an omission.
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
