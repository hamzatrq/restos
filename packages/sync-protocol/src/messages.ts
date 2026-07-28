// Wire protocol v1 (PROTOCOL.md, 24-F8 artifact): one message set for LAN and
// cloud. Unknown keys are stripped (reject-or-drop, 01-F40 — slices are
// sender-enforced; a client can never smuggle one in). Contract fixtures:
// src/__acceptance__/fixtures (20 §2.7 — changing them is a spec-review event).
import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { DEVICE_CLASSES, EventEnvelope } from "@restos/domain";
import { z } from "zod";

export const PROTOCOL_VERSION = 1;

const v = z.literal(PROTOCOL_VERSION);
const seq = z.number().int().nonnegative();

/** Envelope as carried in merged streams — cloud may have stamped global_seq (01-F3). */
export const WireEnvelope = EventEnvelope.extend({ global_seq: seq.optional() });

export const messageSchemas = {
  hello: z.object({
    v,
    kind: z.literal("hello"),
    device_id: z.string().min(1),
    device_class: z.enum(DEVICE_CLASSES),
    branch_id: z.string().min(1),
    token: z.string().min(1),
    last_global_seq: seq,
    own_high_water: seq,
    // Additive under v:1 (DEC-SYNC-010, T-01-19): this peer can DECODE compressed
    // frames. Advertising is half the contract — the grant only holds if the server
    // also accepts (hello_ack.compression). Absent ⇒ plain JSON for this connection's
    // whole life, which is the property that stops a new gateway stranding an old device.
    accepts_compression: z.boolean().optional(),
  }),
  hello_ack: z.object({
    v,
    kind: z.literal("hello_ack"),
    session_id: z.string().min(1),
    hub: z.boolean(),
    resume_from: seq,
    // Additive under v:1 (DEC-SYNC-009, T-01-12): true iff the session's token
    // carries the hub-relay capability — the client-side gate for relaying.
    relay_authorized: z.boolean().optional(),
    // Additive under v:1 (DEC-AUTH-001, T-01-18): a silently re-issued device
    // token, present ONLY when one was actually minted (remaining life below the
    // configured threshold). Absent on an ordinary session, so healthy sessions —
    // and the committed golden transcript — stay byte-identical. Renewing on every
    // hello would destroy issuance determinism, which those fixtures depend on.
    renewed_token: z.string().min(1).optional(),
    // Additive under v:1 (DEC-SYNC-010, T-01-19). Granted IFF the client advertised
    // AND this server accepts — a closed vocabulary, so an unknown codec name is a
    // parse failure rather than a silent downgrade. Absent ⇒ plain, forever.
    compression: z.literal("zstd").optional(),
    /**
     * Additive under v:1 (T-C1, `01-F9` "plus org-scope reference data"). The ORG's current
     * authoritative catalog version.
     *
     * **This single field is what makes the catalog transport correct**, and the push below
     * is only latency. The device compares it against its own stored version and requests if
     * behind, so every reconnection reconciles — including for a device that has been offline
     * for a week and has no hope of replaying an announcement it was not connected for.
     * Absent ⇒ an older server that serves no catalog, and the device simply never asks.
     */
    catalog_version: seq.optional(),
  }),
  push: z.object({ v, kind: z.literal("push"), events: z.array(EventEnvelope), watermark: seq }),
  push_ack: z.object({
    v,
    kind: z.literal("push_ack"),
    acked_watermark: seq,
    // Additive under v:1 (DEC-SYNC-009, T-01-12): present iff the ack answers a
    // relay push — names the ORIGIN device whose stream acked_watermark
    // describes. Hub→origin over LAN, the same shape carries the relayed CLOUD
    // ack (origin_device_id = the receiving origin), the only LAN push_ack that
    // may move the cloud write-checkpoint (19 §5).
    origin_device_id: z.string().min(1).optional(),
    // Additive under v:1 (DEC-AUTH-001, T-01-18). Two carriers, one field:
    // (a) a DRAIN session's renewal — an expired-but-unrevoked device is admitted
    //     push-only (01-F47 "sole purpose"), so its renewal cannot ride hello_ack;
    //     it rides the ack of the push it was admitted to make.
    // (b) a hub-RELAYED origin's renewal — this ack already names its origin via
    //     origin_device_id, so the hub forwards it over LAN and a WAN-less device
    //     renews without ever holding WAN. That clause is what makes a 90-day TTL
    //     safe in a LAN-only deployment instead of bricking every waiter tablet.
    renewed_token: z.string().min(1).optional(),
  }),
  event_batch: z.object({ v, kind: z.literal("event_batch"), events: z.array(WireEnvelope) }),
  catchup_request: z.object({ v, kind: z.literal("catchup_request"), from_global_seq: seq }),
  catchup_response: z.object({
    v,
    kind: z.literal("catchup_response"),
    events: z.array(WireEnvelope),
    complete: z.boolean(),
    next_from: seq,
  }),
  /**
   * `T-C1` — the catalog fetch pair (`01-F9`, `01-F52`..`01-F56`).
   *
   * The device asks; the server decides snapshot vs delta from `have_version`. A delta if it
   * can construct one from that EXACT base, a snapshot otherwise — including `have_version: 0`
   * and including a base too old to reconstruct. The device's existing `needs_snapshot`
   * refusal (`01-F56`) is then the belt to that braces: it is what happens if the server gets
   * this wrong, and it is already implemented and tested.
   */
  catalog_request: z.object({
    v,
    kind: z.literal("catalog_request"),
    /** What the device has now. `0` means "nothing", and gets a snapshot. */
    have_version: seq,
    /** Paging cursor, echoed from a previous `catalog_response.next_from`. */
    from: seq.optional(),
  }),
  catalog_response: z.object({
    v,
    kind: z.literal("catalog_response"),
    form: z.enum(["snapshot", "delta"]),
    /** The version this payload brings the device TO. */
    version: seq,
    /** For a delta, the exact base it applies to. A device holding anything else refuses. */
    base_version: seq.optional(),
    entries: z.array(
      z.object({
        kind: z.string().min(1),
        id: z.string().min(1),
        name: z.string().min(1),
        /** 03-F38 — a short kitchen name, so long item names stop being a KOT layout problem. */
        kitchen_name: z.union([z.string().min(1), z.null()]).optional(),
        parent_id: z.union([z.string().min(1), z.null()]).optional(),
        sort: z.number().int().optional(),
        /**
         * `01-F55` — deletion is a TOMBSTONE. A reprint of an order placed before an item was
         * deleted must still render its name, so a delete travels as a marked entry rather
         * than as an absence. This is also why a snapshot carries its tombstones: the oracle
         * round found that clearing and re-inserting destroyed every one of them, and made
         * `01-F55` fail on its own named scenario after any recovery.
         */
        deleted: z.boolean().optional(),
      }),
    ),
    /**
     * Paging, in `catchup_response`'s vocabulary rather than a second idiom. A large org's
     * catalog will exceed one frame. **A snapshot must apply ATOMICALLY** — the device must
     * never hold half a menu — so paged snapshot chunks accumulate and commit on `complete`.
     */
    complete: z.boolean(),
    next_from: seq,
  }),
  /**
   * `T-C1` — server→device, org-scoped, carrying ONLY a version number.
   *
   * Covers a version changing DURING a live session, so a menu edit does not wait for the
   * next reconnect. It is a freshness optimisation and **the system is correct without it**,
   * which is the property that matters: a notice is exactly the kind of message that gets
   * dropped on a lossy link, and `hello_ack.catalog_version` is what makes that cost freshness
   * rather than correctness.
   */
  catalog_notice: z.object({
    v,
    kind: z.literal("catalog_notice"),
    version: seq,
  }),
  quarantine_notice: z.object({
    v,
    kind: z.literal("quarantine_notice"),
    event_id: z.string().min(1),
    reason: z.string().min(1),
  }),
  purge_command: z.object({ v, kind: z.literal("purge_command"), scope: z.literal("all") }),
  // `ping.t` is the sender's clock at send. Since the HUB heartbeats its followers
  // (01-F13), a follower's inbound ping already carries branch time — which is what
  // makes the 01-F43 offset acquisition need no protocol change at all.
  ping: z.object({ v, kind: z.literal("ping"), t: z.number().int() }),
  pong: z.object({ v, kind: z.literal("pong"), t: z.number().int() }),
} as const;

