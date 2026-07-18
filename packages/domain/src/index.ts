// @restos/domain — the single source of platform schemas (18 §2: sacred).
// Owning specs: 01 §3–§4, 00 §6. Implemented against the T-01-01 acceptance
// contract (plans/wave-0/kernel-tasks.md).
export { newId } from "./ids.js";
export {
  type Paisa,
  type Milligrams,
  type Millilitres,
  type Units,
  paisa,
  mg,
  ml,
  units,
  addPaisa,
  subPaisa,
  sumPaisa,
} from "./money.js";
export { EventEnvelope, type EventEnvelopeT, parseEnvelope } from "./envelope.js";
export {
  ORDER_LINE_STATES,
  TERMINAL_LINE_STATES,
  type OrderLineState,
  type LineStateResult,
  applyLineState,
} from "./states.js";
export {
  eventRegistry,
  parseEvent,
  UnknownEventTypeError,
  type KnownEventType,
  type ParsedEvent,
} from "./registry.js";
export { DEVICE_CLASSES, HUB_ELIGIBLE_CLASSES, type DeviceClass } from "./device-classes.js";
