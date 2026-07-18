// Acceptance tests — T-01-02 golden fixtures (20 §2.7).
//
// The JSON files in ./fixtures/ are the COMMITTED WIRE CONTRACT, consumed by both
// client and gateway suites so the protocol cannot drift silently. Changing any
// fixture's semantics is a wire-contract change: it requires a spec review of
// specs/01-kernel-sync.md §8 / PROTOCOL.md (20 §2.7) — never regenerate casually.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { decodeMessage, encodeMessage } from "../index.js";
import { DEVICE_CLASSES } from "@restos/domain";

const fixtureText = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8");

const FIXTURE_KINDS = ["hello", "push", "event_batch", "quarantine_notice"] as const;

describe("golden fixtures (20 §2.7)", () => {
  it("20 §2.7: every fixture decodes, carries v: 1, and its kind matches its filename", () => {
    for (const kind of FIXTURE_KINDS) {
      const decoded = decodeMessage(fixtureText(kind)) as Record<string, unknown>;
      expect(decoded.kind).toBe(kind);
      expect(decoded.v).toBe(1);
    }
  });

  it("20 §2.7: re-encoding a decoded fixture and re-decoding THAT yields a deep-equal message (semantic stability)", () => {
    for (const kind of FIXTURE_KINDS) {
      const decoded = decodeMessage(fixtureText(kind));
      expect(decodeMessage(encodeMessage(decoded))).toEqual(decoded);
    }
  });

  it("01-F39: the hello fixture's device_class is a member of DEVICE_CLASSES", () => {
    const hello = decodeMessage(fixtureText("hello")) as { device_class: string };
    expect(DEVICE_CLASSES).toContain(hello.device_class);
  });

  it("01-F8: the push fixture's watermark equals its highest event lamport_seq (fixture self-consistency)", () => {
    const push = decodeMessage(fixtureText("push")) as {
      events: Array<{ lamport_seq: number }>;
      watermark: number;
    };
    expect(push.events).toHaveLength(1);
    expect(push.watermark).toBe(push.events[0].lamport_seq);
  });

  it("01-F3/01-F9: the event_batch fixture carries a cloud-assigned non-negative integer global_seq", () => {
    const batch = decodeMessage(fixtureText("event_batch")) as {
      events: Array<{ global_seq?: number; server_received_at: number | null }>;
    };
    expect(Number.isInteger(batch.events[0].global_seq)).toBe(true);
    expect(batch.events[0].global_seq).toBeGreaterThanOrEqual(0);
    expect(batch.events[0].server_received_at).not.toBeNull(); // cloud-merged before global_seq exists
  });
});
