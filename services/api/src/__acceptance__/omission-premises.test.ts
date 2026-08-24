/**
 * **THE SUITE THAT REDDENS WHEN AN OMISSION BECOMES MEASURABLE.**
 *
 * `services/api/src/summary.ts`'s `OMISSIONS` table is prose about the state of this codebase,
 * **rendered to an owner** on the nightly summary. Each entry tells her that a block of her numbers
 * is not measured, so that a zero cannot read as *a clean day* when it means *nothing was counted*.
 * That purpose is right. The failure mode is that the sentences go stale silently, and a stale
 * entry tells her that a number she is reading cannot be affected by something that is affecting
 * it.
 *
 * It has happened twice. The voids/comps/discounts entry asserted *"no payload schema in
 * packages/domain and no emitter anywhere in the product"* — all three clauses false after one
 * day's commits — and was corrected only because an end-to-end run compared the owner's screen
 * against the ledger. The prep-time entry then went on saying *"RestOS is T1-only today"* after
 * `apps/pass-kds` shipped a production ready-mark, and was found by a verifier who was checking
 * something else. **Neither was visible to any suite, because the claim lived in a string.**
 *
 * ── WHAT THIS SUITE IS AND IS NOT ─────────────────────────────────────────────────────────────
 *
 * It evaluates each entry's `premise` — the facts the sentence rests on, declared as data on the
 * entry itself — against the real `@restos/domain` registry, the real `01 §4` line states and the
 * real `CatalogEntryWire`. A premise that stops holding is a failing test **on the day the change
 * lands**, in the package that made it, not on the day someone reads a screen.
 *
 * **`stalePremises` takes its world as a parameter, and that is the whole reason mutation is
 * possible here.** `packages/domain` is a protected path (commandment 10) and mutate-and-revert on
 * a shipped registry is exactly what this repo forbids for anything an interrupted agent could
 * strand. So §C hands the checker *fabricated* worlds — a registry in which `alert.raised` has a
 * schema, an `01 §4` that carries a `comped` state, a catalog entry that grew a cost field — and
 * asserts the specific entry is named. `assertEveryProcedureIsGated` uses the same parameterisation
 * for the same reason, and says so: *"a check that can only ever be pointed at the one correct
 * router is a check nothing has verified."*
 *
 * ⚠ **WHAT IT CANNOT SEE, so a green run is not read as total coverage.** It cannot see a missing
 * estimation job (`03-F27`), a threshold default that appears in the corpus (`13-F10`), a spec act
 * that opens `DEC-MONEY-010`'s gate (iii), or `services/intelligence` ceasing to be a stub. Those
 * clauses are still prose and still rot. The premise narrows the surface; it does not close it.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** — written by the session that corrected `OMISSIONS`, so
 * `24 §3`'s independent-oracle guarantee is not available and is not claimed. §C's mutation matrix
 * is what stands in for it, and §C's negative control is what stops that matrix proving nothing.
 *
 * Commandment 5: `@restos/domain` and `@restos/sync-protocol` only. No `@restos/sync-client`
 * anywhere near this plane.
 */

import { eventRegistry, ORDER_LINE_STATES, type SettledConservationArgs } from "@restos/domain";
import { CatalogEntryWire } from "@restos/sync-protocol";
import { describe, expect, it } from "vitest";
import { OMISSIONS, type Omission } from "../summary.js";

// ── the checker ────────────────────────────────────────────────────────────────────────────────

/**
 * The three facts an `OmissionPremise` is evaluated against. A record rather than three positional
 * arguments, because §C builds a dozen of these and a positional `readonly string[]` in the wrong
 * slot is how a mutant silently stops being the mutant it claims to be.
 */
type World = {
  /** Does `packages/domain` carry a payload schema for this type — i.e. can it be appended at all? */
  readonly hasPayloadSchema: (type: string) => boolean;
  /** `01 §4`'s canonical line-state vocabulary. */
  readonly lineStates: readonly string[];
  /** The key set of the catalog entry this plane publishes. */
  readonly catalogEntryFields: readonly string[];
};

