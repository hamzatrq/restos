/**
 * **`14-F29` + `01-F60` — the completeness rule, at the editor.**
 *
 * `publishCatalog` refuses an incomplete entry at the writer and `services/api`'s `assertSavable`
 * refuses it at the save. This suite is about the third refusal, the one `14-F29` asks for *"here,
 * because this editor is where an owner meets it"* — and about the distinction the whole design
 * turns on: **an empty cell and a `0` are different facts.**
 *
 * The fixture is a five-branch, five-channel org on purpose. `14-F29` names 25 cells as the case
 * that makes fill-across mandatory, and a 1×1 fixture cannot tell a fill-across from an assignment.
 */

import type { OrderChannel } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { isWholeRupees, rupeeTextFromPaisa } from "../lib/money";
import {
  cellKey,
  cellsOf,
  draftFromPrices,
  type EnabledPairs,
  emptyDraft,
  fillAcross,
  type GridDraft,
  needsPrices,
  resolveGrid,
  SELLABLE_KINDS,
} from "../lib/price-grid";

const FIVE: EnabledPairs = {
  branches: ["gulberg", "dha", "johar", "model", "cantt"],
  channels: ["counter", "phone", "storefront", "whatsapp", "foodpanda"],
};

const ONE: EnabledPairs = { branches: ["gulberg"], channels: ["counter"] };

const cellText = (price_paisa: number): string | null =>
  isWholeRupees(price_paisa) ? rupeeTextFromPaisa(price_paisa) : null;

describe("14-F29 — the grid's shape", () => {
  it("is a row per branch and a column per enabled channel", () => {
    expect(cellsOf(FIVE)).toHaveLength(25);
    expect(Object.keys(emptyDraft(FIVE))).toHaveLength(25);
  });

  it("keys every cell so two branch ids cannot collide", () => {
    // The separator is NUL, as the API and the gateway both join it. A separator that can occur
    // inside an id would let two branches share a cell, and an unpriced pair would read as present.
    const keys = new Set(
      cellsOf({ branches: ["x", "x y", "x  y"], channels: ["counter"] }).map((pair) =>
        cellKey(pair.branch_id, pair.channel),
      ),
    );
    expect(keys.size).toBe(3);
  });
});

describe("14-F29 — fill-across is what makes 25 cells usable", () => {
  it("sets every one of the 25 cells from one number", () => {
    const filled = fillAcross(FIVE, "450");
    expect(Object.keys(filled)).toHaveLength(25);
    for (const pair of cellsOf(FIVE)) {
      expect(filled[cellKey(pair.branch_id, pair.channel)]).toBe("450");
    }
  });

  it("overwrites cells that already carry a value", () => {
    // A fill that spared typed cells would make the button's effect depend on invisible history,
    // so pressing it twice would do different things. Overrides are typed ON TOP of the fill.
    const typed: GridDraft = { ...fillAcross(FIVE, "450"), [cellKey("dha", "foodpanda")]: "520" };
    const refilled = fillAcross(FIVE, "300");
    expect(typed[cellKey("dha", "foodpanda")]).toBe("520");
    expect(refilled[cellKey("dha", "foodpanda")]).toBe("300");
  });

  it("survives an override typed on top", () => {
    const draft: GridDraft = { ...fillAcross(FIVE, "450"), [cellKey("dha", "foodpanda")]: "520" };
    const resolved = resolveGrid(FIVE, draft);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const uplift = resolved.prices.find(
      (price) => price.branch_id === "dha" && price.channel === "foodpanda",
    );
    expect(uplift?.price_paisa).toBe(52000);
    expect(resolved.prices).toHaveLength(25);
  });
});

