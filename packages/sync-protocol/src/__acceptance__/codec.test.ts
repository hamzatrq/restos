// Acceptance tests — T-01-02 codec law (kernel-tasks contract, 20 §2.3):
// decodeMessage(encodeMessage(m)) deep-equals m for every valid message.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseMessage, encodeMessage, decodeMessage } from "../index.js";
import { builders } from "./builders.js";

describe("codec round-trip (20 §2.3)", () => {
  it("PROTOCOL.md: encodeMessage produces a JSON string and decode(encode(m)) is identity for every kind", () => {
    for (const build of Object.values(builders)) {
      const m = parseMessage(build());
      const text = encodeMessage(m);
      expect(typeof text).toBe("string");
      expect(decodeMessage(text)).toEqual(m);
    }
  });

  it("PROTOCOL.md law (fast-check): decodeMessage(encodeMessage(m)) deep-equals m for arbitrary ping/push_ack/catchup_request", () => {
    const seq = fc.nat({ max: Number.MAX_SAFE_INTEGER });
    const arbitraryMessage = fc.oneof(
      seq.map((t) => ({ v: 1, kind: "ping", t })),
      seq.map((acked_watermark) => ({ v: 1, kind: "push_ack", acked_watermark })),
      seq.map((from_global_seq) => ({ v: 1, kind: "catchup_request", from_global_seq })),
    );
    fc.assert(
      fc.property(arbitraryMessage, (raw) => {
        const m = parseMessage(raw);
        expect(decodeMessage(encodeMessage(m))).toEqual(m);
      }),
    );
  });

  it("PROTOCOL.md: decodeMessage rejects non-JSON text", () => {
    const anchor = parseMessage(builders.ping());
    expect(decodeMessage(encodeMessage(anchor))).toEqual(anchor); // anchor: decode works on valid wire text
    expect(() => decodeMessage("{not json")).toThrow();
    expect(() => decodeMessage("")).toThrow();
  });

  it("PROTOCOL.md: decodeMessage rejects JSON non-objects and kindless JSON values", () => {
    const anchor = parseMessage(builders.ping());
    expect(decodeMessage(encodeMessage(anchor))).toEqual(anchor); // anchor: decode works on valid wire text
    expect(() => decodeMessage("42")).toThrow();
    expect(() => decodeMessage('"push"')).toThrow();
    expect(() => decodeMessage("null")).toThrow();
    expect(() => decodeMessage("true")).toThrow();
    expect(() => decodeMessage("[1,2]")).toThrow();
  });
});
