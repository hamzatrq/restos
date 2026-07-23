// Regression guard — external-audit K-03 + K-08 (01-F9 tenant isolation + tooling).
// The gateway's fan-out set is keyed by branchKey(orgId, branchId). The fix uses
// JSON.stringify([orgId, branchId]); the prior key was a separator concat.
//
// K-08 (tooling): the source file must carry zero raw NUL (0x00) bytes — a control
// byte embedded as a separator is a source-hygiene hazard. Read gateway.ts as bytes
// and assert none are present.
//
// K-03 (isolation, 01-F9): a weak/separator-less key collides for adjacent-boundary
// id pairs — e.g. (org "ab", branch "c") and (org "a", branch "bc") both concat to
// "abc". Two DIFFERENT tenants would then share a fan-out set and one would receive
// the other's events — a cross-tenant leak. Under JSON.stringify the keys are
// ["ab","c"] vs ["a","bc"], distinct, so the leak is impossible. This test connects
// both tenants, pushes an event from A, and asserts B receives ZERO event_batch.
// Pre-fix (naive concat): B gets A's batch ⇒ RED. Post-fix: B gets nothing ⇒ GREEN.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
import {
  closeDb,
  type Db,
  freshIdentity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  TEST_TOKEN_SECRET,
  validEnvelopes,
} from "./helpers.js";

let db: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
});

describe("K-08 gateway source carries no NUL separator byte (tooling)", () => {
  it("01-F9: services/sync-gateway/src/gateway.ts contains zero 0x00 bytes", () => {
    const bytes = readFileSync(fileURLToPath(new URL("../gateway.ts", import.meta.url)));
    expect(bytes.includes(0x00)).toBe(false);
  });
});

describe("K-03 branchKey isolates tenants whose ids collide under a weak concat (01-F9)", () => {
  it("01-F9: (org 'ab', branch 'c') and (org 'a', branch 'bc') stay isolated — a push from one is never fanned to the other", async () => {
    // Adversarial ids: naive orgId+branchId concat maps both to "abc". dev-tokens
    // carry the org/branch claims verbatim, so these adversarial tenants are real.
    const tenantA = { org_id: "ab", branch_id: "c", device_id: freshIdentity().device_id };
    const tenantB = { org_id: "a", branch_id: "bc", device_id: freshIdentity().device_id };

    const sessionA = await openSession(gateway, tenantA);
    const sessionB = await openSession(gateway, tenantB);

    const batch = validEnvelopes(tenantA, 0, 2); // valid events in tenant A's stream
    await sessionA.conn.handle(pushMsg(batch));

    // Positive control: A's own push DID fan out (so the isolation check is meaningful,
    // not a vacuous pass on a push that produced no batch at all).
    const aBatches = ofKind(sessionA.rec.all, "event_batch");
    expect(aBatches).toHaveLength(1);
    expect(must(aBatches[0], "A's own event_batch").events.map((e) => e.id)).toEqual(
      batch.map((e) => e.id),
    );

    // The isolation law: B is a different tenant and must receive nothing (01-F9).
    expect(ofKind(sessionB.rec.all, "event_batch")).toHaveLength(0);
  });
});
