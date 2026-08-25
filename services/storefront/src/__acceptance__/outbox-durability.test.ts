/**
 * ACCEPTANCE — `06-F36` (a)/(b): **the durable outbox, against a real Postgres.**
 *
 * ⚠ **THE PROPERTY THIS FILE OWNS IS NOT "THE PORT IS SUPPLIED" — IT IS "THE SUPPLY IS REAL".**
 * `L8`'s measured blind spot: `seams:check` Rule B asks whether a member is supplied and never
 * whether the supply is real, and `server.ts` already records this module's own instance —
 * replacing `outbox: options.outbox` with `inMemoryOutbox()` passed 31 of 31 tests, `typecheck`
 * and `seams:check`. So every case below constructs a SECOND outbox over the SAME database and
 * reads through it: a value that survives only in the first handle's heap fails.
 *
 * That second handle is also the restart test, and it is the whole reason this file exists —
 * the shipping banner said *"a restart loses every order this process accepted"* and it was true.
 */
import { parseEvent } from "@restos/domain";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type OriginIdentity, originIdentity } from "../identity.js";
import { createPostgresOutbox, type DurableOrigin } from "../outbox-postgres.js";
import { DATABASE_URL_ENV } from "./global-setup.js";

const url = (): string => {
  const value = process.env[DATABASE_URL_ENV];
  if (value === undefined) throw new Error("global-setup did not publish a database url");
  return value;
};

/** A fresh tenant per case — isolation by key, never truncation. */
let seq = 0;
const freshIdentity = (): OriginIdentity => {
  seq += 1;
  return originIdentity({
    org_id: `org-${seq}-${process.pid}`,
    branch_id: `branch-${seq}-${process.pid}`,
    device_id: `device-storefront-${seq}`,
    public_host: `shop-${seq}.restos.pk`,
  });
};

const envelope = (identity: OriginIdentity, lamport_seq: number, id?: string) =>
  parseEvent({
    id: id ?? `${identity.device_id}-evt-${lamport_seq}`,
    org_id: identity.org_id,
    branch_id: identity.branch_id,
    device_id: identity.device_id,
    actor_user_id: null,
    lamport_seq,
    device_created_at: 1_700_000_000_000,
    branch_created_at: 1_700_000_000_000,
    time_basis: "branch_provisional",
    server_received_at: null,
    type: "order.created",
    schema_version: 1,
    payload: { order_id: `o-${lamport_seq}`, channel: "storefront" },
    refs: [],
  }).envelope;

let identity: OriginIdentity;
const open: DurableOrigin[] = [];

const openOrigin = async (id: OriginIdentity = identity): Promise<DurableOrigin> => {
  const origin = await createPostgresOutbox({ database_url: url(), identity: id });
  open.push(origin);
  return origin;
};

beforeEach(() => {
  identity = freshIdentity();
});

afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});

describe("A — an accepted order survives the process that accepted it", () => {
  it("a SECOND handle over the same database reads what the first persisted", async () => {
    const first = await openOrigin();
    await first.outbox.put([envelope(identity, 0), envelope(identity, 1)]);
    // The restart: the accepting process is gone.
    await first.close();
    open.length = 0;

    const second = await openOrigin();
    const pending = await second.outbox.pending();
    expect(pending.map((e) => e.lamport_seq)).toEqual([0, 1]);
    expect(pending[0]?.payload).toEqual({ order_id: "o-0", channel: "storefront" });
  });

  it("the lamport counter survives too, so the reborn origin does not re-use slots", async () => {
    const first = await openOrigin();
    expect(await first.lamport.reserve(3)).toBe(0);
    await first.outbox.put([envelope(identity, 0), envelope(identity, 1), envelope(identity, 2)]);
    await first.close();
    open.length = 0;

    const second = await openOrigin();
    // A process-local counter answers 0 here, and every slot collides on the gateway.
    expect(await second.lamport.reserve(1)).toBe(3);
  });

  it("the write-checkpoint survives, so an acked order is not re-pushed for ever", async () => {
    const first = await openOrigin();
    await first.outbox.put([envelope(identity, 0), envelope(identity, 1)]);
    await first.outbox.ack(0);
    await first.close();
    open.length = 0;

    const second = await openOrigin();
    expect((await second.outbox.pending()).map((e) => e.lamport_seq)).toEqual([1]);
  });
});

describe("B — `06-F36` (b): a reservation that is never persisted burns NO slot", () => {
  it("re-uses the slots after a reserve whose put never happened", async () => {
    const first = await openOrigin();
    // The exact crash window: `origin.placeOrder` reserved, and `placement` never reached `put`
    // (an unpriced cart, an unreadable catalog, SIGKILL).
    expect(await first.lamport.reserve(3)).toBe(0);
    await first.close();
    open.length = 0;

    const second = await openOrigin();
    expect(await second.lamport.reserve(1)).toBe(0);
    await second.outbox.put([envelope(identity, 0)]);

    // ⚠ THE PROPERTY THAT MATTERS: slot 0 is present, so the gateway's stop-at-gap ingest can
    // advance. A burned slot leaves `[1]` here and wedges this origin's watermark for ever.
    expect((await second.outbox.pending()).map((e) => e.lamport_seq)).toEqual([0]);
  });

  it("a FAILED put leaves the counter exactly where it was", async () => {
    const origin = await openOrigin();
    await origin.outbox.put([envelope(identity, 0)]);
    // A duplicate slot: the primary key refuses it, so the whole transaction rolls back.
    await expect(origin.outbox.put([envelope(identity, 0, "other-id")])).rejects.toThrow();

    // The restart. It has to CLOSE first — the origin lock is real and refuses a second holder,
    // which §C owns; reopening without closing measures that instead of this.
    await origin.close();
    open.length = 0;
    const reopened = await openOrigin();
    expect(await reopened.lamport.reserve(1)).toBe(1);
    expect((await reopened.outbox.pending()).map((e) => e.lamport_seq)).toEqual([0]);
  });

  it("persists a batch ATOMICALLY — a half-written order is never readable", async () => {
    const origin = await openOrigin();
    const good = envelope(identity, 0);
    const clash = envelope(identity, 1, good.id); // same event id: the unique index refuses it
    await expect(origin.outbox.put([good, clash])).rejects.toThrow();
    // `01-F1`: an `order.created` with no lines is a permanent row a till shows as an empty order.
    expect(await origin.outbox.pending()).toHaveLength(0);
  });
});

