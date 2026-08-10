// ACCEPTANCE TESTS — `03-F13`'s queue, `03-F14`'s aging, `03-F17`'s exit.
//
// PROVENANCE (`24 §3` step 2), stated rather than glossed: authored and implemented by the same
// session. The mitigation is the round-3 law, not a claim of independence — every assertion here
// was mutation-tested against a CONTROL differing in exactly one branch and the matrix is in the
// session report. Where an assertion could pass vacuously it is anchored on something the
// implementation cannot also supply: §B drives a REAL `openStore` and a REAL merge engine, so a
// projection this module merely believes in fails there rather than here.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   03-F13  "One tablet at the pass shows the branch order queue — all channels, channel-tagged —
//           STRICTLY CHRONOLOGICAL BY CONFIRM TIME. Card contents: order number, channel badge,
//           table, age, line summary."
//   03-F14  "Aging colors on each card: neutral → amber at X min → red at Y min. X/Y are
//           org-configurable per order type (defaults: dine-in 10/20, delivery 15/25); TIMER
//           BASIS IS `order.confirmed`, so a failed print never hides a late order."
//   03-F17  "An order leaves the queue when all its lines reach a terminal service state —
//           `served`, or `picked_up` for delivery."
//   03-F23  "Sequencing is visibility only … no reordering of the queue … ever."
//   01-F34  a projection reads NO ordering metadata — no `global_seq`, no `lamport_seq`, no
//           device clock, no envelope-id comparison that reaches a projected VALUE.
//   01-F43  durations need a CONSISTENT clock, not a correct one; the stamp travels in the event.
//   27-F7   "A list's visual order MUST be its work order."

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAging } from "../aging";
import { byConfirmTime, type PassTicket, passQueue } from "../pass-queue";

const ORG = "0199aaaa-0000-7000-8000-000000000001";
const BRANCH = "0199aaaa-0000-7000-8000-000000000002";
const DEVICE = "0199aaaa-0000-7000-8000-000000000003";

