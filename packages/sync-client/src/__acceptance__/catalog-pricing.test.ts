// Acceptance tests — T-3, the DEVICE layer of `01-F60` (price) and `03-F50` (station).
//
// Authored from spec text ONLY, by a session that has seen no implementation and, deliberately,
// not `plans/wave-1/channel-pricing-and-the-counter-loop.md` either (`24 §3` step 2):
//   `specs/01-kernel-sync.md` — `01-F60`: the catalog carries an integer-paisa price for each
//       enabled (branch, channel) pair on `item`/`variant`; at line-add it resolves from **the
//       appending device's branch** and **the order's own channel**; there is deliberately NO
//       fallback to a house price; an unpriced item is NOT an 86'd item — it stays on the grid,
//       disabled in place, and the rest of the order completes normally. The published artifact
//       carries EVERY branch's prices; the device resolves its own row from the `branch_id`
//       already in its identity.
//       Also `01-F52` (never an input to a fold), `01-F53` (after capture, display text only),
//       `01-F54` (an unknown item degrades and never blocks), `01-F55` (tombstone, not removal),
//       `01-F56` (a delta whose base does not match is refused), `01-F17` (never block a sale).
//   `specs/03-kitchen-fulfillment.md` — `03-F50`: `station` is CATALOG data; an entry with no
//       station INHERITS its parent's through the `01-F21` chain; an item that belongs elsewhere
//       than its category overrides it; **where no station resolves anywhere up the chain the
//       line prints on the DEFAULT station's ticket rather than vanishing.**
//   `specs/02-pos-app.md` — `02-F42`: the closed channel set, and the channel is a price key.
//   `specs/00-platform-overview.md §6` — money is integer paisa.
//
// ── RED-AWAITING-IMPLEMENTATION ─────────────────────────────────────────────────────────────
// `CatalogEntry` carries neither field and `CatalogStore` has no resolver for either. 17 of the
// 19 tests below are red. **EXACTLY TWO ARE GREEN at authorship and each says so in its own
// title**: the two persistence guards. They pass for an uninteresting reason — the store writes
// an entry as `JSON.stringify(entry)`, so a field it has never heard of already round-trips —
// and are pinned against an implementation that projects columns instead, which would silently
// drop a price exactly the way the WIRE strips one today. They are not evidence of the closure.
// Everything that RESOLVES a price or a station is red, and that is where `01-F60` and `03-F50`
// actually live.
// (`oracle-round-2-findings.md` A12: a header claimed seven clauses over a file that tested six.)
//
// ── PINNED INTERPRETATIONS — where the FRs stop short ────────────────────────────────────────
//
// 1. PRICE SHAPE — `prices: { branch_id, channel, price_paisa }[]`, matching the wire suite.
//    `01-F60` names no field and no shape. The nested-record alternative is named in
//    `packages/sync-protocol/src/__acceptance__/catalog-entry-pricing.test.ts` and is the
//    simpler one; the triple was chosen because the writer's refusal must name branch + channel.
// 2. RESOLVER SHAPE — `store.catalog.priceOf(kind, id, channel)` and
//    `store.catalog.stationOf(kind, id)`. `01-F60` says the device "resolves its own row from
//    the `branch_id` already in its identity", so the BRANCH is not a parameter: it is the
//    store's own. That is what makes the two-branch test below reproduce the founder ruling
//    rather than merely index an array — and it makes asking for another branch's price
//    structurally impossible at the till, which is the disposition `01-F60` describes.
// 3. `DEFAULT_STATION` — `03-F50` says an unrouted line "prints on the **default station's**
//    ticket" and NEVER names the token. It cannot come from config: `03-F50`'s entire argument
//    is that no org-config plane exists. So it is pinned as an exported constant, and what this
//    file asserts about it is what the FR actually states — that it is non-empty, stable across
//    calls, and reached rather than a null. **Its VALUE is an open question and a finding.**
// 4. A FLOAT PRICE IS `malformed`, NOT A THROW. `01-F17` and this store's existing contract
//    ("a shape the device cannot read is a REFUSAL, never an exception") give the disposition;
//    `00 §6` gives the rule. Defence in depth behind the wire schema, which is where the same
//    check is pinned as a refusal.
//
// ── DELIBERATELY NOT COVERED ────────────────────────────────────────────────────────────────
// - COMPLETENESS AT PUBLISH. `01-F60` puts it at the WRITER; pinned in the gateway suite.
// - THE UI DISPOSITION. "rendered disabled in place with its reason (`27-F4`)" is `packages/ui`
//   and `02`'s counter, not this package. What is pinned here is the half this layer owns: the
//   item stays in `list()` and only its PRICE is absent.
// - `modifier`. `01-F60` names `item`/`variant` as sellable and `category`/`modifier_group` as
//   carrying none. It says nothing about `modifier`, which is a real fifth kind in
//   `CatalogKind` and is priced in every real menu. Asserting either way would invent an FR.
// - CAPTURE INTO THE EVENT. `01-F60`'s "captured into the event" is `order.line_added`, which
//   belongs to the counter (`02`), not to the catalog store.

