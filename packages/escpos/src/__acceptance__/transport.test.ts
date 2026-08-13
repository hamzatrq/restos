// Acceptance tests — K-3, part 1 of 2: the ESC/POS half of the `Transport` seam. The paper sensor
// (`03-F40`), the stall (`03-F41`), the real-time query cap, and what a transport may be handed.
//
// Part 2 — the `Transport` interface's shape and the virtual printer that implements it — lives in
// `packages/testing/src/__acceptance__/virtual-printer.test.ts`, because a TypeScript interface has
// no runtime existence and the only way to assert one is against an implementation. The interface
// is DECLARED there too, once, next to the check that observes it: this file used to carry a second
// copy that nothing imported, and the two could drift. See the note at the head of
// `transport-oracle-surface.ts`. **Nothing in THIS suite asserts anything about a `Transport`.**
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `18 §10` — "document model … → encoder → `Transport` interface"; the transport matrix; "every
//              printer interaction goes through the spooler … direct transport writes from app
//              code are banned"; the virtual printer implements `Transport` and renders to PNG.
//   `03-F40` — `DLE EOT 4`, never `GS r`; the two INCOMPATIBLE bit layouts for the same sensor;
//              near-end is not universal and is model-gated from the capability record; cap
//              outstanding real-time queries at 4.
//   `03-F41` — a stalled printer is HOLDING the job; `stalled` ≠ `failed`; a stall never counts
//              toward the 3-attempt budget and never re-transmits; `DLE ENQ n=2` recovers a
//              recoverable/cutter error.
//   `03-F42` — a document is transmitted as ONE unit; no I/O wait interleaved inside a document.
//   `03-F4`  — the spooler's state machine and its 3-attempt/30 s budget.
//   `03-F10` — the rig's paper-out step; the 9100/Bluetooth reconnect step.
//   `03-F34` — a hard refusal to print, never a silent degradation.
//   `03 §7`  — the capability record that the near-end feature is gated from.
// K-1's and K-2's landed code was read as the CONTRACT this layer sits behind (their exports and
// their oracle surfaces). No K-3 implementation was read; none exists.
// `plans/wave-1/kot-printing.md` was deliberately NOT read.
//
// ── NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER. ──
//
// Every assertion here is about bytes in a `Uint8Array`, an integer decoded from a status byte, or
// a transition of a pure state machine. `03-F10`'s paper-out step — "pull the roll mid-job … then
// assert reloading prints the job EXACTLY ONCE" — is a RIG procedure on real hardware and is still
// owed in full. The software half of it is in the virtual-printer suite, and neither suite may be
// read as having performed it.
//
// ── WHAT IS GREEN ON THE RED RUN, AND WHY (stated so the count is not read as coverage) ──
//
// FOUR of the 21 tests pass on the RED run and none of them observes a K-3 export:
//   * THREE ORACLE SELF-TESTS feed `03-F40`'s two bit maps — both transcribed from the FR
//     sentence, neither taken from any implementation — the same response bytes, and assert that
//     the maps DISAGREE and that the disagreement is fixture- and field-dependent. A
//     counter-example nobody demonstrated is worth nothing: without these, "the implementation
//     agrees with the `DLE EOT 4` map" could be true of a decoder that ignores its input.
//   * ONE — `03-F34`'s "a refusal carries no bytes" — passes because it observes K-2's LANDED
//     encoder, which is the layer that produces the refusal. It is named here so its green is not
//     read as evidence about a transport, and its `describe` says the same thing: the transport
//     half is structural and is held in the virtual-printer suite, not here.
//
// ── FR AMBIGUITIES AND CONFLICTS, REPORTED RATHER THAN FILLED ──
//
//  1. **`03-F40` names bit PAIRS and does not say whether ONE bit of a pair counts.** "bits 2,3
//     near-end / 5,6 out" is satisfied by `both set` and by `any set`, and real firmware sets them
//     together. Every fixture below sets both bits of a pair or none of them, so both readings
//     agree on what the implementation must answer, and this suite does not decide the question.
//     It is not idle: under the `any set` reading the two maps AGREE that a near-end byte is
//     near-end (self-test below), which is exactly why every fixture asserts BOTH fields.
//  2. **The near-end gate's OFF value is not stated.** `03-F40` says "model-gate the feature"; it
//     does not say what a gated-off reading looks like. `"unsupported"` is the interpretation, and
//     the reason is the FR's own: a `false` that can never become `true` is the `GS r` defect
//     ("reports paper present forever") wearing a different name. Declared in the oracle surface
//     with the alternative named.
//  3. **`has_near_end_sensor` is a NEW field on `03 §7`'s record.** K-1 asserted the eight fields
//     are present and explicitly refused to close the key set, naming this FR as one of the two
//     that grow it. Its value per shipped model is a rig fact (`03-F10`), so this suite asserts
//     only that every shipped row DECLARES it and that the unknown-model default is the
//     conservative one; it invents no per-model answer.
//  4. **`03-F41` does not say what a link error DURING a paper-out means.** Evidence carrying both
//     `paper_out: true` and a `link_error` is not exercised and nothing here decides it. Naming it
//     rather than picking one: the two answers have different costs (a wrongly-classified stall
//     double-prints; a wrongly-classified failure loses the alert) and the FR chooses neither.
//  5. **The 4-query cap has NO OWNER in the FR.** `03-F40` gives the number and no component. The
//     oracle surface declares a window in `packages/escpos` and says why; nothing in K-3 is
//     observed to USE it. See DEFERRED — this is round 2's pattern 4 named in advance.
//  6. **`DLE ENQ n=2`'s CALLER is unspecified.** `03-F41` names the command for "a
//     recoverable/cutter error" and never says who sends it or when. This suite asserts the bytes
//     and that it is a REAL-TIME command (the property that makes it reachable on an offline
//     printer at all); the sending policy is the spooler's and the spooler has no K-task.
//  7. **`03-F42`'s "no I/O wait interleaved inside a document" cannot be asserted from a byte
//     buffer.** It is asserted by construction in the interface — one document, one argument, one
//     call — and that assertion lives in the virtual-printer suite where an object exists to
//     enumerate. A timing test would be the weaker form and the brief says so.

