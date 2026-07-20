// Regression guard — external-audit K-01 (01-F5), STORE level. Companion to the
// domain-level canonical-regression.test.ts (@restos/domain), which pins the pure
// hash primitive. This one drives the SAME bug through the real openStore append
// path: the store stamps a device's audit-chain HEAD from the in-memory envelope
// but persists it via JSON.stringify (which drops undefined-valued keys). If
// canonicalJson does not mirror that drop, the HEAD hash computed at stamp time
// diverges from the hash of the round-tripped row a later verify re-reads — a
// legitimate `undefined` payload key self-breaks the chain (01-F5).
//
// Pre-fix (canonicalJson kept undefined keys): auditEventHash(first, with
// note:undefined) !== auditEventHash(first re-read from SQLite, note dropped), so
// the second event's prev_audit_hash links to a hash the stored first no longer
// reproduces — verifyAuditChain returns { ok: false }, this test is RED.
// Post-fix (canonicalJson omits undefined/function/symbol to match JSON.stringify):
// both hashes agree, the chain verifies, GREEN.
import { isAuditEvent, verifyAuditChain } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { openStore } from "../index.js";
import { appendInput, identity } from "./builders.js";

describe("K-01 audit chain survives an undefined payload key through the store (01-F5)", () => {
  it("01-F5: an audit.login carrying note:undefined leaves the device's readOwnEvents() chain verifiable after the JSON round-trip", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });

    // First own audit event: payload has an undefined-valued key. JSON.stringify
    // drops `note` on the way to SQLite, so the persisted row differs from the
    // in-memory value the HEAD hash is computed over — exactly the K-01 fault line.
    store.append(
      appendInput(id, { type: "audit.login", payload: { actor: "u", note: undefined } }),
    );
    // Second own audit event: its store-stamped prev_audit_hash links to the HEAD
    // hash of the first. Only a canonicalJson that mirrors JSON.stringify keeps
    // that link reproducible from the round-tripped first row.
    store.append(appendInput(id, { type: "audit.login", payload: { actor: "u2" } }));

    const own = store.readOwnEvents();
    expect(own.filter((e) => isAuditEvent(e.type))).toHaveLength(2); // both audit rows present
    // The Auditor precondition holds: this device's audit events in lamport order
    // form an unbroken chain (01-F5). Deep-equal { ok: true } — a broken link would
    // surface as { ok: false, broken_at, expected_prev, found_prev }.
    expect(verifyAuditChain(own)).toEqual({ ok: true });

    store.close();
  });
});
