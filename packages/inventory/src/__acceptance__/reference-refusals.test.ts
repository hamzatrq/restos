/**
 * `10-F31` / `10-F29` / `10-F32` — the refusals a WRITER owes, and the ones it must NOT invent.
 *
 * **Every one of these is enforced where the owner types, never where the report is read.** That is
 * `14-F29`/`01-F60` precedent, and it is what makes slice 1's variance report complete by
 * construction rather than by a floor on every row (`10-F31`'s own note). A report that repaired an
 * incomplete reference set would be guessing, and R5 forbids exactly the guesses it would make.
 *
 * ⚠ **§D is the section to read before "adding the missing setting".** `10-F32` and `10-F33` (e)
 * both refuse a control the market ships, with a reason, and a refusal with no test is a decision
 * the next session reverses without noticing.
 */

import { describe, expect, it } from "vitest";
import { BANNED_VARIANCE_WORDS } from "../noise.js";
import { type ReferenceData, referenceRefusals } from "../reference.js";
import { item } from "./fixtures.js";

const KG = 1_000_000;

const base = (over: Partial<ReferenceData> = {}): ReferenceData => ({
  items: [item({ item_id: "chicken" })],
  areas: [],
  recipes: [],
  menu_recipes: [],
  ...over,
});

const codes = (refs: ReferenceData) => referenceRefusals(refs).map((r) => r.code);

// ── §A · 10-F31's two writer-side invariants ───────────────────────────────────────────────────

describe("§A · 10-F31 — is_counted ⇒ is_costed, and every published leaf is costed", () => {
  it("a COUNTED item that is not COSTED is refused at save", () => {
    // This is what makes the variance report's PKR column complete by construction. Without it a
    // counted item could produce a quantity gap with no money beside it, and R3 would then have to
    // render a floor on every row for ever.
    const refusals = referenceRefusals(
      base({ items: [item({ item_id: "chicken", is_counted: true, is_costed: false })] }),
    );
    expect(refusals.map((r) => r.code)).toEqual(["counted_not_costed"]);
    expect(refusals[0]?.fr).toBe("10-F31");
    expect(refusals[0]?.subject).toBe("chicken");
  });

  it("a COSTED item that is not COUNTED is FINE — that asymmetry is the whole ruling", () => {
    // Appendix D's discipline survives on the COUNT and is lifted off the COST. Salt is costed and
    // never counted, and refusing that would be the collision `10-F31` exists to resolve.
    expect(
      codes(base({ items: [item({ item_id: "salt", is_counted: false, is_costed: true })] })),
    ).toEqual([]);
  });

  it("an uncosted LEAF of a PUBLISHED recipe is refused, and named", () => {
    const refs = base({
      items: [
        item({ item_id: "chicken" }),
        item({ item_id: "salt", is_counted: false, is_costed: false }),
      ],
      recipes: [
        {
          recipe_id: "boti",
          version: 1,
          yield_qty_base: null,
          produces_item_id: null,
          lines: [
            { line_no: 0, component: { kind: "item", id: "chicken" }, qty: 250_000 },
            { line_no: 1, component: { kind: "item", id: "salt" }, qty: 2_000 },
          ],
        },
      ],
      menu_recipes: [{ sellable_kind: "menu_item", sellable_id: "boti", recipe_id: "boti" }],
    });
    const refusals = referenceRefusals(refs);
    expect(refusals.map((r) => r.code)).toEqual(["recipe_leaf_not_costed"]);
    expect(refusals[0]?.subject).toBe("salt");
  });

  it("an UNPUBLISHED recipe's uncosted leaf is NOT refused — the gate is on what is sold", () => {
    // A draft recipe with a hole is a work in progress. Refusing it would make the editor unusable
    // and would refuse the very state the ramp passes through.
    const refs = base({
      items: [item({ item_id: "salt", is_counted: false, is_costed: false })],
      recipes: [
        {
          recipe_id: "draft",
          version: 1,
          yield_qty_base: null,
          produces_item_id: null,
          lines: [{ line_no: 0, component: { kind: "item", id: "salt" }, qty: 1 }],
        },
      ],
    });
    expect(codes(refs)).toEqual([]);
  });
});

