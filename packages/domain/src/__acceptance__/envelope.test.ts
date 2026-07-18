// Acceptance tests — T-01-01 (authored from spec text only; see plans/wave-0/kernel-tasks.md).
// Envelope shape per 00 §6; ordering fields (lamport_seq, server_received_at) per 01-F3.
import { describe, it, expect } from "vitest";
import { newId, parseEnvelope } from "../index.js";

const validEnvelope = () => ({
  id: newId(),
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
  actor_user_id: newId(),
  lamport_seq: 7,
  device_created_at: 1752800000000,
  server_received_at: null,
  type: "order.created",
  schema_version: 1,
  payload: { order_id: newId() },
  refs: [] as string[],
});

describe("event envelope (01-F3, 00 §6)", () => {
  it("01-F3/00 §6: accepts a valid envelope and preserves every field", () => {
    const input = validEnvelope();
    expect(parseEnvelope(input)).toEqual(input);
  });

  it("00 §6: actor_user_id may be null (device-only events)", () => {
    expect(parseEnvelope({ ...validEnvelope(), actor_user_id: null }).actor_user_id).toBeNull();
  });

  it("01-F3: server_received_at is null before cloud merge and an integer after", () => {
    expect(parseEnvelope({ ...validEnvelope(), server_received_at: null }).server_received_at).toBeNull();
    const merged = { ...validEnvelope(), server_received_at: 1752800001234 };
    expect(parseEnvelope(merged).server_received_at).toBe(merged.server_received_at);
  });

  it("01-F3: rejects a missing lamport_seq", () => {
    const { lamport_seq: _drop, ...missing } = validEnvelope();
    expect(() => parseEnvelope(missing)).toThrow();
  });

  it("01-F3: accepts lamport_seq 0 but rejects a negative lamport_seq", () => {
    expect(parseEnvelope({ ...validEnvelope(), lamport_seq: 0 }).lamport_seq).toBe(0);
    expect(() => parseEnvelope({ ...validEnvelope(), lamport_seq: -1 })).toThrow();
  });

  it("01-F3: rejects non-integer sequence and timestamp fields", () => {
    const base = validEnvelope();
    expect(parseEnvelope(base).lamport_seq).toBe(base.lamport_seq); // anchors the rejections below
    expect(() => parseEnvelope({ ...validEnvelope(), lamport_seq: 1.5 })).toThrow();
    expect(() => parseEnvelope({ ...validEnvelope(), device_created_at: 1752800000000.5 })).toThrow();
    expect(() => parseEnvelope({ ...validEnvelope(), server_received_at: 1752800000000.5 })).toThrow();
  });

  it("00 §6: rejects a missing schema_version and a schema_version below 1", () => {
    const { schema_version: _drop, ...missing } = validEnvelope();
    expect(() => parseEnvelope(missing)).toThrow();
    expect(() => parseEnvelope({ ...validEnvelope(), schema_version: 0 })).toThrow();
  });
});
