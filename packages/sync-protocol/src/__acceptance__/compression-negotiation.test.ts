// Acceptance tests — T-01-19: wire live compressed framing (DEC-SYNC-010).
//
// SPEC SOURCE (24 §3 step 2 — authored from spec text, implementation not seen):
//   • specs/DECISIONS.md DEC-SYNC-010 (**accepted**): "compression is negotiated per
//     connection at `hello`/`hello_ack`, opt-in from both ends, and applies to the
//     catch-up path where the 26 §6.4 transfer budget lives; a peer that does not
//     advertise it receives plain JSON forever, so the negotiation can never strand
//     an older device."
//   • PROTOCOL.md compressed-framing clause: the compressed pair is `zstd(utf8(JSON))`,
//     TRANSPARENT (deep-equal to the plain codec for every kind), carrying a
//     `ZSTD_c_checksumFlag` content checksum so a corrupted frame fails LOUDLY instead
//     of decompressing into a schema-valid but WRONG message. "Which framing a
//     connection uses is negotiated per-connection at the transport layer" — the hole
//     T-01-19 fills.
//   • plans/wave-0/t-01-19-compression-wiring.md — the four traps: no magic-number
//     sniffing, nothing compressed before the ack, checksum stays on, fixtures stay plain.
//
// ── ORACLE-PROPOSED SURFACE (binding for the implementing session; the negotiation
//    fields come straight from the ratified decision, the codec seam is named here
//    because both the client transport and the gateway socket adapter must select the
//    SAME per-connection codec). ADDITIVE under `v: 1` — the precedent is
//    `relay_authorized` / `renewed_token` (DEC-SYNC-009 / DEC-AUTH-001): optional
//    fields, no version bump, old-shaped messages keep parsing.
//
//      messageSchemas.hello     gains  accepts_compression?: boolean
//      messageSchemas.hello_ack gains  compression?: "zstd"
//
//      negotiateCompression(hello: { accepts_compression?: boolean }, self_accepts: boolean)
//        => "zstd" | undefined        // granted IFF both ends opted in
//
//      createFrameCodec(compression: "zstd" | undefined) => {
//        encode(m: ProtocolMessage): string | Uint8Array;  // string = plain text frame
//        decode(frame: string | Uint8Array): ProtocolMessage;
//      }
//
//    The codec is held ONCE PER CONNECTION (built from the negotiated value at
//    hello/hello_ack time, discarded when the socket closes). `string` vs `Uint8Array`
//    is the text-frame/binary-frame distinction the WebSocket layer already carries
//    (`ws` reports it as `isBinary`) — so nothing ever has to sniff a magic number.
//
// RED-AWAITING-IMPLEMENTATION: the schema fields are stripped today (zod strips unknown
// keys) and neither function exists — each test either asserts the stripped field or
// guards on the missing function with a self-documenting NOT IMPLEMENTED reason.

import { describe, expect, it } from "vitest";
import type { ProtocolMessage } from "../index.js";
import * as protocol from "../index.js";
import { builders, envelope } from "./builders.js";

const { MESSAGE_KINDS, decodeMessage, encodeMessage, parseMessage } = protocol;

// ── the not-yet-built negotiation surface ────────────────────────────────────
type FrameCodec = {
  encode: (m: ProtocolMessage) => string | Uint8Array;
  decode: (frame: string | Uint8Array) => ProtocolMessage;
};
type NegotiationSurface = {
  // The implementing signature is `(hello: { accepts_compression?: boolean }, self_accepts:
  // boolean)`; the probe types the first parameter loosely so a whole builder-shaped hello
  // can be passed without TS's weak-type check rejecting it. Behavior, not typing, is pinned.
  negotiateCompression?: (
    hello: Record<string, unknown>,
    self_accepts: boolean,
  ) => "zstd" | undefined;
  createFrameCodec?: (compression: "zstd" | undefined) => FrameCodec;
};

const surface = (): Required<NegotiationSurface> => {
  const p = protocol as typeof protocol & NegotiationSurface;
  if (typeof p.negotiateCompression !== "function" || typeof p.createFrameCodec !== "function") {
    throw new Error(
      "T-01-19 NOT IMPLEMENTED: sync-protocol.negotiateCompression / createFrameCodec — " +
        "the per-connection compression negotiation + codec seam ratified by DEC-SYNC-010 " +
        "(hello.accepts_compression ∧ hello_ack.compression). RED until T-01-19 lands.",
    );
  }
  return p as Required<NegotiationSurface>;
};