/** The tree as it actually is. Everything §B asserts against. */
const REAL: World = {
  hasPayloadSchema: (type) => eventRegistry.has(type),
  lineStates: ORDER_LINE_STATES,
  catalogEntryFields: Object.keys(CatalogEntryWire.shape),
};

/** One broken premise, named so a failure says WHICH entry and WHICH clause. */
type Stale = { readonly block: string; readonly axis: string; readonly detail: string };

const stalePremises = (omissions: readonly Omission[], world: World): readonly Stale[] => {
  const stale: Stale[] = [];
  for (const entry of omissions) {
    const { premise } = entry;

    for (const type of premise.unemittable_types)
      if (world.hasPayloadSchema(type))
        stale.push({
          block: entry.block,
          axis: "unemittable_types",
          detail:
            `${type} now has a payload schema in packages/domain, so a device can append it and ` +
            `the gateway can ingest it. This entry says an owner's block cannot be measured; ` +
            `re-read it against the tree before this sentence reaches another screen.`,
        });

    for (const type of premise.emittable_types)
      if (!world.hasPayloadSchema(type))
        stale.push({
          block: entry.block,
          axis: "emittable_types",
          detail:
            `${type} has NO payload schema, so nothing can produce it. This entry tells an owner ` +
            `that something IS recorded or IS produced; it now overstates the product.`,
        });

    for (const state of premise.absent_line_states)
      if (world.lineStates.includes(state))
        stale.push({
          block: entry.block,
          axis: "absent_line_states",
          detail:
            `01 §4 now carries the line state "${state}". This entry turns on that state NOT ` +
            `existing — a line that can exit through it nets its own money out.`,
        });

    if (premise.catalog_entry_fields.length > 0) {
      const actual = [...world.catalogEntryFields].sort();
      const pinned = [...premise.catalog_entry_fields].sort();
      if (JSON.stringify(actual) !== JSON.stringify(pinned))
        stale.push({
          block: entry.block,
          axis: "catalog_entry_fields",
          detail:
            `the published catalog entry's key set moved: pinned [${pinned.join(", ")}], actual ` +
            `[${actual.join(", ")}]. If the new key carries a COST this entry is false; if it ` +
            `does not, re-pin the set. The whole set is pinned on purpose — no list of forbidden ` +
            `names can guess what a cost field will be called.`,
        });
    }
  }
  return stale;
};

/** Every axis, so §A can prove none of them has gone inert (`24-F14`). */
const AXES = [
  "unemittable_types",
  "emittable_types",
  "absent_line_states",
  "catalog_entry_fields",
] as const;

const axisSize = (entry: Omission, axis: (typeof AXES)[number]): number =>
  entry.premise[axis].length;

// ── §A · the table itself ──────────────────────────────────────────────────────────────────────

