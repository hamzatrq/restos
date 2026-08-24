/**
 * ACCEPTANCE — `06-F30`/`06-F31`: the cloud origin, and THE SEAM TO A REAL TILL.
 *
 * ⚠ **§E IS THE POINT OF THIS FILE.** Everything above it can be satisfied by a service that
 * produces correct-looking envelopes and reaches nothing — which is `L8` exactly, fifteen
 * recorded instances, every gate green. §E ingests this origin's real output into a REAL
 * `packages/sync-client` device store and asserts the order arrives in `openOrders()` as an
 * unconfirmed `storefront` row: the predicate `apps/pos-electron`'s shipped `isCloudInbox` is.
 *
 * The design's own decisive claim is what §E tests: `02-F9`'s inbox reads candidates from the
 * till's fold of its BRANCH STREAM, so an order living only in a cloud table cannot appear there.
 * If §E passes, resolution (A) is real; if it were deleted, this whole service could be
 * decorative and every other test here would stay green.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@restos/sync-client";
import { beforeEach, describe, expect, it } from "vitest";
import { STOREFRONT_CAPABILITY } from "../entitlement.js";
import { originIdentity, STOREFRONT_DEVICE_CLASS } from "../identity.js";
import { createStorefrontOrigin, type LamportSource, ORIGIN_TIME_BASIS } from "../origin.js";
import { inMemoryOutbox } from "../outbox.js";
import { createPlacement } from "../placement.js";
import { fixedCatalog } from "./catalog-fixture.js";

const ORG = "org-karachi";
const BRANCH = "branch-clifton";
const STOREFRONT_DEVICE = "device-storefront-clifton";
const TILL_DEVICE = "device-counter-1";

const counter = (): LamportSource => {
  let next = 0;
  return {
    reserve: async (count) => {
      const first = next;
      next += count;
      return first;
    },
  };
};

let ids = 0;
const PUBLISHED = { "item-burger": 45_000, "item-fries": 32_000 };

const origin = (lamport: LamportSource = counter(), clock = () => 1_755_000_000_000) =>
  createStorefrontOrigin({
    identity: originIdentity({
      org_id: ORG,
      branch_id: BRANCH,
      device_id: STOREFRONT_DEVICE,
      public_host: "burger-house.restos.pk",
    }),
    catalog: fixedCatalog(PUBLISHED),
    lamport,
    clock,
    newId: () => `0193b0f0-0000-7000-8000-${String(++ids).padStart(12, "0")}`,
  });

const CART = {
  order_id: "order-sf-1",
  lines: [
    { line_id: "line-1", item_id: "item-burger", qty: 1 },
    { line_id: "line-2", item_id: "item-fries", qty: 2 },
  ],
};

beforeEach(() => {
  ids = 0;
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 01-F62: the envelope is LEGAL, and it is a device's.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F62/06-F30 — the origin stamps a legal branch-scoped envelope", () => {
  it("carries the three branch fields 01-F62 requires", async () => {
    const { events } = await origin().placeOrder(CART);
    for (const e of events) {
      expect(e.branch_id).toBe(BRANCH);
      expect(e.org_id).toBe(ORG);
      expect(typeof e.branch_created_at).toBe("number");
      expect(e.time_basis).toBeDefined();
    }
  });

  it("the emitter is a DEVICE — 01-F62's discriminant is untouched, not amended", () => {
    // `05-F29` (b) amended `01-F62` so a cloud USER's decision had an envelope. This does not:
    // the event is branch-scoped and its `device_id` is a registered device that happens to run
    // in a data centre. A test that only checked "the envelope parses" could not tell these two
    // designs apart, so it checks the device identity explicitly.
    const id = originIdentity({
      org_id: ORG,
      branch_id: BRANCH,
      device_id: STOREFRONT_DEVICE,
      public_host: "burger-house.restos.pk",
    });
    expect(id.device_class).toBe(STOREFRONT_DEVICE_CLASS);
    expect(STOREFRONT_DEVICE_CLASS).toBe("storefront_cloud");
  });

  it("actor_user_id is null — a customer is not a ROLES member (02-F45, 01-F84)", async () => {
    const { events } = await origin().placeOrder(CART);
    for (const e of events) expect(e.actor_user_id).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 06-F31: the clock is permanently provisional.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 06-F31 — the origin's clock is branch_provisional, for ever", () => {
  it("every event this origin mints is branch_provisional, never branch", async () => {
    const o = origin();
    const placed = await o.placeOrder(CART);
    const cancelled = await o.cancelOrder({ order_id: CART.order_id, reason: "changed my mind" });
    for (const e of [...placed.events, ...cancelled.events]) {
      expect(
        e.time_basis,
        "06-F31: a cloud origin never contacts a branch hub, so it never acquires an offset and " +
          "must never claim `branch` basis — 01-F45's precedence is what keeps that safe",
      ).toBe("branch_provisional");
    }
    expect(ORIGIN_TIME_BASIS).toBe("branch_provisional");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — the gateway's contiguity rule (handlePush advances a watermark over a gap-free run only).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F3/06-F30 — lamport slots are CONTIGUOUS per origin", () => {
  it("a placed order occupies one gap-free run: created then one slot per line", async () => {
    const { events } = await origin().placeOrder(CART);
    expect(events.map((e) => e.lamport_seq)).toEqual([0, 1, 2]);
    expect(events[0]?.type).toBe("order.created");
    expect(events.slice(1).map((e) => e.type)).toEqual(["order.line_added", "order.line_added"]);
  });

  it("a second order continues the sequence with no gap and no reuse", async () => {
    const o = origin();
    await o.placeOrder(CART);
    const second = await o.placeOrder({ ...CART, order_id: "order-sf-2" });
    expect(second.events.map((e) => e.lamport_seq)).toEqual([3, 4, 5]);
  });

  it("reserves the WHOLE run up front, so a partially-failed batch cannot leave a hole", async () => {
    // The gateway tracks slots per ORIGIN and advances only over a contiguous run, so a skipped
    // slot wedges this origin's outbox permanently. One reservation per batch is the property.
    const calls: number[] = [];
    const spy: LamportSource = {
      reserve: async (n) => {
        calls.push(n);
        return 0;
      },
    };
    await origin(spy).placeOrder(CART);
    expect(calls).toEqual([1 + CART.lines.length]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 01-F18/06-F6 and commandment 4's ordering.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 06-F33/01-F18 — the price is the CATALOG's, resolved by the origin", () => {
  it("writes the published price for (this branch, storefront), and captures it once", async () => {
    const { events } = await origin().placeOrder(CART);
    const lines = events.filter((e) => e.type === "order.line_added");
    expect(lines.map((e) => (e.payload as { unit_price_paisa: number }).unit_price_paisa)).toEqual([
      45_000, 32_000,
    ]);
    expect(lines.map((e) => (e.payload as { qty: number }).qty)).toEqual([1, 2]);
  });

  it("pins the channel to `storefront` — 02-F42 makes channel a PRICE KEY, not a caller's choice", async () => {
    const { events } = await origin().placeOrder(CART);
    expect((events[0]?.payload as { channel: string } | undefined)?.channel).toBe("storefront");
  });

  it("computes and writes NO total — the money arithmetic is the fold's (01-F17, 02-F63)", async () => {
    // Two implementations of one money fact is the corpus's most-repeated defect. The storefront
    // writes lines; `billed_total`, `16-F5`'s per-line tax and `02-F63`'s charge rounding are the
    // till's. A payload key holding a total would be the second writer.
    const { events } = await origin().placeOrder(CART);
    for (const e of events) {
      const keys = Object.keys(e.payload as Record<string, unknown>);
      expect(keys).not.toContain("total_paisa");
      expect(keys).not.toContain("billed_total");
    }
  });

  it("PERSISTS BEFORE IT ACKNOWLEDGES — commandment 4 / 00 §5.2, pinned on COMPLETION", async () => {
    /**
     * ⚠ **THE FIRST VERSION OF THIS TEST DID NOT BITE, AND A MUTANT IS WHY IT WAS REWRITTEN.**
     *
     * It recorded a `put:3` marker at the TOP of a spy `put` and asserted `["put:3", "acked"]`.
     * That measures when `put` was CALLED, not when it COMPLETED — so `void deps.outbox.put(...)`
     * in place of `await` still ran the spy's first synchronous statement before `place` returned,
     * and the seam mutant SURVIVED with 29/29 green. Reading the test could not find that;
     * running the mutant did (`L10`).
     *
     * The property is: **`place` must not RESOLVE until the outbox has.** So the outbox is held
     * open on a deferred promise and the assertion is that `place` is still pending while the
     * write is — the only shape a dropped `await` cannot satisfy.
     */
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const outbox = inMemoryOutbox();
    let settled = false;

    const placement = createPlacement({
      origin: origin(),
      outbox: {
        put: async (events) => {
          await held;
          await outbox.put(events);
        },
        pending: outbox.pending,
        ack: outbox.ack,
      },
      entitlement: async () => ({
        status: "record",
        record: { capabilities: new Set([STOREFRONT_CAPABILITY]) },
      }),
    });

    const pending = placement.place(ORG, CART).then((r) => {
      settled = true;
      return r;
    });

    // Drain the microtask queue several times over. If `place` did not await the write it has
    // resolved by now, and the customer has been told her order is placed with nothing persisted.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(
      settled,
      "commandment 4 / 00 §5.2: `place` resolved while the outbox write was still outstanding — " +
        "a customer told her order is placed, with nothing durable anywhere and no row to be " +
        "missing from (01-F1)",
    ).toBe(false);
    expect(outbox.all()).toHaveLength(0);

    release();
    const result = await pending;
    expect(result.order_id).toBe(CART.order_id);
    expect(outbox.all()).toHaveLength(3);
  });

  it("pins `storefront` even when the caller supplies an order_type — 02-F42's price key", async () => {
    // The channel mutant's real target. Asserting the channel on a cart with NO `order_type` is
    // satisfied by any implementation that falls back to the literal, so the discriminating case
    // is a cart that HAS one: `order_type` is a separate field and must never reach `channel`.
    const { events } = await origin().placeOrder({ ...CART, order_type: "delivery" });
    const payload = events[0]?.payload as { channel: string; order_type?: string };
    expect(payload.channel).toBe("storefront");
    expect(payload.order_type).toBe("delivery");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE SEAM. A real till's fold, fed this origin's real output.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 06-F30/02-F9 — a storefront order REACHES A REAL TILL's open-orders fold", () => {
  const till = () =>
    openStore({
      path: join(mkdtempSync(join(tmpdir(), "sf-seam-")), "device.db"),
      identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL_DEVICE },
    });

  it("the order appears in openOrders() as an UNCONFIRMED `storefront` row — isCloudInbox's exact predicate", async () => {
    const { events } = await origin().placeOrder(CART);
    const store = till();
    try {
      store.ingestBatch(events);
      const rows = store.openOrders();
      const row = rows.find((r) => r.order_id === CART.order_id);
      expect(
        row,
        "06-F30's decisive claim: `02-F9`'s inbox reads the till's fold of its BRANCH stream, so " +
          "an order that lives only in a cloud table can never appear there. If this is " +
          "undefined the plane decision is wrong, not the test.",
      ).toBeDefined();
      // `isCloudInbox` = channel ∈ {storefront, whatsapp} ∧ confirmed_at === null.
      expect(row?.channel).toBe("storefront");
      expect(row?.confirmed_at).toBeNull();
    } finally {
      store.close();
    }
  });

  it("the till folds the LINES at the prices the storefront captured (01-F53 — no re-resolution)", async () => {
    const { events } = await origin().placeOrder(CART);
    const store = till();
    try {
      store.ingestBatch(events);
      const row = store.openOrders().find((r) => r.order_id === CART.order_id);
      // `json_lines` is a canonical-JSON cell MAP keyed by line_id (`BilledLineCell`), not an
      // array — asserted by key so the shape is stated rather than assumed, and so a reordering
      // of the map could never be read as a price change (`01-F34`: no projected value depends
      // on line order).
      const cells = JSON.parse(row?.json_lines ?? "{}") as Record<
        string,
        { item_id: string; qty: number; unit_price_paisa: number }
      >;
      expect(Object.keys(cells).sort()).toEqual(["line-1", "line-2"]);
      expect(cells["line-1"]?.unit_price_paisa).toBe(45_000);
      expect(cells["line-2"]?.unit_price_paisa).toBe(32_000);
      expect(cells["line-1"]?.qty).toBe(1);
      expect(cells["line-2"]?.qty).toBe(2);
      expect(cells["line-1"]?.item_id).toBe("item-burger");
    } finally {
      store.close();
    }
  });

  it("a FOREIGN origin is what arrives: the till's own device_id is not the emitter", async () => {
    // The property that makes §E a seam rather than a round-trip: these envelopes were minted by
    // a different device than the one folding them, which is what `01-F62` requires and what a
    // browser could never do.
    const { events } = await origin().placeOrder(CART);
    const store = till();
    try {
      store.ingestBatch(events);
      const stored = store.readAllEvents().filter((e) => e.device_id === STOREFRONT_DEVICE);
      expect(stored).toHaveLength(3);
      expect(store.readOwnEvents()).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("06-F19/01-F84: the storefront's CANCEL is emittable and folds without throwing", async () => {
    // `order.cancelled` had no schema until `01-F84`'s code half landed, so `store.append`/ingest
    // threw `UnknownEventTypeError` for it and both named producers were unbuildable. This is
    // the first producer the type has ever had.
    const o = origin();
    const placed = await o.placeOrder(CART);
    const cancelled = await o.cancelOrder({
      order_id: CART.order_id,
      reason: "customer changed their mind before we confirmed",
    });
    const store = till();
    try {
      store.ingestBatch([...placed.events, ...cancelled.events]);
      expect(store.readAllEvents().filter((e) => e.type === "order.cancelled")).toHaveLength(1);
      // ⚠ STATED, NOT ASSERTED AS DESIRABLE: the order is STILL in `open_orders`. The merge
      // disposition is projection-inert and `26 §7` reserves that decision for an oracle
      // (`06-F31`). This assertion pins the CURRENT honest behaviour so that the day a merge rule
      // lands, this test fails and is read — rather than the cancel silently starting to work.
      expect(store.openOrders().some((r) => r.order_id === CART.order_id)).toBe(true);
    } finally {
      store.close();
    }
  });
});
