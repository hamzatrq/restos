// Acceptance tests — T-01-10 audit hash-chain, pure domain helpers (authored from
// the kernel-tasks binding contract + specs/01-kernel-sync.md 01-F5/§4/§7 +
// DEC-AUDIT-001 only; 24 §3 step 2: read-only to the implementing session).
//
// 01-F5: audit events are hash-chained per device — each carries the hash of the
// device's previous audit event. 01 §7: audit hash-chaining is non-configurable
// platform law, computed identically on every host. DEC-AUDIT-001 ratifies the
// scheme: SHA-256-hex over canonical-JSON of the envelope MINUS server_received_at
// (so a device-`null` and a cloud-stamped integer hash identically), via
// @noble/hashes (pure-JS/sync/cross-runtime). This suite pins that ratified scheme
// with an INDEPENDENT SHA-256 computation, never by trusting the impl's own hash.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AUDIT_EVENT_TYPES,
  auditEventHash,
  type EventEnvelopeT,
  isAuditEvent,
  newId,
  parseEvent,
  verifyAuditChain,
} from "../index.js";

const T0 = 1752800000000;

const AUDIT_TYPES = [
  "audit.login",
  "audit.drawer_opened",
  "audit.reprint",
  "audit.threshold_override",
  "audit.settings_changed",
] as const;

/** The store-owned chain field lives in the PAYLOAD (the envelope z.object strips
 * unknown keys — DEC-AUDIT-001 decision 2). Read it back as string | null. */
const prevOf = (env: EventEnvelopeT): string | null =>
  (env.payload as { prev_audit_hash: string | null }).prev_audit_hash;

const auditEnvelope = (overrides: Partial<EventEnvelopeT> = {}): EventEnvelopeT => ({
  id: newId(),
  org_id: "org-A",
  branch_id: "br-A",
  device_id: "dev-A",
  actor_user_id: newId(),
  lamport_seq: 0,
  device_created_at: T0,
  server_received_at: null,
  type: "audit.login",
  schema_version: 1,
  payload: { prev_audit_hash: null },
  refs: [],
  ...overrides,
});

// -------------------------------------------------------------------------
// Independent oracle: the ratified canonical serializer (UTF-16 code-unit key
// sort at every depth, no insignificant whitespace — 20 §4.2) + SHA-256 over the
// envelope with server_received_at DELETED. Recomputed here so the suite pins the
// exact bytes, not just self-consistency.
// -------------------------------------------------------------------------
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

const independentHash = (env: EventEnvelopeT): string => {
  const { server_received_at: _omit, ...rest } = env;
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(rest))));
};

/** A properly linked chain of n audit events on one device (ascending lamport). */
const makeChain = (n: number, salt: number): EventEnvelopeT[] => {
  const chain: EventEnvelopeT[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const env = auditEnvelope({
      id: `a${salt}-${i}`,
      lamport_seq: i,
      device_created_at: T0 + i * 100,
      type: AUDIT_TYPES[i % AUDIT_TYPES.length]!,
      payload: { prev_audit_hash: prev, actor: `u${i}` },
    });
    chain.push(env);
    prev = auditEventHash(env);
  }
  return chain;
};

const tamperPrev = (env: EventEnvelopeT, value: string | null): EventEnvelopeT => ({
  ...env,
  payload: { ...(env.payload as Record<string, unknown>), prev_audit_hash: value },
});

describe("audit event catalog (01-F5)", () => {
  it("01-F5: isAuditEvent recognises exactly the five audit.* subtypes, nothing else", () => {
    for (const type of AUDIT_TYPES) expect(isAuditEvent(type), `${type} is audit`).toBe(true);
    expect([...AUDIT_EVENT_TYPES].sort()).toEqual([...AUDIT_TYPES].sort());
    for (const type of ["order.created", "payment.recorded", "audit", "audit.", "login"]) {
      expect(isAuditEvent(type), `${type} is not audit`).toBe(false);
    }
  });

  it("01-F5: parseEvent accepts an audit envelope whose payload.prev_audit_hash is null or a string", () => {
    expect(parseEvent(auditEnvelope()).type).toBe("audit.login");
    const linked = auditEnvelope({ payload: { prev_audit_hash: "a".repeat(64) } });
    expect(parseEvent(linked).type).toBe("audit.login");
  });

  it("01-F5/01-F4: parseEvent rejects an audit payload missing prev_audit_hash or carrying a non-string/non-null value", () => {
    // Anchor: the well-formed audit payload parses (so the rejections below are the field, not the type).
    expect(parseEvent(auditEnvelope()).type).toBe("audit.login");
    expect(() => parseEvent(auditEnvelope({ payload: {} }))).toThrow();
    expect(() => parseEvent(auditEnvelope({ payload: { prev_audit_hash: 42 } }))).toThrow();
    expect(() => parseEvent(auditEnvelope({ payload: { prev_audit_hash: "" } }))).toThrow();
  });
});