// ── §B · cycles, refused at the writer and never in the fold ───────────────────────────────────

describe("§B · 10-F31 — a recipe cycle is refused at SAVE, and the refusal names the cycle", () => {
  const cyclic = (): ReferenceData =>
    base({
      recipes: [
        {
          recipe_id: "dynamite",
          version: 1,
          yield_qty_base: KG,
          produces_item_id: null,
          lines: [{ line_no: 0, component: { kind: "recipe", id: "mayo" }, qty: 100 }],
        },
        {
          recipe_id: "mayo",
          version: 1,
          yield_qty_base: KG,
          produces_item_id: null,
          lines: [{ line_no: 0, component: { kind: "recipe", id: "dynamite" }, qty: 100 }],
        },
      ],
    });

  it("dynamite sauce → mayo → dynamite sauce is refused", () => {
    // No product in the survey documents a nesting limit, and none documents a cycle check either.
    // Refusing at the writer is what stops the fold having to choose between hanging and
    // truncating at an invented depth.
    const refusals = referenceRefusals(cyclic()).filter((r) => r.code === "recipe_cycle");
    expect(refusals.length).toBeGreaterThan(0);
    expect(refusals[0]?.detail).toContain("→");
  });

  it("a SELF-referencing recipe is refused too", () => {
    const refs = base({
      recipes: [
        {
          recipe_id: "self",
          version: 1,
          yield_qty_base: KG,
          produces_item_id: null,
          lines: [{ line_no: 0, component: { kind: "recipe", id: "self" }, qty: 1 }],
        },
      ],
    });
    expect(codes(refs)).toContain("recipe_cycle");
  });

  it("DEEP nesting without a cycle is legal — the rule is acyclicity, not a depth limit", () => {
    // "A recipe can be used as an ingredient on any other recipe" is unanimous in the survey, and a
    // depth cap would be an invented policy (commandment 2).
    const chain = Array.from({ length: 12 }, (_, i) => ({
      recipe_id: `r${i}`,
      version: 1,
      yield_qty_base: KG,
      produces_item_id: null,
      lines:
        i === 11
          ? [{ line_no: 0, component: { kind: "item" as const, id: "chicken" }, qty: 10 }]
          : [{ line_no: 0, component: { kind: "recipe" as const, id: `r${i + 1}` }, qty: 10 }],
    }));
    expect(codes(base({ recipes: chain }))).toEqual([]);
  });

  it("a missing component is a DIFFERENT refusal from a cycle", () => {
    const refs = base({
      recipes: [
        {
          recipe_id: "boti",
          version: 1,
          yield_qty_base: null,
          produces_item_id: null,
          lines: [{ line_no: 0, component: { kind: "item", id: "ghost" }, qty: 1 }],
        },
      ],
    });
    expect(codes(refs)).toEqual(["recipe_component_missing"]);
  });
});

// ── §C · 10-F29's weight-tier dimension rule ───────────────────────────────────────────────────