import { describe, expect, it } from "vitest";
import * as escpos from "../index.js";
import { type EncoderPart, type EscposK2Api, encode } from "./encoder-oracle-surface.js";
import {
  type EscposK1Api,
  printerCapabilities,
  unknownPrinterCapability,
} from "./oracle-surface.js";
import {
  classifyTransmit,
  createRealtimeQueryWindow,
  decodePaperStatus,
  decodeWithDleEot4Map,
  decodeWithGsRMap,
  type EscposK3Api,
  errorRecoveryRequest,
  GS_R_NEAR_END_BITS,
  GS_R_PAPER_OUT_BITS,
  type PrinterCapabilityWithSensors,
  paperStatusQuery,
  REALTIME_QUERY_CAP,
  RESPONSE_NEAR_END,
  RESPONSE_PAPER_OUT,
  RESPONSE_PAPER_PRESENT,
  realtimeQueryCap,
  TRANSMIT_OUTCOME_KEYS,
  type TransmitEvidence,
} from "./transport-oracle-surface.js";

const api = escpos as unknown as EscposK3Api;
const k1 = escpos as unknown as EscposK1Api;
const k2 = escpos as unknown as EscposK2Api;

/**
 * A capability record, defaulting to a printer that HAS a near-end sensor (`03-F40`'s gated-on
 * case). ONE builder, deliberately: there used to be two, and the second erased
 * `has_near_end_sensor` from its return type, which is how a fixture ended up asserting a
 * `"unsupported"` near-end reading against a record that said the sensor was fitted. `03-F40`'s
 * gate makes those two facts inseparable, so the builder that produces one produces the other.
 */
