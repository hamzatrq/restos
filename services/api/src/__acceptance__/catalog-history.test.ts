/**
 * **`14-F3` — the change history renders its own example.**
 *
 * The FR text: *"The change history of any entity is browsable in place (**"price changed by Ali,
 * 2 Jul, 450 → 480"**) — the audit trail is a first-class UI element, not a hidden log."*
 *
 * That sentence names four things a row must carry, and until August 2026 the record carried one
 * of them. `LedgerRecord` had `actor_user_id` (**Ali**), `entity`/`entity_id`/`version`, and two
 * content HASHES — so the screen could say who and had nothing to print for **2 Jul**, **450** or
 * **480**. `apps/backoffice/src/components/change-history.tsx` rendered a standing apology instead
 * of inventing them, which was the right call and not a resting state.
 *
 * The two additions and the FRs that rule them:
 *
 *   - `server_received_at` — `01-F62` (August 2026): `catalog.changed` is **org-scoped**. It
 *     carries `org_id`, no `branch_id` and no branch stamp, never enters a branch stream, and no
 *     device folds it; its ordering authority is `server_received_at`, which `01-F18` already
 *     ruled for catalog edits. So the clock is the SERVER's and that is legitimate — the inverse
 *     of the device-clock threat `01-F43` exists for, not an exception to it.
 *   - `price_changes` — `14-F3`'s two numbers, as the CELLS that moved. A delta, never an entity
 *     body: `01-F52` forbids the event carrying the catalog, and a `(branch, channel)` before/after
 *     pair carries no name, no station, no parent and cannot rebuild a menu.
 *
 * **THE MUTATIONS THIS FILE IS AIMED AT** (round-3 law — a mechanism pointed at the case that
 * matters, not merely built):
 *
 *   1. the stamp is absent from the record;
 *   2. the stamp is taken at READ time — the reading device's clock — rather than stored from the
 *      server's. This is the dangerous one: on the day a record is written, a screen formatting
 *      its own `Date.now()` prints the *right* date. It only goes wrong later, which is exactly
 *      how it survives a demo. The injected clock here is a fixed instant far from `Date.now()`,
 *      so a read-time stamp cannot coincide with the correct answer;
 *   3. a row loses its actor;
 *   4. the numbers are dropped, or reported as changed when they did not move, or a `0` is treated
 *      as an absence (`01-F60`'s free modifier).
 */

import { ORDER_CHANNELS, type OrderChannel } from "@restos/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { type CatalogEntry, createMemoryStagedEditStore, type EnabledPairs } from "../catalog.js";
import {
  type CatalogDeps,
  type CatalogRuntime,
  createCatalogRuntime,
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
  type LedgerRecord,
  priceChanges,
  publishEdits,
  stageEdit,
} from "../publish.js";

const ORG = "org-1";
const ACTOR = "u-ali";

/** 2 July 2026, 09:15 Asia/Karachi — `14-F3`'s own "2 Jul", and nowhere near `Date.now()`. */
const T_2_JUL = Date.UTC(2026, 6, 2, 4, 15, 0);
const CUTOVER_HOUR = 5;

const ENABLED: EnabledPairs = { branches: ["gulberg"], channels: ["counter"] };

/** `450 → 480` in integer paisa (`00 §6`) — the FR's own figures, in rupees, as paisa. */
const P450 = 45_000;
const P480 = 48_000;

const itemAt = (price_paisa: number): CatalogEntry => ({
  kind: "item",
  id: "biryani",
  name: "Chicken Biryani",
  prices: [{ branch_id: "gulberg", channel: "counter", price_paisa }],
});

type Harness = {
  runtime: CatalogRuntime;
  clock: { at: number };
  history: () => Promise<readonly LedgerRecord[]>;
};

const harness = (enabled: EnabledPairs = ENABLED): Harness => {
  const clock = { at: T_2_JUL };
  const ledger = createMemoryLedgerAppender();
  const deps: CatalogDeps = {
    staged: createMemoryStagedEditStore(),
    publisher: createMemoryCatalogPublisher(),
    ledger,
    enabled,
    now: () => clock.at,
    cutover_hour: CUTOVER_HOUR,
  };
  return { runtime: createCatalogRuntime(deps), clock, history: () => ledger.history(ORG) };
};

/** Publish one entry immediately, as `catalog.save` with `apply_when: "now"` does. */
const publish = async (
  h: Harness,
  entry: CatalogEntry,
  actor_user_id = ACTOR,
): Promise<number | null> =>
  publishEdits(h.runtime, ORG, [
    stageEdit(h.runtime, { org_id: ORG, actor_user_id, entry, apply_when: "now" }),
  ]);

