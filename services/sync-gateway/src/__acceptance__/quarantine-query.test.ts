// T-01-08 oracle — the quarantine query seam for fleet health (law 6 of the
// T-01-08 contract, plans/wave-0/kernel-tasks.md; 01-F37 "surfaced to fleet
// health" — the READ SEAM lands here, the doc-15 dashboard/alerting and the
// operator resolution flow are explicitly out of scope). Authored from the
// T-01-08 contract + specs/01-kernel-sync.md (01-F37) + 00 §5.4 (org isolation)
// ONLY (24 §3 step 2: read-only to the implementing session).
//
// RED-AWAITING-IMPLEMENTATION: @restos/sync-gateway exports no listQuarantine —
// every call fails "not a function" (the structural-cast idiom keeps typecheck
// green while the surface is unbuilt).
//
// ── ORACLE-PINNED QUERY SURFACE (binding for the implementing session) ───────
//   listQuarantine(db, { org_id, branch_id?, device_id?, limit? }):
//     Promise<QuarantineEntry[]>
//   Entries carry at least { claimed_event_id, device_id, reason, received_at,
//   envelope } — envelope is the verbatim quarantined envelope as an OBJECT
//   (parsed from the text column). Ordered received_at DESC (newest first),
//   page-capped; `limit` caps the page explicitly. org_id scopes ABSOLUTELY:
//   another org reusing the same branch_id string never leaks (00 §5.4).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import * as gatewayModule from "../index.js";
import { createGateway } from "../index.js";
import {
  BASE_T,
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  openDb,
  openSession,
  pushMsg,
  TEST_TOKEN_SECRET,
  type TestClock,
  unknownTypeEnvelope,
} from "./helpers.js";

type QuarantineEntry = {
  claimed_event_id: string;
  device_id: string;
  reason: string;
  received_at: number;
  envelope: Record<string, unknown>;
};
type QuerySurface = {
  listQuarantine(
    db: Db,
    filter: { org_id: string; branch_id?: string; device_id?: string; limit?: number },
  ): Promise<QuarantineEntry[]>;
};
const { listQuarantine } = gatewayModule as unknown as QuerySurface;

let db: Db;
let clock: TestClock;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  clock = makeClock();
  gateway = createGateway({ db, clock, auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
});

describe("law 6 — quarantine query isolation and shape (01-F37 / 00 §5.4)", () => {
  it("01-F37/00 §5.4: listQuarantine returns ONE org's rows only — another org reusing the SAME branch_id string never leaks — with the verbatim envelope and the contract fields", async () => {
    const orgA = freshIdentity();
    // Deliberate cross-org branch-string collision: isolation must be BY ORG.
    const orgB: Identity = {
      org_id: freshIdentity().org_id,
      branch_id: orgA.branch_id,
      device_id: freshIdentity().device_id,
    };
    const sessionA = await openSession(gateway, orgA);
    const sessionB = await openSession(gateway, orgB);

    clock.t = BASE_T + 20_000;
    const badA = unknownTypeEnvelope(orgA, 0);
    await sessionA.conn.handle(pushMsg([badA]));
    const badB = unknownTypeEnvelope(orgB, 0);
    await sessionB.conn.handle(pushMsg([badB]));

    const entries = await listQuarantine(db, { org_id: orgA.org_id });
    expect(entries).toHaveLength(1);
    const entry = must(entries[0], "org A entry");
    expect(entry.claimed_event_id).toBe(badA.id);
    expect(entry.device_id).toBe(orgA.device_id);
    expect(entry.reason).toBe("schema_invalid");
    expect(entry.received_at).toBe(BASE_T + 20_000);
    expect(entry.envelope).toEqual(JSON.parse(JSON.stringify(badA))); // verbatim (01-F37)
  });

  it("01-F37: filters by branch and device, orders received_at DESC (newest first), and honors the page cap", async () => {
    const base = freshIdentity();
    const branch2 = freshIdentity().branch_id;
    const deviceB1a: Identity = base;
    const deviceB1b: Identity = { ...base, device_id: freshIdentity().device_id };
    const deviceB2: Identity = {
      org_id: base.org_id,
      branch_id: branch2,
      device_id: freshIdentity().device_id,
    };
    const s1 = await openSession(gateway, deviceB1a);
    const s2 = await openSession(gateway, deviceB1b);
    const s3 = await openSession(gateway, deviceB2);

    clock.t = BASE_T + 21_000;
    const bad1 = unknownTypeEnvelope(deviceB1a, 0);
    await s1.conn.handle(pushMsg([bad1]));
    clock.t = BASE_T + 22_000;
    const bad2 = unknownTypeEnvelope(deviceB1b, 0);
    await s2.conn.handle(pushMsg([bad2]));
    clock.t = BASE_T + 23_000;
    const bad3 = unknownTypeEnvelope(deviceB2, 0);
    await s3.conn.handle(pushMsg([bad3]));

    // Unfiltered: all three, newest first.
    const all = await listQuarantine(db, { org_id: base.org_id });
    expect(all.map((e) => e.claimed_event_id)).toEqual([bad3.id, bad2.id, bad1.id]);

    // Branch filter: branch 1 only, still newest first.
    const branch1Only = await listQuarantine(db, {
      org_id: base.org_id,
      branch_id: base.branch_id,
    });
    expect(branch1Only.map((e) => e.claimed_event_id)).toEqual([bad2.id, bad1.id]);

    // Device filter narrows to one device's rows.
    const deviceOnly = await listQuarantine(db, {
      org_id: base.org_id,
      device_id: deviceB1a.device_id,
    });
    expect(deviceOnly.map((e) => e.claimed_event_id)).toEqual([bad1.id]);

    // Page cap: limit 2 returns the two newest.
    const capped = await listQuarantine(db, { org_id: base.org_id, limit: 2 });
    expect(capped.map((e) => e.claimed_event_id)).toEqual([bad3.id, bad2.id]);
  });

  it("01-F37: the read seam is READ-ONLY observability — listing changes nothing (identical result on a second call; kernel.quarantine untouched)", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);
    const bad = unknownTypeEnvelope(identity, 0);
    await session.conn.handle(pushMsg([bad]));

    const first = await listQuarantine(db, { org_id: identity.org_id });
    const second = await listQuarantine(db, { org_id: identity.org_id });
    expect(second).toEqual(first);
    const raw = await db.execute(
      sql`select count(*) as n from kernel.quarantine where org_id = ${identity.org_id}`,
    );
    expect(Number(must([...raw][0], "count row").n)).toBe(1);
  });
});
