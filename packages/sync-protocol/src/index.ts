// @restos/sync-protocol — wire types shared by sync-client and sync-gateway
// (PROTECTED PATH, 20 §4.4). Owning spec: 01 §8; design: PROTOCOL.md.
//
// This root entry is the NODE door and its export list is unchanged: the zstd framing moved from
// `messages.ts` into `compression.ts` (which owns the `node:zlib` import) and is re-exported here
// under exactly the same names, so every existing consumer is unaffected. The portable half is
// also published on its own as `@restos/sync-protocol/messages` — see that file's header for why
// a `node:` import at the top of the message parser made the kernel unbundlable for RN.
export { createFrameCodec, decodeCompressed, encodeCompressed } from "./compression.js";
export {
  CatalogEntryWire,
  type CatalogEntryWireT,
  type Compression,
  decodeMessage,
  encodeMessage,
  type FrameCodec,
  MESSAGE_KINDS,
  type MessageKind,
  messageSchemas,
  negotiateCompression,
  PROTOCOL_VERSION,
  type ProtocolMessage,
  parseMessage,
  // `01-F75` — the `staff` row schema, exported for the same reason `CatalogEntryWire` is: a
  // resource whose row is loose at the WRITER is a resource whose bad row is discovered on a till.
  StaffEntryWire,
  type StaffEntryWireT,
  UnknownMessageKindError,
  WireEnvelope,
} from "./messages.js";
export type {
  Clock,
  CloudTransport,
  CloudTransportHandlers,
  MeshTransport,
  PeerInfo,
  TimerId,
  TransportHandlers,
} from "./transport.js";
