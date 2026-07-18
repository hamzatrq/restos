// @restos/sync-protocol — wire types shared by sync-client and sync-gateway
// (PROTECTED PATH, 20 §4.4). Owning spec: 01 §8; design: PROTOCOL.md.
export {
  PROTOCOL_VERSION,
  MESSAGE_KINDS,
  type MessageKind,
  type ProtocolMessage,
  messageSchemas,
  WireEnvelope,
  parseMessage,
  encodeMessage,
  decodeMessage,
  UnknownMessageKindError,
} from "./messages.js";
