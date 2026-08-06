/**
 * Real-time printer status and the stall/failure classification (`03-F40`, `03-F41`, `18 §10`).
 *
 * Two facts about deployed hardware drive everything in this file and neither is a preference:
 *
 *   * `03-F40`: the paper-end sensor takes the printer **offline**, and an offline printer "does
 *     not execute `GS r` at all" — so the query has to be a REAL-TIME command (`DLE EOT 4`), which
 *     is answered while offline by design. The two commands also carry **incompatible bit layouts
 *     for the same sensor**, so only one map appears here and it is `DLE EOT 4`'s.
 *   * `03-F41`: a printer that has run out of paper is **holding** the job, not dropping it. So
 *     `stalled` is a distinct outcome from `failed`, and the layer that owns the ESC/POS knowledge
 *     is the layer that tells them apart — the spooler decides what to DO about it, and must not
 *     need this file's bit map to do so.
 *
 * There is no I/O in this file. Nothing here opens a socket, a serial port or a Bluetooth link:
 * the transports named in `18 §10` are unbuilt, and `03-F10`'s rig pass is owed in full.
 */

import type { PrinterCapability } from "./capability.js";

/** `03-F40`, verbatim: "`DLE EOT 4`: bits 2,3 near-end / 5,6 out". */
const NEAR_END_BITS = 0b0000_1100;
const PAPER_OUT_BITS = 0b0110_0000;

/**
 * `03-F40`'s roll-paper sensor reading.
 *
 * `near_end` is three-valued because the FR's own failure is two-valued reporting: a printer with
 * no near-end sensor leaves those bits clear forever, so `false` would be a warning that can never
 * fire — "paper present forever", one sensor over.
 */
export type PaperStatus = {
  paper_out: boolean;
  /** `"unsupported"` where the model has no near-end sensor (`03-F40`'s model gate). */
  near_end: boolean | "unsupported";
};

/**
 * `03-F40`: the real-time roll-paper query, `DLE EOT n=4`. `DLE` = 0x10, `EOT` = 0x04.
 *
 * The FR supplies the requirement; the published ESC/POS command set supplies the opcode.
 */
export const PAPER_STATUS_QUERY = Uint8Array.from([0x10, 0x04, 0x04]);

/**
 * `03-F41`: "Recovery from a recoverable/cutter error is `DLE ENQ n=2`." `ENQ` = 0x05.
 *
 * Real-time for the same reason the query is: the printer needing recovery is by definition not
 * processing its ordinary buffer, so a recovery sent as an ordinary command would queue behind the
 * job it exists to release. Who sends it, and when, is the spooler's policy and is unspecified.
 *
 * @unreached-owed K-8. The comment above says it outright — "who sends it, and when, is
 * unspecified" — and no transport can reach a cutter error with no printer attached.
 */
export const ERROR_RECOVERY_REQUEST = Uint8Array.from([0x10, 0x05, 0x02]);

/** `03-F40`: decode a `DLE EOT 4` response — with `DLE EOT 4`'s map, model-gated for near-end. */
export const decodePaperStatus = (response: number, caps: PrinterCapability): PaperStatus => ({
  paper_out: (response & PAPER_OUT_BITS) === PAPER_OUT_BITS,
  near_end: caps.has_near_end_sensor ? (response & NEAR_END_BITS) === NEAR_END_BITS : "unsupported",
});

/** What one transmit attempt observed. All three are required: an omission would classify by luck. */
export type TransmitEvidence = {
  /** `03-F40`'s answer, or `null` when the printer answered nothing at all. */
  status: PaperStatus | null;
  timed_out: boolean;
  /** A NAME (`"EPIPE"`), never a boolean — an S1 band has to say what broke. */
  link_error: string | null;
};

/**
 * `03-F4`'s state names, reused verbatim so the spooler cannot introduce a fourth word for the
 * same thing. A stalled outcome deliberately carries **no retry accounting**: `03-F41` says "a
 * stall never counts toward the 3-attempt budget", and a field that looks like bookkeeping is how
 * a budget gets spent through the back door.
 */
export type TransmitOutcome =
  | { ok: true }
  | { ok: false; state: "stalled"; reason: "paper_out"; model_id: string }
  | { ok: false; state: "failed"; reason: "link_error" | "no_response"; model_id: string };

/**
 * `03-F41`: stalled or failed, decided where the ESC/POS knowledge is.
 *
 * The order of the tests is the FR's own risk order. **Paper-out wins**, because the defect
 * `03-F41` is written about is a stall read as a failure — that retries and "double-prints the
 * instant the roll is loaded". Silence loses to a named link error for the opposite reason: an S1
 * band that says `no_response` when the socket reported `EPIPE` sends someone to the wrong layer.
 *
 * A timeout with the roll present and the link intact is a FAILURE (`no_response`): `03-F41`'s
 * whole sentence is about a timeout that must not be read as a stall, which leaves it a failure
 * once the sensor has said the roll is fine.
 *
 * **What is NOT decided here:** a link error arriving *during* a paper-out. `03-F41` does not rule,
 * the two answers have different costs, and this classifier takes the one that cannot double-print.
 */
export const classifyTransmit = (
  evidence: TransmitEvidence,
  caps: PrinterCapability,
): TransmitOutcome => {
  const model_id = caps.model_id;
  if (evidence.status?.paper_out === true) {
    return { ok: false, state: "stalled", reason: "paper_out", model_id };
  }
  if (evidence.link_error !== null) {
    return { ok: false, state: "failed", reason: "link_error", model_id };
  }
  if (evidence.status === null || evidence.timed_out) {
    return { ok: false, state: "failed", reason: "no_response", model_id };
  }
  return { ok: true };
};

/** `03-F40`, verbatim: "Cap outstanding real-time queries at **4**." */
export const REALTIME_QUERY_CAP = 4;

export type RealtimeQueryWindow = {
  /** `true` if a query may go out now; `false` at the cap. A refused query consumes no slot. */
  send(): boolean;
  /** A response arrived, or the query was abandoned. Frees exactly one slot, never more. */
  receive(): void;
  outstanding(): number;
};

/**
 * The cap, as a state machine.
 *
 * A refused query consumes no slot and a spurious response buys no credit — the first would wedge
 * the window shut after four refusals and the second would widen the cap by over-receiving, and
 * the cap exists because the printer's real-time response buffer is finite.
 *
 * **This window has no caller yet.** `18 §10`'s three transports are unbuilt; the first one to
 * land must be tested against this, or the cap is a number in a file.
 *
 * @unreached-owed K-8 / `18 §10` — the first real transport owes this its caller. "The cap is a
 * number in a file" is this rail's defect stated in the author's own words, one round early.
 */
export const createRealtimeQueryWindow = (): RealtimeQueryWindow => {
  let outstanding = 0;
  return {
    send: () => {
      if (outstanding >= REALTIME_QUERY_CAP) return false;
      outstanding += 1;
      return true;
    },
    receive: () => {
      outstanding = Math.max(0, outstanding - 1);
    },
    outstanding: () => outstanding,
  };
};
