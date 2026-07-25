// Acceptance tests — T-01-01 (authored from spec text only; see plans/wave-0/kernel-tasks.md).
// Envelope shape per 00 §6; ordering fields (lamport_seq, server_received_at) per 01-F3.
//
// T-01-17 (DEC-TIME-001, accepted) extends the envelope with the time layer:
// `branch_created_at` (01-F43 branch-consensus time, stamped by the originating
// device at append) and `time_basis` (01-F44 provisional marker). `device_created_at`
// STAYS and stays raw — 01-F45 demotes it to an untrusted forensic hint, and 01-N2's
// skew detection needs the untouched device clock to compare against hub/server time.
import { describe, expect, it } from "vitest";
import * as domain from "../index.js";
import { newId, parseEnvelope } from "../index.js";

/** T-01-17 oracle surface (24 §3 step 2): read through a typed view so the suite
 * compiles against the CONTRACT rather than the shipped module — a missing export
 * fails the red run at runtime, loudly, instead of blocking `pnpm typecheck`. */
const timeLayer = domain as unknown as { TIME_BASES?: readonly string[] };

/** The post-T-01-17 envelope shape this oracle pins (same reason as above). */
type TimedEnvelope = {
  device_created_at: number;
  branch_created_at: number;
  time_basis: string;
  server_received_at: number | null;
};

const timed = (value: unknown): TimedEnvelope => parseEnvelope(value) as unknown as TimedEnvelope;

const validEnvelope = () => ({
  id: newId(),
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
  actor_user_id: newId(),
  lamport_seq: 7,
  device_created_at: 1752800000000,
  branch_created_at: 1752800000000,
  time_basis: "branch",
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
    expect(
      parseEnvelope({ ...validEnvelope(), server_received_at: null }).server_received_at,
    ).toBeNull();
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
    expect(() =>
      parseEnvelope({ ...validEnvelope(), device_created_at: 1752800000000.5 }),
    ).toThrow();
    expect(() =>
      parseEnvelope({ ...validEnvelope(), server_received_at: 1752800000000.5 }),
    ).toThrow();
  });

  it("00 §6: rejects a missing schema_version and a schema_version below 1", () => {
    const { schema_version: _drop, ...missing } = validEnvelope();
    expect(() => parseEnvelope(missing)).toThrow();
    expect(() => parseEnvelope({ ...validEnvelope(), schema_version: 0 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-01-17 — the time layer on the envelope (DEC-TIME-001).
// ---------------------------------------------------------------------------

describe("envelope time layer (01-F43/01-F44/01-F45)", () => {
  it("01-F43: branch_created_at is a REQUIRED integer epoch-ms field — a missing or non-integer value is rejected", () => {
    const base = validEnvelope();
    expect(timed(base).branch_created_at).toBe(base.branch_created_at); // anchors the rejections
    const { branch_created_at: _drop, ...missing } = base;
    expect(() => parseEnvelope(missing)).toThrow();
    expect(() =>
      parseEnvelope({ ...validEnvelope(), branch_created_at: 1752800000000.5 }),
    ).toThrow();
    expect(() => parseEnvelope({ ...validEnvelope(), branch_created_at: null })).toThrow();
    expect(() =>
      parseEnvelope({ ...validEnvelope(), branch_created_at: "1752800000000" }),
    ).toThrow();
  });

  it("01-F43: branch time is signed — a device whose offset runs backwards stamps a branch_created_at below its own device clock", () => {
    // branch_time_offset is a SIGNED integer millisecond value (01-F43): a device
    // whose clock runs ahead of the hub carries a negative offset.
    const env = timed({
      ...validEnvelope(),
      device_created_at: 1752800000000,
      branch_created_at: 1752800000000 - 7_200_000,
    });
    expect(env.branch_created_at).toBe(1752800000000 - 7_200_000);
    expect(env.device_created_at).toBe(1752800000000);
  });

  it("01-F44: time_basis is a REQUIRED closed marker — exactly {branch, branch_provisional}", () => {
    expect(timed({ ...validEnvelope(), time_basis: "branch" }).time_basis).toBe("branch");
    expect(timed({ ...validEnvelope(), time_basis: "branch_provisional" }).time_basis).toBe(
      "branch_provisional",
    );
    const { time_basis: _drop, ...missing } = validEnvelope();
    expect(() => parseEnvelope(missing)).toThrow();
    // A device can never know server time at append (01-F44's `server` basis is a
    // property of the DERIVED business stamp, resolved from server_received_at),
    // and free-form/unknown markers would let a fiscal consumer misread the stamp.
    for (const bogus of ["server", "device", "provisional", "", "BRANCH", 1, null]) {
      expect(
        () => parseEnvelope({ ...validEnvelope(), time_basis: bogus }),
        String(bogus),
      ).toThrow();
    }
  });

  it("01-F44: TIME_BASES is the closed vocabulary declared once in domain", () => {
    expect(timeLayer.TIME_BASES).toBeDefined();
    expect([...(timeLayer.TIME_BASES ?? [])].sort()).toEqual(["branch", "branch_provisional"]);
  });

  it("01-F45: device_created_at survives verbatim beside branch_created_at — the raw clock is what 01-N2 skew detection measures", () => {
    // A device whose clock is four years fast: the raw hint is preserved exactly,
    // the branch stamp is the consensus value. Neither overwrites the other.
    const raw = 1752800000000 + 4 * 365 * 24 * 60 * 60 * 1000;
    const env = timed({
      ...validEnvelope(),
      device_created_at: raw,
      branch_created_at: 1752800000000,
      time_basis: "branch",
    });
    expect(env.device_created_at).toBe(raw);
    expect(env.branch_created_at).toBe(1752800000000);
  });

  it("01-F44/01-F1: a cloud-merged envelope keeps its provisional marker verbatim — reconciliation never silently promotes a stamp", () => {
    // The ledger is append-only (01-F1): the cloud stamping server_received_at can
    // never rewrite the device's stamp. The pair (unchanged marker, present
    // server_received_at) is exactly what makes reconciliation OBSERVABLE to a
    // fiscal consumer (01-F44, 16-N3) instead of implicit.
    const offline = timed({
      ...validEnvelope(),
      time_basis: "branch_provisional",
      server_received_at: null,
    });
    const merged = timed({ ...offline, server_received_at: 1752800001234 });
    expect(merged.time_basis).toBe("branch_provisional");
    expect(merged.branch_created_at).toBe(offline.branch_created_at);
    expect(merged.server_received_at).toBe(1752800001234);
  });
});
