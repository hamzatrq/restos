/**
 * The durable print spooler (`03-F4`), the stall (`03-F41`), the whole-document rule (`03-F42`) and
 * the health check (`03-F40`).
 *
 * There is no I/O in this file beyond the two seams it is handed. It never opens a socket, a serial
 * port or a Bluetooth link (`18 §10`'s transports are unbuilt), and it never touches a disk itself:
 * the durable store arrives as an argument. **No physical printer has run any of this** — `03-F10`'s
 * rig pass is owed in full (K-8), and every behaviour below is bytes handed to an object.
 *
 * Three sentences from the FRs decide almost every line:
 *
 *   * `03-F4`: "every print job is persisted (SQLite, WAL) with an explicit state machine … **before
 *     the first transmit attempt**; a crash or power loss mid-print resumes or reprints the job on
 *     restart — never drops it. Retry with backoff (default 3 attempts over 30 s) on transport
 *     failure."
 *   * `03-F41`: "a stalled printer is **holding** the job, not dropping it — so `03-F4`'s retry must
 *     not fire … a stall never counts toward the 3-attempt budget and never re-transmits. A timeout
 *     that flips a stall to `failed` and retries **double-prints the instant the roll is loaded**."
 *   * `03-F42`: "A document is rendered whole, buffered, and transmitted as one unit … **No I/O wait
 *     may be interleaved inside a document.**"
 */

import type { PrinterCapability } from "./capability.js";
import { decodePaperStatus, PAPER_STATUS_QUERY, type PaperStatus } from "./status.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F4 — the state machine and the budget.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `03-F4`, verbatim and in the FR's own order: "`queued → transmitting → stalled? → printed |
 * failed`".
 *
 * Five, not four: `03-F41`'s entire subject is that `stalled` is not `failed`, and collapsing them
 * is the duplicate-KOT defect's first move. Five, not six: a sixth word would be a state the `01 §4`
 * / `03-F4` vocabulary does not have (Commandment 2) — which is why "waiting to retry" is spelled
 * with `queued` below rather than given a name of its own.
 */
export const SPOOLER_JOB_STATES = [
  "queued",
  "transmitting",
  "stalled",
  "printed",
  "failed",
] as const;
export type JobState = (typeof SPOOLER_JOB_STATES)[number];

/** `03-F4`, verbatim: "default 3 attempts over 30 s". */
export const MAX_TRANSMIT_ATTEMPTS = 3;

/**
 * `03-F4`'s 30 s retry window.
 *
 * **This constant has no caller in this package, deliberately.** `pump()` advances a job by at most
 * one transport interaction and never waits on a clock, so the backoff *schedule* belongs to
 * whatever drives the pump (K-7, on the counter). The BUDGET is enforced here; the SPACING is not
 * enforced anywhere yet, and saying so is cheaper than a constant that looks connected.
 */
export const RETRY_WINDOW_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The job.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A print job as the spooler receives it.
 *
 * `document` is a `Uint8Array` and that is `03-F42` at the type level: a field typed as a generator,
 * a stream or a `() => Uint8Array` could produce bytes while I/O was in flight; a value that is
 * already an array cannot. Typically `render()`'s `bytes` (K-4).
 *
 * `printer_name` and `order_ref` are `03-F5`'s two nouns — its alert reads "KOT #142 did not print —
 * grill printer offline". They are CARRIED, never interpreted: this layer neither raises the alert
 * nor formats the string (`03-F5` puts it on the host device, i.e. K-7).
 */