describe("audit event hashing (01-F5, 01 §7 platform law)", () => {
  it("01-F5: auditEventHash is SHA-256-hex over canonical-JSON of the envelope minus server_received_at — matches an independent computation", () => {
    const env = auditEnvelope({
      payload: { prev_audit_hash: "b".repeat(64), actor: "u7" },
      refs: ["r1"],
    });
    const h = auditEventHash(env);
    expect(h).toBe(independentHash(env));
    expect(h).toMatch(/^[0-9a-f]{64}$/); // 32-byte SHA-256 as lowercase hex
  });

  it("01-F5: auditEventHash is deterministic — equal for a structurally identical envelope regardless of key insertion order", () => {
    const env = auditEnvelope({ id: "a-det", payload: { actor: "u1", prev_audit_hash: null } });
    const reordered: EventEnvelopeT = {
      refs: [],
      payload: { prev_audit_hash: null, actor: "u1" },
      type: "audit.login",
      schema_version: 1,
      server_received_at: null,
      device_created_at: env.device_created_at,
      lamport_seq: 0,
      actor_user_id: env.actor_user_id,
      device_id: "dev-A",
      branch_id: "br-A",
      org_id: "org-A",
      id: "a-det",
    };
    expect(auditEventHash(reordered)).toBe(auditEventHash(env));
  });

  it("01-F5/01-F3: cross-plane stability — a device-null and any cloud-stamped server_received_at hash identically", () => {
    const onDevice = auditEnvelope({ id: "a-xp", server_received_at: null });
    const merged: EventEnvelopeT = { ...onDevice, server_received_at: 1752800009999 };
    expect(auditEventHash(merged)).toBe(auditEventHash(onDevice));
    expect(auditEventHash(merged)).toBe(independentHash(onDevice));
  });

  it("01-F5: mutating any hash-covered field changes the hash; mutating only server_received_at does not (forge resistance at the byte level)", () => {
    const base = auditEnvelope({
      id: "a-cov",
      payload: { prev_audit_hash: null, actor: "u1" },
      refs: ["r0"],
    });
    const h = auditEventHash(base);
    const mutations: EventEnvelopeT[] = [
      { ...base, id: "a-cov-2" },
      { ...base, device_id: "dev-B" },
      { ...base, org_id: "org-B" },
      { ...base, branch_id: "br-B" },
      { ...base, actor_user_id: newId() },
      { ...base, lamport_seq: 1 },
      { ...base, device_created_at: base.device_created_at + 1 },
      { ...base, type: "audit.reprint" },
      { ...base, schema_version: 2 },
      { ...base, refs: ["r0", "r1"] },
      tamperPrev(base, "c".repeat(64)),
      { ...base, payload: { prev_audit_hash: null, actor: "u2" } },
    ];
    for (const m of mutations) expect(auditEventHash(m), JSON.stringify(m)).not.toBe(h);
    // server_received_at is excluded, so stamping it must NOT move the hash.
    expect(auditEventHash({ ...base, server_received_at: 123 })).toBe(h);
  });
});

describe("verifyAuditChain (01-F5)", () => {
  it("01-F5: a correctly linked chain verifies ok — empty, single, and multi-event", () => {
    expect(verifyAuditChain([])).toEqual({ ok: true });
    expect(verifyAuditChain(makeChain(1, 1))).toEqual({ ok: true });
    expect(verifyAuditChain(makeChain(6, 2))).toEqual({ ok: true });
  });

  it("01-F5: a first event whose prev_audit_hash is not null is a broken chain at that first event", () => {
    const chain = makeChain(4, 3);
    const broken = [tamperPrev(chain[0] as EventEnvelopeT, "d".repeat(64)), ...chain.slice(1)];
    const result = verifyAuditChain(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.broken_at).toBe(chain[0]?.id);
      expect(result.expected_prev).toBeNull();
      expect(result.found_prev).toBe("d".repeat(64));
    }
  });

  it("01-F5: mutating a middle event's stored prev_audit_hash breaks its own link and pinpoints it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 0x7fffffff }),
        (n, salt) => {
          const chain = makeChain(n, salt);
          const k = 1 + (salt % (n - 1)); // a non-first index
          const tampered = [...chain];
          tampered[k] = tamperPrev(chain[k] as EventEnvelopeT, "e".repeat(64));
          const result = verifyAuditChain(tampered);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.broken_at).toBe(chain[k]?.id);
            expect(result.expected_prev).toBe(auditEventHash(chain[k - 1] as EventEnvelopeT));
            expect(result.found_prev).toBe("e".repeat(64));
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it("01-F5: mutating any hash-covered field of a non-final chained event breaks the NEXT link (forge resistance)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 0x7fffffff }),
        (n, salt) => {
          const chain = makeChain(n, salt);
          const k = salt % (n - 1); // a non-final index [0, n-2]
          const forged = [...chain];
          // Rewrite covered data (a new actor) without touching this event's own prev link.
          forged[k] = {
            ...(chain[k] as EventEnvelopeT),
            payload: { prev_audit_hash: prevOf(chain[k] as EventEnvelopeT), actor: "forged" },
          };
          const result = verifyAuditChain(forged);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.broken_at).toBe(chain[k + 1]?.id);
            expect(result.found_prev).toBe(prevOf(chain[k + 1] as EventEnvelopeT));
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it("01-F5: reordering two audit events breaks the chain", () => {
    const chain = makeChain(5, 4);
    const swapped = [...chain];
    swapped[2] = chain[3] as EventEnvelopeT;
    swapped[3] = chain[2] as EventEnvelopeT;
    expect(verifyAuditChain(swapped).ok).toBe(false);
  });

  it("01-F5: dropping a middle event (a gap) breaks the chain at the survivor whose prev no longer resolves", () => {
    const chain = makeChain(5, 5);
    const gapped = [...chain.slice(0, 2), ...chain.slice(3)]; // drop index 2
    const result = verifyAuditChain(gapped);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.broken_at).toBe(chain[3]?.id); // the event whose prev pointed at the dropped one
      expect(result.found_prev).toBe(prevOf(chain[3] as EventEnvelopeT));
    }
  });
});
