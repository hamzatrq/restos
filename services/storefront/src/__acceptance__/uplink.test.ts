/**
 * ACCEPTANCE — `06-F36` (c)/(d)/(e): **the drain.**
 *
 * ⚠ **REPRODUCED ON A REAL STACK BEFORE THIS FILE EXISTED (2026-08-25):** real Postgres, a real
 * `services/sync-gateway`, a real published catalog, three carts posted to the running dev host.
 * Each returned `200 {"order_id":…}`; `select device_id, count(*) from kernel.events group by 1`
 * returned **`(0 rows)`**. The till's Orders tab read *"No new orders from the website or
 * WhatsApp."* Every part was correct and nothing connected them.
 *
 * The transport here is a double over the SAME `CloudTransport` seam the real WebSocket adapter
 * implements (`@restos/sync-protocol/transport`), so what is exercised is the shipped uplink and
 * not a copy of it. What this file cannot see is whether the gateway ACCEPTS what is pushed —
 * that is `outbox-drain.test.ts`, which runs against a real Postgres and a real gateway ingest.
 */
import type { EventEnvelopeT } from "@restos/domain";
import type { ProtocolMessage } from "@restos/sync-protocol/messages";
import type { CloudTransport, CloudTransportHandlers } from "@restos/sync-protocol/transport";
import { beforeEach, describe, expect, it } from "vitest";
import { originIdentity } from "../identity.js";
import { inMemoryOutbox, type Outbox } from "../outbox.js";
import { createUplink, STOREFRONT_PUSH_BATCH_MAX, type Uplink } from "../uplink.js";

const IDENTITY = originIdentity({
  org_id: "org-karachi",
  branch_id: "branch-clifton",
  device_id: "device-storefront-1",
  public_host: "burger-house.restos.pk",
});

const envelope = (lamport_seq: number): EventEnvelopeT =>
  ({
    id: `evt-${lamport_seq}`,
    org_id: IDENTITY.org_id,
    branch_id: IDENTITY.branch_id,
    device_id: IDENTITY.device_id,
    actor_user_id: null,
    lamport_seq,
    device_created_at: 1,
    branch_created_at: 1,
    time_basis: "branch_provisional",
    server_received_at: null,
    type: "order.created",
    schema_version: 1,
    payload: { order_id: `o-${lamport_seq}`, channel: "storefront" },
    refs: [],
  }) as unknown as EventEnvelopeT;

/** A double over the shipped seam. `up()`/`deliver()` are the edges the real adapter drives. */
const fakeTransport = () => {
  let handlers: CloudTransportHandlers | null = null;
  const sent: ProtocolMessage[] = [];
  let stopped = 0;
  const transport: CloudTransport = {
    start: (h) => {
      handlers = h;
    },
    stop: () => {
      stopped += 1;
      handlers = null;
    },
    send: (message) => {
      // Fire-and-forget while down is DROPPED, exactly as the real adapter does.
      if (handlers !== null) sent.push(message);
    },
  };
  return {
    transport,
    sent,
    stopped: () => stopped,
    up: () => handlers?.onUp(),
    down: () => handlers?.onDown(),
    deliver: (message: ProtocolMessage) => handlers?.onMessage(message),
    started: () => handlers !== null,
  };
};

const helloAck = (): ProtocolMessage =>
  ({ v: 2, kind: "hello_ack", session_id: "s1", hub: false, resume_from: 0 }) as ProtocolMessage;

const pushAck = (acked_watermark: number, extra: Record<string, unknown> = {}): ProtocolMessage =>
  ({ v: 2, kind: "push_ack", acked_watermark, ...extra }) as ProtocolMessage;