describe("01-F60 — every enabled pair is priced, and there is no fallback", () => {
  it("refuses a grid with one enabled pair unpriced", () => {
    const draft: GridDraft = { ...fillAcross(FIVE, "450"), [cellKey("cantt", "foodpanda")]: "" };
    const resolved = resolveGrid(FIVE, draft);
    expect(resolved.ok).toBe(false);
  });

  it("names the branch and the channel it refused for", () => {
    // `01-F60`'s refusal is REQUIRED to name the entry, the branch and the channel. A refusal that
    // only says "incomplete" leaves an owner hunting 25 cells for the one she missed.
    const draft: GridDraft = { ...fillAcross(FIVE, "450"), [cellKey("cantt", "foodpanda")]: "" };
    const resolved = resolveGrid(FIVE, draft);
    if (resolved.ok) throw new Error("expected a refusal");
    expect(resolved.faults).toHaveLength(1);
    expect(resolved.faults[0]?.branch_id).toBe("cantt");
    expect(resolved.faults[0]?.channel).toBe("foodpanda");
  });

  it("reports every bad cell at once, not the first", () => {
    const draft: GridDraft = {
      ...fillAcross(FIVE, "450"),
      [cellKey("cantt", "foodpanda")]: "",
      [cellKey("dha", "whatsapp")]: "",
      [cellKey("model", "phone")]: "12.5",
    };
    const resolved = resolveGrid(FIVE, draft);
    if (resolved.ok) throw new Error("expected a refusal");
    expect(resolved.faults).toHaveLength(3);
  });

  it("refuses a cell that is missing from the draft entirely", () => {
    // "the key was never written" and "the owner cleared it" must resolve identically. An
    // implementation iterating the DRAFT rather than the enabled set passes everything else here
    // and lets a whole missing row through.
    const { [cellKey("cantt", "foodpanda")]: _dropped, ...partial } = fillAcross(FIVE, "450");
    const resolved = resolveGrid(FIVE, partial);
    if (resolved.ok) throw new Error("expected a refusal");
    expect(resolved.faults[0]?.branch_id).toBe("cantt");
  });

  it("ignores a price for a pair that is no longer enabled", () => {
    const draft: GridDraft = {
      ...fillAcross(FIVE, "450"),
      [cellKey("closed-branch", "counter")]: "9",
    };
    const resolved = resolveGrid(FIVE, draft);
    if (!resolved.ok) throw new Error("expected acceptance");
    expect(resolved.prices).toHaveLength(25);
    expect(resolved.prices.some((price) => price.branch_id === "closed-branch")).toBe(false);
  });
});

describe("01-F60 — a free item carries an explicit 0 on every pair", () => {
  it("accepts a grid of zeroes and emits 25 zero prices", () => {
    // THE free-modifier case. `if (!text)` refuses this outright; `if (!price_paisa)` reports it as
    // missing. Both mutants die here and nowhere else in this file.
    const resolved = resolveGrid(FIVE, fillAcross(FIVE, "0"));
    if (!resolved.ok)
      throw new Error(`expected acceptance, got ${JSON.stringify(resolved.faults)}`);
    expect(resolved.prices).toHaveLength(25);
    expect(resolved.prices.every((price) => price.price_paisa === 0)).toBe(true);
  });

  it("accepts a single zero cell inside a priced grid", () => {
    const draft: GridDraft = { ...fillAcross(FIVE, "450"), [cellKey("dha", "counter")]: "0" };
    const resolved = resolveGrid(FIVE, draft);
    if (!resolved.ok) throw new Error("expected acceptance");
    const free = resolved.prices.find(
      (price) => price.branch_id === "dha" && price.channel === "counter",
    );
    expect(free?.price_paisa).toBe(0);
  });

  it("distinguishes a zero from an omission on the SAME grid", () => {
    // The control pair: one cell `0`, one cell empty. An implementation that conflates them either
    // accepts both (and ships a forgotten channel as free) or refuses both (and bans a free
    // add-on). Only an implementation that keeps them apart passes this single assertion.
    const draft: GridDraft = {
      ...fillAcross(FIVE, "450"),
      [cellKey("dha", "counter")]: "0",
      [cellKey("dha", "foodpanda")]: "",
    };
    const resolved = resolveGrid(FIVE, draft);
    if (resolved.ok) throw new Error("expected a refusal for the EMPTY cell");
    expect(resolved.faults).toHaveLength(1);
    expect(resolved.faults[0]?.channel).toBe("foodpanda");
  });
});