export const MESSAGE_KINDS = Object.keys(
  messageSchemas,
) as readonly (keyof typeof messageSchemas)[];
export type MessageKind = keyof typeof messageSchemas;

const union = z.discriminatedUnion("kind", [
  messageSchemas.hello,
  messageSchemas.hello_ack,
  messageSchemas.push,
  messageSchemas.push_ack,
  messageSchemas.event_batch,
  messageSchemas.catchup_request,
  messageSchemas.catchup_response,
  messageSchemas.catalog_request,
  messageSchemas.catalog_response,
  messageSchemas.catalog_notice,
  messageSchemas.quarantine_notice,
  messageSchemas.purge_command,
  messageSchemas.ping,
  messageSchemas.pong,
]);

export type ProtocolMessage = z.infer<typeof union>;

export class UnknownMessageKindError extends Error {
  constructor(kind: unknown) {
    super(`unknown protocol message kind: ${String(kind)} (PROTOCOL.md is the closed message set)`);
    this.name = "UnknownMessageKindError";
  }
}

export const parseMessage = (value: unknown): ProtocolMessage => {
  if (typeof value === "object" && value !== null && "kind" in value) {
    const kind = (value as { kind: unknown }).kind;
    if (typeof kind !== "string" || !(kind in messageSchemas))
      throw new UnknownMessageKindError(kind);
  }
  return union.parse(value);
};

