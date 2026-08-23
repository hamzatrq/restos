/**
 * ACCEPTANCE TESTS — **the cart's MONEY column and its off-bill word** (`27-F24`, `27-F12`).
 *
 * Written alongside the implementation under `20 §4.3`'s R66 amendment — *"the separation rule is
 * TIERED BY PATH … everywhere else the implementing session may write its own acceptance tests
 * provided it mutation-proves them"*. `packages/ui` is not a `20 §4.4` protected path and nothing
 * here computes money; the mutation matrix is in the session report.
 *
 * ## The defect this file exists to keep closed, measured on a real Electron till at 1366×768
 *
 * The cart rendered `1 Chicken Biryani  ✕ NO`. **No money on any row**, and the only figure on the
 * surface was `TOTAL Rs 989`. After a void, the cart row was **byte-identical to the three live
 * rows** — same name, same quantity, same removal control — and the only evidence anything had
 * happened was the total moving 1,059 → 989. So a cashier who voided the wrong dish could not see
 * that she had, and could not check what came off; under `01-F1` a wrong void is permanent.
 *
 * All 437 tests in this package and all 1305 in `apps/pos-electron` were green throughout.
 *
 * ## §0 — PINNED INTERPRETATIONS (`24 §3b`)
 *
 * **M1 — the line total is REQUIRED, not optional.** `shared/ipc.ts` makes the same call for
 * `billed_paisa` one seam over and gives the reason: *"an optional money field is a number a host
 * can decline to say while the screen goes on treating its absence as a value."* The named simpler
 * alternative is `billedPaisa?: Paisa` with a hidden row when absent; it is refused because it
 * re-admits the exact shipped defect the moment one caller forgets, and because the two callers
 * that were forgetting it (`Counter.tsx`, this package's own stories) are the entire population.
 *
 * **M2 — an off-bill line is carried by a WORD, and the word is not optional beside the fill.**
 * `27-F12`: *"a lone `-` is one glyph wide, is the first thing lost at 1–2 m or on a scratched
 * panel, and means nothing to a non-reader."* A strike-through and a grey fill are the same
 * argument in different marks, so neither may carry it alone. The prop is therefore ONE optional
 * string rather than a boolean beside a word: half-supplying it is unrepresentable.
 *
 * **M3 — the fill is `Tile`'s `unavailable` treatment, not a new one.** A cashier meets a voided
 * dish on `LineCorrection`'s picker as `1 × Raita / Rs 0 / already voided`, which is a `Tile` with
 * `unavailable`. Inventing a second look for one fact is `03-F40`'s two sensor bit layouts wearing
 * a cart row. The named alternative — `27-F14`'s red, whose table does list *"void & refund
 * actions"* — is refused because red on this surface already means `03-F5`'s print alarm and the
 * removal control, and because the word discharges `27-F12` without spending the budget.
 *
 * **M4 — `27-F16` binds: the money is NOT coloured, on a voided row either.** `Rs 0` is the
 * EXPECTED figure for an exited line, and colour on a number means *this number is abnormal*.
 *
 * ## What this file deliberately does NOT assert
 *
 * - **That the money is on the screen.** happy-dom performs no layout — every
 *   `getBoundingClientRect` is zeroes — so this file can say *"the figure is in the document, in
 *   its own element, with the right glyphs"* and never *"it fits the cart column"*. Adding a money
 *   column made every cart row wider inside a fixed column; `pnpm layout:check` owns that in Blink
 *   and this repo's nine layout defects were all found there or by launching, none here.
 * - **Which `01 §4` states are exits.** That is the counter's reading of the kernel's vocabulary
 *   and lives in `Counter.tsx`'s `offBillWord`, asserted by `apps/pos-electron`'s
 *   `cart-money.dom.test.tsx`. This component takes a word and renders it.
 * - **The arithmetic.** No sum is computed here or in the component; both figures arrive finished
 *   from the fold (`27-F24`, `26 §8`).
 */

