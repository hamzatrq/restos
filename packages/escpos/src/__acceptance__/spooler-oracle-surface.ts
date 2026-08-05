// K-6 ORACLE SURFACE — types, a fake printer, and guarded accessors ONLY. NOT AN IMPLEMENTATION
// of the spooler.
//
// This file declares the contract `spooler.test.ts` drives. It contains no spooler logic: the fake
// printer below is a PRINTER, not a spooler — it accepts documents, holds them when its roll is
// out, and counts. Every decision the suite is about (when to send, when to retry, what spends the
// budget) belongs to the implementation and is absent here on purpose.
//
// Authored from spec text only (24 §3 step 2 — read-only to the implementing session):
//   specs/03-kitchen-fulfillment.md 03-F4  — "Durable spooler: every print job is persisted …
//     with an explicit state machine (`queued → transmitting → stalled? → printed | failed`) …
//     before the first transmit attempt … Retry with backoff (default 3 attempts over 30 s) on
//     transport failure."
//   specs/03-kitchen-fulfillment.md 03-F41 — "a stalled printer is HOLDING the job, not dropping
//     it — so `03-F4`'s retry must not fire … a stall never counts toward the 3-attempt budget and
//     never re-transmits. A timeout that flips a stall to `failed` and retries double-prints the
//     instant the roll is loaded — a duplicate KOT is a real kitchen error, not a cosmetic one."
//   specs/03-kitchen-fulfillment.md 03-F42 — "A document is rendered whole, buffered, and
//     transmitted as one unit … No I/O wait may be interleaved inside a document."
//   specs/03-kitchen-fulfillment.md 03-F40 — paper-out is read with the real-time `DLE EOT 4`,
//     never `GS r`; "a health check built on `GS r` reports 'paper present' forever and a
//     paper-out becomes a silent KOT failure"; near-end is model-gated.
//   specs/03-kitchen-fulfillment.md 03-F5  — silent KOT failure is forbidden; the alert names "the
//     printer and order".
//   specs/03-kitchen-fulfillment.md 03-F34 — a hard refusal to print, never a silent degradation.
//   specs/03-kitchen-fulfillment.md 03-F10 — the rig's paper-out step: "pull the roll mid-job and
//     assert the spooler reports `stalled` … then assert reloading prints the job EXACTLY ONCE".
//   specs/01-kernel-sync.md 01-F17 — a sale is NEVER blocked.
// K-1/K-2/K-3/K-4/K-5's landed code was read as the CONTRACT this layer composes over (their
// exports and their oracle surfaces). No K-6 implementation was read; none exists.
//
// ── NO HARDWARE IS INVOLVED IN ANY TEST THAT USES THIS FILE ──
//
// Every assertion downstream is about bytes handed to a JavaScript object, integers on a record,
// and transitions of a state machine. `03-F10`'s rig step — "pull the roll mid-job" on a real
// printer — is owed in full (K-8) and nothing here performs it. `pullRoll()` below moves a boolean.
// No test name may be read as a measurement of a printer.
//
// ── THE SEAM: WHY THIS FILE DOES NOT RE-DECLARE `Transport` ──
//
// `Transport` is declared ONCE, in `packages/testing/src/__acceptance__/virtual-printer-oracle-
// surface.ts`, beside the conformance check that is the only thing able to observe it. K-3's
// surface used to carry a second copy under a header claiming derivation; it was deleted because
// two copies nothing ties together drift silently, and an implementation shipping a wrong
// `Transport` passed both suites.
//
// This file does not make that mistake again and does not pretend it can avoid the problem either.
// `@restos/escpos` does not depend on `@restos/testing`, and a test author may not add the edge.
// So what is declared below is `SpoolerTransport` — the two members the SPOOLER is observed to
// use, named identically to the two on the canonical declaration, and it is a STRUCTURAL SUBSET,
// not a copy. TypeScript's structural typing makes any conforming `Transport` assignable to it.
// The consequence is stated rather than hidden: a rename on the canonical `Transport` does NOT red
// this suite. That is a real gap and `18 §16` is where closing it belongs.