describe("14-F3 — a history row carries the FR's own example", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('renders "price changed by Ali, 2 Jul, 450 → 480" from ONE record', async () => {
    await publish(h, itemAt(P450));
    h.clock.at = T_2_JUL + 3_600_000; // an hour later, same day
    await publish(h, itemAt(P480));

    const rows = await h.history();
    expect(rows).toHaveLength(2);
    const edit = rows[1] as LedgerRecord;

    // by Ali
    expect(edit.actor_user_id).toBe(ACTOR);
    // 2 Jul — the SERVER's stamp, stored on the record
    expect(edit.server_received_at).toBe(T_2_JUL + 3_600_000);
    // 450 → 480
    expect(edit.payload.price_changes).toEqual([
      { branch_id: "gulberg", channel: "counter", before_paisa: P450, after_paisa: P480 },
    ]);
  });

  it("stamps the SERVER's clock, not the reading device's (01-F62)", async () => {
    await publish(h, itemAt(P450));
    const rows = await h.history();
    const stamped = (rows[0] as LedgerRecord).server_received_at;

    // The stamp is a stored FACT. A record read months later reads the same instant, and that
    // instant is the injected server clock — not whatever clock the reader happens to hold.
    expect(stamped).toBe(T_2_JUL);
    expect(Math.abs(Date.now() - stamped)).toBeGreaterThan(86_400_000);
    const again = await h.history();
    expect((again[0] as LedgerRecord).server_received_at).toBe(stamped);
  });

  it("gives every row in a bulk edit the SAME instant (14-F8 is five records, one publish)", async () => {
    // `14-F8`: a bulk edit emits individual events "so history stays per-item". They are still one
    // publish, so two `now()` readings would let five rows disagree about when "the" edit happened
    // — and let a row disagree with the artifact version it names.
    const edits = ["biryani", "karahi", "nihari"].map((id) =>
      stageEdit(h.runtime, {
        org_id: ORG,
        actor_user_id: ACTOR,
        entry: { ...itemAt(P450), id },
        apply_when: "now",
      }),
    );
    await publishEdits(h.runtime, ORG, edits);

    const rows = await h.history();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.server_received_at))).toEqual(new Set([T_2_JUL]));
  });

  it("keeps the actor per EDIT, so a sweep of two owners' edits attributes each correctly", async () => {
    // The artifact's actor collapses to `null` for a mixed sweep; the history's must not, or
    // `14-F3`'s "by Ali" becomes "by whoever was last in the array".
    const edits = [
      stageEdit(h.runtime, {
        org_id: ORG,
        actor_user_id: "u-ali",
        entry: itemAt(P450),
        apply_when: "now",
      }),
      stageEdit(h.runtime, {
        org_id: ORG,
        actor_user_id: "u-bilal",
        entry: { ...itemAt(P480), id: "karahi" },
        apply_when: "now",
      }),
    ];
    await publishEdits(h.runtime, ORG, edits);

    const rows = await h.history();
    expect(rows.map((row) => [row.payload.entity_id, row.actor_user_id])).toEqual([
      ["biryani", "u-ali"],
      ["karahi", "u-bilal"],
    ]);
  });

  it("a day-end edit is stamped when it LANDS, not when it was staged (14-F28)", async () => {
    // The history's date is the date the change reached the tills. A stamp taken at stage time
    // would date a 23:10 edit to the previous business day and put the row in the wrong place in
    // an `01-F18`-ordered list.
    const staged = stageEdit(h.runtime, {
      org_id: ORG,
      actor_user_id: ACTOR,
      entry: itemAt(P450),
      apply_when: "day_end",
    });
    await h.runtime.staged.stage(staged);

    h.clock.at = staged.lands_at + 1;
    await h.runtime.scheduler.runDue();

    const rows = await h.history();
    expect(rows).toHaveLength(1);
    expect((rows[0] as LedgerRecord).server_received_at).toBe(staged.lands_at + 1);
    expect((rows[0] as LedgerRecord).server_received_at).not.toBe(staged.staged_at);
  });
});