import { paisa } from "@restos/domain";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme";
import { Cart } from "./Cart";
import { Tile } from "./Tile";

afterEach(cleanup);

/**
 * ⚠ **COLOUR IS ASSERTED AGAINST THE SHIPPED SIBLING, NEVER AGAINST A TOKEN LITERAL.**
 *
 * Importing the static `color` record is the bypass `discipline.test.ts` bans in components and it
 * is wrong HERE for the same reason it is wrong there: that record is the light palette only, so an
 * assertion built on it makes a claim about one polarity while `27-F67` makes the training
 * inversion TOTAL. It also asserts the weaker thing. M3's claim is not *"this hex"*, it is *"the
 * cart reached for the pairing `Tile`'s `unavailable` state already ships"* — the look a cashier
 * has already met on `LineCorrection`'s picker — so the honest oracle is a `Tile` rendered under
 * the same provider and read back. A palette change moves both together and nothing here reds.
 */
const tileStyle = (
  props: Partial<Parameters<typeof Tile>[0]> = {},
): { background: string; color: string; border: string } => {
  const { unmount, container } = render(
    <ThemeProvider>
      <Tile posture="counter" label="reference" {...props} />
    </ThemeProvider>,
  );
  const { style } = container.querySelector("button") as HTMLElement;
  // Read the three properties BEFORE unmounting and copy them by name: a `CSSStyleDeclaration`
  // spreads to an empty object, so `{...style}` silently yields `undefined` for every property —
  // an assertion that then compares `undefined` to `undefined` and passes on any implementation.
  const values = { background: style.background, color: style.color, border: style.border };
  unmount();
  return values;
};

const KARAHI = 45_000;
const NAAN = 6_000;
const COKE = 12_000;

/** Three lines, one of them voided — the shape the real till was in when the defect was found. */
const mount = (over: Partial<Parameters<typeof Cart>[0]> = {}) =>
  render(
    <ThemeProvider>
      <Cart
        lines={[
          { id: "line-1", name: "Mutton Karahi", quantity: 1, billedPaisa: paisa(KARAHI) },
          { id: "line-2", name: "Naan", quantity: 4, billedPaisa: paisa(NAAN) },
          { id: "line-3", name: "Coke", quantity: 2, billedPaisa: paisa(COKE) },
        ]}
        totalPaisa={paisa(KARAHI + NAAN + COKE)}
        onRemove={() => {}}
        {...over}
      />
    </ThemeProvider>,
  );

/** The whole row a dish sits in — the item, its money, and its removal control. */
const rowFor = (dish: string): HTMLElement => {
  const name = screen.getByText(dish);
  let node: HTMLElement | null = name;
  // Walk to the direct child of the cart `section`, which IS the row (the component's own shape).
  while (node?.parentElement && node.parentElement.tagName !== "SECTION") node = node.parentElement;
  expect(node, `no cart row contains ${dish}`).toBeTruthy();
  return node as HTMLElement;
};

/**
 * The box that carries the off-bill treatment: the row's first child, holding the item and its
 * money and nothing else (the removal control is the row's second child, `27-F9`).
 *
 * ⚠ **Anchored structurally rather than by walking `parentElement` up from the dish name, and the
 * first draft of this file did the latter and was VACUOUS.** Three hops from the name lands on the
 * inner wrapper, whose `background` is `""` in every state — so the CONTROL below passed against
 * an implementation that filled every row. Found by mutating, not by reading.
 */
