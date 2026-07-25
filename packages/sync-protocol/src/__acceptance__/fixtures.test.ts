// Acceptance tests — T-01-02 golden fixtures (20 §2.7).
//
// The JSON files in ./fixtures/ are the COMMITTED WIRE CONTRACT, consumed by both
// client and gateway suites so the protocol cannot drift silently. Changing any
// fixture's semantics is a wire-contract change: it requires a spec review of
// specs/01-kernel-sync.md §8 / PROTOCOL.md (20 §2.7) — never regenerate casually.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEVICE_CLASSES } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { decodeMessage, encodeMessage } from "../index.js";

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
    const [pushedEvent] = push.events;
    expect(pushedEvent).toBeDefined();
    if (pushedEvent === undefined) throw new Error("unreachable: length asserted above");
    expect(push.watermark).toBe(pushedEvent.lamport_seq);
  });

  it("01-F43/01-F44 (T-01-17 re-pin): every fixture envelope carries the time layer — integer branch_created_at + a closed time_basis marker", () => {
    // The wire contract now carries branch-consensus time (01-F43) and the
    // provisional marker (01-F44) alongside the RAW device clock (01-F45, kept for
    // 01-N2 skew forensics). The golden set pins BOTH marker values: push.json is a
    // device-local append that has had no hub contact (branch_provisional,
    // server_received_at null); the merged streams carry branch.
    const envelopesOf = (kind: string): Array<Record<string, unknown>> => {
      const decoded = decodeMessage(fixtureText(kind)) as {
        events?: Array<Record<string, unknown>>;
      };
      return decoded.events ?? [];
    };
    const seenBases = new Set<unknown>();
    for (const kind of ["push", "event_batch", "catchup_response"]) {
      const events = envelopesOf(kind);
      expect(events.length, kind).toBeGreaterThan(0);
      for (const event of events) {
        expect(Number.isInteger(event.branch_created_at), `${kind}.branch_created_at`).toBe(true);
        expect(Number.isInteger(event.device_created_at), `${kind}.device_created_at`).toBe(true);
        expect(["branch", "branch_provisional"], `${kind}.time_basis`).toContain(event.time_basis);
        seenBases.add(event.time_basis);
      }
    }
    expect([...seenBases].sort()).toEqual(["branch", "branch_provisional"]);
    const [pushed] = envelopesOf("push");
    expect(pushed?.time_basis).toBe("branch_provisional"); // never yet seen by the cloud
    expect(pushed?.server_received_at).toBeNull();
  });

  it("01-F3/01-F9: the event_batch fixture carries a cloud-assigned non-negative integer global_seq", () => {
    const batch = decodeMessage(fixtureText("event_batch")) as {
      events: Array<{ global_seq?: number; server_received_at: number | null }>;
    };
    const [batchEvent] = batch.events;
    expect(batchEvent).toBeDefined();
    if (batchEvent === undefined) throw new Error("unreachable: asserted defined above");
    expect(Number.isInteger(batchEvent.global_seq)).toBe(true);
    expect(batchEvent.global_seq).toBeGreaterThanOrEqual(0);
    expect(batchEvent.server_received_at).not.toBeNull(); // cloud-merged before global_seq exists
  });
});