export type PrintJob = {
  job_id: string;
  /** `03-F42`: the whole document, already buffered. */
  document: Uint8Array;
  printer_name: string;
  order_ref: string;
  /**
   * `03-F55` — what this document COMMITTED TO PAPER, as opaque line identifiers.
   *
   * CARRIED and never interpreted, exactly as `printer_name` and `order_ref` are: this layer does
   * not know what a line is, does not group by it, and does not compare two jobs' coverage. The
   * host decides what a station is still owed (`main/printing.ts`); the spool is only where that
   * answer has to survive.
   *
   * **It rides on the JOB ROW and not in the host's memory, because `03-F4` is written about the
   * power cut and the relaunch is exactly when both failures appear**: a spool re-read without the
   * coverage either reprints a chit already on the spike in the kitchen, or loses an addition that
   * never got there. `03-F4` already carries the bytes across a restart — "never drops it" — and
   * this belongs to the same row.
   *
   * **OPTIONAL**, for `SpoolerOptions.store`'s reason and one more: `__acceptance__/spooler-job-
   * store.test.ts` and this package's own `spooler*.test.ts` build `PrintJob`s that predate this
   * FR and are oracles no implementing session may edit. Absent means "this job kept no record",
   * which is a spool row written before `03-F55` — a state the host must decide about and this
   * layer must not paper over with an empty array.
   */
  covers?: readonly string[];
};

/** What the spooler knows about a job. `attempts` is `03-F4`'s budget counter. */
export type JobRecord = {
  job_id: string;
  state: JobState;
  /** `03-F41`: a stall NEVER increments this. */
  attempts: number;
  printer_name: string;
  order_ref: string;
  /** `03-F55`'s coverage, carried back out unchanged — see `PrintJob.covers`. */
  covers?: readonly string[];
};

/**
 * The two transport members the spooler uses — a structural subset of `18 §10`'s `Transport`, which
 * is declared once beside the virtual printer's conformance check and is not re-declared here.
 *
 * `send` takes ONE `Uint8Array` (`03-F42`'s "one unit"). `status` is `03-F40`'s real-time query, and
 * it is what a HELD job's release is decided from: `03-F41`'s printer "holds until the roll is
 * replaced", so something has to notice the roll came back, and only the sensor can.
 */
export type SpoolerTransport = {
  send(document: Uint8Array): Promise<TransmitOutcomeLike>;
  status(): Promise<PaperStatus>;
};

/**
 * `classifyTransmit`'s answer, as the spooler consumes it: did it work, and if not, is the printer
 * HOLDING the bytes or did they never arrive? The `reason` and `model_id` a failure carries are
 * `03-F5`'s alert copy and are not read here.
 */
type TransmitOutcomeLike = { ok: true } | { ok: false; state: "stalled" | "failed" };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F4 — the durable store.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A job as it is WRITTEN DOWN: the record plus the bytes.
 *
 * The bytes are part of the row because `03-F4`'s second sentence needs them — "a crash or power
 * loss mid-print resumes or **reprints** the job on restart". A store that persisted the state
 * machine and dropped the document would satisfy the first half of the FR and still leave the
 * kitchen with a record of a ticket nobody can print.
 */
export type PersistedJob = JobRecord & { document: Uint8Array };

/**
 * The durable seam (`03-F4`: "persisted (SQLite, WAL)"), supplied by the host — `18 §4`'s canonical
 * durable-local-queue is one implementation shared with the sync outbox (`01-F8`) and the fiscal
 * queue (`16-F11`), and this package does not pick the engine.
 *
 * `put` is SYNCHRONOUS and that is forced, not chosen: `enqueue` is synchronous (`01-F17` — a sale
 * is never blocked), and `03-F4` puts the write BEFORE the first transmit. A promise between the two
 * is exactly the window a power cut loses the ticket in.
 *
 * There is no `delete`: `03-F4` says "never drops it", and a `printed` row that has been removed is
 * indistinguishable on restart from a job that was never enqueued — the duplicate KOT arriving by a
 * third route.
 */
export type SpoolerJobStore = {
  /** Every persisted job, in the order it was first written. Read at construction. */
  load(): readonly PersistedJob[];
  /** Write (or overwrite) one job's row. */
  put(job: PersistedJob): void;
};

export type SpoolerOptions = {
  transport: SpoolerTransport;
  /**
   * `03-F4`'s durable store. Omitting it keeps the queue in memory for the life of the process,
   * which satisfies no part of the FR's crash clause — the host is expected to supply one, and no
   * test in this package can catch a host that forgets (the same hole `pin-attempt-persistence.
   * test.ts` records against `createPinSession`'s `attempts`).
   */
  store?: SpoolerJobStore;
};