import type {
  PaperStatus,
  PrinterCapabilityWithSensors,
  TransmitOutcome,
} from "./transport-oracle-surface.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F4 — the state machine, verbatim.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `03-F4`, verbatim and in the FR's own order: "`queued → transmitting → stalled? → printed |
 * failed`".
 *
 * Transcribed rather than invented, and asserted as a list rather than as a set, because
 * `03-F41`'s whole subject is that one of these five is NOT another one of them: "the spooler
 * distinguishes `transmitting, printer stalled` from `failed`". A spooler that ships four states
 * has collapsed exactly that distinction, and a spooler that ships six has introduced a word the
 * FR does not have (Commandment 2).
 */
export const JOB_STATES_PER_03_F4 = [
  "queued",
  "transmitting",
  "stalled",
  "printed",
  "failed",
] as const;
export type JobState = (typeof JOB_STATES_PER_03_F4)[number];

/** `03-F4`, verbatim: "default 3 attempts over 30 s". */
export const ATTEMPTS_PER_03_F4 = 3;
export const RETRY_WINDOW_MS_PER_03_F4 = 30_000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The job.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A print job as the spooler receives it.
 *
 * `document` is a `Uint8Array` and that is `03-F42` at the type level: "a document is rendered
 * whole, buffered, and transmitted as one unit". A field typed as a generator, an async iterator,
 * a stream or a `() => Uint8Array` would let the bytes be produced while I/O is in flight, which
 * is the interleave the FR bans — and a value that is already an array cannot be. This is the
 * "impossible by construction" form the brief asks for, in preference to a timing measurement
 * (`24-F12`).
 *
 * `printer_name` and `order_ref` are `03-F5`'s two nouns: the alert it mandates reads "KOT #142
 * did not print — grill printer offline", so both have to survive to whatever raises it. They are
 * carried, never interpreted: this layer does not raise the alert (that is K-7, on the counter,
 * `03-F5`/`screen-map §4`) and does not format the string.
 */
export type PrintJob = {
  job_id: string;
  /** `03-F42`: the WHOLE document, already buffered. Typically `render()`'s `bytes`. */
  document: Uint8Array;
  /** `03-F5`: "naming the printer and order". */
  printer_name: string;
  order_ref: string;
};

/**
 * What the spooler knows about a job.
 *
 * `attempts` is the one number `03-F41` is written about — "a stall never counts toward the
 * 3-attempt budget" — so it is on the record and observable rather than private. A budget nobody
 * can read is a budget nobody can prove was not spent.
 */