import { describe, expect, it } from "vitest";
import type { CatalogEntry, CatalogKind, CatalogStore } from "../index.js";
import * as clientNs from "../index.js";
import { openStore } from "../index.js";

// ── the surface T-3 contracts, reached through casts so this file typechecks before it exists;
// a missing member is then a loud NAMED failure inside the test rather than a module-load crash
// that takes the whole file's reporting with it (same device as T-2's order-channel.test.ts).

const maybeExports = clientNs as unknown as { DEFAULT_STATION?: string };

type Resolvers = {
  priceOf?: (kind: CatalogKind, id: string, channel: string) => number | null;
  stationOf?: (kind: CatalogKind, id: string) => string;
};

const priceOf = (store: CatalogStore, kind: CatalogKind, id: string, channel: string) => {
  const fn = (store as unknown as Resolvers).priceOf;
  if (typeof fn !== "function")
    throw new Error(
      "CatalogStore has no priceOf(kind, id, channel) yet — 01-F60's resolution step " +
        "(T-3 red-awaiting-implementation)",
    );
  return fn(kind, id, channel);
};

const stationOf = (store: CatalogStore, kind: CatalogKind, id: string) => {
  const fn = (store as unknown as Resolvers).stationOf;
  if (typeof fn !== "function")
    throw new Error(
      "CatalogStore has no stationOf(kind, id) yet — 03-F50's inheritance walk " +
        "(T-3 red-awaiting-implementation)",
    );
  return fn(kind, id);
};

const defaultStation = (): string => {
  const value = maybeExports.DEFAULT_STATION;
  if (value === undefined)
    throw new Error(
      "@restos/sync-client does not export DEFAULT_STATION yet — 03-F50's unrouted-line " +
        "fallback (T-3 red-awaiting-implementation)",
    );
  return value;
};

// ── fixtures ────────────────────────────────────────────────────────────────────────────────

const DHA = "br-dha";
const SADDAR = "br-saddar";

const deviceIn = (branch_id: string) =>
  openStore({
    path: ":memory:",
    identity: { org_id: "org1", branch_id, device_id: `dev-${branch_id}` },
  });

type Price = { branch_id: string; channel: string; price_paisa: number };

const at = (branch_id: string, channel: string, price_paisa: number): Price => ({
  branch_id,
  channel,
  price_paisa,
});

const entry = (
  kind: CatalogKind,
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
): CatalogEntry => ({ kind, id, name, ...extra }) as CatalogEntry;

/**
 * ONE published version, carrying EVERY branch's prices — `01-F60`: "the published artifact
 * carries every branch's prices, one version, identical for all". Every store in this file
 * applies THIS object, byte for byte, so any difference in what they resolve is the device's
 * own branch and nothing else.
 */
