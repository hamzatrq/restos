// Regression guard — external-audit K-01/K-06 (01-F5): canonicalJson must match
// JSON.stringify's treatment of undefined/function/symbol, so the audit hash of the
// in-memory value equals the hash of what gets persisted (JSON round-trip). Before
// the fix, an undefined-valued payload key self-broke the chain.
//
// T-01-17 RE-PIN (24 §3 step 2, oracle-owned): the ratified envelope gains
// `branch_created_at` + `time_basis` (01-F43/01-F44). 01-F5 hashes the whole
// envelope minus `server_received_at`, so both new fields are hash-covered and every
// audit hash in the corpus moves. Nothing here is a literal pin — the suite asserts
// RELATIONS (round-trip stability, forge resistance), so the re-pin is a fixture
// change and the property is unchanged and re-proved on the new fields below.
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
  branch_created_at: 1752800000000,
  time_basis: "branch" as const,
  server_received_at: null,
  type: "audit.login",
  schema_version: 1,
  payload,
  refs: [] as string[],
});

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Overlay arbitrary envelope fields without an excess-property check — used for
 * the T-01-17 time-layer mutations (see the re-pin note in the header). */
const withFields = <T>(base: T, fields: Record<string, unknown>): T =>
  ({ ...base, ...fields }) as T;

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

  it("01-F43/01-F44/01-F5 (T-01-17 re-pin): the two time-layer fields are hash-COVERED — moving either one moves the audit hash", () => {
    // The re-pin must not weaken the chain: a forged branch stamp or a forged
    // provisional marker has to be as detectable as a forged device_id. The fields
    // are applied through `withFields` so the suite compiles both before the
    // envelope type carries them (red phase) and after (green phase).
    const base = envelope({ actor: "u", prev_audit_hash: null });
    const h = auditEventHash(base);
    const movedBranch = withFields(base, { branch_created_at: base.branch_created_at + 1 });
    const movedBasis = withFields(base, { time_basis: "branch_provisional" });
    const movedDevice = withFields(base, { device_created_at: base.device_created_at + 1 });
    expect(auditEventHash(movedBranch)).not.toBe(h);
    expect(auditEventHash(movedBasis)).not.toBe(h);
    // …and they are independent of each other and of the raw device clock (01-F45).
    expect(auditEventHash(movedDevice)).not.toBe(h);
    expect(
      auditEventHash(withFields(movedDevice, { branch_created_at: base.branch_created_at - 1 })),
    ).not.toBe(auditEventHash(movedDevice));
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