export type JobRecord = {
  job_id: string;
  state: JobState;
  /** `03-F4`'s budget counter. `03-F41`: a stall NEVER increments this. */
  attempts: number;
  printer_name: string;
  order_ref: string;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The transport seam the spooler is handed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The two members the spooler is observed to use — a structural subset of the canonical
 * `Transport` (see this file's header), not a second declaration of it.
 *
 * `send` takes ONE `Uint8Array`: `03-F42`'s "one unit", expressed where it can be enforced.
 * `status` is `03-F40`'s real-time query, and it is what a HELD job's release is decided from —
 * `03-F41`'s printer "goes offline and holds until the roll is replaced", so something has to
 * notice the roll came back, and the only thing that can is the sensor.
 */
export type SpoolerTransport = {
  send(document: Uint8Array): Promise<TransmitOutcome>;
  status(): Promise<PaperStatus>;
};

/**
 * Member names that would express HALF a document, transcribed from K-3's list so this suite and
 * the virtual printer's ban the same vocabulary rather than two overlapping ones.
 *
 * `03-F42`: "a chunked or streaming renderer that stalls >2 s mid-ticket gets its ticket cut in
 * half." A seam that cannot be handed a fragment cannot be stalled mid-fragment.
 *
 * This is a DENYLIST and it cannot state the absence completely — a second write path called
 * something nobody guessed would pass. Said plainly here for the same reason K-3 said it: the FR
 * is what has to close that, and until it does this is the honest shape.
 */
export const PARTIAL_DOCUMENT_MEMBERS = [
  "write",
  "writeChunk",
  "sendChunk",
  "chunk",
  "stream",
  "pipe",
  "cork",
  "uncork",
  "flush",
  "end",
  "begin",
  "beginDocument",
  "endDocument",
  "append",
] as const;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F40 — the health check.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `03-F40`'s health check, as a verdict.
 *
 * The FR names the thing and names its failure in one sentence: "a health check built on `GS r`
 * reports **'paper present' forever**, and a paper-out becomes a silent KOT failure." Two
 * properties fall out of that sentence and both are asserted downstream:
 *
 *   1. it is built on a RAW real-time response byte, because a bit-layout defect is only possible
 *      in something that reads bits — a health check handed an already-decoded `PaperStatus`
 *      cannot have the defect this FR exists to prevent, and testing it would be theatre;
 *   2. "no answer at all" is NOT health. The `GS r` defect's shape is a reading that can never
 *      become bad; a verdict that answers `ready` to silence has the same shape via a different
 *      route.
 *
 * DECLARED INTERPRETATION (24 §3b), stated rather than smuggled: **near-end is a warning, not a
 * stop.** `03-F40` model-gates the near-end sensor and never says what to do with a positive
 * reading. `01-F17` decides it — a sale is never blocked — and a roll that is near its end is
 * still feeding, so refusing to print on it stops service for a condition that has not happened
 * yet. The named alternative (near-end ⇒ `ready: false`) is rejected on that ground alone; if an
 * FR later wants a pre-emptive stop it can say so, and this reading is the one that fails safe
 * toward food reaching the pass.
 */
export type PrinterHealth = {
  /** May a document be handed to this printer now? */
  ready: boolean;
  /** Why not. `null` when ready. */
  reason: "paper_out" | "no_response" | null;
  /** `03-F40`'s near-end, model-gated. A WARNING — see the interpretation above. */
  near_end: boolean | "unsupported";
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The spooler.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * DECLARED INTERPRETATION (24 §3b) — `pump()`, and why the spooler does not drive itself.
 *
 * `03-F4` gives a state machine and a retry budget "over 30 s" and says nothing about what turns
 * the crank. A self-driving spooler (an internal timer loop, `start()`/`stop()`) is the obvious
 * alternative and it is rejected for a stated reason: the only way to observe a timer loop is to
 * WAIT for it, and `24-F12` bans the flaky-by-construction timing assertion that would follow.
 * The whole point of `03-F42`'s brief is to prefer impossible-by-construction over measured.
 *
 * So: `pump()` advances every non-terminal job by AT MOST ONE transport interaction and resolves.
 * It does not loop internally and it does not wait on a clock. The backoff *schedule* is therefore
 * the caller's (K-7 owns it in `pos-electron`) and this suite asserts the BUDGET — `03-F4`'s three
 * attempts — and never the spacing between them.
 */
export type Spooler = {
  /**
   * `03-F4`: the job is recorded "before the first transmit attempt".
   *
   * Synchronous, and that is `01-F17` at the type level: a sale is never blocked — not by
   * printing. A method returning `Promise<JobRecord>` invites a confirm path to await a printer.
   */
  enqueue(job: PrintJob): JobRecord;
  /** Advance every non-terminal job by at most one transport interaction. */
  pump(): Promise<void>;
  job(job_id: string): JobRecord | undefined;
  jobs(): readonly JobRecord[];
};

export type SpoolerOptions = {
  transport: SpoolerTransport;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The fake printer. A PRINTER, not a spooler.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What the fake printer recorded. Two arrays, and the distinction between them is the whole test.
 *
 *   `attempts`  — every `send()` call. `03-F41`'s "never re-transmits" is a statement about THIS
 *                 array's length.
 *   `received`  — the documents the printer actually took and is holding or has printed. A stall
 *                 is a printer that TOOK the bytes and is holding them (`03-F41`: "the printer
 *                 stops after the current printing completes, goes offline and holds until the
 *                 roll is replaced"), so a stalled send appends here. A link error did not reach
 *                 the printer and does not.
 *
 * The duplicate KOT `03-F41` is written about is `received.length === 2`, and it is invisible
 * until the roll is replaced — which is exactly why the suite asserts on this array and not on
 * "the job eventually succeeded".
 */
export type FakePrinter = SpoolerTransport & {
  /** Every `send()` argument, in order. */
  attempts(): readonly Uint8Array[];
  /** Every document the printer took (ok or stalled), in order. */
  received(): readonly Uint8Array[];
  /** Every transport method called, in order, including the partial-document spies. */
  calls(): readonly string[];
  /** Transport calls that were made while a `send()` was still pending (`03-F42`). */
  callsDuringSend(): readonly string[];
  /** `03-F41`/`03-F10`: the roll runs out. The printer holds; it does not drop. */
  pullRoll(): void;
  /** `03-F41`: the roll is replaced. What was held prints — exactly once. */
  loadRoll(): void;
  /** Queue N consecutive link failures. Consumed one per `send()`. */
  failLink(count: number): void;
  /** Make the next `send()` never resolve — for `01-F17`, a printer that is simply not there. */
  hang(): void;
};

export type FakePrinterOptions = {
  capability: PrinterCapabilityWithSensors;
};

/**
 * A printer that behaves the way `03-F41` describes one.
 *
 * It classifies its own outcome rather than calling K-3's `classifyTransmit`, deliberately: this
 * is the ORACLE's model of a printer, and a fake that shared the implementation's classifier would
 * make every downstream assertion a round-trip of one function against itself. The mapping used is
 * the FR's own sentence and nothing more — roll out ⇒ `stalled`/`paper_out`, broken link ⇒
 * `failed`/`link_error`.
 *
 * The partial-document members are present as SPIES that record and throw. Their presence is not a
 * claim that a transport may have them (K-3's suite bans them on the canonical declaration); it is
 * how "the spooler never called one" becomes an observation rather than an assumption. A spooler
 * that reaches for `write()` gets a recorded call AND a thrown error, so it cannot fail quietly.
 */
export const createFakePrinter = (options: FakePrinterOptions): FakePrinter => {
  const model_id = options.capability.model_id;
  const attempts: Uint8Array[] = [];
  const received: Uint8Array[] = [];
  const calls: string[] = [];
  const callsDuringSend: string[] = [];
  let paper_out = false;
  let link_failures = 0;
  let hanging = false;
  let sending = 0;

  const note = (name: string): void => {
    calls.push(name);
    if (sending > 0) callsDuringSend.push(name);
  };

  const printer = {
    async send(document: Uint8Array): Promise<TransmitOutcome> {
      note("send");
      attempts.push(document.slice());
      if (hanging) {
        hanging = false;
        return new Promise<TransmitOutcome>(() => {
          /* never resolves — `01-F17`: the sale must not wait on this. */
        });
      }
      sending += 1;
      try {
        // One microtask turn in which the document is "in flight". Anything the spooler does here
        // is an I/O wait interleaved inside a document (`03-F42`) and is recorded as such.
        await Promise.resolve();
        if (link_failures > 0) {
          link_failures -= 1;
          return { ok: false, state: "failed", reason: "link_error", model_id };
        }
        received.push(document.slice());
        if (paper_out) {
          return { ok: false, state: "stalled", reason: "paper_out", model_id };
        }
        return { ok: true };
      } finally {
        sending -= 1;
      }
    },
    async status(): Promise<PaperStatus> {
      note("status");
      await Promise.resolve();
      return {
        paper_out,
        near_end: options.capability.has_near_end_sensor ? false : "unsupported",
      };
    },
    attempts: () => attempts,
    received: () => received,
    calls: () => calls,
    callsDuringSend: () => callsDuringSend,
    pullRoll: () => {
      paper_out = true;
    },
    loadRoll: () => {
      paper_out = false;
    },
    failLink: (count: number) => {
      link_failures = count;
    },
    hang: () => {
      hanging = true;
    },
  };

  for (const member of PARTIAL_DOCUMENT_MEMBERS) {
    Object.defineProperty(printer, member, {
      value: (): never => {
        note(member);
        throw new Error(`03-F42: a document is transmitted as ONE unit — \`${member}\` is banned`);
      },
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }

  return printer as FakePrinter;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The `@restos/escpos` surface this suite drives.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every member is optional so that a missing export fails the RED run LOUDLY at runtime (with the
 * FR named) instead of blocking `pnpm typecheck` for the whole repo — K-1's idiom, inherited
 * through K-2, K-3, K-4 and K-5.
 */
export type EscposK6Api = {
  /** `03-F4`: the state machine's five names. */
  SPOOLER_JOB_STATES?: readonly string[];
  /** `03-F4`: "default 3 attempts". */
  MAX_TRANSMIT_ATTEMPTS?: number;
  /** `03-F4`: "over 30 s". */
  RETRY_WINDOW_MS?: number;
  /** `03-F4`/`03-F41`/`03-F42`: the spooler itself. */
  createSpooler?: (options: SpoolerOptions) => Spooler;
  /** `03-F40`: the query the health check is built on. `DLE EOT 4`, never `GS r`. */
  PRINTER_HEALTH_QUERY?: Uint8Array;
  /** `03-F40`: the health check, over a RAW real-time response byte (or `null` for silence). */
  checkPrinterHealth?: (
    response: number | null,
    caps: PrinterCapabilityWithSensors,
  ) => PrinterHealth;
};

const missing = (name: string, fr: string): never => {
  throw new Error(`@restos/escpos.${name} is not implemented yet (K-6, ${fr})`);
};

export const spoolerJobStates = (api: EscposK6Api): readonly string[] =>
  api.SPOOLER_JOB_STATES ?? missing("SPOOLER_JOB_STATES", "03-F4");

export const maxTransmitAttempts = (api: EscposK6Api): number =>
  api.MAX_TRANSMIT_ATTEMPTS ?? missing("MAX_TRANSMIT_ATTEMPTS", "03-F4");

export const retryWindowMs = (api: EscposK6Api): number =>
  api.RETRY_WINDOW_MS ?? missing("RETRY_WINDOW_MS", "03-F4");

export const createSpooler = (api: EscposK6Api, options: SpoolerOptions): Spooler =>
  typeof api.createSpooler === "function"
    ? api.createSpooler(options)
    : missing("createSpooler", "03-F4");

export const printerHealthQuery = (api: EscposK6Api): Uint8Array =>
  api.PRINTER_HEALTH_QUERY ?? missing("PRINTER_HEALTH_QUERY", "03-F40");

export const checkPrinterHealth = (
  api: EscposK6Api,
  response: number | null,
  caps: PrinterCapabilityWithSensors,
): PrinterHealth =>
  typeof api.checkPrinterHealth === "function"
    ? api.checkPrinterHealth(response, caps)
    : missing("checkPrinterHealth", "03-F40");

/** Every function-valued member on an object and its prototype chain, sorted. */
export const functionMembers = (subject: object): readonly string[] => {
  const found = new Set<string>();
  for (
    let object: object | null = subject;
    object !== null && object !== Object.prototype;
    object = Object.getPrototypeOf(object) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(object)) {
      if (name === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, name);
      if (descriptor !== undefined && typeof descriptor.value === "function") found.add(name);
    }
  }
  return [...found].sort();
};
