// K-3 ORACLE SURFACE — types, spec-derived bit maps and guarded accessors ONLY. NOT AN
// IMPLEMENTATION.
//
// This file declares the contract `transport.test.ts` drives. The ONLY arithmetic in it is
// `03-F40`'s two bit masks, transcribed from the FR sentence that names them, because the whole
// point of that FR is that the two maps must be told apart and a test that cannot state both maps
// cannot tell them apart. Everything else either forwards to `../index.js` or throws a named "not
// implemented yet" error.
//
// Authored from spec text only (24 §3 step 2 — read-only to the implementing session):
//   specs/18-engineering-handbook.md §10 — "document model … → encoder → `Transport` interface";
//     the transport matrix (TCP 9100, USB/serial, Bluetooth SPP/BLE); "every printer interaction
//     goes through the spooler … direct transport writes from app code are banned"; and "the
//     virtual printer (in `packages/testing`) implements `Transport` and renders output to PNG".
//   specs/03-kitchen-fulfillment.md 03-F40 — paper-out is read with the real-time `DLE EOT 4`,
//     never `GS r`; the two INCOMPATIBLE bit layouts for the same sensor; near-end is not
//     universal and is model-gated from the capability record; cap outstanding real-time queries
//     at 4.
//   specs/03-kitchen-fulfillment.md 03-F41 — a stalled printer is HOLDING the job; `stalled` is a
//     distinct state from `failed`; a stall never counts toward the 3-attempt budget and never
//     re-transmits; recovery from a recoverable/cutter error is `DLE ENQ n=2`.
//   specs/03-kitchen-fulfillment.md 03-F42 — a document is rendered whole, buffered and
//     transmitted as ONE unit; no I/O wait may be interleaved inside a document.
//   specs/03-kitchen-fulfillment.md 03-F4  — the spooler's state machine
//     (`queued → transmitting → stalled? → printed | failed`) and its 3-attempt budget.
//   specs/03-kitchen-fulfillment.md 03-F10 — the rig's paper-out step ("pull the roll mid-job …
//     then assert reloading prints the job EXACTLY ONCE") and the 9100/Bluetooth reconnect step.
//   specs/03-kitchen-fulfillment.md §7    — the capability record this layer model-gates from.
//   specs/03-kitchen-fulfillment.md 03-F34 — a hard refusal to print, never a silent degradation.
//
// NO HARDWARE IS INVOLVED IN ANY TEST THAT USES THIS FILE. Every assertion downstream is about
// bytes placed in a `Uint8Array`, integers decoded from a status byte, and transitions of a pure
// state machine. Nothing here opens a socket, a serial port or a Bluetooth link, and no test name
// may be read as a measurement of a printer.
//
// A NOTE ON WHAT IS *NOT* HERE, AND ON A CLAIM THIS HEADER USED TO MAKE.
//
// `Transport` is a TypeScript interface, and an interface has no runtime existence: the only way
// to assert one is against an implementation, and the only implementation in the repo is the
// virtual printer in `packages/testing`. The declaration and the conformance check therefore live
// TOGETHER and live THERE — `packages/testing/src/__acceptance__/virtual-printer-oracle-surface.ts`
// declares `Transport`, and `virtual-printer.test.ts` drives it.
//
// This file used to carry a SECOND copy of that declaration (a `Transport` type and a
// `TRANSPORT_MEMBERS` list) under a header claiming the virtual printer's allowlist "is derived
// from" it. Both halves of that claim were false: `transport.test.ts` imported neither symbol, and
// the other package asserted against its own hand-copy of the same four names. Two copies that
// nothing ties together can drift silently, so an implementation shipping a wrong `Transport`
// passed both suites. The copy is DELETED rather than re-pointed: `@restos/testing` does not
// depend on `@restos/escpos`, a test author may not add the edge, and one home is the only shape
// that cannot drift. When a REAL transport lands in this package (`18 §10`'s TCP 9100 is the one
// it calls pure TS and all-platform), it must be checked against that same declaration and not
// against a third copy of the names.