describe("§A · every entry declares a premise, and every axis is live (24-F14)", () => {
  it("the table is not empty — an empty OMISSIONS proves nothing and renders nothing", () => {
    expect(OMISSIONS.length).toBeGreaterThan(0);
  });

  it("no entry has a vacuous premise — a premise with nothing in it checks nothing", () => {
    const vacuous = OMISSIONS.filter((entry) =>
      AXES.every((axis) => axisSize(entry, axis) === 0),
    ).map((entry) => entry.block);
    expect(vacuous).toEqual([]);
  });

  it("every axis is exercised by at least one entry, so none can go inert behind the others", () => {
    // Without this, deleting the one entry that uses an axis leaves the checker green while a
    // whole class of drift stops being watched. `seams:check` asserts its own empty-match per
    // scope half for exactly this reason.
    const unused = AXES.filter((axis) => OMISSIONS.every((entry) => axisSize(entry, axis) === 0));
    expect(unused).toEqual([]);
  });

  it("every entry names an FR or decision id — Commandment 2", () => {
    for (const entry of OMISSIONS) {
      expect(entry.fr).toMatch(/^(\d{2}-F\d+[a-z]?|DEC-[A-Z]+-\d+)$/);
      expect(entry.block.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });
});

// ── §B · the premises hold against the tree as it is ───────────────────────────────────────────

describe("§B · every premise holds against the real registry, states and catalog", () => {
  it("no entry is stale", () => {
    // The failure message is the whole value of this assertion: it names the block, the axis and
    // what to do, so the next reader corrects the SENTENCE rather than silencing the test.
    expect(stalePremises(OMISSIONS, REAL)).toEqual([]);
  });

  it("the world it checks against is real, not an empty stub (24-F14)", () => {
    // A `hasPayloadSchema` that answered `false` to everything would make every `unemittable_types`
    // clause pass vacuously, which is this repo's most-repeated test defect.
    expect(REAL.hasPayloadSchema("order.settlement_closed")).toBe(true);
    expect(REAL.hasPayloadSchema("not.an.event.type")).toBe(false);
    expect(REAL.lineStates.length).toBeGreaterThan(0);
    expect(REAL.catalogEntryFields.length).toBeGreaterThan(0);
  });

  it("01-F30's executable form still carries no comp or discount term (DEC-MONEY-010)", () => {
    // A TYPE-level assertion, because `SettledConservationArgs` is a type and no runtime value can
    // see its keys. `tsc --noEmit` covers `services/*/src`, so this fails `pnpm verify` — not this
    // suite — the day a fourth term is added. That is the one clause of the comps/discounts entry
    // no runtime world can express, and it is the clause `DEC-MONEY-010`'s gate turns on.
    type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const TERMS = ["billed_paisa", "tendered_paisa", "refunded_paisa"] as const;
    const stillThreeTerms: Exact<keyof SettledConservationArgs, (typeof TERMS)[number]> = true;
    expect(stillThreeTerms).toBe(true);
  });
});

// ── §C · the mutation matrix — proof that §B would actually bite ───────────────────────────────

/** A world differing from `REAL` in exactly one respect. One branch, so attribution is real. */
const worldWithSchema = (extra: string): World => ({
  ...REAL,
  hasPayloadSchema: (type) => type === extra || REAL.hasPayloadSchema(type),
});
const worldWithoutSchema = (missing: string): World => ({
  ...REAL,
  hasPayloadSchema: (type) => type !== missing && REAL.hasPayloadSchema(type),
});

const blocksNamed = (stale: readonly Stale[]): readonly string[] => [
  ...new Set(stale.map((row) => row.block)),
];

describe("§C · mutation — each premise kills the change it claims to own", () => {
  it("alert.raised gaining a schema reddens the exception-alerts entry", () => {
    const stale = stalePremises(OMISSIONS, worldWithSchema("alert.raised"));
    expect(blocksNamed(stale)).toEqual(["What's odd (exception alerts)"]);
    expect(stale[0]?.axis).toBe("unemittable_types");
  });

  it("eta.estimates_published gaining a schema reddens the prep-time entry", () => {
    expect(
      blocksNamed(stalePremises(OMISSIONS, worldWithSchema("eta.estimates_published"))),
    ).toEqual(["Prep-time and ETA figures"]);
  });

  it("tip.paid_out gaining a schema reddens the tips entry", () => {
    expect(blocksNamed(stalePremises(OMISSIONS, worldWithSchema("tip.paid_out")))).toEqual([
      "Tips",
    ]);
  });

  it("table.state_changed gaining a schema reddens the open-tables entry", () => {
    expect(blocksNamed(stalePremises(OMISSIONS, worldWithSchema("table.state_changed")))).toEqual([
      "Open orders and open tables (the live view)",
    ]);
  });

  it("stock.wastage_recorded gaining a schema reddens the purchases-and-wastage entry", () => {
    expect(
      blocksNamed(stalePremises(OMISSIONS, worldWithSchema("stock.wastage_recorded"))),
    ).toEqual(["Purchases and wastage logged"]);
  });

  it("stock.count_recorded reddens BOTH entries that depend on it, and only those two", () => {
    // 13-F10's detector count and 12-F10's purchases block rest on the same absent type. A mutant
    // that reddened only one would mean the other's clause was never really checked.
    expect(blocksNamed(stalePremises(OMISSIONS, worldWithSchema("stock.count_recorded")))).toEqual([
      "Purchases and wastage logged",
      "What's odd (exception alerts)",
    ]);
  });

  it("stock.movement_recorded reddens the margin entry too", () => {
    expect(
      blocksNamed(stalePremises(OMISSIONS, worldWithSchema("stock.movement_recorded"))),
    ).toEqual(["Purchases and wastage logged", "Estimated gross margin"]);
  });

  it("comp.recorded LOSING its schema reddens the netting entry — the other direction", () => {
    // The entry tells an owner comps ARE reported. If they stopped being emittable it would be
    // overstating the product, which is the failure the original entry made in reverse.
    const stale = stalePremises(OMISSIONS, worldWithoutSchema("comp.recorded"));
    expect(blocksNamed(stale)).toEqual([
      "Comps and discounts NETTED OUT of the day's takings",
      "What's odd (exception alerts)",
    ]);
    expect(stale.every((row) => row.axis === "emittable_types")).toBe(true);
  });

  it("order.line_state_changed losing its schema reddens the prep-time sample claim", () => {
    const stale = stalePremises(OMISSIONS, worldWithoutSchema("order.line_state_changed"));
    expect(blocksNamed(stale)).toEqual(["Prep-time and ETA figures"]);
    expect(stale[0]?.axis).toBe("emittable_types");
  });

  it("a `comped` line state appearing in 01 §4 reddens the netting entry", () => {
    const stale = stalePremises(OMISSIONS, {
      ...REAL,
      lineStates: [...ORDER_LINE_STATES, "comped"],
    });
    expect(blocksNamed(stale)).toEqual(["Comps and discounts NETTED OUT of the day's takings"]);
    expect(stale[0]?.axis).toBe("absent_line_states");
  });

  it("a cost field on the catalog entry reddens the margin entry", () => {
    const stale = stalePremises(OMISSIONS, {
      ...REAL,
      catalogEntryFields: [...REAL.catalogEntryFields, "unit_cost_paisa"],
    });
    expect(blocksNamed(stale)).toEqual(["Estimated gross margin"]);
    expect(stale[0]?.axis).toBe("catalog_entry_fields");
  });

  it("a field NAME nobody could have guessed still reddens it — the reason the set is pinned", () => {
    const stale = stalePremises(OMISSIONS, {
      ...REAL,
      catalogEntryFields: [...REAL.catalogEntryFields, "bom"],
    });
    expect(blocksNamed(stale)).toEqual(["Estimated gross margin"]);
  });

  it("an entry losing its premise is caught by §A, not silently by §B", () => {
    const gutted: readonly Omission[] = OMISSIONS.map((entry) => ({
      ...entry,
      premise: {
        unemittable_types: [],
        emittable_types: [],
        absent_line_states: [],
        catalog_entry_fields: [],
      },
    }));
    // §B goes green on a gutted table — which is exactly why §A exists and why it asserts
    // non-vacuity per entry AND per axis.
    expect(stalePremises(gutted, REAL)).toEqual([]);
    expect(gutted.every((entry) => AXES.every((axis) => axisSize(entry, axis) === 0))).toBe(true);
  });

  // ── the negative control ─────────────────────────────────────────────────────────────────────

  it("NEGATIVE CONTROL — a change no entry depends on kills nothing", () => {
    // `order.merged` is `01 §4` vocabulary with no schema (26 §7 measured it as one of the three
    // still schema-less) and no entry above rests on it. If this reddened, the checker would be
    // reacting to the SHAPE of a mutation rather than to its content, and every kill in §C would
    // prove nothing about attribution.
    expect(stalePremises(OMISSIONS, worldWithSchema("order.merged"))).toEqual([]);
    expect(stalePremises(OMISSIONS, worldWithSchema("payment.split_recorded"))).toEqual([]);
    expect(stalePremises(OMISSIONS, worldWithoutSchema("customer.created"))).toEqual([]);
    expect(
      stalePremises(OMISSIONS, { ...REAL, lineStates: [...ORDER_LINE_STATES, "reheating"] }),
    ).toEqual([]);
  });
});
