// Acceptance tests — T-01-16 transport: zstd batch compression (COVER 3).
//
// ⚠ NO WRITTEN CONTRACT. plans/wave-0/kernel-tasks.md has no T-01-16 entry; it is
// the "future task" T-01-15 explicitly punted ("transport batching + zstd (future
// task; see 26 §6.4)", kernel-tasks.md:463). This suite is therefore authored from
// SPEC TEXT ONLY (24 §3 step 2):
//   • 26 §6.4 bottleneck 2: "zstd batch compression is specced but not implemented …
//     On 4G this is part of the 60 s, not an optimisation."
//   • 01 §5: "protobuf-free — JSON + zstd batch compression is sufficient at this
//     event volume and keeps debugging trivial."
//   • 00 §5: the <60 s-on-4G END-TO-END catch-up budget (network transfer included).
//
// ── ORACLE-PROPOSED SURFACE (binding for the implementing session; flagged for
//    ratification + a PROTOCOL.md spec-review in the oracle report — zstd IS a wire
//    framing change, SPEC-FIRST). ADDITIVE to the plain JSON codec (messages.ts):
//    the existing encodeMessage/decodeMessage stay byte-for-byte (T-01-02 golden
//    fixtures must NOT drift). The compressed pair is a NEW, separate framing:
//      encodeCompressed(m: ProtocolMessage): Uint8Array   // zstd(utf8(JSON))
//      decodeCompressed(b: Uint8Array): ProtocolMessage    // JSON.parse(utf8(unzstd))
//    Law (mirrors the T-01-02 codec law): decodeCompressed(encodeCompressed(m))
//    deep-equals m for every valid message — so compression is TRANSPARENT to every
//    consumer (the merge engine reuses the invariance idiom; folds are not re-pinned).
//
// RED-AWAITING-IMPLEMENTATION: the two functions do not exist yet — each test guards
// on their absence and fails with a self-documenting "NOT IMPLEMENTED" reason.

import { describe, expect, it } from "vitest";
import type { ProtocolMessage } from "../index.js";
import * as protocol from "../index.js";
import { envelope } from "./builders.js";

// The additive compressed-framing pair the transport task must add to sync-protocol.
type CompressionCodec = {
  encodeCompressed?: (m: ProtocolMessage) => Uint8Array;
  decodeCompressed?: (b: Uint8Array) => ProtocolMessage;
};

/** RED guard: resolves the not-yet-built pair, or throws the missing-feature reason. */
const compressionCodec = (): Required<CompressionCodec> => {
  const p = protocol as typeof protocol & CompressionCodec;
  if (typeof p.encodeCompressed !== "function" || typeof p.decodeCompressed !== "function") {
    throw new Error(
      "T-01-16 NOT IMPLEMENTED: sync-protocol.encodeCompressed / decodeCompressed — " +
        "the additive zstd batch-compression framing (01 §5, 26 §6.4). RED until the " +
        "transport task lands (SPEC-FIRST: PROTOCOL.md records the compressed framing).",
    );
  }
  return p as Required<CompressionCodec>;
};

const parse = (v: unknown): ProtocolMessage => protocol.parseMessage(v);

/** A realistic catch-up page: n merged wire events (event_batch — what gets compressed). */
const eventBatchPage = (n: number): ProtocolMessage =>
  parse({
    v: 1,
    kind: "event_batch",
    events: Array.from({ length: n }, (_unused, i) => ({
      ...envelope(),
      lamport_seq: i,
      global_seq: i + 1,
    })),
  });

const catchupResponsePage = (n: number, complete: boolean): ProtocolMessage =>
  parse({
    v: 1,
    kind: "catchup_response",
    events: Array.from({ length: n }, (_unused, i) => ({
      ...envelope(),
      lamport_seq: i,
      global_seq: i + 1,
    })),
    complete,
    next_from: n,
  });

describe("T-01-16 zstd batch compression round-trip (01 §5, 26 §6.4)", () => {
  it("01 §5: decodeCompressed(encodeCompressed(m)) deep-equals m for a realistic multi-event catch-up page", () => {
    const codec = compressionCodec();
    const page = eventBatchPage(200);
    const bytes = codec.encodeCompressed(page);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(codec.decodeCompressed(bytes)).toEqual(page); // identical event set, byte-for-byte
  });

  it("01 §5: a catchup_response page (the paged pull frame) round-trips identically, complete flag and cursor preserved", () => {
    const codec = compressionCodec();
    const page = catchupResponsePage(120, false);
    expect(codec.decodeCompressed(codec.encodeCompressed(page))).toEqual(page);
  });

  it("01 §5: an EMPTY page (0 events) and a 1-EVENT page both round-trip (the boundary sizes)", () => {
    const codec = compressionCodec();
    for (const page of [eventBatchPage(0), eventBatchPage(1), catchupResponsePage(0, true)]) {
      expect(codec.decodeCompressed(codec.encodeCompressed(page))).toEqual(page);
    }
  });

  it("01 §5: compression is TRANSPARENT — the compressed frame decodes to the same event set the plain codec produces (no re-pin of folds; the merge engine sees identical bytes)", () => {
    const codec = compressionCodec();
    const page = eventBatchPage(64);
    // The plain JSON path (unchanged, T-01-02) and the compressed path must yield the
    // SAME ProtocolMessage — the whole point of transparency (26 §6.4 acceptance table).
    const viaPlain = protocol.decodeMessage(protocol.encodeMessage(page));
    const viaCompressed = codec.decodeCompressed(codec.encodeCompressed(page));
    expect(viaCompressed).toEqual(viaPlain);
  });

  it("26 §6.4/00 §5: for a realistically-sized repetitive page the compressed frame is SMALLER than the raw JSON (compression actually happens — it is part of the 60 s, not a no-op)", () => {
    const codec = compressionCodec();
    const page = eventBatchPage(500); // a full CATCHUP_PAGE_SIZE page of similar orders
    const rawBytes = Buffer.byteLength(protocol.encodeMessage(page), "utf8");
    const compressedBytes = codec.encodeCompressed(page).byteLength;
    expect(compressedBytes).toBeLessThan(rawBytes);
  });

  it("01 §5: the plain JSON codec is UNTOUCHED by the additive compressed framing (T-01-02 golden-fixture contract must not drift)", () => {
    // Anchor: the plain path still works exactly as T-01-02 pinned it — the compressed
    // pair is additive, never a replacement (senior-review / spec-review note in report).
    const page = eventBatchPage(3);
    expect(protocol.decodeMessage(protocol.encodeMessage(page))).toEqual(page);
    expect(typeof protocol.encodeMessage(page)).toBe("string");
  });
});