import type { PrinterCapability } from "./oracle-surface.js";

/**
 * `03-F40`: "A **near-end** sensor is not universal (the TM-T88VII lists paper-end + cover-open
 * only) — model-gate the feature from the 03-F10 capability record rather than assuming it."
 *
 * K-1's record has no such field, and K-1 said so in as many words: the eight fields are asserted
 * PRESENT, never that "the key set is closed at eight", and it named this FR as one of the two
 * that grow it. This is that growth.
 *
 * DECLARED INTERPRETATION (24 §3b — stated, not smuggled): the gate is a BOOLEAN ON THE RECORD,
 * not a lookup keyed by `model_id` inside the decoder. The named alternative — a model list in the
 * status module — is rejected because `03 §7` already made the capability record the single place
 * a model becomes a set of numbers, and a second per-model table is the drift the withdrawn
 * `58 | 80` enum was withdrawn for.
 */
export type PrinterCapabilityWithSensors = PrinterCapability & {
  /** `03-F40`: whether THIS model has a paper NEAR-END sensor at all. */
  has_near_end_sensor: boolean;
};

/**
 * `03-F40`'s roll-paper sensor reading.
 *
 * `near_end` is a three-valued field and that is the FR's own doing. A printer with no near-end
 * sensor reports bits that are always clear, so a decoder that maps "bits clear" to `false` says
 * "the roll is not running out" about a printer that cannot know — which is the SAME defect
 * `03-F40` is written about: "a health check built on `GS r` reports **'paper present' forever**".
 * `"unsupported"` is the only value that a caller cannot mistake for a reading.
 *
 * DECLARED INTERPRETATION (24 §3b): the FR says "model-gate the feature" and does not say what the
 * gated-off value is. The named alternative — omitting the key entirely — is weaker in TypeScript,
 * where `status.near_end` on an optional field is `undefined` and `undefined` is falsy, i.e. it
 * degrades to exactly the reading this FR bans.
 */
export type PaperStatus = {
  /** `DLE EOT 4` bits 5,6 — the roll is OUT. The printer is offline and holding (`03-F41`). */
  paper_out: boolean;
  /** `DLE EOT 4` bits 2,3 — the roll is NEAR its end. `"unsupported"` where the model has no sensor. */
  near_end: boolean | "unsupported";
};

/**
 * `03-F40`, verbatim: "(`DLE EOT 4`: bits 2,3 near-end / 5,6 out; `GS r 1`: bits 0,1 / 2,3)".
 *
 * Both maps live here BECAUSE the FR's failure is decoding one with the other's map, and a suite
 * that carries only the correct map cannot demonstrate that the wrong one is wrong. The `GS r` map
 * is never handed to the implementation and the implementation is never asked to produce one — it
 * is the oracle's counter-example, and `transport.test.ts` proves the two disagree before it uses
 * either.
 */
export const DLE_EOT_4_NEAR_END_BITS = 0b0000_1100;
export const DLE_EOT_4_PAPER_OUT_BITS = 0b0110_0000;
export const GS_R_NEAR_END_BITS = 0b0000_0011;
export const GS_R_PAPER_OUT_BITS = 0b0000_1100;

/**
 * Bits 1 and 4 are fixed at 1 in an ESC/POS real-time status byte. The FR names only the sensor
 * bits; these come from the published command set, for K-2's stated reason — "the FR supplies the
 * requirement; the published ESC/POS command set supplies the opcode". They are set on every
 * fixture below so that an implementation which validates the fixed bits is not failed by a
 * fixture the printer would never send.
 */
export const REALTIME_STATUS_RESERVED_BITS = 0b0001_0010;

/** A response byte with the roll present and not near its end. */
export const RESPONSE_PAPER_PRESENT = REALTIME_STATUS_RESERVED_BITS;
/** A response byte reporting NEAR-END only — the roll is still feeding. */
export const RESPONSE_NEAR_END = REALTIME_STATUS_RESERVED_BITS | DLE_EOT_4_NEAR_END_BITS;
/** A response byte reporting PAPER OUT. */
export const RESPONSE_PAPER_OUT = REALTIME_STATUS_RESERVED_BITS | DLE_EOT_4_PAPER_OUT_BITS;

