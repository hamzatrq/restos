// Acceptance tests — T-01-02 (authored from PROTOCOL.md + kernel-tasks contract only).
// Message vocabulary and per-kind body validation. FRs: 01-F8, 01-F9, 01-F37, 01-F39, 01-F40.

import { DEVICE_CLASSES } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { MESSAGE_KINDS, parseMessage, UnknownMessageKindError } from "../index.js";
import { builders, without } from "./builders.js";

const KINDS_PER_PROTOCOL_MD = [
  "hello",
  "hello_ack",
  "push",
  "push_ack",
  "event_batch",
  "catchup_request",
  "catchup_response",
  "quarantine_notice",
  "purge_command",
  "ping",
  "pong",
];

describe("wire message vocabulary (PROTOCOL.md)", () => {
  it("PROTOCOL.md: MESSAGE_KINDS is exactly the 11 kinds of the message table", () => {
    expect(MESSAGE_KINDS).toHaveLength(11);
    expect([...MESSAGE_KINDS].sort()).toEqual([...KINDS_PER_PROTOCOL_MD].sort());
  });

  it("PROTOCOL.md: parseMessage accepts a minimal valid instance of every kind and preserves it", () => {
    for (const kind of KINDS_PER_PROTOCOL_MD) {
      const m = builders[kind as keyof typeof builders]();
      expect(parseMessage(m)).toEqual(m);
    }
  });

  it("PROTOCOL.md: unknown kind throws UnknownMessageKindError (known kind anchors the harness)", () => {
    expect(parseMessage(builders.ping())).toEqual(expect.objectContaining({ kind: "ping" }));
    expect(() => parseMessage({ v: 1, kind: "teleport", t: 1 })).toThrow(UnknownMessageKindError);
  });

  it("PROTOCOL.md: v must be exactly 1 (v: 2, v: 0, and missing v all reject)", () => {
    expect(parseMessage(builders.ping())).toEqual(builders.ping()); // anchor: v: 1 is valid
    expect(() => parseMessage({ ...builders.ping(), v: 2 })).toThrow();
    expect(() => parseMessage({ ...builders.ping(), v: 0 })).toThrow();
    expect(() => parseMessage(without(builders.ping(), "v"))).toThrow();
  });

  it("PROTOCOL.md: each kind rejects a missing required body field (delta isolation: same message ± one field)", () => {
    const cases: Array<[keyof typeof builders, string]> = [
      ["hello", "device_class"],
      ["hello", "token"],
      ["hello_ack", "session_id"],
      ["push", "events"],
      ["push", "watermark"],
      ["push_ack", "acked_watermark"],
      ["event_batch", "events"],
      ["catchup_request", "from_global_seq"],
      ["catchup_response", "complete"],
      ["purge_command", "scope"],
      ["ping", "t"],
    ];
    for (const [kind, field] of cases) {
      const full = builders[kind]();
      expect(parseMessage(full)).toEqual(full); // anchor: full message is valid
      expect(() => parseMessage(without(full, field))).toThrow();
    }
  });
});

describe("hello — device classes and sender-enforced slices", () => {
  it("01-F39: hello.device_class accepts each of DEVICE_CLASSES and nothing else ('toaster' rejects)", () => {
    for (const device_class of DEVICE_CLASSES) {
      const m = { ...builders.hello(), device_class };
      expect(parseMessage(m)).toEqual(m);
    }
    expect(() => parseMessage({ ...builders.hello(), device_class: "toaster" })).toThrow();
  });

  it("01-F40: hello carries no slice — a client-declared slice field is rejected or dropped, never kept", () => {
    const clean = builders.hello();
    expect(parseMessage(clean)).toEqual(clean); // anchor: a slice-free hello is valid
    const smuggled = { ...clean, slice: { tables: ["T1"] } };
    let parsed: unknown;
    try {
      parsed = parseMessage(smuggled);
    } catch {
      return; // strict rejection satisfies 01-F40
    }
    expect(parsed).not.toHaveProperty("slice"); // stripping also satisfies it; keeping it never does
  });
});

describe("watermarks and range cursors (01-F8, 01-F9)", () => {
  it("01-F8: push.watermark is a non-negative integer — 0 accepted, negatives and fractions rejected", () => {
    const zero = { ...builders.push(), watermark: 0 };
    expect(parseMessage(zero)).toEqual(zero);
    expect(() => parseMessage({ ...builders.push(), watermark: -1 })).toThrow();
    expect(() => parseMessage({ ...builders.push(), watermark: 1.5 })).toThrow();
  });

  it("01-F8: push_ack.acked_watermark is a non-negative integer — 0 accepted, negatives and fractions rejected", () => {
    const zero = { ...builders.push_ack(), acked_watermark: 0 };
    expect(parseMessage(zero)).toEqual(zero);
    expect(() => parseMessage({ ...builders.push_ack(), acked_watermark: -1 })).toThrow();
    expect(() => parseMessage({ ...builders.push_ack(), acked_watermark: 1.5 })).toThrow();
  });

  it("01-F8: push.events must be valid domain EventEnvelopes (envelope minus lamport_seq rejects)", () => {
    const full = builders.push();
    expect(parseMessage(full)).toEqual(full); // anchor
    const [pushedEnvelope] = full.events;
    expect(pushedEnvelope).toBeDefined();
    if (pushedEnvelope === undefined) throw new Error("unreachable: builder pushes one envelope");
    const broken = { ...full, events: [without(pushedEnvelope, "lamport_seq")] };
    expect(() => parseMessage(broken)).toThrow();
  });

  it("01-F9: catchup_request.from_global_seq is a non-negative integer — 0 accepted, negatives/fractions/strings rejected", () => {
    const zero = { ...builders.catchup_request(), from_global_seq: 0 };
    expect(parseMessage(zero)).toEqual(zero);
    expect(() => parseMessage({ ...builders.catchup_request(), from_global_seq: -1 })).toThrow();
    expect(() => parseMessage({ ...builders.catchup_request(), from_global_seq: 2.5 })).toThrow();
    expect(() => parseMessage({ ...builders.catchup_request(), from_global_seq: "0" })).toThrow();
  });

  it("01-F3/PROTOCOL.md: event_batch events allow an optional non-negative integer global_seq", () => {
    const withSeq = builders.event_batch();
    expect(parseMessage(withSeq)).toEqual(withSeq);
    const [batchEvent] = withSeq.events;
    expect(batchEvent).toBeDefined();
    if (batchEvent === undefined) throw new Error("unreachable: builder batches one event");
    const withoutSeq = { ...withSeq, events: [without(batchEvent, "global_seq")] };
    expect(parseMessage(withoutSeq)).toEqual(withoutSeq); // pre-cloud-assignment is legal
    expect(() =>
      parseMessage({ ...withSeq, events: [{ ...batchEvent, global_seq: -1 }] }),
    ).toThrow();
    expect(() =>
      parseMessage({ ...withSeq, events: [{ ...batchEvent, global_seq: 1.5 }] }),
    ).toThrow();
  });
});

describe("quarantine (01-F37)", () => {
  it("01-F37: quarantine_notice requires both event_id and reason", () => {
    const full = builders.quarantine_notice();
    expect(parseMessage(full)).toEqual(full); // anchor
    expect(() => parseMessage(without(full, "event_id"))).toThrow();
    expect(() => parseMessage(without(full, "reason"))).toThrow();
  });
});