/** Lets the uplink's internal `void (async () => …)()` chains settle. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

let net: ReturnType<typeof fakeTransport>;
let outbox: ReturnType<typeof inMemoryOutbox>;
let uplink: Uplink;
const reported: string[] = [];

beforeEach(() => {
  net = fakeTransport();
  outbox = inMemoryOutbox();
  reported.length = 0;
  uplink = createUplink({
    identity: IDENTITY,
    outbox,
    transport: net.transport,
    token: "token-abc",
    report: (line) => reported.push(line),
  });
});

describe("A — the reproduction: an accepted order reaches the wire", () => {
  it("pushes what the outbox holds once the session is up", async () => {
    await outbox.put([envelope(0), envelope(1), envelope(2)]);
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();

    const pushes = net.sent.filter((m) => m.kind === "push");
    expect(pushes).toHaveLength(1);
    const push = pushes[0] as Extract<ProtocolMessage, { kind: "push" }>;
    expect(push.events.map((e) => e.lamport_seq)).toEqual([0, 1, 2]);
    // `01-F8`: the watermark is the batch's own last slot, never anything ahead of it.
    expect(push.watermark).toBe(2);
  });

  it("hellos with this origin's identity, its class and its token", async () => {
    uplink.start();
    net.up();
    const hello = net.sent.find((m) => m.kind === "hello") as Extract<
      ProtocolMessage,
      { kind: "hello" }
    >;
    expect(hello.device_id).toBe(IDENTITY.device_id);
    expect(hello.branch_id).toBe(IDENTITY.branch_id);
    expect(hello.device_class).toBe("storefront_cloud");
    expect(hello.token).toBe("token-abc");
  });

  it("pushes NOTHING when the outbox is empty — the ordinary state", async () => {
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();
    expect(net.sent.filter((m) => m.kind === "push")).toHaveLength(0);
  });
});

describe("B — `06-F36` (c): PUSH-ONLY. It holds no branch slice", () => {
  it("never sends a catchup_request", async () => {
    await outbox.put([envelope(0)]);
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();
    expect(net.sent.filter((m) => m.kind === "catchup_request")).toHaveLength(0);
  });

  it("never sends a reference_request — it reads prices over HTTP (`06-F33`)", async () => {
    uplink.start();
    net.up();
    net.deliver({
      v: 2,
      kind: "hello_ack",
      session_id: "s1",
      hub: false,
      resume_from: 0,
      reference_versions: [
        { resource: "catalog", scope: { org_id: IDENTITY.org_id, branch_id: null }, version: 9 },
      ],
    } as ProtocolMessage);
    await settle();
    expect(net.sent.filter((m) => m.kind === "reference_request")).toHaveLength(0);
  });

  it("DROPS a delivered event_batch: nothing is stored and nothing is acked", async () => {
    uplink.start();
    net.up();
    net.deliver(helloAck());
    net.deliver({
      v: 2,
      kind: "event_batch",
      events: [{ ...envelope(41), device_id: "device-till-1", global_seq: 5 }],
    } as unknown as ProtocolMessage);
    await settle();
    expect(await outbox.pending()).toHaveLength(0);
    expect(uplink.status().last_push_ack).toBeNull();
  });

  it("declares what it holds on hello: no cursor, no high water", async () => {
    uplink.start();
    net.up();
    const hello = net.sent.find((m) => m.kind === "hello") as Extract<
      ProtocolMessage,
      { kind: "hello" }
    >;
    expect(hello.last_global_seq).toBe(0);
    expect(hello.own_high_water).toBe(0);
  });
});

describe("C — `06-F36` (e): a persist WAKES the drain", () => {
  it("pushes an order appended while the session is already up", async () => {
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();
    expect(net.sent.filter((m) => m.kind === "push")).toHaveLength(0);

    await outbox.put([envelope(0)]);
    uplink.notifyAppended();
    await settle();

    const pushes = net.sent.filter((m) => m.kind === "push");
    expect(pushes).toHaveLength(1);
    expect((pushes[0] as Extract<ProtocolMessage, { kind: "push" }>).watermark).toBe(0);
  });

  it("holds the order and pushes it on reconnect when the link is DOWN", async () => {
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();
    net.down();

    await outbox.put([envelope(0)]);
    uplink.notifyAppended();
    await settle();
    // Commandment 4 / `00 §5.1`: an unreachable branch is normal, and the row is durable.
    expect(net.sent.filter((m) => m.kind === "push")).toHaveLength(0);
    expect(await outbox.pending()).toHaveLength(1);

    net.up();
    net.deliver(helloAck());
    await settle();
    expect(net.sent.filter((m) => m.kind === "push")).toHaveLength(1);
  });
});

describe("D — `06-F36` (d): push_ack is THE write-checkpoint", () => {
  it("clears only what was acked, and only on the ack", async () => {
    await outbox.put([envelope(0), envelope(1), envelope(2)]);
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();
    // Nothing is cleared by having been SENT.
    expect(await outbox.pending()).toHaveLength(3);

    net.deliver(pushAck(1));
    await settle();
    expect((await outbox.pending()).map((e) => e.lamport_seq)).toEqual([2]);
    expect(uplink.status().last_push_ack).toBe(1);
  });

  it("chains the next page past the ack, so a backlog over one page drains", async () => {
    const big = Array.from({ length: STOREFRONT_PUSH_BATCH_MAX + 3 }, (_, i) => envelope(i));
    await outbox.put(big);
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();

    const first = net.sent.filter((m) => m.kind === "push") as Extract<
      ProtocolMessage,
      { kind: "push" }
    >[];
    expect(first).toHaveLength(1);
    expect(first[0]?.events).toHaveLength(STOREFRONT_PUSH_BATCH_MAX);

    net.deliver(pushAck(STOREFRONT_PUSH_BATCH_MAX - 1));
    await settle();
    const pushes = net.sent.filter((m) => m.kind === "push") as Extract<
      ProtocolMessage,
      { kind: "push" }
    >[];
    expect(pushes).toHaveLength(2);
    expect(pushes[1]?.events.map((e) => e.lamport_seq)).toEqual([
      STOREFRONT_PUSH_BATCH_MAX,
      STOREFRONT_PUSH_BATCH_MAX + 1,
      STOREFRONT_PUSH_BATCH_MAX + 2,
    ]);
  });

  it("ignores an ack that names ANOTHER origin (`DEC-SYNC-009`)", async () => {
    await outbox.put([envelope(0), envelope(1)]);
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();

    net.deliver(pushAck(1, { origin_device_id: "device-till-1" }));
    await settle();
    expect(await outbox.pending()).toHaveLength(2);
    expect(uplink.status().last_push_ack).toBeNull();
  });

  it("never rewinds the checkpoint on a stale ack", async () => {
    await outbox.put([envelope(0), envelope(1), envelope(2)]);
    uplink.start();
    net.up();
    net.deliver(helloAck());
    await settle();
    net.deliver(pushAck(2));
    await settle();
    net.deliver(pushAck(0));
    await settle();
    expect(uplink.status().last_push_ack).toBe(2);
    expect(await outbox.pending()).toHaveLength(0);
  });
});

describe("E — `01-F47`: the renewal is adopted for the next hello", () => {
  it("hellos with the renewed token after one arrives", async () => {
    uplink.start();
    net.up();
    net.deliver({ ...(helloAck() as object), renewed_token: "token-new" } as ProtocolMessage);
    await settle();
    net.down();
    net.up();
    const hellos = net.sent.filter((m) => m.kind === "hello") as Extract<
      ProtocolMessage,
      { kind: "hello" }
    >[];
    expect(hellos).toHaveLength(2);
    expect(hellos[1]?.token).toBe("token-new");
  });
});

describe("F — `01-F42`/`01-F48`: a revoked origin stops, loudly", () => {
  it("stops pushing, says so, and stops the transport", async () => {
    await outbox.put([envelope(0)]);
    uplink.start();
    net.up();
    net.deliver({ v: 2, kind: "purge_command", scope: "all" } as ProtocolMessage);
    await settle();

    expect(uplink.status().revoked).toBe(true);
    expect(net.stopped()).toBe(1);
    expect(reported.join("\n")).toContain("REVOKED");
    // And nothing is pushed afterwards, however hard the persist path pokes it.
    uplink.notifyAppended();
    await settle();
    expect(net.sent.filter((m) => m.kind === "push")).toHaveLength(0);
  });
});

describe("G — `01-F17`: an outbox that fails must not take the connection down", () => {
  it("reports and survives a failing pending() read", async () => {
    const broken: Outbox = {
      put: async () => {},
      pending: async () => {
        throw new Error("connection terminated unexpectedly");
      },
      ack: async () => {},
    };
    const alone = createUplink({
      identity: IDENTITY,
      outbox: broken,
      transport: net.transport,
      token: "t",
      report: (line) => reported.push(line),
    });
    alone.start();
    net.up();
    net.deliver(helloAck());
    await settle();
    expect(reported.join("\n")).toContain("outbox read failed");
    // The session is still up and a later drain still runs.
    expect(alone.status().connected).toBe(true);
  });
});