/** The oracle's correct decoder: `03-F40`'s `DLE EOT 4` map, and nothing else. */
export const decodeWithDleEot4Map = (response: number): { near_end: boolean; out: boolean } => ({
  near_end: (response & DLE_EOT_4_NEAR_END_BITS) === DLE_EOT_4_NEAR_END_BITS,
  out: (response & DLE_EOT_4_PAPER_OUT_BITS) === DLE_EOT_4_PAPER_OUT_BITS,
});

/**
 * The oracle's COUNTER-EXAMPLE decoder: `03-F40`'s `GS r 1` map applied to the same byte. This is
 * the mistake the FR names ("`packages/escpos` must never decode one with the other's map"), and
 * it exists here only so the tests can show what it costs.
 */
export const decodeWithGsRMap = (response: number): { near_end: boolean; out: boolean } => ({
  near_end: (response & GS_R_NEAR_END_BITS) === GS_R_NEAR_END_BITS,
  out: (response & GS_R_PAPER_OUT_BITS) === GS_R_PAPER_OUT_BITS,
});

/**
 * `03-F41`: "the spooler distinguishes **`transmitting, printer stalled`** from **`failed`**, and
 * a stall never counts toward the 3-attempt budget and never re-transmits."
 *
 * The distinction is made HERE, not in the spooler, and that placement is a declared
 * interpretation (24 §3b). The alternative — the spooler classifies — requires the spooler to hold
 * `03-F40`'s bit map, which is the one thing that FR says must live in `packages/escpos` and must
 * never be mixed up with the other map. So the transport layer answers "what happened" in ESC/POS
 * terms and the spooler decides what to do about it. `03-F4`'s state names are reused verbatim so
 * that a spooler cannot introduce a fourth word for the same thing.
 */
export type TransmitOutcome =
  | { ok: true }
  | {
      ok: false;
      /** `03-F4`'s state, `03-F41`'s addition: the printer is HOLDING the job. */
      state: "stalled";
      /** Why. `03-F40` supplies the only evidence a stall can rest on. */
      reason: "paper_out";
      /** `03-F5`'s precedent: an alert names the printer. */
      model_id: string;
    }
  | {
      ok: false;
      state: "failed";
      /** `link_error`: the link itself broke. `no_response`: the printer answered nothing at all. */
      reason: "link_error" | "no_response";
      model_id: string;
    };

/**
 * Every key an outcome is permitted to carry, as runtime data — K-1's allowlist idiom, and here it
 * guards a specific leak: an outcome that also carried an `attempt`, `retry_in_ms` or
 * `attempts_remaining` would let a stall spend retry budget through the back door, which is the
 * one thing `03-F41` forbids ("a stall never counts toward the 3-attempt budget").
 */
export const TRANSMIT_OUTCOME_KEYS = ["ok", "state", "reason", "model_id"] as const;

type _OutcomeKeysAreExhaustive =
  Exclude<
    keyof Extract<TransmitOutcome, { ok: false }>,
    (typeof TRANSMIT_OUTCOME_KEYS)[number]
  > extends never
    ? true
    : never;
const _outcomeKeysAreExhaustive: _OutcomeKeysAreExhaustive = true;
void _outcomeKeysAreExhaustive;

/**
 * What the transport observed about one transmit attempt.
 *
 * All three fields are REQUIRED. `03-F41`'s defect is a timeout being read as a failure, so a
 * classifier that could be called without the sensor's answer would be able to reproduce the
 * defect by omission.
 */
export type TransmitEvidence = {
  /** `03-F40`'s answer, or `null` when the printer answered NOTHING (not even a real-time query). */
  status: PaperStatus | null;
  /** The transport stopped waiting for the document to be accepted. */
  timed_out: boolean;
  /** The link itself errored. A NAME (`"EPIPE"`), never a boolean — an S1 band has to say what. */
  link_error: string | null;
};