describe("14-F3 — the numbers, and what counts as a change", () => {
  it("reports a brand-new entry as null → price, matching before_ref === null", async () => {
    const h = harness();
    await publish(h, itemAt(P450));
    const row = (await h.history())[0] as LedgerRecord;
    expect(row.payload.before_ref).toBeNull();
    expect(row.payload.price_changes).toEqual([
      { branch_id: "gulberg", channel: "counter", before_paisa: null, after_paisa: P450 },
    ]);
  });

  it("reports NOTHING when the edit moved no price", async () => {
    // An empty list is a fact ("this edit renamed something"), not a missing field. A history that
    // cannot tell those apart is the hidden log `14-F3` exists to replace.
    const h = harness();
    await publish(h, itemAt(P450));
    await publish(h, { ...itemAt(P450), name: "Chicken Biryani (Special)" });
    const row = (await h.history())[1] as LedgerRecord;
    expect(row.payload.price_changes).toEqual([]);
    expect(row.payload.before_ref).not.toBe(row.payload.after_ref);
  });

  it("treats 0 as a PRICE on both sides — 01-F60's free modifier is not an absence", () => {
    // `if (!price)` is the mistake this pins. A modifier moving 450 → 0 is a change to free, and
    // a cell arriving at 0 is a new free cell — neither may read as "no price".
    const free = (id: string): CatalogEntry => ({
      kind: "modifier",
      id,
      name: "Extra Raita",
      prices: [{ branch_id: "gulberg", channel: "counter", price_paisa: 0 }],
    });
    expect(priceChanges({ ...free("raita"), prices: [] }, free("raita"))).toEqual([
      { branch_id: "gulberg", channel: "counter", before_paisa: null, after_paisa: 0 },
    ]);
    expect(priceChanges({ ...free("raita"), prices: itemAt(P450).prices }, free("raita"))).toEqual([
      { branch_id: "gulberg", channel: "counter", before_paisa: P450, after_paisa: 0 },
    ]);
    // …and 0 → 0 is not a change.
    expect(priceChanges(free("raita"), free("raita"))).toEqual([]);
  });

  it("reports only the cells that MOVED, not the whole grid", () => {
    // A five-channel org that changed one channel yields one row. Reporting all five would make
    // every history entry unreadable and, worse, indistinguishable from a real five-cell edit.
    const grid = (overrides: Partial<Record<OrderChannel, number>>): CatalogEntry => ({
      kind: "item",
      id: "biryani",
      name: "Chicken Biryani",
      prices: ORDER_CHANNELS.map((channel) => ({
        branch_id: "gulberg",
        channel,
        price_paisa: overrides[channel] ?? P450,
      })),
    });
    expect(priceChanges(grid({}), grid({ foodpanda: P480 }))).toEqual([
      { branch_id: "gulberg", channel: "foodpanda", before_paisa: P450, after_paisa: P480 },
    ]);
  });

  it("reports a dropped cell as price → null", () => {
    // Reachable through `14-F7`: a tombstone is exempt from `01-F60` completeness, so an archive
    // may legitimately publish an entry whose grid has shrunk. Collapsing this to `0` would print
    // "free" where the truth is "gone".
    const before: CatalogEntry = {
      kind: "item",
      id: "biryani",
      name: "Chicken Biryani",
      prices: [
        { branch_id: "gulberg", channel: "counter", price_paisa: P450 },
        { branch_id: "gulberg", channel: "foodpanda", price_paisa: P480 },
      ],
    };
    expect(priceChanges(before, { ...itemAt(P450), deleted: true })).toEqual([
      { branch_id: "gulberg", channel: "foodpanda", before_paisa: P480, after_paisa: null },
    ]);
  });

  it("does not confuse two branches whose ids and channels overlap at the separator", () => {
    // `("a b", "c")` and `("a", "b c")` must never collide, or a moved price reads as unchanged.
    const cell = (branch_id: string, price_paisa: number) => ({
      branch_id,
      channel: "counter" as const,
      price_paisa,
    });
    const before: CatalogEntry = {
      kind: "item",
      id: "x",
      name: "X",
      prices: [cell("a", P450), cell("a b", P450)],
    };
    const after: CatalogEntry = {
      kind: "item",
      id: "x",
      name: "X",
      prices: [cell("a", P450), cell("a b", P480)],
    };
    expect(priceChanges(before, after)).toEqual([
      { branch_id: "a b", channel: "counter", before_paisa: P450, after_paisa: P480 },
    ]);
  });
});

describe("01-F52 / 01-F53 — what the history is still NOT", () => {
  it("carries a price DELTA and never an entity body", async () => {
    // `01-F52`: the event announces a version, it does not carry the catalog. A reader must not be
    // able to reconstruct a menu from history — no name, no station, no parent, no entry object.
    const h = harness();
    await publish(h, { ...itemAt(P450), station: "tandoor", kitchen_name: "BIRYANI" });
    const row = (await h.history())[0] as LedgerRecord;
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain("Chicken Biryani");
    expect(serialised).not.toContain("tandoor");
    expect(Object.keys(row.payload).sort()).toEqual([
      "after_ref",
      "before_ref",
      "entity",
      "entity_id",
      "price_changes",
      "version",
    ]);
  });

  it("still names the version it describes, so the row points at the artifact (01-F52)", async () => {
    const h = harness();
    const v1 = await publish(h, itemAt(P450));
    const v2 = await publish(h, itemAt(P480));
    const rows = await h.history();
    expect(rows.map((row) => row.payload.version)).toEqual([v1, v2]);
  });
});