const dirs: string[] = [];
const freshStore = (): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "pass-queue-"));
  dirs.push(dir);
  return openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
  });
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
const uuid = (): string => `0199bbbb-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

/** Append one order through the REAL store, so the fold — not this file — builds the projection. */
const ringOrder = (
  store: DeviceStore,
  opts: {
    order_id: string;
    channel: string;
    order_type: string;
    /** `device_created_at`, which the store stamps into `branch_created_at` (`01-F43`). */
    at: number;
    lines?: number;
    table?: string;
  },
): void => {
  const append = (type: string, payload: unknown): void => {
    store.append({
      id: uuid(),
      org_id: ORG,
      branch_id: BRANCH,
      device_id: DEVICE,
      actor_user_id: null,
      device_created_at: opts.at,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  append("order.created", {
    order_id: opts.order_id,
    channel: opts.channel,
    order_type: opts.order_type,
  });
  if (opts.table !== undefined) {
    append("order.table_assigned", {
      order_id: opts.order_id,
      table_id: opts.table,
      supersedes: [],
      from_table_id: null,
    });
  }
  for (let i = 0; i < (opts.lines ?? 1); i += 1) {
    append("order.line_added", {
      order_id: opts.order_id,
      line_id: `${opts.order_id}-L${i}`,
      item_id: "item-karahi",
      qty: i + 1,
      unit_price_paisa: 45_000,
    });
  }
  append("order.confirmed", { order_id: opts.order_id });
};

const NAMES = (id: string): string => (id === "item-karahi" ? "KARAHI" : id);
const AGING = resolveAging(undefined);

const queueOf = (store: DeviceStore, now: number): readonly PassTicket[] =>
  passQueue({ store, name: NAMES, aging: AGING, now: () => now });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `03-F13` / `01-F34`: STRICTLY CHRONOLOGICAL, AND THE ORDER READS NOTHING ELSE.
//
// This is the section that exists because `AGENTS.md` calls law 1 "the law most often broken by
// accident — twice in the post-review round". A queue sort is the single most natural place in
// this product to break it: the rows arrive in an array and taking that array's order is one line
// of code that looks like nothing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F13 — strictly chronological by confirm time", () => {
  it("orders by the confirm stamp and NOT by the order events arrived in", () => {
    const store = freshStore();
    // Appended NEWEST FIRST. If the queue took arrival order — or `global_seq`, or `lamport_seq`,
    // all of which increase monotonically with append here — it would come back reversed.
    ringOrder(store, { order_id: uuid(), channel: "counter", order_type: "dine_in", at: 3_000 });
    ringOrder(store, { order_id: uuid(), channel: "phone", order_type: "delivery", at: 2_000 });
    ringOrder(store, {
      order_id: uuid(),
      channel: "storefront",
      order_type: "takeaway",
      at: 1_000,
    });

    const stamps = queueOf(store, 10_000).map((t) => t.confirm_at);
    expect(stamps).toEqual([1_000, 2_000, 3_000]);
  });

  it("01-F34 — an id RELABEL cannot change the order (the bijection property)", () => {
    // Two orders one millisecond apart, so the stamps decide and nothing else can. Then the SAME
    // two stamps with the ids swapped: if any comparator term reached an id where the stamps
    // differ, one of these two runs would disagree with the other.
    const runs: string[][] = [];
    for (const [firstId, secondId] of [
      ["aaaa1111-0000-7000-8000-000000000001", "bbbb2222-0000-7000-8000-000000000002"],
      ["bbbb2222-0000-7000-8000-000000000002", "aaaa1111-0000-7000-8000-000000000001"],
    ]) {
      const store = freshStore();
      ringOrder(store, {
        order_id: String(firstId),
        channel: "counter",
        order_type: "dine_in",
        at: 5_001,
      });
      ringOrder(store, {
        order_id: String(secondId),
        channel: "counter",
        order_type: "dine_in",
        at: 5_000,
      });
      runs.push(queueOf(store, 9_000).map((t) => t.order_id));
    }
    // The EARLIER order is first in both runs, whichever id it carries.
    expect(runs[0]).toEqual([
      "bbbb2222-0000-7000-8000-000000000002",
      "aaaa1111-0000-7000-8000-000000000001",
    ]);
    expect(runs[1]).toEqual([
      "aaaa1111-0000-7000-8000-000000000001",
      "bbbb2222-0000-7000-8000-000000000002",
    ]);
  });

  it("the comparator separates stamps 30 s apart, not just whole minutes", () => {
    // The first draft of this module sorted by the RENDERED `minutes`, which is floored — so two
    // tickets half a minute apart shared a value and the id tiebreak silently decided the cook
    // order between them. `27-F7` makes the visual order the work order and half a minute of
    // kitchen work is not a rounding error.
    const older: PassTicket = {
      order_id: "zzzz",
      confirm_at: 1_000_000,
    } as unknown as PassTicket;
    const newer: PassTicket = {
      order_id: "aaaa",
      confirm_at: 1_030_000,
    } as unknown as PassTicket;
    expect(byConfirmTime(older, newer)).toBeLessThan(0);
    // …and the id term is what breaks a genuine tie, in the only case it may.
    const tieA: PassTicket = { order_id: "aaaa", confirm_at: 5 } as unknown as PassTicket;
    const tieB: PassTicket = { order_id: "zzzz", confirm_at: 5 } as unknown as PassTicket;
    expect(byConfirmTime(tieA, tieB)).toBeLessThan(0);
    expect(byConfirmTime(tieA, tieA)).toBe(0);
  });

  it("01-F43 — a device clock that is hours out changes ages but NEVER the order", () => {
    const store = freshStore();
    const ids = [uuid(), uuid(), uuid()];
    ringOrder(store, {
      order_id: ids[0] ?? "",
      channel: "counter",
      order_type: "dine_in",
      at: 100,
    });
    ringOrder(store, {
      order_id: ids[1] ?? "",
      channel: "counter",
      order_type: "dine_in",
      at: 200,
    });
    ringOrder(store, {
      order_id: ids[2] ?? "",
      channel: "counter",
      order_type: "dine_in",
      at: 300,
    });
    const at = (now: number): string[] => queueOf(store, now).map((t) => t.order_id);
    // "durations need a CONSISTENT clock, not a correct one" — the order is identical at every
    // now, and the ages differ, which is exactly the split `01-F43` makes.
    expect(at(1_000)).toEqual(at(1_000 + 3_600_000));
    expect(queueOf(store, 60_100)[0]?.minutes).toBe(1);
    expect(queueOf(store, 3_660_100)[0]?.minutes).toBe(61);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the CARD, built from a real fold. `03-F13`'s five contents and nothing else.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F13 — the card carries what the FR names", () => {
  it("order number, channel badge, table, age and a line summary", () => {
    const store = freshStore();
    const id = uuid();
    ringOrder(store, {
      order_id: id,
      channel: "foodpanda",
      order_type: "delivery",
      at: 1_000,
      lines: 2,
      table: "7",
    });
    const [ticket] = queueOf(store, 601_000);
    expect(ticket).toBeDefined();
    // The order NUMBER — there is none in the ledger, so it is the same eight characters the
    // counter prints. See `referenceOf`.
    expect(ticket?.reference).toBe(id.slice(0, 8));
    expect(ticket?.channel).toBe("foodpanda");
    expect(ticket?.tables).toEqual(["7"]);
    expect(ticket?.minutes).toBe(10);
    expect(ticket?.lines.map((l) => `${l.quantity} ${l.name}`)).toEqual(["1 KARAHI", "2 KARAHI"]);
    // `03-F15` — "2 of 3 items ready", counted on the trusted side.
    expect(ticket?.linesTotal).toBe(2);
    expect(ticket?.linesDone).toBe(0);
  });

  it("01-F54 — an item no catalog has degrades to its identifier and never blocks", () => {
    const store = freshStore();
    ringOrder(store, { order_id: uuid(), channel: "counter", order_type: "dine_in", at: 1 });
    const [ticket] = passQueue({ store, name: (id) => id, aging: AGING, now: () => 1 });
    expect(ticket?.lines[0]?.name).toBe("item-karahi");
  });

  it("an UNCONFIRMED order is not on the pass at all", () => {
    const store = freshStore();
    const id = uuid();
    // `order.created` + a line, and NO confirm. `merge.ts` writes a queue row iff a confirm
    // anchor exists, so the counter's `02-F9` inbox never reaches the kitchen.
    store.append({
      id: uuid(),
      org_id: ORG,
      branch_id: BRANCH,
      device_id: DEVICE,
      actor_user_id: null,
      device_created_at: 1,
      type: "order.created",
      schema_version: 1,
      payload: { order_id: id, channel: "storefront", order_type: "delivery" },
      refs: [],
    });
    expect(queueOf(store, 1_000)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `03-F14` / `03-F47`: the thresholds, and the TIMER BASIS clause.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F14/03-F47 — aging", () => {
  it("resolves X/Y per ORDER TYPE, at the FR's own defaults", () => {
    const store = freshStore();
    ringOrder(store, { order_id: uuid(), channel: "counter", order_type: "dine_in", at: 0 });
    ringOrder(store, { order_id: uuid(), channel: "phone", order_type: "delivery", at: 1 });
    const [dineIn, delivery] = queueOf(store, 1_000);
    expect([dineIn?.amberAt, dineIn?.redAt]).toEqual([10, 20]);
    expect([delivery?.amberAt, delivery?.redAt]).toEqual([15, 25]);
  });

  it("takeaway and pickup take dine-in's row — the PINNED interpretation, asserted as one", () => {
    // `03-F14` and `03-F47` name defaults for two of `02-F1`'s order types and not for these. The
    // reading is argued in `aging.ts`; it is pinned here so a change to it is a change to a test.
    expect(AGING.thresholdsFor("takeaway")).toEqual({ amberAt: 10, redAt: 20 });
    expect(AGING.thresholdsFor("pickup")).toEqual({ amberAt: 10, redAt: 20 });
    // An unknown or absent type ages rather than staying permanently neutral.
    expect(AGING.thresholdsFor("something_else")).toEqual({ amberAt: 10, redAt: 20 });
    expect(AGING.thresholdsFor(null)).toEqual({ amberAt: 10, redAt: 20 });
  });

  it("a layer-2 configuration is applied, and a REFUSED one falls back without throwing", () => {
    const configured = resolveAging("dine_in=8/16,delivery=20/40");
    expect(configured.source).toBe("configured");
    expect(configured.thresholdsFor("dine_in")).toEqual({ amberAt: 8, redAt: 16 });

    // `X < Y` is a legality: a row where red comes first means the amber step never renders and
    // the operator loses the warning that exists to be acted on BEFORE the ticket is late.
    for (const junk of ["dine_in=20/10", "dine_in=10/10", "dine_in=0/5", "dine_in=8", "=8/16"]) {
      const refused = resolveAging(junk);
      expect(refused.source, junk).toBe("refused");
      // `01-F17`'s spirit: a typo must not take the kitchen's screen off the wall mid-service.
      expect(refused.thresholdsFor("dine_in")).toEqual({ amberAt: 10, redAt: 20 });
      expect(refused.malformed).toContain(junk);
    }
  });

  it("03-F14 — the timer basis is `order.confirmed` and a KOT event cannot move it", () => {
    // The clause this pins is *"so a failed print never hides a late order"*. A kitchen whose
    // printer died at 20:40 must still watch its tickets go amber and then red.
    const store = freshStore();
    const id = uuid();
    ringOrder(store, { order_id: id, channel: "counter", order_type: "dine_in", at: 1_000 });
    const before = queueOf(store, 901_000)[0]?.minutes;
    store.append({
      id: uuid(),
      org_id: ORG,
      branch_id: BRANCH,
      device_id: DEVICE,
      actor_user_id: null,
      device_created_at: 900_000,
      type: "kot.print_failed",
      schema_version: 1,
      payload: { order_id: id, printer_name: "grill" },
      refs: [],
    });
    expect(queueOf(store, 901_000)[0]?.minutes).toBe(before);
    expect(before).toBe(15);
  });
});