const caps = (over: Partial<PrinterCapabilityWithSensors> = {}): PrinterCapabilityWithSensors => ({
  model_id: "K3-TEST-80MM",
  dots: 576,
  dpi: 203,
  cols_font_a: 42,
  cols_font_b: 56,
  has_native_qr: false,
  has_cutter: true,
  raster_ok: true,
  has_near_end_sensor: true,
  ...over,
});

const evidence = (over: Partial<TransmitEvidence> = {}): TransmitEvidence => ({
  status: { paper_out: false, near_end: false },
  timed_out: false,
  link_error: null,
  ...over,
});

/** `[0x1d, 0x72]` — `GS r`, the command `03-F40` bans outright. */
const GS_R = [0x1d, 0x72] as const;

const containsSequence = (bytes: readonly number[], seq: readonly number[]): boolean =>
  bytes.some((_, i) => seq.every((value, k) => bytes[i + k] === value));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ORACLE SELF-TESTS — the counter-example must be shown to be a counter-example.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the two bit maps (oracle self-tests — these observe no implementation)", () => {
  it("03-F40: the maps disagree on a NEAR-END byte — the GS r map calls a feeding roll 'out'", () => {
    // 0b0001_1110: bits 2,3 set (`DLE EOT 4` near-end), bits 5,6 clear (not out). Decoded with the
    // `GS r 1` map, bits 2,3 mean PAPER OUT — so a printer with paper in it reports a stall, and
    // `03-F41` says a stall holds the job. The cost of this direction is a ticket that never
    // prints while the roll is fine.
    expect(RESPONSE_NEAR_END).toBe(0b0001_1110);
    expect(decodeWithDleEot4Map(RESPONSE_NEAR_END)).toEqual({ near_end: true, out: false });
    expect(decodeWithGsRMap(RESPONSE_NEAR_END).out).toBe(true);
    expect(decodeWithGsRMap(RESPONSE_NEAR_END).out).not.toBe(
      decodeWithDleEot4Map(RESPONSE_NEAR_END).out,
    );
  });

  it("03-F40: the maps disagree on a PAPER-OUT byte — the GS r map reports paper present, which is the silent KOT failure", () => {
    // 0b0111_0010: bits 5,6 set (`DLE EOT 4` paper out), bits 2,3 clear. The `GS r 1` map reads
    // bits 2,3 for "out", finds them clear, and answers "paper present" about an empty printer.
    // That is `03-F40`'s named consequence — "a paper-out becomes a silent KOT failure" — and it
    // is the direction that loses food, not just time.
    expect(RESPONSE_PAPER_OUT).toBe(0b0111_0010);
    expect(decodeWithDleEot4Map(RESPONSE_PAPER_OUT)).toEqual({ near_end: false, out: true });
    expect(decodeWithGsRMap(RESPONSE_PAPER_OUT)).toEqual({ near_end: false, out: false });
  });

  it("03-F40: under the FR's other permissible reading, NEAR-END alone does not tell the maps apart", () => {
    // `03-F40` says "bits 2,3 near-end" and does not say whether one bit of the pair counts. Under
    // the ANY-BIT reading the `GS r` map also calls 0b0001_1110 near-end (bit 1 is inside its
    // near-end pair), so a test that asserted only `near_end === true` would pass with the wrong
    // map installed. That is why every implementation assertion below asserts BOTH fields on BOTH
    // fixtures: this is the "guard passed by not looking" shape, and here it is demonstrated
    // rather than asserted about.
    const lenientGsR = (b: number): { near_end: boolean; out: boolean } => ({
      near_end: (b & GS_R_NEAR_END_BITS) !== 0,
      out: (b & GS_R_PAPER_OUT_BITS) !== 0,
    });
    expect(lenientGsR(RESPONSE_NEAR_END).near_end).toBe(
      decodeWithDleEot4Map(RESPONSE_NEAR_END).near_end,
    );
    expect(lenientGsR(RESPONSE_NEAR_END).out).not.toBe(decodeWithDleEot4Map(RESPONSE_NEAR_END).out);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F40 — the sensor is read with DLE EOT 4, with DLE EOT 4's map, gated per model.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("03-F40 — paper-out is detected with the real-time DLE EOT 4, never GS r", () => {
  it("03-F40: the query is DLE EOT n=4 — a REAL-TIME command, which is the whole reason it is the one that works", () => {
    // "Real-time commands are answered while offline by design", and a paper-end takes the printer
    // offline. A query that is not real-time is a query the printer never executes when it matters
    // — the exact failure mode `GS r` has. The opcode identity (`DLE` = 0x10, `EOT` = 0x04, n = 4)
    // comes from the published ESC/POS command set; the FR supplies the requirement.
    const query = [...paperStatusQuery(api)];
    expect(query).toEqual([0x10, 0x04, 0x04]);
    expect(query[0], "the paper query is not a real-time command").toBe(0x10);
    expect(containsSequence(query, GS_R)).toBe(false);
  });

  it("03-F40: no byte constant the package exports contains GS r", () => {
    // WHAT THIS SCAN COVERS, EXACTLY: the package's TOP-LEVEL exports that are a `Uint8Array` or an
    // array of numbers. It is broader than naming `PAPER_STATUS_QUERY` — a second query constant
    // added later is scanned without anyone editing this test — and it is narrower than "every byte
    // sequence the package publishes", which is what this comment used to claim. Bytes built INSIDE
    // a function are invisible here. They are not unguarded: K-2's ESC/POS walker is an allowlist
    // run over `encode()`'s whole output ("every document this suite encodes walks clean — no
    // banned and no unaccounted byte"), `GS r` (`1d 72`) is not one of the five `GS` opcodes it
    // admits (`GS !`, `GS B`, `GS V`, `GS v 0`, `GS ( D`), and an unadmitted command is reported as
    // `GS 0x72 at offset N — not in the K-2 allowlist` and reds that suite. The two scans together
    // are the coverage; neither alone is.
    // Non-vacuity is asserted first: a scan that found nothing to scan is the guard that passed by
    // not looking.
    const byteConstants = Object.entries(escpos as Record<string, unknown>).flatMap(
      ([name, value]) =>
        value instanceof Uint8Array
          ? [{ name, bytes: [...value] }]
          : Array.isArray(value) && value.every((v) => typeof v === "number")
            ? [{ name, bytes: value as number[] }]
            : [],
    );
    expect(
      byteConstants.length,
      "no byte constants were scanned — the scan is vacuous",
    ).toBeGreaterThanOrEqual(2);
    for (const constant of byteConstants) {
      expect(containsSequence(constant.bytes, GS_R), `${constant.name} contains GS r`).toBe(false);
    }
  });

  it("03-F40: a near-end response decodes as near-end and NOT as paper-out", () => {
    // Both fields, for the reason the third self-test demonstrates.
    expect(decodePaperStatus(api, RESPONSE_NEAR_END, caps())).toEqual({
      paper_out: false,
      near_end: true,
    });
  });

  it("03-F40: a paper-out response decodes as paper-out", () => {
    expect(decodePaperStatus(api, RESPONSE_PAPER_OUT, caps())).toEqual({
      paper_out: true,
      near_end: false,
    });
  });

  it("03-F40: a paper-present response decodes as neither — the decoder is not stuck on one answer", () => {
    // The positive control. Without it, "reports paper out when the roll is out" is satisfied by a
    // decoder that reports paper out always.
    expect(decodePaperStatus(api, RESPONSE_PAPER_PRESENT, caps())).toEqual({
      paper_out: false,
      near_end: false,
    });
  });

  it("03-F40: near-end is model-gated — a printer with no such sensor reports 'unsupported', never a false negative", () => {
    // "A near-end sensor is not universal (the TM-T88VII lists paper-end + cover-open only) —
    // model-gate the feature from the 03-F10 capability record rather than assuming it." A printer
    // without the sensor leaves those bits clear forever, so a decoder that maps clear→false hands
    // back a warning that can never fire: `03-F40`'s own "reports paper present forever", one
    // sensor over. The gate is asserted with the bits SET, so a decoder that simply forwards the
    // bits cannot pass by accident.
    // One assertion, not two: `toBe("unsupported")` already excludes `false`, and the second line
    // that used to follow it added nothing while looking like a second check.
    const gated = decodePaperStatus(api, RESPONSE_NEAR_END, caps({ has_near_end_sensor: false }));
    expect(gated.near_end).toBe("unsupported");

    // PAPER-END is universal — it is what takes the printer offline (`03-F41`) — so the gate must
    // not swallow it. A gate that silenced both readings would be a printer that can never report
    // an empty roll.
    const stillReportsOut = decodePaperStatus(
      api,
      RESPONSE_PAPER_OUT,
      caps({ has_near_end_sensor: false }),
    );
    expect(stillReportsOut.paper_out).toBe(true);
  });

  it("03 §7 + 03-F40: every shipped capability row DECLARES the near-end sensor, and the unknown model under-claims it", () => {
    // The FR says model-gate "from the 03-F10 capability record", so the fact has to be ON the
    // record for every model the table ships — an absent key is `undefined`, and `undefined` is
    // falsy, which is the interpretation the gate exists to prevent. The VALUE per model is a rig
    // measurement (`03-F10`) and is not asserted here; only that a value was recorded.
    const rows = printerCapabilities(k1);
    expect(rows.length, "the shipped table is empty — the scan is vacuous").toBeGreaterThan(0);
    for (const row of rows) {
      const declared = (row as unknown as Record<string, unknown>).has_near_end_sensor;
      expect(typeof declared, `${row.model_id} does not declare has_near_end_sensor`).toBe(
        "boolean",
      );
    }
    // K-1's rule for the unknown model: "every field here under-claims". An unknown printer is
    // assumed to have no near-end sensor, so the warning is `unsupported` rather than invented.
    const unknown = unknownPrinterCapability(k1) as unknown as Record<string, unknown>;
    expect(unknown.has_near_end_sensor).toBe(false);
  });

  it("03-F40: outstanding real-time queries are capped at 4, and a refused query consumes no slot", () => {
    // "Cap outstanding real-time queries at 4." The refused-query clause is not in the FR and is
    // not an invention either: a window that charged a slot for a query it did not send would
    // wedge shut after four refusals, i.e. the cap would become a permanent stop rather than a
    // limit. See ambiguity 5 — this window has no observed caller in K-3.
    expect(realtimeQueryCap(api)).toBe(REALTIME_QUERY_CAP);
    expect(REALTIME_QUERY_CAP).toBe(4);

    const window = createRealtimeQueryWindow(api);
    expect(window.outstanding()).toBe(0);
    const admitted = [window.send(), window.send(), window.send(), window.send()];
    expect(admitted).toEqual([true, true, true, true]);
    expect(window.outstanding()).toBe(4);

    expect(window.send(), "a fifth outstanding query was admitted").toBe(false);
    expect(window.outstanding(), "a refused query consumed a slot").toBe(4);

    window.receive();
    expect(window.outstanding()).toBe(3);
    expect(window.send()).toBe(true);
    expect(window.outstanding()).toBe(4);
  });

  it("03-F40: responses that answer nothing do not buy credit — the cap cannot be widened by over-receiving", () => {
    // A duplicated or late response must not raise the ceiling. Without this, four spurious
    // `receive()` calls turn the cap into 8, and the cap exists because the printer's real-time
    // response buffer is finite.
    const window = createRealtimeQueryWindow(api);
    window.receive();
    window.receive();
    window.receive();
    expect(window.outstanding(), "outstanding went negative").toBe(0);
    const admitted = [window.send(), window.send(), window.send(), window.send(), window.send()];
    expect(admitted.filter(Boolean).length).toBe(REALTIME_QUERY_CAP);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F41 — a stall is the printer HOLDING the job. It is not a failure and it buys no retry.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("03-F41 — a stalled printer is holding the job, so the retry must not fire", () => {
  it("03-F41: paper out plus a TIMEOUT classifies as stalled — this is the defect the FR is written about", () => {
    // "A timeout that flips a stall to `failed` and retries **double-prints the instant the roll is
    // loaded** — a duplicate KOT is a real kitchen error, not a cosmetic one." The timeout is set
    // deliberately: without it this test passes against a classifier that only looks at the sensor
    // when nothing else went wrong, which is precisely the classifier that ships the bug.
    // The fixture is SELF-CONSISTENT and has to be: `"unsupported"` is what `03-F40`'s gate answers
    // when — and only when — the model has no near-end sensor, so the record must say so. It said
    // the opposite here once, which described a printer that cannot exist and let the reader take
    // either half as the fixture's meaning.
    const outcome = classifyTransmit(
      api,
      evidence({ status: { paper_out: true, near_end: "unsupported" }, timed_out: true }),
      caps({ model_id: "GRILL-1", has_near_end_sensor: false }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // `toBe("stalled")` already excludes `"failed"`; the `.not.toBe("failed")` line that used to
    // follow it read like a second check and was not one. What actually holds the distinction open
    // is the partition test further down, where both states have to be REACHED.
    expect(outcome.state).toBe("stalled");
    expect(outcome.reason).toBe("paper_out");
    expect(outcome.model_id, "the outcome does not name the printer").toBe("GRILL-1");
  });

  it("03-F41: paper out WITHOUT a timeout is the same stall — the sensor decides, not the clock", () => {
    const outcome = classifyTransmit(
      api,
      evidence({ status: { paper_out: true, near_end: true }, timed_out: false }),
      caps(),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.state).toBe("stalled");
  });

  it("03-F41/03-F4: a broken link IS a failure, and it names the link error", () => {
    // The other side of the distinction. `03-F4`'s retry exists for exactly this case — "retry with
    // backoff (default 3 attempts over 30 s) on transport failure" — so a classifier that called
    // everything a stall would silence the retry the FR requires.
    const outcome = classifyTransmit(
      api,
      evidence({ status: { paper_out: false, near_end: false }, link_error: "EPIPE" }),
      caps({ model_id: "GRILL-1" }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.state).toBe("failed");
    expect(outcome.reason).toBe("link_error");
    expect(outcome.model_id).toBe("GRILL-1");
  });

  it("03-F41/03-F40: a printer that answers NOTHING is a failure, not a stall", () => {
    // "Real-time commands are answered while offline by design." So silence is not evidence of a
    // held job — it is evidence of a dead link, and the retry budget is the right response. This
    // is the assertion that stops "stalled" from becoming the catch-all that never retries.
    const outcome = classifyTransmit(api, evidence({ status: null, timed_out: true }), caps());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.state).toBe("failed");
    expect(outcome.reason).toBe("no_response");
  });

  it("03-F41: a clean transmit is neither — otherwise every document is an incident", () => {
    const outcome = classifyTransmit(api, evidence(), caps());
    expect(outcome.ok).toBe(true);
    expect(Object.keys(outcome)).toEqual(["ok"]);
  });

  it("03-F41: `stalled` and `failed` are distinct states and BOTH are reachable", () => {
    // `03-F4`'s machine is `queued → transmitting → stalled? → printed | failed` and `03-F41` adds
    // the branch. A classifier that answered one word for every input would satisfy each test
    // above that happens to expect that word; the enumeration is what makes them a partition.
    const states = [
      classifyTransmit(
        api,
        evidence({ status: { paper_out: true, near_end: false }, timed_out: true }),
        caps(),
      ),
      classifyTransmit(api, evidence({ link_error: "ECONNRESET" }), caps()),
      classifyTransmit(api, evidence({ status: null, timed_out: true }), caps()),
    ].map((outcome) => (outcome.ok ? "ok" : outcome.state));
    expect(new Set(states)).toEqual(new Set(["stalled", "failed"]));
  });

  it("03-F41: a stalled outcome carries NO retry accounting — the budget cannot be spent through the back door", () => {
    // "A stall never counts toward the 3-attempt budget and never re-transmits." An outcome that
    // carried `attempt`, `attempts_remaining` or `retry_in_ms` would let a spooler charge the
    // budget while reading a field that looks like bookkeeping. Stated as an ALLOWLIST for K-1's
    // reason: an absence cannot be stated completely by guessing names.
    const outcome = classifyTransmit(
      api,
      evidence({ status: { paper_out: true, near_end: false }, timed_out: true }),
      caps(),
    );
    const extra = Object.keys(outcome).filter(
      (key) => !(TRANSMIT_OUTCOME_KEYS as readonly string[]).includes(key),
    );
    expect(extra, "a stalled outcome carries an unaccounted field").toEqual([]);
    expect(Object.keys(outcome).length).toBeGreaterThan(1);
  });

  it("03-F41: the error-recovery request is DLE ENQ n=2, and it is REAL-TIME so an offline printer executes it", () => {
    // "Recovery from a recoverable/cutter error is `DLE ENQ n=2`." The printer needing recovery is
    // by definition not processing its ordinary buffer, so a recovery expressed as a non-real-time
    // command would sit behind the very job it is meant to release — the same shape of mistake as
    // `GS r`. Opcode identity (`DLE` = 0x10, `ENQ` = 0x05, n = 2) from the published command set.
    const recover = [...errorRecoveryRequest(api)];
    expect(recover).toEqual([0x10, 0x05, 0x02]);
    expect(recover[0], "the recovery request is not a real-time command").toBe(0x10);
    expect(recover).not.toEqual([...paperStatusQuery(api)]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F34 — a refusal carries no bytes. NOT a claim about a transport: read the title.
//
// The block was called "a refused document is not sendable", which promised an assertion about a
// transport refusing to send. There is no transport in `packages/escpos` — K-3's exports here are
// the sensor map, the classifier, the two real-time byte constants and the query window — so the
// single test below could not have made that assertion and did not: it drives K-2's LANDED
// `encode()` and nothing else. The title now says that. The transport half is STRUCTURAL (a
// refusal has no `bytes` field, so `send(document: Uint8Array)` cannot be called with one) and is
// held by the `Transport` declaration and its conformance test in the virtual-printer suite.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("03-F34 — an encoder refusal carries no bytes (K-2's landed encoder; no transport here)", () => {
  it("03-F34/03-F42: a refusal carries no bytes, so there is nothing a transport could be handed", () => {
    // K-1 deferred this to K-3 in as many words, and warned how it goes wrong: "a spy sink written
    // now would have nothing to spy on and would pass by finding nothing." So this is NOT a
    // write-counter on an idle transport — that is round 2's A13 ("asserts an empty store is
    // empty"). The positive control is the half that makes the negative able to fail.
    // Two banners with ordinary text between them — `27-F56`'s "a ticket with two banners has
    // none". The intervening run is not decoration: a `feed` alone leaves the band open (a banner
    // may take two lines), so a feed-separated pair is ONE banner and would not refuse.
    const twoBanners: EncoderPart[] = [
      { kind: "text", value: "VOID", ink: "inverted", scope: "banner" },
      { kind: "text", value: "KOT 142", ink: "normal" },
      { kind: "text", value: "REPRINT", ink: "inverted", scope: "banner" },
    ];
    const refused = encode(k2, twoBanners, caps());
    expect(refused.ok, "the two-banner fixture did not refuse — the control is broken").toBe(false);
    expect("bytes" in refused).toBe(false);

    const accepted = encode(k2, [{ kind: "text", value: "KOT 142", ink: "normal" }], caps());
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.bytes, "the positive control produced nothing to send").toBeInstanceOf(
      Uint8Array,
    );
    expect(accepted.bytes.length).toBeGreaterThan(0);
  });
});

// ── DEFERRED FROM K-3, DELIBERATELY (stated so the gap is a decision, not an omission) ──
//
// * **THE 3-ATTEMPT BUDGET ITSELF IS NOT ASSERTED ANYWHERE, AND NO K-TASK OWNS IT.** `03-F41`'s
//   operative sentence is "a stall never counts toward the 3-attempt budget and never
//   re-transmits", and the budget lives in `03-F4`'s spooler — a SQLite table and a state machine
//   that no task in this brief builds. K-3 asserts the classification the budget consumes
//   (`stalled` ≠ `failed`, and a stalled outcome carries no retry accounting) and the virtual
//   printer asserts the observable consequence (a stall then a reload prints EXACTLY ONE
//   document). Neither is the budget. Whoever builds the spooler owes: three attempts and no more
//   on a `failed`; ZERO attempts consumed across any number of `stalled` outcomes; and the
//   `queued → transmitting → stalled? → printed | failed` transitions persisted before the first
//   transmit (`03-F4`), because the double-print appears after a crash too.
// * **THE 4-QUERY CAP HAS NO OBSERVED CALLER.** The window above is tested as a state machine and
//   nothing in K-3 sends a real-time query through it — the virtual printer answers `status()`
//   directly. This is round 2's pattern 4 ("correct in isolation, unconnected in fact") and it is
//   named here rather than left to be discovered: the first REAL transport (TCP 9100 is the one
//   `18 §10` says is pure TS and all-platform) must be tested against the window, or the cap is a
//   number in a file.
// * **`GS r` IS NOT MODELLED AS A DEVICE BEHAVIOUR.** `03-F40`'s physical claim — the paper-end
//   sensor takes the printer offline and it then "does not execute `GS r` at all" — is a fact
//   about firmware. Nothing in K-3 sends `GS r`, so there is nothing to model; if a later health
//   check ever does, the virtual printer must model the SILENCE, or that check will look correct
//   in tests and report "paper present" forever in the kitchen.
// * **`03-F10`'s RIG STEP IS OWED IN FULL AND NOTHING HERE SUBSTITUTES FOR IT.** "Pull the roll
//   mid-job and assert the spooler reports `stalled` via `DLE EOT 4`, then assert reloading prints
//   the job EXACTLY ONCE" is a hardware procedure, and no printer exists yet. The virtual-printer
//   suite runs the software shape of it. A software model of a stall proves the code's arithmetic,
//   never the firmware's behaviour, and the two have already disagreed once in this FR's own
//   history (that is what `GS r` is).
// * **PAPER-OUT ARRIVING MID-DOCUMENT.** `03-F42` makes a document one transmitted unit, so the
//   software model has no state between "sent" and "not sent". A roll that runs out halfway
//   through the ribbon of bytes is `03-F10`'s rig step and belongs to the physical pass.
// * **COVER-OPEN AND THE OTHER SENSORS.** `03-F40` mentions the TM-T88VII "lists paper-end +
//   cover-open only" in passing. Cover-open has no FR of its own and no stated behaviour; nothing
//   here decodes it. `DLE EOT` has three other `n` values and none of them is specified in this
//   corpus.
// * **THE TRANSPORT MATRIX.** `18 §10` names TCP 9100, USB/serial (`serialport`/`usb`) and
//   Bluetooth SPP/BLE (`ble-plx`). K-3 defines the seam they implement and builds none of them;
//   `03-F10`'s "9100 and Bluetooth reconnect" step is theirs. No assertion here has opened a
//   socket.
// * **"DIRECT TRANSPORT WRITES FROM APP CODE ARE BANNED" (`18 §10`) IS NOT ENFORCED BY ANY TEST.**
//   It is a discipline scan over app code, and today there is no spooler, no transport
//   implementation outside `packages/testing`, and no app that prints — so the scan would find
//   nothing, report green, and mean nothing (round 2's A13 exactly). It belongs with the spooler,
//   where the rule first has something to be true about.
// * **THE S1 BAND** (`27-F11d`) stays a `packages/ui` surface, as K-1 and K-2 both recorded. K-3
//   classifies; it does not alert. `03-F5`'s "loud alert within 45 s of confirm" is the spooler's
//   and the UI's.