describe("01-F60 — an empty enabled set is refused, never treated as complete", () => {
  it("refuses when no branch is enabled", () => {
    // An empty cross product makes EVERY entry vacuously complete — the same hole the founder
    // closed by making the enabled set a required input, arrived at from the other side.
    expect(resolveGrid({ branches: [], channels: ["counter"] }, {}).ok).toBe(false);
  });

  it("refuses when no channel is enabled", () => {
    expect(resolveGrid({ branches: ["gulberg"], channels: [] }, {}).ok).toBe(false);
  });

  it("refuses even when the draft is full of valid prices", () => {
    const resolved = resolveGrid({ branches: [], channels: [] }, fillAcross(ONE, "450"));
    expect(resolved.ok).toBe(false);
  });
});

describe("prefill from an entry that already has prices", () => {
  it("fills the cells that exist", () => {
    const draft = draftFromPrices(
      ONE,
      [{ branch_id: "gulberg", channel: "counter" as OrderChannel, price_paisa: 45000 }],
      cellText,
    );
    expect(draft[cellKey("gulberg", "counter")]).toBe("450");
  });

  it("leaves a pair the entry does not price EMPTY, so it refuses on save", () => {
    const draft = draftFromPrices(
      FIVE,
      [{ branch_id: "gulberg", channel: "counter" as OrderChannel, price_paisa: 45000 }],
      cellText,
    );
    expect(draft[cellKey("dha", "foodpanda")]).toBe("");
    expect(resolveGrid(FIVE, draft).ok).toBe(false);
  });

  it("drops a price for a branch that is no longer enabled", () => {
    const draft = draftFromPrices(
      ONE,
      [{ branch_id: "closed", channel: "counter" as OrderChannel, price_paisa: 45000 }],
      cellText,
    );
    expect(Object.keys(draft)).toHaveLength(1);
    expect(draft[cellKey("gulberg", "counter")]).toBe("");
  });

  it("leaves a sub-rupee price EMPTY rather than showing a truncated number", () => {
    // 45050 paisa cannot round-trip through whole rupees. Rendering `450` and saving it back is a
    // five-rupee cut nobody typed, and `01-F53` freezes it. An empty cell is visible; that is not.
    const draft = draftFromPrices(
      ONE,
      [{ branch_id: "gulberg", channel: "counter" as OrderChannel, price_paisa: 45050 }],
      cellText,
    );
    expect(draft[cellKey("gulberg", "counter")]).toBe("");
  });

  it("prefills a free item as 0, not as empty", () => {
    const draft = draftFromPrices(
      ONE,
      [{ branch_id: "gulberg", channel: "counter" as OrderChannel, price_paisa: 0 }],
      cellText,
    );
    expect(draft[cellKey("gulberg", "counter")]).toBe("0");
    expect(resolveGrid(ONE, draft).ok).toBe(true);
  });
});

describe("01-F60 — which kinds a price is required on", () => {
  it("includes modifier (founder ruling, July 2026)", () => {
    // A paid add-on carries the same commission exposure as the dish it sits on. This is the
    // ruling that closed the July gap; a suite still encoding the old rule would fail a correct
    // implementation, which is the failure AGENTS.md keeps as a worked example.
    expect(SELLABLE_KINDS).toContain("modifier");
    expect(needsPrices("modifier", false)).toBe(true);
  });

  it("includes item and variant", () => {
    expect(needsPrices("item", false)).toBe(true);
    expect(needsPrices("variant", false)).toBe(true);
  });

  it("excludes a category and a modifier group, which nothing prices", () => {
    expect(needsPrices("category", false)).toBe(false);
    expect(needsPrices("modifier_group", false)).toBe(false);
  });

  it("exempts a tombstone", () => {
    // `01-F55` keeps an archived entry resolvable for display and off the sellable grid. Requiring
    // a price on it would make archiving impossible the moment a new channel is enabled.
    expect(needsPrices("item", true)).toBe(false);
  });
});