const ONE_MENU = {
  kind: "snapshot" as const,
  version: 4,
  entries: [
    entry("item", "I-karahi", "Chicken Karahi", {
      prices: [
        at(DHA, "counter", 145_000),
        at(DHA, "foodpanda", 168_000),
        at(SADDAR, "counter", 118_000),
        at(SADDAR, "foodpanda", 139_000),
      ],
    }),
  ],
};

describe("01-F60 — the price resolves from THIS device's branch and the ORDER's channel", () => {
  it("two devices in different branches read DIFFERENT prices off the SAME version", () => {
    // THE FOUNDER RULING, and the clause that fails if resolution ever reads an org default:
    // "A chain genuinely prices the same dish differently by location (a DHA outlet above a
    // Saddar one), so the price is keyed by (branch, channel)." One snapshot, one version
    // number, one set of bytes — two answers, decided by the device's own identity.
    const dha = deviceIn(DHA);
    const saddar = deviceIn(SADDAR);
    expect(dha.catalog.apply(ONE_MENU)).toEqual({ applied: true, version: 4 });
    expect(saddar.catalog.apply(ONE_MENU)).toEqual({ applied: true, version: 4 });

    expect(priceOf(dha.catalog, "item", "I-karahi", "counter")).toBe(145_000);
    expect(priceOf(saddar.catalog, "item", "I-karahi", "counter")).toBe(118_000);
    // Same version on both, so the difference cannot be blamed on one device being stale.
    expect(dha.catalog.version()).toBe(saddar.catalog.version());
  });

  it("the CHANNEL selects within the branch — an aggregator order is not a counter sale", () => {
    // `02-F42`: the channel is a price key. `01-F60`'s named hazard is exactly this pair
    // collapsing: "a forgotten aggregator price sells at the in-restaurant rate while commission
    // still takes its cut — invisible at the till, frozen permanently by 01-F53".
    const dha = deviceIn(DHA);
    dha.catalog.apply(ONE_MENU);
    expect(priceOf(dha.catalog, "item", "I-karahi", "counter")).toBe(145_000);
    expect(priceOf(dha.catalog, "item", "I-karahi", "foodpanda")).toBe(168_000);
  });

  it("NO FALLBACK across channels — an unpriced channel resolves to nothing, not to a house price", () => {
    // "There is deliberately no fallback to a house price." A device holding a version published
    // before the writer check existed is the case `01-F60` says this path exists for.
    const dha = deviceIn(DHA);
    dha.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [entry("item", "I1", "Chapli Kebab", { prices: [at(DHA, "counter", 45_000)] })],
    });
    const resolved = priceOf(dha.catalog, "item", "I1", "whatsapp");
    expect(resolved, "an unpriced channel fell back to another channel's price").not.toBe(45_000);
    expect(resolved).toBeNull();
  });

  it("NO FALLBACK across branches — another branch's price is never this branch's price", () => {
    // The same ban on the other axis. A device in a branch the owner has not yet priced must
    // resolve nothing, not the first row in the array and not the other outlet's number.
    const lahore = deviceIn("br-lahore");
    lahore.catalog.apply(ONE_MENU);
    const resolved = priceOf(lahore.catalog, "item", "I-karahi", "counter");
    expect(resolved, "an unpriced branch read another branch's price").not.toBe(145_000);
    expect(resolved, "an unpriced branch read another branch's price").not.toBe(118_000);
    expect(resolved).toBeNull();
  });

  it("an UNPRICED item is not an 86'd item — it stays on the grid, only its price is absent", () => {
    // `01-F60`, verbatim: "It is rendered disabled in place with its reason, never removed from
    // the grid, and the rest of the order completes normally... This is the opposite disposition
    // to `01-F59`." So the catalog must keep serving it; only the number is missing.
    const dha = deviceIn(DHA);
    dha.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [
        entry("item", "I1", "Chapli Kebab", { prices: [at(DHA, "counter", 45_000)] }),
        entry("item", "I2", "Seekh Kebab"),
      ],
    });
    expect(dha.catalog.list("item").map((e) => e.id)).toEqual(["I1", "I2"]);
    expect(dha.catalog.lookup("item", "I2")?.name).toBe("Seekh Kebab");
    expect(priceOf(dha.catalog, "item", "I2", "counter")).toBeNull();
    // ...and its priced sibling is unaffected: one unpriced item never costs the sale (01-F17).
    expect(priceOf(dha.catalog, "item", "I1", "counter")).toBe(45_000);
  });

  it("a non-sellable kind resolves no price at all", () => {
    // "Non-sellable kinds (`category`, `modifier_group`) carry none."
    const dha = deviceIn(DHA);
    dha.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [entry("category", "C1", "Mains"), entry("modifier_group", "MG1", "Spice level")],
    });
    expect(priceOf(dha.catalog, "category", "C1", "counter")).toBeNull();
    expect(priceOf(dha.catalog, "modifier_group", "MG1", "counter")).toBeNull();
  });

  it("a `variant` is sellable and prices like an item", () => {
    const dha = deviceIn(DHA);
    dha.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [
        entry("item", "I1", "Chicken Karahi", { prices: [at(DHA, "counter", 145_000)] }),
        entry("variant", "V-half", "Half", {
          parent_id: "I1",
          prices: [at(DHA, "counter", 78_000)],
        }),
      ],
    });
    expect(priceOf(dha.catalog, "variant", "V-half", "counter")).toBe(78_000);
  });

  it("a DELTA re-prices, and the device then resolves the NEW number", () => {
    // `01-F53` freezes an OPEN order's price; it does not freeze the catalog. The next line
    // added prices at the new number, and this is the mechanism `14-F6`'s price editor drives.
    const dha = deviceIn(DHA);
    dha.catalog.apply({
      kind: "snapshot",
      version: 1,
      entries: [entry("item", "I1", "Chapli Kebab", { prices: [at(DHA, "counter", 45_000)] })],
    });
    expect(
      dha.catalog.apply({
        kind: "delta",
        from_version: 1,
        version: 2,
        upserts: [entry("item", "I1", "Chapli Kebab", { prices: [at(DHA, "counter", 49_000)] })],
        deletes: [],
      }),
    ).toEqual({ applied: true, version: 2 });
    expect(priceOf(dha.catalog, "item", "I1", "counter")).toBe(49_000);
  });

  it("00 §6 — a FRACTIONAL price is malformed, refused rather than thrown, and changes nothing", () => {
    // Money is integers-in-a-double and the double is the hazard (law 3). A 449.995 that reached
    // `unit_price_paisa` would be frozen there permanently by `01-F53`. The disposition is this
    // store's own: "a shape the device cannot read is a REFUSAL, never an exception" (01-F17).
    const dha = deviceIn(DHA);
    // Anchor: the identical snapshot with an INTEGER price applies, so the refusal below is the
    // price and not the fixture.
    expect(
      dha.catalog.apply({
        kind: "snapshot",
        version: 1,
        entries: [entry("item", "I1", "Chapli Kebab", { prices: [at(DHA, "counter", 45_000)] })],
      }),
    ).toEqual({ applied: true, version: 1 });

    const refused = dha.catalog.apply({
      kind: "snapshot",
      version: 2,
      entries: [entry("item", "I1", "Chapli Kebab", { prices: [at(DHA, "counter", 45_000.5)] })],
    });
    expect(refused).toEqual({ applied: false, reason: "malformed", version: 1 });
    // And nothing moved: the till keeps the menu it had (01-F17), at the version it had.
    expect(dha.catalog.version()).toBe(1);
    expect(priceOf(dha.catalog, "item", "I1", "counter")).toBe(45_000);
  });

  it("prices survive the store's own persistence verbatim [GREEN at authorship]", () => {
    // GREEN before the implementation: the store persists `JSON.stringify(entry)`, so an unknown
    // field already round-trips. Pinned as a regression guard against an implementation that
    // projects columns instead and drops what it does not know — which is precisely how the
    // WIRE loses a price today (`z.object` strips unknown keys). Not evidence of resolution.
    const dha = deviceIn(DHA);
    dha.catalog.apply(ONE_MENU);
    const read = dha.catalog.lookup("item", "I-karahi") as unknown as { prices?: readonly Price[] };
    expect(read.prices).toEqual([
      { branch_id: DHA, channel: "counter", price_paisa: 145_000 },
      { branch_id: DHA, channel: "foodpanda", price_paisa: 168_000 },
      { branch_id: SADDAR, channel: "counter", price_paisa: 118_000 },
      { branch_id: SADDAR, channel: "foodpanda", price_paisa: 139_000 },
    ]);
  });
});