export type Spooler = {
  /**
   * `03-F4`: the job is recorded "before the first transmit attempt".
   *
   * Synchronous, and that is `01-F17` at the type level: a sale is never blocked, not by a printer
   * and not by a full queue. A `Promise<JobRecord>` here would invite a confirm path to await one.
   */
  enqueue(job: PrintJob): JobRecord;
  /** Advance every non-terminal job by AT MOST ONE transport interaction. */
  pump(): Promise<void>;
  job(job_id: string): JobRecord | undefined;
  jobs(): readonly JobRecord[];
};

type Entry = { record: JobRecord; document: Uint8Array };

const isTerminal = (state: JobState): boolean => state === "printed" || state === "failed";

/**
 * The spooler.
 *
 * `pump()` does not loop and does not wait on a clock — one call, at most one transport interaction
 * per job. Two consequences, both deliberate: the retry schedule is the caller's (see
 * `RETRY_WINDOW_MS`), and `03-F42`'s "no I/O wait interleaved inside a document" holds by
 * construction, because the loop below awaits one `send` to completion before it touches the
 * transport again for any reason.
 *
 * On restart, rows come back as they were written, with ONE transition: a job caught mid-transmit
 * (`transmitting`) returns to `queued`, because its outcome is unknown and `03-F4` permits either
 * "resumes or reprints". `printed`, `failed` and `stalled` are restored as they stand — restoring a
 * `stalled` row as anything else is `03-F41`'s named defect, and restoring `printed` as `queued`
 * reprints a ticket that is already on the spike in the kitchen.
 */
