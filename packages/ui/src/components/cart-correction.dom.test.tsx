/**
 * ACCEPTANCE TESTS — the cart's two correction surfaces: `C8`'s line removal (`02-F8`) and `C7`'s
 * item note (`02-F6`), as an OPERATOR experiences them.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** Written by a session that read `specs/27-design-language.md`,
 * `specs/21-ux-system.md`, `specs/02-pos-app.md` and `specs/00-platform-overview.md`, and that did
 * not write the implementation it describes (`24 §3` step 2). Read-only to the implementing
 * session.
 *
 * ## Who this is for, because every pin below is downstream of it
 *
 * `21 §5`: **icons + numbers dominant, minimal words** — of 27 field subjects, 24 could not type a
 * single word. `00 §5.6`: staff navigate by **memorized position**. `27-F9`: wet-screen gesture
 * error is **21.34% against 0.00% dry**, and the sensed touch point physically *migrates toward
 * the moisture*. A removal control is the one destructive act on the busiest surface in the
 * product, tapped 10–25× a shift beside a grid tapped ~300×.
 *
 * ## What is asserted here and what is asserted elsewhere, stated because the boundary matters
 *
 * **happy-dom performs NO LAYOUT** — every `getBoundingClientRect` is zeroes — so this file can
 * say *"the control is in the document, is a real target, and does the right thing when pressed"*
 * and can never say *"the control is on the screen"*. The nine layout defects this repo has found
 * were all found by `pnpm layout:check` in Blink or by launching the app, and none by a
 * `.dom.test.tsx`. Where a claim is geometric, this file asserts the **declared** token value
 * rather than a measured box, and says so at the assertion.
 *
 * ## §0 — PINNED INTERPRETATIONS (`24 §3b`)
 *
 * **U1 — one removal control PER LINE, naming that line's `id`.** `CartProps.lines` already carries
 * an `id` per line and `onRemove` already takes one, so this is transcription — but §A is what
 * makes it a claim: an implementation calling `onRemove(lines[0].id)`, or passing the row INDEX,
 * satisfies every "the button exists" test ever written and removes the wrong dish.
 *
 * **U2 — the control carries a VISIBLE mark AND a VISIBLE word, and the word is `NO`.**
 *   `27-F5` requires *"a persistent, visible, **labelled** target"*. An `aria-label` is a label to a
 *   screen reader and not to a cashier, so it does not discharge the FR on its own.
 *   The word is `NO` because this package already ships that exact vocabulary for this exact
 *   meaning, one file over: `QuantityItemLine` renders a removal as `✕ NO <name>`, and
 *   `packages/escpos`'s KOT uses the same word with the reason stated — *"a word rather than a
 *   glyph because `27-F60` forbids a pictogram carrying meaning alone"*. A second word for one act
 *   would give a cashier and a cook two vocabularies for the same fact, which is `03-F40`'s named
 *   defect. Reading down the row, `NO` + `1 Coke` is the sentence the cook gets on the chit.
 *   *The simpler alternative, named:* the bare `×` this component ships today. It is refused
 *   because `27-F5` asks for a labelled target and because `21 §5`'s population reads marks, not
 *   ARIA. **This is the pin to overturn if a reviewer disagrees; §B is the test to change, by
 *   name, and nothing else in this file depends on it.**
 *
 * **U3 — no confirmation step, no modal, no second tap.** `02-F37` keeps anything from coming
 * between the cashier and the customer; `27-F10` wants the act complete in <100 ms; `02-F49` rules
 * that the remedy for a mis-tap is re-adding the item — one tap of the surface's most practised
 * gesture. A confirm dialog on a 10–25×/shift act is the friction that teaches an operator to
 * work around a control.
 *
 * **U4 — the note renders under its item, never inlined into the item line.** `27-F59` in terms,
 * and `27-F57`'s measured reason: wrapping destroys the vertical alignment on which the
 * quantity→item mapping depends, and that mapping is where comprehension collapses from ~71% to
 * ~35%.
 *
 * ## What this file deliberately does NOT assert
 *
 * - **Where the control sits in the box.** `27-F9`'s adjacency is a geometric claim and happy-dom
 *   cannot make it. `pnpm layout:check` owns it, and its own limits are recorded in `AGENTS.md`:
 *   it only sees states its FIXTURE produces.
 * - **The quick-tag pick list.** `02-F50` puts the note's INPUT on the counter surface, not in
 *   `packages/ui`; `apps/pos-electron`'s renderer oracle owns it. This file asserts only that a
 *   note which has been recorded is displayed correctly.
 * - **Colour.** `27-F14`'s budget has no slot for "note" and `27-F16` keeps money uncoloured;
 *   `packages/ui`'s palette oracles already gate every token this component uses.
 */

import { paisa } from "@restos/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { space, targetFor, touch } from "../tokens/index";
import { Cart } from "./Cart";

afterEach(cleanup);