describe("03-F50 — station is catalog data, and it INHERITS down the 01-F21 chain", () => {
  const menu = (entries: readonly CatalogEntry[]) => {
    const s = deviceIn(DHA);
    s.catalog.apply({ kind: "snapshot", version: 1, entries });
    return s.catalog;
  };

  it("an item with no station inherits its CATEGORY's — all breads to the tandoor", () => {
    // `03-F50`: "the category form is how a kitchen actually thinks (all breads to the tandoor)
    // ... So the common case is a handful of values on categories, not one per dish."
    const c = menu([
      entry("category", "C-breads", "Breads", { station: "tandoor" }),
      entry("item", "I-naan", "Naan", { parent_id: "C-breads" }),
    ]);
    expect(stationOf(c, "item", "I-naan")).toBe("tandoor");
  });

  it("an EXPLICIT station on the item overrides its category's", () => {
    // `03-F50`: "an item that belongs elsewhere than its category overrides it."
    const c = menu([
      entry("category", "C-breads", "Breads", { station: "tandoor" }),
      entry("item", "I-garlic-bread", "Garlic Bread", {
        parent_id: "C-breads",
        station: "grill",
      }),
    ]);
    expect(stationOf(c, "item", "I-garlic-bread")).toBe("grill");
  });

  it("inheritance walks the WHOLE chain — a variant reaches its grandparent category", () => {
    // `01-F21`'s chain is Category → MenuItem → Variant. A one-level lookup would leave every
    // variant unrouted while the category above it is correctly configured, which reads at the
    // pass as the half-order that never printed.
    const c = menu([
      entry("category", "C-breads", "Breads", { station: "tandoor" }),
      entry("item", "I-naan", "Naan", { parent_id: "C-breads" }),
      entry("variant", "V-garlic", "Garlic Naan", { parent_id: "I-naan" }),
    ]);
    expect(stationOf(c, "variant", "V-garlic")).toBe("tandoor");
    // ...and an override still wins two levels down.
    const overridden = menu([
      entry("category", "C-breads", "Breads", { station: "tandoor" }),
      entry("item", "I-naan", "Naan", { parent_id: "C-breads" }),
      entry("variant", "V-cheese", "Cheese Naan", { parent_id: "I-naan", station: "grill" }),
    ]);
    expect(stationOf(overridden, "variant", "V-cheese")).toBe("grill");
  });

  it("AN UNROUTED ITEM IS NOT A DROPPED ITEM — it resolves to the default station", () => {
    // `03-F50`: "Where no station resolves anywhere up the chain, the line prints on the DEFAULT
    // station's ticket rather than vanishing — a line silently absent from every ticket is the
    // one failure the paper cannot reveal."
    //
    // What is asserted is what the FR states, because the FR NAMES NO TOKEN (see interpretation
    // 3 in the header): the answer is reached, is non-empty, is the same for every unrouted
    // entry, and is never null.
    const c = menu([
      entry("category", "C-mains", "Mains"),
      entry("item", "I-karahi", "Chicken Karahi", { parent_id: "C-mains" }),
      entry("item", "I-orphan", "Daal"),
    ]);
    const routed = stationOf(c, "item", "I-karahi");
    expect(routed, "an unrouted line vanished from every ticket").not.toBeNull();
    expect(routed).toBe(defaultStation());
    expect(String(routed).length, "the default station is an empty string").toBeGreaterThan(0);
    // Every unrouted line lands on the SAME ticket — one default, not one per call site.
    expect(stationOf(c, "item", "I-orphan")).toBe(routed);
  });

  it("01-F54 — a not-yet-synced PARENT still routes the line, it does not throw", () => {
    // "An unknown or not-yet-synced item degrades to its identifier and NEVER blocks." A device
    // mid-fetch can hold an item whose category has not arrived; the chain is then unwalkable
    // and the line must still reach a station.
    const c = menu([entry("item", "I-karahi", "Chicken Karahi", { parent_id: "C-not-here" })]);
    expect(stationOf(c, "item", "I-karahi")).toBe(defaultStation());
  });

  it("01-F17 — a parent CYCLE terminates rather than hanging the till", () => {
    // Interpretation, flagged: `03-F50` describes a chain and no FR forbids a cycle on the wire.
    // `parent_id` is wire input, and a stopped till is the one unacceptable outcome. A timeout
    // here fails the test rather than passing it, which is the point.
    const c = menu([
      entry("item", "I-a", "A", { parent_id: "I-b" }),
      entry("item", "I-b", "B", { parent_id: "I-a" }),
    ]);
    expect(stationOf(c, "item", "I-a")).toBe(defaultStation());
  }, 2_000);

  it("01-F55 — a TOMBSTONED item still routes, because an open order may still reference it", () => {
    // A delete does not un-cook the order already on the pass. `lookup()` resolves tombstones
    // for exactly this reason; the station walk reads the same rows.
    const c = menu([
      entry("category", "C-breads", "Breads", { station: "tandoor" }),
      entry("item", "I-naan", "Naan", { parent_id: "C-breads" }),
    ]);
    expect(
      c.apply({
        kind: "delta",
        from_version: 1,
        version: 2,
        upserts: [],
        deletes: [{ kind: "item", id: "I-naan" }],
      }),
    ).toEqual({ applied: true, version: 2 });
    expect(
      c.list("item").map((e) => e.id),
      "a tombstone stayed on the grid",
    ).toEqual([]);
    expect(stationOf(c, "item", "I-naan")).toBe("tandoor");
  });

  it("station survives the store's own persistence verbatim [GREEN at authorship]", () => {
    // GREEN for the same `JSON.stringify` reason as the price guard above, and pinned for the
    // same regression. `03-F50`: "`station` joins `kitchen_name` ... on the catalog entry."
    const c = menu([entry("category", "C-breads", "Breads", { station: "tandoor" })]);
    const read = c.lookup("category", "C-breads") as unknown as { station?: string | null };
    expect(read.station).toBe("tandoor");
  });

  it("an EXPLICIT null station is a cleared station, and inherits again", () => {
    // RED — its persistence half passes today, its resolution half does not, so the test as a
    // whole is red and is NOT counted among the two green guards. `kitchen_name` and `parent_id`
    // already take `string | null` on this entry, so a back office that CLEARS a station sends
    // null — and a cleared station must resume inheriting, not route to null.
    const c = menu([
      entry("category", "C-breads", "Breads", { station: "tandoor" }),
      entry("item", "I-naan", "Naan", { parent_id: "C-breads", station: null }),
    ]);
    const read = c.lookup("item", "I-naan") as unknown as { station?: string | null };
    expect(read.station).toBeNull();
    expect(stationOf(c, "item", "I-naan")).toBe("tandoor");
  });
});
