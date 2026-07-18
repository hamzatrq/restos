// @restos/domain — the single source of platform schemas (18 §2: sacred).
// Owning specs: 01 §3–§4, 00 §6. Implemented against the T-01-01 acceptance
// contract (plans/wave-0/kernel-tasks.md).

export { DEVICE_CLASSES, type DeviceClass, HUB_ELIGIBLE_CLASSES } from "./device-classes.js";
export { EventEnvelope, type EventEnvelopeT, parseEnvelope } from "./envelope.js";
export { newId } from "./ids.js";
export {
  addPaisa,
  type Milligrams,
  type Millilitres,
  mg,
  ml,
  type Paisa,
  paisa,
  subPaisa,
  sumPaisa,
  type Units,
  units,
} from "./money.js";
export {
  eventRegistry,
  type KnownEventType,
  type ParsedEvent,
  parseEvent,
  UnknownEventTypeError,
} from "./registry.js";
export {
  applyLineState,
  type LineStateResult,
  ORDER_LINE_STATES,
  type OrderLineState,
  TERMINAL_LINE_STATES,
} from "./states.js";