/** `03-F40`, verbatim: "Cap outstanding real-time queries at **4**." */
export const REALTIME_QUERY_CAP = 4;

/**
 * The cap, as a state machine.
 *
 * DECLARED INTERPRETATION (24 §3b), and the weakest thing in this file — say so plainly. `03-F40`
 * gives a number and no owner. Put in `packages/escpos` it is written once; left to each transport
 * it is written three times (TCP, USB/serial, Bluetooth) and tested in none, because no transport
 * exists yet to test it in. This surface is the smaller lie. **No K-3 component is observed to USE
 * it** — see the DEFERRED note in `transport.test.ts`; that is round 2's pattern 4 ("correct in
 * isolation, unconnected in fact") named in advance rather than discovered later.
 */
export type RealtimeQueryWindow = {
  /** `true` if a query may go out now; `false` at the cap. A refused query consumes no slot. */
  send(): boolean;
  /** A response arrived, or the query was abandoned. Frees exactly one slot, never more. */
  receive(): void;
  outstanding(): number;
};

/**
 * The `@restos/escpos` surface this suite drives. Every member is optional so that a missing export
 * fails the RED run LOUDLY at runtime (with the FR named) instead of blocking `pnpm typecheck` for
 * the whole repo — K-1's idiom, inherited through K-2.
 */
export type EscposK3Api = {
  /** `03-F40`: the real-time roll-paper query, `DLE EOT 4`. */
  PAPER_STATUS_QUERY?: Uint8Array;
  /** `03-F41`: "Recovery from a recoverable/cutter error is `DLE ENQ n=2`." */
  ERROR_RECOVERY_REQUEST?: Uint8Array;
  /** `03-F40`: the `DLE EOT 4` map, model-gated for near-end. */
  decodePaperStatus?: (response: number, caps: PrinterCapabilityWithSensors) => PaperStatus;
  /** `03-F41`: stalled vs failed, decided where the ESC/POS knowledge is. */
  classifyTransmit?: (evidence: TransmitEvidence, caps: PrinterCapability) => TransmitOutcome;
  /** `03-F40`: "Cap outstanding real-time queries at 4." */
  REALTIME_QUERY_CAP?: number;
  createRealtimeQueryWindow?: () => RealtimeQueryWindow;
};

const missing = (name: string, fr: string): never => {
  throw new Error(`@restos/escpos.${name} is not implemented yet (K-3, ${fr})`);
};

export const paperStatusQuery = (api: EscposK3Api): Uint8Array =>
  api.PAPER_STATUS_QUERY ?? missing("PAPER_STATUS_QUERY", "03-F40");

export const errorRecoveryRequest = (api: EscposK3Api): Uint8Array =>
  api.ERROR_RECOVERY_REQUEST ?? missing("ERROR_RECOVERY_REQUEST", "03-F41");

export const decodePaperStatus = (
  api: EscposK3Api,
  response: number,
  caps: PrinterCapabilityWithSensors,
): PaperStatus =>
  typeof api.decodePaperStatus === "function"
    ? api.decodePaperStatus(response, caps)
    : missing("decodePaperStatus", "03-F40");

export const classifyTransmit = (
  api: EscposK3Api,
  evidence: TransmitEvidence,
  caps: PrinterCapability,
): TransmitOutcome =>
  typeof api.classifyTransmit === "function"
    ? api.classifyTransmit(evidence, caps)
    : missing("classifyTransmit", "03-F41");

export const realtimeQueryCap = (api: EscposK3Api): number =>
  api.REALTIME_QUERY_CAP ?? missing("REALTIME_QUERY_CAP", "03-F40");

export const createRealtimeQueryWindow = (api: EscposK3Api): RealtimeQueryWindow =>
  typeof api.createRealtimeQueryWindow === "function"
    ? api.createRealtimeQueryWindow()
    : missing("createRealtimeQueryWindow", "03-F40");