const LINES = [
  { id: "line-1", name: "Mutton Karahi", quantity: 1 },
  { id: "line-2", name: "Coke", quantity: 2 },
  { id: "line-3", name: "Naan", quantity: 4 },
];

const mount = (over: Partial<Parameters<typeof Cart>[0]> = {}) => {
  const onRemove = vi.fn();
  render(
    <ThemeProvider>
      <Cart lines={LINES} totalPaisa={paisa(77000)} onRemove={onRemove} {...over} />
    </ThemeProvider>,
  );
  return onRemove;
};

/** Every control that removes something, in DOM order — the order a cashier scans down the cart. */
const removeControls = (): HTMLElement[] =>
  screen
    .getAllByRole("button")
    .filter((b) =>
      /remove|^\s*(no|×|✕|✖|x)\b/i.test(
        `${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`,
      ),
    );

const px = (value: string | null): number => Number.parseFloat(value ?? "NaN");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — U1: the control exists, there is one per line, and it names ITS OWN line.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F8 — a cashier can take ONE line off the order", () => {
  it("renders one removal control per line", () => {
    mount();
    expect(
      removeControls(),
      "02-F8's pre-confirm removal has no surface — `Cart` declares `onRemove` and renders nothing",
    ).toHaveLength(LINES.length);
  });

  /**
   * ⚠ **THE ASSERTION §A EXISTS FOR.** The plausible wrong implementations are both invisible to a
   * "the button is there" test and both remove the WRONG dish:
   *   · `onClick={() => onRemove(lines[0].id)}` — a closure written outside the map;
   *   · `onClick={() => onRemove(String(index))}` — the row position instead of the line key,
   *     which `01-F1` then makes a permanent removal of a line that does not exist while the Coke
   *     stays on the bill.
   * Three lines, and the SECOND one is pressed on purpose: with one line, or with the first, both
   * mutants pass.
   */
  it("pressing the second line's control names the SECOND line's id, not the first and not an index", () => {
    const onRemove = mount();
    const second = removeControls()[1];
    expect(second).toBeTruthy();
    fireEvent.click(second as HTMLElement);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("line-2");
  });

  it("each control is distinguishable by the DISH it removes (00 §5.6 — position plus a name)", () => {
    // Three identical controls in a column is a control an operator cannot aim: `27-F9`'s touch
    // point migrates under moisture, so the only recovery is knowing which one was hit. The
    // accessible name is asserted here because it is the machine-readable half of that; U2's
    // visible half is §B.
    mount();
    for (const line of LINES) {
      expect(
        screen.getByRole("button", { name: new RegExp(line.name, "i") }),
        `no removal control names ${line.name}`,
      ).toBeTruthy();
    }
  });

  it("CONTROL — with no `onRemove` supplied, no removal control is rendered at all", () => {
    // `02-F10`'s recall surface shows a settled order read-only, and `02-F49`'s post-confirm path
    // is a void with an approver rather than this control. The prop being optional is what lets one
    // component serve both, and this asserts the absence is real rather than assumed — without it,
    // an implementation that always rendered the control would pass every test above and put an
    // unapprovable removal on a recalled bill.
    render(
      <ThemeProvider>
        <Cart lines={LINES} totalPaisa={paisa(77000)} />
      </ThemeProvider>,
    );
    expect(removeControls()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — U2: 27-F5's LABELLED target. The pin to overturn if a reviewer rejects the word.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 27-F5/21 §5 — the target is visibly labelled, not labelled to a screen reader", () => {
  it("the control carries visible text on the glass, not only an aria-label", () => {
    mount();
    const first = removeControls()[0] as HTMLElement;
    expect(
      (first.textContent ?? "").trim().length,
      "27-F5 requires a persistent, visible, LABELLED target — an aria-label is not a label a " +
        "cashier can see, and 24 of 27 field subjects could not read one anyway",
    ).toBeGreaterThan(0);
  });

  /**
   * ⚠ **THE PIN, isolated in one test so overturning it costs one line.** `NO` is this platform's
   * shipped word for a removal, on glass (`QuantityItemLine`'s `✕ NO <name>`) and on paper
   * (`packages/escpos`'s `REMOVAL_MARKER`, chosen because `27-F60` forbids a pictogram carrying
   * meaning alone). A cashier and a cook must not learn two words for one act.
   */
  it("the visible word is the platform's removal word — `NO` (U2)", () => {
    mount();
    const first = removeControls()[0] as HTMLElement;
    expect(
      (first.textContent ?? "").toUpperCase(),
      "a second vocabulary for one act — the KOT says NO and the cart says something else",
    ).toContain("NO");
  });

  it("27-F8: the target is at least the absolute floor, read from the TOKEN and never a literal", () => {
    // DECLARED size, not a measured box — happy-dom lays nothing out, and this file's header says
    // so. It is still worth asserting: the component's own comment records that this control
    // shipped at a raw `44`, BELOW the 48 dp floor, on the one destructive control on the surface.
    // Reading `targetFor("floor")` rather than `48` is what makes the assertion move with the token.
    mount();
    const first = removeControls()[0] as HTMLElement;
    expect(px(first.style.minHeight)).toBeGreaterThanOrEqual(targetFor("floor"));
    expect(px(first.style.minWidth)).toBeGreaterThanOrEqual(targetFor("floor"));
  });

  it("27-F8/27-F9: the control is set apart from the item body by at least the gap minimum", () => {
    // `27-F9` is geometric and `layout:check` owns it; what this can hold is the DECLARED
    // separation, which is the thing a refactor deletes. `touch-gap-min` is `27-F8`'s "gaps ≥ 8 dp"
    // as a token, so a spacing change that dropped below it reddens here rather than in a review.
    mount();
    const first = removeControls()[0] as HTMLElement;
    expect(px(first.style.marginLeft)).toBeGreaterThanOrEqual(touch["touch-gap-min"] as number);
    expect(px(first.style.marginLeft)).toBeGreaterThanOrEqual(space["space-4"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — U3/27-F5: one tap, no gesture, no modal.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 27-F5/27-F10/02-F37 — one tap completes it, and nothing else does", () => {
  it("ONE press removes — no confirmation step stands between the cashier and the customer", () => {
    const onRemove = mount();
    fireEvent.click(removeControls()[0] as HTMLElement);
    expect(onRemove).toHaveBeenCalledTimes(1);
    // A confirm dialog would leave the callback uncalled until a second control was found. There
    // is deliberately no second press here: `02-F37` forbids the modal and `27-F10` wants the act
    // finished inside the perceptual threshold.
  });

  it("27-F5: hovering does not remove, and neither does a touch that never becomes a tap", () => {
    // "No soft keys, no hover or dwell activation, no long-press-only actions, no gesture-only
    // affordances. Dwell-to-click was tried in the field and abandoned." A wet hand rests on the
    // glass; `27-F9` measures the touch point MIGRATING toward the moisture. A dwell- or
    // swipe-activated removal is a dish that vanishes off the bill while nobody pressed anything.
    const onRemove = mount();
    const first = removeControls()[0] as HTMLElement;
    fireEvent.mouseOver(first);
    fireEvent.mouseEnter(first);
    fireEvent.touchStart(first);
    fireEvent.touchMove(first);
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(first);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("the control is a real button — reachable by keyboard and by the accessibility tree", () => {
    // `27-F5`'s "persistent, visible, labelled target" and `18 §`'s closed-vocabulary rule both
    // land on the same shape. A `<div onClick>` renders identically and is reachable by neither.
    mount();
    for (const control of removeControls()) {
      expect(control.tagName).toBe("BUTTON");
      expect(control.getAttribute("type")).toBe("button");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — U4: the note is displayed under its item, and never inlined into it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F6/27-F59 — the note reads under its dish", () => {
  const withNote = () =>
    render(
      <ThemeProvider>
        <Cart
          lines={[
            { id: "line-1", name: "Mutton Karahi", quantity: 1, note: "less spicy" },
            { id: "line-2", name: "Coke", quantity: 2 },
          ]}
          totalPaisa={paisa(77000)}
          onRemove={() => {}}
        />
      </ThemeProvider>,
    );

  it("02-F6: the note is on the screen", () => {
    withNote();
    expect(
      screen.getByText("less spicy"),
      "02-F6's note reaches the fold and the cart shows nothing — the cashier cannot see what " +
        "the kitchen was told",
    ).toBeTruthy();
  });

  /**
   * ⚠ **THE ASSERTION §D EXISTS FOR.** The tempting implementation is `{name} ({note})` — one
   * line, fewer elements, and it reads fine in a screenshot. `27-F59` forbids it in terms
   * ("never inlined") and `27-F57` gives the measured reason: an inlined qualifier turns one
   * scannable line into a wrapped paragraph, and wrapping destroys the vertical alignment the
   * quantity→item mapping depends on — the step where execution accuracy falls from ~71% decode
   * to ~35% execute.
   */
  it("27-F59: the note is its OWN element — the item line still reads `1 Mutton Karahi` alone", () => {
    withNote();
    const noteEl = screen.getByText("less spicy");
    const nameEl = screen.getByText("Mutton Karahi");
    expect(noteEl).not.toBe(nameEl);
    expect(
      nameEl.textContent,
      "the note was inlined into the item line — 27-F59 forbids it and 27-F57 measures why",
    ).toBe("Mutton Karahi");
    expect(noteEl.contains(nameEl)).toBe(false);
    expect(nameEl.contains(noteEl)).toBe(false);
  });

  it("CONTROL — a line with no note renders no note element", () => {
    // Without this, a component that rendered an empty emphasised row for every line would pass
    // both tests above and put a blank indent under every dish on the ticket and the screen —
    // `00 §5.7`'s zero-on-a-clock, in whitespace.
    withNote();
    const cokeRow = screen.getByText("Coke").parentElement?.parentElement;
    expect(cokeRow?.textContent).toBe("2Coke");
  });
});
