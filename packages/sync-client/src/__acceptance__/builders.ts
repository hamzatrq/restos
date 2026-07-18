// Acceptance-test builders — T-01-03, authored from the kernel-tasks binding
// contract + specs/01-kernel-sync.md §3/§5 only (24 §3 step 2: read-only to the
// implementing session).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId } from "@restos/domain";

export const identity = () => ({
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
});

export type Identity = ReturnType<typeof identity>;

/** Envelope minus lamport_seq/server_received_at — the store assigns those (plan contract). */
export const appendInput = (id: Identity, overrides: Record<string, unknown> = {}) => ({
  id: newId(),
  org_id: id.org_id,
  branch_id: id.branch_id,
  device_id: id.device_id,
  actor_user_id: null,
  device_created_at: 1752800000000,
  type: "order.created",
  schema_version: 1,
  payload: { order_id: newId(), channel: "dine_in" },
  refs: [],
  ...overrides,
});

export const tempDbPath = () => join(mkdtempSync(join(tmpdir(), "restos-outbox-")), "device.db");

/** Deterministic PRNG (mulberry32) — seeded runs only, no ambient randomness. */
export const seededRng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
