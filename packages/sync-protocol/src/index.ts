// @restos/sync-protocol — wire types shared by sync-client and sync-gateway
// (PROTECTED PATH, 20 §4.4). Owning spec: 01 §8; design: PROTOCOL.md.
export {
  decodeMessage,
  encodeMessage,
  MESSAGE_KINDS,
  type MessageKind,
  messageSchemas,
  PROTOCOL_VERSION,
  type ProtocolMessage,
  parseMessage,
  UnknownMessageKindError,
  WireEnvelope,
} from "./messages.js";
export type {
  Clock,
  MeshTransport,
  PeerInfo,
  TimerId,
  TransportHandlers,
} from "./transport.js";