const itemBoxOf = (dish: string): HTMLElement => rowFor(dish).firstElementChild as HTMLElement;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — M1: 27-F24's line total. Every row, every time, finished.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 27-F24 — every cart row carries its own finished money", () => {
  it("renders a line total ON the row, for EVERY line", () => {
    mount();
    // Asserted per row rather than by counting `Rs` on the surface: a component that rendered the
    // ORDER total three times, or one figure for the whole list, passes a global count and tells
    // a cashier nothing about the dish she is looking at.
    expect(within(rowFor("Mutton Karahi")).getByText(/Rs\s*450/)).toBeTruthy();
    expect(within(rowFor("Naan")).getByText(/Rs\s*60/)).toBeTruthy();
    expect(within(rowFor("Coke")).getByText(/Rs\s*120/)).toBeTruthy();
  });

  /**
   * ⚠ **THE ASSERTION §A EXISTS FOR.** The plausible wrong implementations all put A number on the
   * row and are invisible to "a figure is present":
   *   · the ORDER total repeated on every row — passes any `getByText(/Rs/)` sweep;
   *   · the UNIT price rather than the fold's extended `billed_paisa` — `packages/escpos`'s
   *     receipt genuinely does this and states why, so it is the shape a reader would copy;
   *   · `qty × price` computed here — which is not multiplication, it is `billedCellPaisa`
   *     carrying `01-F30`'s exited-line rule, and `26 §8` forbids reimplementing it outside
   *     `packages/sync-client`.
   * Three lines with three DIFFERENT and non-proportional figures is what separates them: 4 Naan
   * at Rs 60 total is Rs 15 each, so no per-unit or per-row-constant reading can survive.
   */
  it("the figure is the FOLD's value for that line, not the order total and not a unit price", () => {
    mount();
    const naan = rowFor("Naan");
    expect(within(naan).queryByText(/Rs\s*630/), "the ORDER total is on the line row").toBeNull();
    expect(within(naan).queryByText(/Rs\s*15/), "a UNIT price was derived here").toBeNull();
    expect(within(naan).getByText(/Rs\s*60/)).toBeTruthy();
  });

  it("27-F23: symbol-first `Rs`, and NO decimals on an operational screen", () => {
    mount();
    const text = rowFor("Mutton Karahi").textContent ?? "";
    expect(text).toContain("Rs 450");
    expect(text, "27-F23 puts no paisa on an operational screen").not.toMatch(/450[.,]00/);
  });

  it("a zero-priced line still renders its money rather than nothing (01-F60)", () => {
    // `01-F60` permits a price of 0 precisely so *free* is distinguishable from *forgotten*. An
    // implementation writing `{billedPaisa ? <MoneyValue/> : null}` — the falsy-guard a reviewer
    // reads straight past — turns the one case the FR exists for back into a blank row.
    mount({
      lines: [{ id: "line-1", name: "Water", quantity: 1, billedPaisa: paisa(0) }],
      totalPaisa: paisa(0),
    });
    expect(within(rowFor("Water")).getByText(/Rs\s*0/)).toBeTruthy();
  });

  it("CONTROL — the TOTAL is still exactly one figure and still the hero (27-F24/27-F25)", () => {
    // Without this, an implementation that satisfied §A by rendering the total on each row would
    // be caught above but one that DROPPED the total to make room would not.
    mount();
    const totalRow = screen.getByText("TOTAL").parentElement as HTMLElement;
    expect(totalRow.textContent).toContain("Rs 630");
    expect(
      (within(totalRow).getByText(/Rs\s*630/) as HTMLElement).style.fontSize,
      "27-F25 — the total is the largest element in its region",
    ).toBe("48px");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — M2/M3: a voided line is visibly not a live line, and the WORD is what carries it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const VOIDED = {
  lines: [
    { id: "line-1", name: "Mutton Karahi", quantity: 1, billedPaisa: paisa(KARAHI) },
    { id: "line-2", name: "Naan", quantity: 4, billedPaisa: paisa(0), offBill: "VOIDED" },
    { id: "line-3", name: "Coke", quantity: 2, billedPaisa: paisa(COKE) },
  ],
  totalPaisa: paisa(KARAHI + COKE),
};

describe("§B 27-F12 — an off-bill line says so in a WORD", () => {
  it("the word is on the glass, on ITS OWN row and on no other", () => {
    mount(VOIDED);
    expect(
      within(rowFor("Naan")).getByText("VOIDED"),
      "a voided row is byte-identical to a live one — the defect this file closes",
    ).toBeTruthy();
    expect(within(rowFor("Mutton Karahi")).queryByText("VOIDED")).toBeNull();
    expect(within(rowFor("Coke")).queryByText("VOIDED")).toBeNull();
  });

  it("the word travels with the money the fold zeroed, on the same row", () => {
    mount(VOIDED);
    const naan = rowFor("Naan").textContent ?? "";
    // Both facts in one row's text, in reading order: what happened, then what it is worth now.
    expect(naan).toContain("VOIDED");
    expect(naan).toContain("Rs 0");
    expect(naan.indexOf("VOIDED")).toBeLessThan(naan.indexOf("Rs 0"));
  });

  /**
   * ⚠ **THE ASSERTION §B EXISTS FOR, and it is `27-F12` in one line.** A component that carried
   * the state with the sunken fill alone — or with a strike-through alone — renders a visibly
   * different row, passes any snapshot, and says nothing to the 24-of-27 field subjects who cannot
   * read one, nothing at 1–2 m, and nothing on a scratched panel. The FR's own wording is that a
   * lone mark *"means nothing to a non-reader"*.
   */
  it("27-F12: the word is TEXT, so the state survives greyscale and a scratched panel", () => {
    mount(VOIDED);
    const word = within(rowFor("Naan")).getByText("VOIDED");
    expect(word.textContent?.trim().length, "the state is carried by a mark, not a word").toBe(6);
  });

  it("M3: the fill is `Tile`'s unavailable pairing — the vocabulary the picker already uses", () => {
    mount(VOIDED);
    // The DECLARED tokens, not a measured box (happy-dom lays nothing out). What this holds is
    // that the row reached for the shipped "not live" pairing rather than a new one — and reading
    // the tokens rather than literals is what makes the assertion move with the palette.
    const box = itemBoxOf("Naan");
    const unavailable = tileStyle({ unavailable: true, unavailableReason: "already voided" });
    expect(box.style.background, "a second look for one fact").toBe(unavailable.background);
    expect(box.style.color).toBe(unavailable.color);
    // `27-F66` — the elevation fills sit ~1.1:1 apart and cannot carry perceivability alone, so
    // the fill takes an independent mark. Neutral fill, neutral boundary (`27-F64`), read off the
    // cart's own outer boundary rather than named: same token, same palette, no literal.
    // (Not read off a `Tile`: it writes `borderBottom` after `border`, and happy-dom's CSSOM then
    // resolves the `border` shorthand to `""` — a comparison that would pass against anything.)
    const section = screen.getByRole("region", { name: /current order/i });
    expect(box.style.border).toBe(section.style.border);
    expect(box.style.border, "the fill carries the state with no mark to relieve it").not.toBe("");
  });

  /**
   * ⚠ **THE FIRST DRAFT OF THIS TEST SURVIVED ITS OWN MUTANT, and the shape is worth keeping.**
   * It asserted only that the voided row's money matched the LIVE row's money — so
   * `<MoneyValue abnormal />` on *every* row, which is `27-F16` broken on the whole cart, passed
   * all 30 tests. A guard built correctly and aimed one case away, found by mutating and not by
   * reading. What bites is naming the colour that must NOT appear, and the honest source for it is
   * the surface's own fault-coloured control: the removal button, whose `27-F14` red is the one
   * hue `27-F16` is protecting the numerals from.
   */
  it("M4/27-F16: NO line total is coloured abnormal — not the voided one and not the live ones", () => {
    mount(VOIDED);
    const fault = (within(rowFor("Naan")).getAllByRole("button")[0] as HTMLElement).style.color;
    expect(fault, "the removal control lost its fault colour — this oracle reads it").not.toBe("");
    const money = within(rowFor("Naan")).getByText(/Rs\s*0/) as HTMLElement;
    const live = within(rowFor("Mutton Karahi")).getByText(/Rs\s*450/) as HTMLElement;
    for (const figure of [money, live])
      expect(
        figure.style.color,
        "colour on a number means `this number is abnormal`, and Rs 0 is the EXPECTED figure for " +
          "an exited line — 27-F16 spends the preattentive channel on exceptions, not on rows",
      ).not.toBe(fault);
    // The two agree, so the state is carried by the WORD and never by a shift in the numeral.
    expect(money.style.color).toBe(live.style.color);
    expect(money.style.color).not.toBe(within(rowFor("Naan")).getByText("VOIDED").style.color);
  });

  it("CONTROL — with no `offBill`, no word and no fill appear anywhere", () => {
    // Without this, a component that always rendered the fill (or an empty word element) would
    // pass every assertion above and mark the whole cart dead.
    mount();
    expect(screen.queryByText("VOIDED")).toBeNull();
    for (const dish of ["Mutton Karahi", "Naan", "Coke"]) {
      const box = itemBoxOf(dish);
      expect(box.style.background, `${dish} is drawn as off-bill while it is on the bill`).toBe("");
      expect(box.style.color, `${dish} is dimmed while it is on the bill`).toBe("");
    }
  });

  it("the word is whatever the caller said — this package does not know `01 §4`", () => {
    // `01 §4` has TWO exit states and the counter renders both. A component that hardcoded the
    // string `VOIDED` passes every test above and prints the wrong word on a cancelled line.
    mount({
      lines: [
        { id: "line-1", name: "Naan", quantity: 4, billedPaisa: paisa(0), offBill: "CANCELLED" },
      ],
      totalPaisa: paisa(0),
    });
    expect(screen.getByText("CANCELLED")).toBeTruthy();
    expect(screen.queryByText("VOIDED")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — the rows that were already there are unchanged. A money column that ate the note, the
// modifier or the removal band would trade one unreadable cart for another.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 27-F57/27-F59 — the money column did not disturb the item line", () => {
  it("27-F57: the quantity is still immediately left of the name, in one element", () => {
    // The money sits OUTSIDE `QuantityItemLine` for exactly this reason: `27-F57` bans a
    // right-aligned column between a number and the thing it counts, and the mapping step is
    // where execution accuracy falls from ~71% decode to ~35%. Putting the price INSIDE the pair
    // is the refactor that quietly undoes it.
    mount();
    const pair = screen.getByText("Mutton Karahi").parentElement as HTMLElement;
    expect(pair.textContent).toBe("1Mutton Karahi");
  });

  it("the note, the modifier and the removal band still render under their dish", () => {
    mount({
      lines: [
        {
          id: "line-1",
          name: "Mutton Karahi",
          quantity: 1,
          modifiers: ["Medium spice"],
          removals: ["ONION"],
          note: "less spicy",
          billedPaisa: paisa(KARAHI),
        },
      ],
      totalPaisa: paisa(KARAHI),
    });
    for (const text of ["Medium spice", "less spicy"]) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText(/ONION/)).toBeTruthy();
  });

  it("27-F59: a removal band on a VOIDED line keeps its own fault colour", () => {
    // The off-bill fill cascades `color` onto the quantity and the name, which set none of their
    // own. A removal sets its own, and it must keep it: `27-F59`'s reason for the inverted marker
    // is that *a missed removal is an allergen incident*, and dimming it because the line stopped
    // being billed subordinates a safety fact to a money one.
    mount({
      lines: [
        {
          id: "line-1",
          name: "Mutton Karahi",
          quantity: 1,
          removals: ["ONION"],
          billedPaisa: paisa(0),
          offBill: "VOIDED",
        },
      ],
      totalPaisa: paisa(0),
    });
    const band = screen.getByText(/ONION/) as HTMLElement;
    const destructive = tileStyle({ destructive: true });
    expect(band.style.background, "the removal band was dimmed by a money state").toBe(
      destructive.background,
    );
    expect(band.style.color).toBe(destructive.color);
  });

  it("the empty cart still says what to do next and shows no money rows", () => {
    mount({ lines: [], totalPaisa: paisa(0) });
    expect(screen.getByText("Nothing added yet")).toBeTruthy();
    expect(screen.getAllByText(/Rs/), "an empty cart drew a line total").toHaveLength(1);
  });
});