describe("§C · 10-F29 — the weight tier is legal only in the item's own dimension", () => {
  const withTier = (base_unit: "mg" | "ml", unit: "mg" | "ml") =>
    referenceRefusals(
      base({
        items: [
          item({
            item_id: "soy",
            base_unit,
            count_units: {
              primary_label: "bottle",
              primary_size_base: KG,
              partial: { kind: "weight", unit },
              // biome-ignore lint/suspicious/noExplicitAny: narrow cast for a fixture axis.
            } as any,
          }),
        ],
      }),
    ).map((r) => r.code);

  it("⚠ THE FOUNDER'S SOY SAUCE: held in ml and weighed is REFUSED", () => {
    // Weighing a bottle held in `ml` needs a density, and assuming 1 L = 1 kg is exactly the fudge
    // §2 rejects Apicbase for. The item is either held in mass — a kitchen weighs it and nothing
    // else changes — or it is counted by tenths. It is not both.
    expect(withTier("ml", "mg")).toEqual(["weight_tier_dimension"]);
  });

  it("held in mg and weighed is FINE", () => {
    expect(withTier("mg", "mg")).toEqual([]);
  });

  it("the FRACTION tier carries no unit and is always legal — that is the escape hatch", () => {
    const refs = base({
      items: [
        item({
          item_id: "soy",
          base_unit: "ml",
          count_units: {
            primary_label: "bottle",
            primary_size_base: KG,
            partial: { kind: "fraction" },
          },
        }),
      ],
    });
    expect(codes(refs)).toEqual([]);
  });

  it("a reference cost over ZERO quantity is refused — a pair with no rate", () => {
    const refs = base({
      items: [item({ item_id: "salt", reference_cost: { value_paisa: 6_000, qty_base: 0 } })],
    });
    expect(codes(refs)).toEqual(["reference_cost_zero_qty"]);
  });
});

// ── §D · what is refused to EXIST, and must stay refused ───────────────────────────────────────

describe("§D · 10-F32 / 10-F33 (e) — the controls this module refuses to ship", () => {
  it("there is NO shrink or yield percentage on a raw item, at any layer", () => {
    // `10-F32`: loss on a marinade is a property of the process on the night, not of the goat — and
    // a shrink percentage is a guess that enters a ledger and comes out looking like a measurement.
    // A field-name assertion because that is what a later session would add.
    const shape = Object.keys(item({ item_id: "chicken" }));
    expect(shape).not.toContain("shrink_pct");
    expect(shape).not.toContain("shrink_bp");
    expect(shape).not.toContain("yield_pct");
    expect(shape).not.toContain("waste_factor");
  });

  it("there is NO settable percentage variance tolerance anywhere in the reference model", () => {
    // `10-F33` (e): every vendor threshold is per category or per site and is a number a human
    // guesses once — wrong in unit, wrong in grain and wrong in basis. The floor replaces its
    // filtering, PKR ranking its prioritisation, the sustained run its alerting.
    const shape = Object.keys(item({ item_id: "chicken" }));
    expect(shape).not.toContain("variance_tolerance_pct");
    expect(shape).not.toContain("acceptable_variance_bp");
  });

  it("the banned vocabulary does not appear in any refusal message this module produces", () => {
    // `10-F33` (f) binds the whole module and not only the hints: a refusal is prose an owner reads.
    const everything = referenceRefusals({
      items: [item({ item_id: "chicken", is_counted: true, is_costed: false })],
      areas: [],
      recipes: [
        {
          recipe_id: "self",
          version: 1,
          yield_qty_base: KG,
          produces_item_id: null,
          lines: [{ line_no: 0, component: { kind: "recipe", id: "self" }, qty: 1 }],
        },
      ],
      menu_recipes: [{ sellable_kind: "menu_item", sellable_id: "x", recipe_id: "ghost" }],
    });
    expect(everything.length).toBeGreaterThan(2);
    for (const refusal of everything) {
      const words = refusal.detail.toLowerCase().split(/[^a-z]+/);
      for (const banned of BANNED_VARIANCE_WORDS) {
        expect(words, `refusal ${refusal.code}`).not.toContain(banned);
      }
    }
  });

  it("every refusal cites an FR that could be grepped — commandment 2", () => {
    const everything = referenceRefusals({
      items: [item({ item_id: "chicken", is_counted: true, is_costed: false })],
      areas: [],
      recipes: [],
      menu_recipes: [],
    });
    for (const refusal of everything) expect(refusal.fr).toMatch(/^10-F\d+$/);
  });
});