/** Every PROTOCOL.md kind, parsed from its minimal builder. */
const everyKind = (): ProtocolMessage[] => MESSAGE_KINDS.map((k) => parseMessage(builders[k]()));

/** A realistic catch-up page — where the 26 §6.4 transfer budget actually lives. */
const catchupPage = (n: number): ProtocolMessage =>
  parseMessage({
    v: 1,
    kind: "catchup_response",
    events: Array.from({ length: n }, (_unused, i) => ({
      ...envelope(),
      lamport_seq: i,
      global_seq: i + 1,
    })),
    complete: false,
    next_from: n,
  });

const asRecord = (m: ProtocolMessage): Record<string, unknown> =>
  m as unknown as Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
describe("DEC-SYNC-010: the negotiation fields are ADDITIVE under v: 1", () => {
  it("DEC-SYNC-010: an OLD-shaped hello (no accepts_compression) still parses, deep-equal and unchanged — the un-updated device is never rejected", () => {
    const old = builders.hello();
    expect(parseMessage(old)).toEqual(old);
    expect(asRecord(parseMessage(old)).v).toBe(1); // no version bump
  });

  it("DEC-SYNC-010: an OLD-shaped hello_ack (no compression) still parses, deep-equal and unchanged — a device on an old gateway is never rejected", () => {
    const old = builders.hello_ack();
    expect(parseMessage(old)).toEqual(old);
    expect(asRecord(parseMessage(old)).v).toBe(1);
  });

  it("DEC-SYNC-010: hello.accepts_compression is CARRIED, not stripped — the advertisement is the client's half of the opt-in", () => {
    const advertised = { ...builders.hello(), accepts_compression: true };
    expect(asRecord(parseMessage(advertised)).accepts_compression).toBe(true);
    // …and survives the plain codec, which is the frame the gateway actually reads.
    expect(
      asRecord(decodeMessage(encodeMessage(parseMessage(advertised)))).accepts_compression,
    ).toBe(true);
  });

  it("DEC-SYNC-010: hello.accepts_compression: false is carried as an explicit DECLINE (not silently upgraded)", () => {
    const declined = { ...builders.hello(), accepts_compression: false };
    expect(asRecord(parseMessage(declined)).accepts_compression).toBe(false);
  });

  it("DEC-SYNC-010: a non-boolean accepts_compression is REJECTED (the field is a capability flag, not free-form)", () => {
    expect(() => parseMessage({ ...builders.hello(), accepts_compression: "yes" })).toThrow();
    expect(() => parseMessage({ ...builders.hello(), accepts_compression: 1 })).toThrow();
  });

  it("DEC-SYNC-010: hello_ack.compression is CARRIED, not stripped — the ack IS the grant", () => {
    const granted = { ...builders.hello_ack(), compression: "zstd" };
    expect(asRecord(parseMessage(granted)).compression).toBe("zstd");
    expect(asRecord(decodeMessage(encodeMessage(parseMessage(granted)))).compression).toBe("zstd");
  });

  it('DEC-SYNC-010: hello_ack.compression is a CLOSED vocabulary — only "zstd" (01 §5 names zstd; anything else is an unimplementable grant)', () => {
    for (const bad of ["gzip", "deflate", "br", "none", "", true, 1]) {
      expect(() => parseMessage({ ...builders.hello_ack(), compression: bad })).toThrow();
    }
  });

  it("DEC-SYNC-010: the additive fields coexist with the other v:1 additive fields (relay_authorized / renewed_token) — same precedent, one message", () => {
    const ack = {
      ...builders.hello_ack(),
      relay_authorized: true,
      renewed_token: "tok-renewed",
      compression: "zstd",
    };
    const parsed = asRecord(parseMessage(ack));
    expect(parsed.relay_authorized).toBe(true);
    expect(parsed.renewed_token).toBe("tok-renewed");
    expect(parsed.compression).toBe("zstd");
  });

  it("20 §2.7: the COMMITTED golden hello/hello_ack fixtures stay plain and un-negotiated — compression must be transparent to the wire contract, not baked into it", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const read = (name: string): Record<string, unknown> =>
      JSON.parse(
        readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"),
      ) as Record<string, unknown>;
    const hello = read("hello");
    const ack = read("hello_ack");
    expect("accepts_compression" in hello).toBe(false);
    expect("compression" in ack).toBe(false);
    // They still decode — the additive fields did not disturb the baseline shape.
    expect(asRecord(parseMessage(hello)).kind).toBe("hello");
    expect(asRecord(parseMessage(ack)).kind).toBe("hello_ack");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("DEC-SYNC-010: the grant requires opt-in from BOTH ends", () => {
  it('DEC-SYNC-010: both ends opted in ⇒ granted "zstd"', () => {
    const { negotiateCompression } = surface();
    expect(negotiateCompression({ accepts_compression: true }, true)).toBe("zstd");
  });

  it("DEC-SYNC-010: the peer did not advertise (field ABSENT — the un-updated device) ⇒ NOT granted, whatever we support", () => {
    const { negotiateCompression } = surface();
    expect(negotiateCompression({}, true)).toBeUndefined();
    expect(negotiateCompression(builders.hello(), true)).toBeUndefined();
  });

  it("DEC-SYNC-010: the peer explicitly declined ⇒ NOT granted", () => {
    const { negotiateCompression } = surface();
    expect(negotiateCompression({ accepts_compression: false }, true)).toBeUndefined();
  });

  it("DEC-SYNC-010: WE do not accept compression ⇒ NOT granted, however loudly the peer advertises", () => {
    const { negotiateCompression } = surface();
    expect(negotiateCompression({ accepts_compression: true }, false)).toBeUndefined();
    expect(negotiateCompression({}, false)).toBeUndefined();
  });

  it("DEC-SYNC-010: an UNGRANTED ack carries no `compression` key on the wire at all — an old peer must see the exact bytes it saw before", () => {
    const { negotiateCompression } = surface();
    const granted = negotiateCompression(builders.hello(), true); // old client → undefined
    const ack = parseMessage({ ...builders.hello_ack(), compression: granted });
    expect(encodeMessage(ack)).not.toContain("compression");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("DEC-SYNC-010: absent means plain JSON, FOREVER (the anti-stranding property)", () => {
  it("DEC-SYNC-010: an un-negotiated connection emits, for EVERY kind, a plain text frame the OLD decoder (decodeMessage) parses deep-equal — a newly-deployed gateway can never send a frame an un-updated terminal cannot read", () => {
    const { createFrameCodec } = surface();
    const codec = createFrameCodec(undefined);
    for (const message of everyKind()) {
      const frame = codec.encode(message);
      expect(typeof frame).toBe("string"); // never a binary frame
      expect(decodeMessage(frame as string)).toEqual(message);
    }
  });

  it("DEC-SYNC-010: an un-negotiated connection round-trips every kind through its own codec (plain in, plain out)", () => {
    const { createFrameCodec } = surface();
    const codec = createFrameCodec(undefined);
    for (const message of everyKind()) {
      expect(codec.decode(codec.encode(message))).toEqual(message);
    }
  });

  it("DEC-SYNC-010 trap 1: an un-negotiated connection REJECTS a compressed frame even though it could decode one — support comes from the contract, never from sniffing the zstd magic number (a peer that decodes today may not after a rollback)", () => {
    const { createFrameCodec } = surface();
    const plain = createFrameCodec(undefined);
    const page = catchupPage(32);
    const compressed = protocol.encodeCompressed(page); // a perfectly valid zstd frame
    expect(() => plain.decode(compressed)).toThrow();
    // The connection is not poisoned by the rejected frame: plain framing still works.
    expect(plain.decode(plain.encode(page))).toEqual(page);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("DEC-SYNC-010: a granted connection compresses transparently", () => {
  it("DEC-SYNC-010/PROTOCOL.md: on a granted connection every non-handshake kind is carried as a BINARY frame that decodes deep-equal — negotiation does not change a single field", () => {
    const { createFrameCodec } = surface();
    const codec = createFrameCodec("zstd");
    for (const message of everyKind()) {
      if (asRecord(message).kind === "hello" || asRecord(message).kind === "hello_ack") continue;
      const frame = codec.encode(message);
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(codec.decode(frame)).toEqual(message);
      // …and identical to what the plain path yields: transparency (PROTOCOL.md).
      expect(codec.decode(frame)).toEqual(decodeMessage(encodeMessage(message)));
    }
  });

  it("DEC-SYNC-010 trap 2: `hello` and `hello_ack` are ALWAYS plain, even on a granted codec — the handshake is what establishes what the peer can read, so it cannot itself be compressed (the peer's decoder is still plain when they cross the wire)", () => {
    const { createFrameCodec } = surface();
    const codec = createFrameCodec("zstd");
    for (const kind of ["hello", "hello_ack"] as const) {
      const message = parseMessage(builders[kind]());
      const frame = codec.encode(message);
      expect(typeof frame).toBe("string");
      expect(decodeMessage(frame as string)).toEqual(message); // readable by a plain peer
    }
  });

  it("DEC-SYNC-010: a granted codec still DECODES a plain frame — the switch is not simultaneous at the two ends (the handshake pair is plain, and a frame sent before the ack landed is plain), so inbound tolerance is one-directional: plain never accepts compressed, granted always accepts plain", () => {
    const { createFrameCodec } = surface();
    const codec = createFrameCodec("zstd");
    for (const message of everyKind()) {
      expect(codec.decode(encodeMessage(message))).toEqual(message);
    }
  });

  it("26 §6.4: a realistic catch-up page is actually SMALLER on a granted connection — compression is part of the <60 s/4G transfer budget, not an optimisation", () => {
    const { createFrameCodec } = surface();
    const page = catchupPage(500);
    const frame = createFrameCodec("zstd").encode(page);
    expect(frame).toBeInstanceOf(Uint8Array);
    expect((frame as Uint8Array).byteLength).toBeLessThan(
      Buffer.byteLength(encodeMessage(page), "utf8"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("DEC-SYNC-010 trap 3: the negotiated path KEEPS the content checksum", () => {
  it("PROTOCOL.md/audit-1 #D: a frame emitted by the negotiated codec carries the zstd Content_Checksum flag (frame-header descriptor bit 0x04) — the only integrity check a zstd frame has", () => {
    const { createFrameCodec } = surface();
    const frame = createFrameCodec("zstd").encode(catchupPage(40));
    expect(frame).toBeInstanceOf(Uint8Array);
    const bytes = Buffer.from(frame as Uint8Array);
    expect(bytes.subarray(0, 4).toString("hex")).toBe("28b52ffd"); // zstd magic (LE)
    // Byte 4 is the Frame_Header_Descriptor; bit 2 (0x04) is Content_Checksum_flag.
    // A codec that re-compresses without ZSTD_c_checksumFlag clears it — and a
    // single-byte corruption then decompresses into a schema-valid but WRONG message.
    expect(bytes[4] === undefined ? 0 : bytes[4] & 0x04).not.toBe(0);
  });

  it("PROTOCOL.md/audit-1 #D: NO single-byte corruption of a negotiated frame ever decodes to a valid-WRONG message — corruption is LOUD (throws) or the exact original, never a different schema-valid message the merge engine would trust", () => {
    const { createFrameCodec } = surface();
    const codec = createFrameCodec("zstd");
    // Deterministic page (fixed ids) — the invariant must be reproducible.
    const page = parseMessage({
      v: 1,
      kind: "event_batch",
      events: Array.from({ length: 40 }, (_unused, i) => ({
        id: `id-${i}`,
        org_id: "org-x",
        branch_id: "br-x",
        device_id: "dev-x",
        actor_user_id: null,
        lamport_seq: i,
        device_created_at: 1_752_800_000_000,
        branch_created_at: 1_752_800_000_000,
        time_basis: "branch",
        server_received_at: null,
        type: "order.created",
        schema_version: 1,
        payload: { order_id: `ord-${i}` },
        refs: [],
        global_seq: i + 1,
      })),
    });
    const frame = Buffer.from(codec.encode(page) as Uint8Array);
    const canonical = JSON.stringify(page);
    const misparses: number[] = [];
    for (let pos = 0; pos < frame.length; pos++) {
      const corrupt = Buffer.from(frame);
      corrupt.writeUInt8(corrupt.readUInt8(pos) ^ 0xff, pos);
      let decoded: ProtocolMessage;
      try {
        decoded = codec.decode(corrupt);
      } catch {
        continue; // clean throw — the contract
      }
      if (JSON.stringify(decoded) !== canonical) misparses.push(pos);
    }
    expect(misparses).toEqual([]);
  });
});