export const createSpooler = ({ transport, store }: SpoolerOptions): Spooler => {
  const entries = new Map<string, Entry>();

  for (const row of store?.load() ?? []) {
    const { document, ...record } = row;
    entries.set(row.job_id, {
      record: { ...record, state: record.state === "transmitting" ? "queued" : record.state },
      document,
    });
  }

  /** Every transition is written down — `03-F4` persists the state machine, not just the job. */
  const commit = (entry: Entry, state: JobState): void => {
    entry.record.state = state;
    store?.put({ ...entry.record, document: entry.document });
  };

  const advance = async (entry: Entry): Promise<void> => {
    if (entry.record.state === "stalled") {
      // `03-F41`: the printer TOOK these bytes and is holding them until the roll is replaced, so
      // the only question left is whether the roll came back — never whether to send again. Asking
      // the sensor is `03-F40`'s real-time query; re-transmitting here is the duplicate KOT.
      const status = await transport.status();
      if (!status.paper_out) commit(entry, "printed");
      return;
    }

    commit(entry, "transmitting");
    const outcome = await transport.send(entry.document);

    if (!outcome.ok && outcome.state === "stalled") {
      // `03-F41`: "a stall never counts toward the 3-attempt budget" — `attempts` does not move.
      commit(entry, "stalled");
      return;
    }

    entry.record.attempts += 1;
    if (outcome.ok) {
      commit(entry, "printed");
      return;
    }
    // `03-F4`: "retry … (default 3 attempts over 30 s) on transport failure", and then stop.
    // `03-F5`/`03-F34` make the stop LOUD rather than silent: the terminal record keeps the printer
    // name and the order ref, and stays listed, so the host can raise the alert that names both.
    commit(entry, entry.record.attempts >= MAX_TRANSMIT_ATTEMPTS ? "failed" : "queued");
  };

  return {
    enqueue: (job) => {
      const entry: Entry = {
        record: {
          job_id: job.job_id,
          state: "queued",
          attempts: 0,
          printer_name: job.printer_name,
          order_ref: job.order_ref,
          // Conditional because `exactOptionalPropertyTypes` distinguishes "absent" from
          // "undefined", and `03-F55` reads absent as a spool row that kept no coverage — a
          // distinction the store has to be able to write down.
          ...(job.covers === undefined ? {} : { covers: job.covers }),
        },
        document: job.document,
      };
      entries.set(job.job_id, entry);
      // `03-F4`: written down BEFORE the first transmit attempt — and before this call returns, so
      // the confirm the cashier just tapped is acked over a row that is already on the disk.
      store?.put({ ...entry.record, document: entry.document });
      return { ...entry.record };
    },
    pump: async () => {
      for (const entry of [...entries.values()]) {
        if (isTerminal(entry.record.state)) continue;
        await advance(entry);
      }
    },
    job: (job_id) => {
      const entry = entries.get(job_id);
      return entry === undefined ? undefined : { ...entry.record };
    },
    jobs: () => [...entries.values()].map((entry) => ({ ...entry.record })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F40 — the health check.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `03-F40`'s query: `DLE EOT 4`, never `GS r`.
 *
 * The SAME binding as K-3's landed `PAPER_STATUS_QUERY`, not a second copy of the three bytes — two
 * copies nothing ties together drift, and one of the two drifting into `GS r` is the whole of this
 * FR: paper-end takes the printer offline, an offline printer "does not execute `GS r` at all", so a
 * health check built on it reports "paper present" forever.
 *
 * @unreached-owed With `checkPrinterHealth` — K-8. ⚠ The reason recorded here said *"no transport
 * has ever sent a real-time query, because no printer is attached"*, and the first half stopped
 * being true in August 2026: `apps/pos-electron/src/main/printer-link.ts`'s `tcp://` link sends
 * `PAPER_STATUS_QUERY` after every document. It reads the transport's decoded `status()` directly,
 * which is why THIS binding and `checkPrinterHealth` still have no caller — the pre-flight they
 * describe is a host act nobody performs yet, not a query nobody sends.
 */
export const PRINTER_HEALTH_QUERY = PAPER_STATUS_QUERY;

/** `03-F40`'s verdict: may a document be handed to this printer now, and if not, why not. */
export type PrinterHealth = {
  ready: boolean;
  /** Why not. `null` when ready. */
  reason: "paper_out" | "no_response" | null;
  /** `03-F40`'s near-end, model-gated. A WARNING — see below. */
  near_end: boolean | "unsupported";
};

/**
 * `03-F40`'s health check, over the RAW real-time response byte — `null` for a printer that answered
 * nothing at all.
 *
 * Silence is NOT health. The `GS r` defect's shape is a reading that can never become bad, and a
 * verdict that answers `ready` to a printer that said nothing has that shape by another route;
 * `03-F34` wants the refusal hard rather than silent.
 *
 * **Near-end warns, it does not stop.** `03-F40` model-gates the sensor and never says what a
 * positive reading does; `01-F17` decides it — a sale is never blocked — and a roll near its end is
 * still feeding, so refusing on it would stop service for a condition that has not happened. The
 * named alternative (near-end ⇒ `ready: false`) is rejected on that ground.
 *
 * **It has no caller in this package.** The spooler reads the transport's decoded `status()`; this
 * is the pre-flight a host runs before it hands over a document (K-7), and it does not go through
 * `03-F40`'s 4-query cap either — `createRealtimeQueryWindow` is still waiting for the transport
 * that ties them together.
 *
 * @unreached-owed K-8, the physical pass (`plans/wave-1/kot-printing.md`). The comment above
 * already names the missing caller — a host pre-flight — and this marker is what makes a gate
 * agree with it, instead of the comment being the only place that knows.
 */
export const checkPrinterHealth = (
  response: number | null,
  caps: PrinterCapability,
): PrinterHealth => {
  if (response === null) {
    return {
      ready: false,
      reason: "no_response",
      near_end: caps.has_near_end_sensor ? false : "unsupported",
    };
  }
  const status = decodePaperStatus(response, caps);
  return {
    ready: !status.paper_out,
    reason: status.paper_out ? "paper_out" : null,
    near_end: status.near_end,
  };
};