describe("C — `06-F30`/`06-F36` (a): exactly one writer per (org, branch)", () => {
  it("refuses a SECOND process for the same origin, by name", async () => {
    await openOrigin();
    // ⚠ It WAITS first — see `ORIGIN_LOCK_WAIT_MS`. A LIVE holder is still there when the window
    // expires, which is what keeps the guard real; a CRASHED one is reaped in ~53 ms and its
    // replacement boots, which is the neighbouring case and the next test.
    await expect(openOrigin()).rejects.toThrow(/still holds the origin lock/);
  }, 30_000);

  it("a CRASHED predecessor does not lock its replacement out — 06-F36 (a)/01-F66 (c)", async () => {
    const dying = await createPostgresOutbox({ database_url: url(), identity });
    await dying.outbox.put([envelope(identity, 0)]);
    await dying.close();
    // A guard that refused here would turn every crash into a stopped storefront, which is worse
    // than the defect it closes. The replacement starts AND reads what the dead one persisted.
    const replacement = await openOrigin();
    expect((await replacement.outbox.pending()).map((e) => e.lamport_seq)).toEqual([0]);
  }, 30_000);

  it("admits a different branch of the same org — the lock is per (org, branch)", async () => {
    await openOrigin();
    const sibling = originIdentity({
      org_id: identity.org_id,
      branch_id: `${identity.branch_id}-other`,
      device_id: `${identity.device_id}-other`,
      public_host: identity.public_host,
    });
    await expect(openOrigin(sibling)).resolves.toBeDefined();
  });

  it("releases the lock on close, so a replacement process can start", async () => {
    const first = await openOrigin();
    await first.close();
    open.length = 0;
    await expect(openOrigin()).resolves.toBeDefined();
  });

  it("does not leak connections when the lock is refused", async () => {
    await openOrigin();
    await expect(openOrigin()).rejects.toThrow();
    // If the refused construction had leaked its two handles, the pool would still hold them.
    const probe = postgres(url(), { max: 1, onnotice: () => {} });
    try {
      const rows = await probe`
        select count(*)::int as n from pg_stat_activity
         where datname = current_database() and state is not null`;
      expect(Number(rows[0]?.n ?? 0)).toBeLessThan(20);
    } finally {
      await probe.end({ timeout: 5 });
    }
  });
});

describe("D — `06-F36` (e): a committed put reaches its subscriber", () => {
  it("notifies once per put, and not before it is durable", async () => {
    const origin = await openOrigin();
    const seen: number[] = [];
    origin.onPut(async () => {
      seen.push((await origin.outbox.pending()).length);
    });
    await origin.outbox.put([envelope(identity, 0)]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The subscriber can already READ the row: the notification is after the commit, never before.
    expect(seen).toEqual([1]);
  });

  it("does not notify when a put fails", async () => {
    const origin = await openOrigin();
    let calls = 0;
    origin.onPut(() => {
      calls += 1;
    });
    await origin.outbox.put([envelope(identity, 0)]);
    await expect(origin.outbox.put([envelope(identity, 0, "other")])).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("E — the checkpoint is monotonic and clears only what it names", () => {
  it("acks through a slot and never rewinds", async () => {
    const origin = await openOrigin();
    await origin.outbox.put([envelope(identity, 0), envelope(identity, 1), envelope(identity, 2)]);
    await origin.outbox.ack(1);
    expect((await origin.outbox.pending()).map((e) => e.lamport_seq)).toEqual([2]);
    await origin.outbox.ack(0);
    expect((await origin.outbox.pending()).map((e) => e.lamport_seq)).toEqual([2]);
  });

  it("keeps the acked rows — `01-F1`, and a send is not an ack", async () => {
    const origin = await openOrigin();
    await origin.outbox.put([envelope(identity, 0)]);
    await origin.outbox.ack(0);
    const probe = postgres(url(), { max: 1, onnotice: () => {} });
    try {
      const rows = await probe`
        select count(*)::int as n from storefront.outbox
         where org_id = ${identity.org_id} and branch_id = ${identity.branch_id}`;
      expect(Number(rows[0]?.n)).toBe(1);
    } finally {
      await probe.end({ timeout: 5 });
    }
  });
});

describe("F — `00 §5.4`: one origin's outbox is not another's", () => {
  it("pending() returns only this (org, branch)'s rows", async () => {
    const mine = await openOrigin();
    const otherIdentity = freshIdentity();
    const theirs = await openOrigin(otherIdentity);
    await mine.outbox.put([envelope(identity, 0)]);
    await theirs.outbox.put([envelope(otherIdentity, 0), envelope(otherIdentity, 1)]);

    expect((await mine.outbox.pending()).map((e) => e.org_id)).toEqual([identity.org_id]);
    expect(await theirs.outbox.pending()).toHaveLength(2);
  });
});