export const encodeMessage = (message: ProtocolMessage): string => JSON.stringify(message);

export const decodeMessage = (text: string): ProtocolMessage => parseMessage(JSON.parse(text));

// Additive compressed framing under v:1 (T-01-16; 01 §5 "JSON + zstd batch
// compression", 26 §6.4 — the catch-up transfer is part of the <60 s/4G budget,
// not an optimisation; DEC-SYNC-010 candidate, PROTOCOL.md compressed-framing
// clause). zstd of the EXACT plain-codec bytes, so the compressed path is
// transparent to every consumer: decodeCompressed(encodeCompressed(m)) deep-equals
// m for every valid message, and the plain JSON codec above is UNTOUCHED (the
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

/** The negotiated framing for one connection; `undefined` = plain JSON (T-01-19). */
export type Compression = "zstd";

/**
 * Decide one connection's framing (DEC-SYNC-010, T-01-19). Both ends must opt in:
 * the peer advertises `accepts_compression` in its `hello`, and this end declares
 * whether it accepts. Either side declining yields plain JSON **for the life of the
 * connection** — that is the anti-stranding property, not a fallback. A newly
 * deployed gateway must never send frames an un-updated device cannot parse, which
 * in this product means a counter terminal that silently stops receiving orders.
 */
export const negotiateCompression = (
  // `| undefined` explicitly: the repo runs `exactOptionalPropertyTypes`, so a parsed
  // `hello` whose optional field is present-but-undefined is not assignable otherwise.
  hello: { accepts_compression?: boolean | undefined },
  selfAccepts: boolean,
): Compression | undefined =>
  hello.accepts_compression === true && selfAccepts ? "zstd" : undefined;

/**
 * A per-connection frame codec (T-01-19). `encode` returns a `string` for a plain
 * text frame and `Uint8Array` for a compressed binary one, so the TRANSPORT's own
 * text/binary distinction carries the framing — never the frame's contents.
 *
 * That typing is the anti-sniffing mechanism, and it is deliberate. Detecting the
 * zstd magic number would make the wire format depend on the message rather than on
 * the agreement, and a peer that can decode a compressed frame today may not after a
 * rollback. So an un-negotiated connection REFUSES a compressed frame even though it
 * could technically decode one.
 *
 * Decode tolerance is one-directional and also deliberate: a granted codec still
 * accepts plain frames, because the two ends do not switch in the same instant — the
 * `hello_ack` that grants compression is itself plain, and messages already in flight
 * behind it are too. A plain codec never accepts a compressed frame.
 */
export type FrameCodec = {
  encode(message: ProtocolMessage): string | Uint8Array;
  decode(frame: string | Uint8Array): ProtocolMessage;
};

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
