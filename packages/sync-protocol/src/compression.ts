// The zstd half of the wire framing (T-01-16, T-01-19, DEC-SYNC-010). ⚠ PROTECTED PATH
// (`20 §4.4`, commandment 10) — SENIOR REVIEW.
//
// ── WHY THIS IS ITS OWN MODULE, August 2026 ────────────────────────────────────────────────────
//
// It is a MOVE out of `messages.ts` and not a rewrite: every function below is byte-identical to
// what lived there, `index.ts` re-exports the same names from the same package root, and no
// consumer's import changed. What moved is the `node:zlib` import, and that is the whole point.
//
// `node:zlib` at the top of `messages.ts` made `@restos/sync-protocol` unbundlable for React
// Native — Metro cannot resolve a `node:` specifier, so a phone could not even reach the message
// PARSER, let alone a socket. `18 §4` puts RN on `@op-engineering/op-sqlite` and `18 §8` requires
// the manager app to stay installable; a kernel package only Node can load contradicts both.
// `messages.ts` is now portable and is published as `@restos/sync-protocol/messages`, the same
// mechanism (and the same reason) as `@restos/sync-client/fold-engine`.
//
// The device end of that subpath negotiates PLAIN framing: `createRnCloudTransport` never
// advertises `accepts_compression`, so `negotiateCompression` yields `undefined` on both sides and
// this module is never needed there. That is the anti-stranding property `negotiateCompression`
// already documents, not a new rule — a peer that declines compression is a supported peer.
import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import {
  type Compression,
  decodeMessage,
  encodeMessage,
  type FrameCodec,
  type ProtocolMessage,
} from "./messages.js";

// Additive compressed framing under v:1 (T-01-16; 01 §5 "JSON + zstd batch
// compression", 26 §6.4 — the catch-up transfer is part of the <60 s/4G budget,
// not an optimisation; DEC-SYNC-010 candidate, PROTOCOL.md compressed-framing
// clause). zstd of the EXACT plain-codec bytes, so the compressed path is
// transparent to every consumer: decodeCompressed(encodeCompressed(m)) deep-equals
// m for every valid message, and the plain JSON codec is UNTOUCHED (the
// T-01-02 golden fixtures must not drift). zstd is Node's built-in (node:zlib,
// synchronous; 18 §14 records the choice — 18 §15 rule 1 bias: no new dependency).
//
// Close-now follow-up #4 (audit-1): the frame carries a zstd CONTENT CHECKSUM
// (ZSTD_c_checksumFlag, +4 bytes). A plain zstd frame has no integrity check, so
// a single-byte-corrupted frame could decompress to a schema-valid but WRONG
// ProtocolMessage that decodeCompressed then returned as real — a silent
// mis-parse the merge engine would trust. With the checksum, decompression of a
// corrupted frame FAILS (checksum mismatch → throw), making corruption LOUD, not
// silent. Additive: the decoder auto-detects the flag from the frame header, the
// round-trip law holds, and the plain JSON codec is untouched.
export const encodeCompressed = (message: ProtocolMessage): Uint8Array =>
  zstdCompressSync(Buffer.from(encodeMessage(message), "utf8"), {
    params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 },
  });

export const decodeCompressed = (bytes: Uint8Array): ProtocolMessage =>
  decodeMessage(zstdDecompressSync(bytes).toString("utf8"));

/**
 * The handshake pair is ALWAYS sent plain, even once a codec is granted. `hello` is
 * what establishes what this peer can read, and `hello_ack` crosses the wire while
 * the client's decoder is still plain — compressing either would require the receiver
 * to already know the answer the message itself carries.
 */
const ALWAYS_PLAIN: ReadonlySet<string> = new Set(["hello", "hello_ack"]);

export const createFrameCodec = (compression: Compression | undefined): FrameCodec => ({
  encode: (message) =>
    compression === undefined || ALWAYS_PLAIN.has(message.kind)
      ? encodeMessage(message)
      : encodeCompressed(message),
  decode: (frame) => {
    if (typeof frame === "string") return decodeMessage(frame);
    if (compression === undefined) {
      throw new Error(
        "received a binary frame on a connection that did not negotiate compression " +
          "(DEC-SYNC-010 — framing comes from the handshake, never from sniffing the frame)",
      );
    }
    return decodeCompressed(frame);
  },
});
