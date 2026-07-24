// Close-now follow-up #4 — decodeCompressed corruption-hardening
// (plans/wave-0/sec-review-followups.md "Close-now batch"; senior review audit-1).
//
// CONTEXT. T-01-16 added the additive zstd framing to messages.ts:
//   encodeCompressed(m): Uint8Array   // zstd(utf8(JSON))
//   decodeCompressed(b): ProtocolMessage    // parseMessage(JSON.parse(utf8(unzstd)))
// The round-trip law (decodeCompressed(encodeCompressed(m)) deep-equals m) is
// already pinned by transport-zstd-codec.test.ts. This suite pins the OTHER
// half of the contract, unasserted until now: a corrupt or hostile frame must
// FAIL CLEANLY — decodeCompressed THROWS, and NEVER silently mis-parses to a
// valid-but-WRONG ProtocolMessage (which the merge engine would ingest as real).
//
// STATUS (phase 1): the deterministic throw-cases are GREEN characterization.
// The single-byte corruption INVARIANT is RED — it reveals a real mis-parse: a
// plain zstd frame carries no integrity check, so a corrupted frame can decode
// to a schema-valid ProtocolMessage with WRONG content. The phase-2 fix is a
// corruption-detecting frame (zstd content checksum), which makes every
// corruption LOUD (checksum mismatch → throw) without touching the plain JSON
// codec, the round-trip law, or the size law.
//
// A note the harness itself proved: Node's zstdDecompressSync does NOT throw on
// a TRUNCATED frame — it silently returns partial (here, empty) output. Clean
// failure on truncation therefore rests on the JSON layer (partial/empty is
// never valid JSON, so JSON.parse throws). MID-STREAM corruption is what the
// content checksum is for.

import { zstdCompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ProtocolMessage } from "../index.js";
import { decodeCompressed, encodeCompressed, parseMessage } from "../index.js";

/** A DETERMINISTIC realistic catch-up page (fixed ids — the corruption invariant
 * must be reproducible; no newId() randomness). */
const fixedPage = (n: number): ProtocolMessage =>
  parseMessage({
    v: 1,
    kind: "event_batch",
    events: Array.from({ length: n }, (_unused, i) => ({
      id: `id-${i}`,
      org_id: "org-x",
      branch_id: "br-x",
      device_id: "dev-x",
      actor_user_id: null,
      lamport_seq: i,
      device_created_at: 1_752_800_000_000,
      server_received_at: null,
      type: "order.created",
      schema_version: 1,
      payload: { order_id: `ord-${i}` },
      refs: [],
      global_seq: i + 1,
    })),
  });

/** Test-side construction of a valid zstd frame around ARBITRARY bytes — mirrors
 * the codec's own compressor (messages.ts uses node:zlib zstd) so the frame is
 * genuinely valid zstd; only its DECOMPRESSED payload is hostile. */
const zstdOf = (bytes: string): Uint8Array => zstdCompressSync(Buffer.from(bytes, "utf8"));

describe("follow-up #4: decodeCompressed rejects corrupt frames (never mis-parses)", () => {
  it("control: a VALID compressed frame round-trips — the throws below are about corruption, not a broken codec", () => {
    const page = fixedPage(16);
    expect(decodeCompressed(encodeCompressed(page))).toEqual(page);
  });

  it("a TRUNCATED zstd frame THROWS cleanly — never a valid-wrong ProtocolMessage", () => {
    // zstd truncation is silent at the decompressor; the JSON layer catches the
    // partial/empty payload. Several truncation depths, each must throw.
    const frame = encodeCompressed(fixedPage(40));
    for (const drop of [1, 4, Math.floor(frame.length / 2), frame.length - 2]) {
      const truncated = frame.subarray(0, frame.length - drop);
      expect(() => decodeCompressed(truncated)).toThrow();
    }
  });

  it("GARBAGE bytes that are not a zstd frame at all THROW (unknown frame descriptor)", () => {
    expect(() =>
      decodeCompressed(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])),
    ).toThrow();
    expect(() => decodeCompressed(new Uint8Array(0))).toThrow(); // the empty frame
  });

  it("a VALID zstd frame whose payload is NOT JSON THROWS at the JSON layer (never mis-parses)", () => {
    expect(() => decodeCompressed(zstdOf("this is definitely not json at all"))).toThrow();
    expect(() => decodeCompressed(zstdOf("{unterminated"))).toThrow();
  });

  it("a VALID zstd frame of VALID JSON that is NOT a ProtocolMessage THROWS at parseMessage — the critical mis-parse guard", () => {
    // Decompresses fine, parses as JSON fine, but is a wrong-shaped or
    // unknown-kind object. It must be REJECTED, not returned as a live message.
    for (const wrong of [
      { hello: "world", v: 99 }, // no kind at all
      { v: 1, kind: "not_a_real_kind", stuff: 1 }, // unknown kind
      { v: 1, kind: "push" }, // known kind, missing required body (events/watermark)
      [1, 2, 3], // valid JSON, wrong top-level type
      42, // valid JSON scalar
    ]) {
      expect(() => decodeCompressed(zstdOf(JSON.stringify(wrong)))).toThrow();
    }
  });

  it("INVARIANT: no single-byte corruption of a valid frame ever decodes to a valid-WRONG ProtocolMessage — corruption is LOUD, never silent", () => {
    // The core safety property. Flip each byte of a valid frame in turn:
    // decodeCompressed must THROW, or (if it returns) return the ORIGINAL message.
    // It must NEVER return a different, schema-valid message — that is a silent
    // mis-parse the merge engine would trust as a real event.
    const page = fixedPage(40);
    const frame = Buffer.from(encodeCompressed(page));
    const canonical = JSON.stringify(page);
    const misparses: number[] = [];
    for (let pos = 0; pos < frame.length; pos++) {
      const corrupt = Buffer.from(frame);
      corrupt.writeUInt8(corrupt.readUInt8(pos) ^ 0xff, pos);
      let decoded: ProtocolMessage;
      try {
        decoded = decodeCompressed(corrupt);
      } catch {
        continue; // clean throw — the contract
      }
      // Returned WITHOUT throwing: it must be the original, never a wrong message.
      if (JSON.stringify(decoded) !== canonical) misparses.push(pos);
    }
    expect(misparses).toEqual([]); // any position here = a silent mis-parse (finding)
  });
});
