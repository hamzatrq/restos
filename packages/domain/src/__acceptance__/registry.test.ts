// Acceptance tests — T-01-01 (authored from spec text only; see plans/wave-0/kernel-tasks.md).
// Typed event registry per 01-F4; payment payload contracts per 01-F29 / 01-F31.
import { describe, it, expect } from "vitest";
import { newId, eventRegistry, parseEvent, UnknownEventTypeError } from "../index.js";

const envelope = (type: string, payload: unknown) => ({
  id: newId(),
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
  actor_user_id: newId(),
  lamport_seq: 1,
  device_created_at: 1752800000000,
  server_received_at: null,
  type,
  schema_version: 1,
  payload,
  refs: [] as string[],
});

const recordedPayload = () => ({
  order_id: newId(),
  amount_paisa: 45000,
  method: "cash",
  settlement_attempt_id: newId(),
});

const refundedPayload = () => ({
  payment_id: newId(),
  amount_paisa: 45000,
  method: "cash_out",
  reason: "customer returned item",
  actor_user_id: newId(),
  approved_by: newId(),
});

describe("typed event registry (01-F4)", () => {
  it("01-F4: the registry is seeded with the four kernel event types and rejects unknown names", () => {
    for (const type of [
      "order.created",
      "order.line_state_changed",
      "payment.recorded",
      "payment.refunded",
    ]) {
      expect(eventRegistry.has(type), `${type} must be registered`).toBe(true);
    }
    expect(eventRegistry.has("order.teleported")).toBe(false);
  });

  it("01-F4: parseEvent returns a typed event for a valid order.created envelope, preserving its payload", () => {
    const payload = { order_id: newId(), channel: "dine_in" };
    const event = parseEvent(envelope("order.created", payload));
    expect(event.type).toBe("order.created");
    expect(event.payload).toMatchObject(payload);
  });

  it("01-F4: an unknown event type throws UnknownEventTypeError, never silent acceptance", () => {
    expect(eventRegistry.has("order.teleported")).toBe(false); // anchors the throw below
    expect(() => parseEvent(envelope("order.teleported", {}))).toThrow(UnknownEventTypeError);
  });

  it("01-F4: a malformed payload for a known type is a parse failure, not silent acceptance", () => {
    // Anchor: the same known type parses when the payload is well-formed.
    expect(parseEvent(envelope("payment.recorded", recordedPayload())).type).toBe("payment.recorded");
    expect(() => parseEvent(envelope("order.line_state_changed", {}))).toThrow();
    expect(() =>
      parseEvent(envelope("payment.recorded", { ...recordedPayload(), amount_paisa: 450.5 })),
    ).toThrow();
  });
});

describe("payment payload contracts (01-F29, 01-F31)", () => {
  it("01-F31: payment.recorded parses with settlement_attempt_id and fails without it — double-taps cannot double-record", () => {
    const full = recordedPayload();
    expect(parseEvent(envelope("payment.recorded", full)).type).toBe("payment.recorded");
    const { settlement_attempt_id: _drop, ...missing } = full;
    expect(() => parseEvent(envelope("payment.recorded", missing))).toThrow();
  });

  it("01-F29: payment.refunded requires the reference to the original payment id", () => {
    const full = refundedPayload();
    expect(parseEvent(envelope("payment.refunded", full)).type).toBe("payment.refunded");
    const { payment_id: _drop, ...missing } = full;
    expect(() => parseEvent(envelope("payment.refunded", missing))).toThrow();
  });

  it("01-F29: payment.refunded accepts only cash_out | raast_reversal_ref | khata_credit methods", () => {
    for (const method of ["cash_out", "raast_reversal_ref", "khata_credit"]) {
      const event = parseEvent(envelope("payment.refunded", { ...refundedPayload(), method }));
      expect(event.type).toBe("payment.refunded");
    }
    expect(() =>
      parseEvent(envelope("payment.refunded", { ...refundedPayload(), method: "bank_transfer" })),
    ).toThrow();
  });
});
