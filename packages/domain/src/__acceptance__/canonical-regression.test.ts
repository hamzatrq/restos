// Regression guard — external-audit K-01/K-06 (01-F5): canonicalJson must match
// JSON.stringify's treatment of undefined/function/symbol, so the audit hash of the
// in-memory value equals the hash of what gets persisted (JSON round-trip). Before
// the fix, an undefined-valued payload key self-broke the chain.
import { describe, expect, it } from "vitest";
import { auditEventHash, newId } from "../index.js";

const envelope = (payload: unknown) => ({
  id: newId(),
  org_id: "org",
  branch_id: "branch",
  device_id: "dev",
  actor_user_id: null,
  lamport_seq: 0,
  device_created_at: 1752800000000,
  server_received_at: null,
  type: "audit.login",
  schema_version: 1,
  payload,
  refs: [] as string[],
});

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("K-01 canonical hash stability (01-F5)", () => {
  it("an undefined payload key hashes identically before and after a JSON round-trip", () => {
    const env = envelope({ actor: "u", note: undefined });
    expect(auditEventHash(env)).toBe(auditEventHash(roundTrip(env)));
  });

  it("undefined array elements, functions, and symbols also survive the round-trip", () => {
    const env = envelope({ a: [1, undefined, 2], f: () => 0, s: Symbol("x"), keep: "v" });
    expect(auditEventHash(env)).toBe(auditEventHash(roundTrip(env)));
  });

  it("forge-resistance intact: mutating any real field still changes the hash", () => {
    const base = envelope({ actor: "u", note: undefined });
    expect(auditEventHash({ ...base, payload: { actor: "MALLORY", note: undefined } })).not.toBe(
      auditEventHash(base),
    );
    expect(auditEventHash({ ...base, device_id: "other" })).not.toBe(auditEventHash(base));
  });

  it("omitting undefined does not collide a present-key with an absent-key of a different value", () => {
    const base = envelope({ a: 1 }); // hold id/all fields fixed; vary only payload
    // {a:1} and {a:1, b:undefined} are the same on disk — SHOULD hash equal (that is the fix).
    expect(auditEventHash({ ...base, payload: { a: 1, b: undefined } })).toBe(
      auditEventHash({ ...base, payload: { a: 1 } }),
    );
    // but {a:1, b:2} is a distinct on-disk state — MUST differ.
    expect(auditEventHash({ ...base, payload: { a: 1, b: 2 } })).not.toBe(
      auditEventHash({ ...base, payload: { a: 1 } }),
    );
  });
});
