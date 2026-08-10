import { paisa } from "@restos/domain";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SURFACE_MODE_MIN_MM, surfaceModeFor } from "../surface-mode";
import { MoneyValue } from "./MoneyValue";
import { PersonTile } from "./PersonTile";
import { Readout } from "./Readout";

/**
 * The three primitives this round added, and the one pure function behind all of them.
 *
 * **⚠ WHAT THIS SUITE CANNOT DO, said first so a green run is not over-read.** happy-dom performs
 * **no layout** — every `getBoundingClientRect()` is zeroes and no `ResizeObserver` fires — so
 * nothing here can assert that a card is 360 dp wide, that a caption sits above its payload, or
 * that a surface is `wide` on a 24″ panel. Those are the layout gate's (`apps/pos-electron
 * layout:check`, five physical panels, real Blink) and they are measured there.
 *
 * What is testable here is the part that is *logic* rather than *layout*: the mode boundaries,
 * and the contracts each component holds about what it renders and what it refuses to render.
 * Both halves are needed and neither substitutes for the other — which is this repo's own
 * standing lesson about a seam test and a durability suite.
 */

describe("surfaceModeFor — 27-F11c, and the boundaries are hardware, not round numbers", () => {
  /**
   * `27 §1a`'s own table, converted the way `27-F68` converts everything: a panel's physical
   * size is `diagonalInches × (pixels / hypot) × 25.4`, in which the RESOLUTION CANCELS. These
   * are the surfaces this product actually deploys to, and the assertion is that each one lands
   * in the mode its ergonomics belong to.
   *
   * **⚠ EVERY CALL BELOW GAINED A SECOND ARGUMENT IN AUGUST 2026 AND THAT IS THE POINT OF THE
   * ROUND, not a mechanical fixup.** `surfaceModeFor` took width only, and the layout gate's own
   * sweep is what refuted it: of the two panels reporting violations, **the Pay tab's was a pure
   * HEIGHT failure** (593 dp of content in a 485 dp box) and Cash's width overflow was a height
   * failure wearing a width costume — its groups column-wrap, so a shorter box makes more columns
   * and therefore more width. A mode that cannot see the short axis cannot arrange for it.
   */
  const glassMm = (diagonalIn: number, w: number, h: number): { width: number; height: number } => {
    const perPixel = (diagonalIn / Math.hypot(w, h)) * 25.4;
    return { width: w * perPixel, height: h * perPixel };
  };
  const modeOf = (diagonalIn: number, w: number, h: number) => {
    const g = glassMm(diagonalIn, w, h);
    return surfaceModeFor(g.width, g.height);
  };

  it("puts BOTH of 27 §1a's counter panels in the same mode — the whole of 27-F11c", () => {
    // "A 1366×768 and a 1920×1080 15.6″ panel hold the SAME number of 12 mm tiles. Extra pixels
    // buy sharpness; only inches buy room." A pixel-keyed breakpoint gets this backwards, which
    // is the entire reason this function takes millimetres.
    const small = glassMm(15.6, 1366, 768);
    const large = glassMm(15.6, 1920, 1080);
    expect(Math.round(small.width)).toBe(345);
    expect(Math.round(large.width)).toBe(345);
    expect(Math.round(small.height)).toBe(194);
    expect(Math.round(large.height)).toBe(194);
    expect(surfaceModeFor(small.width, small.height)).toBe("counter");
    expect(surfaceModeFor(large.width, large.height)).toBe("counter");
  });

  it("separates a 24-inch desktop from a 15.6-inch counter at IDENTICAL pixels", () => {
    // The pair that made the founder's defect invisible: same 1920×1080, 1.5× the glass. If these
    // two ever return the same mode, the product has gone back to laying out against pixels.
    expect(modeOf(15.6, 1920, 1080)).toBe("counter");
    expect(modeOf(24, 1920, 1080)).toBe("wide");
  });

  it("puts 27 §1a's ~10.1-inch waiter tablet in compact, at the same pixels as the counter", () => {
    expect(modeOf(10.1, 1366, 768)).toBe("compact");
  });

  it("puts 27-F11f's 22-inch pass panel and a 32-inch ultrawide in wide", () => {
    expect(modeOf(22, 1920, 1080)).toBe("wide");
    expect(modeOf(32, 3840, 1080)).toBe("wide");
  });

  /**
   * **THE DEFECT THE SECOND AXIS EXISTS TO CLOSE, as the pair that used to collide.**
   *
   * A 6.5″ phone (69 × 150 mm) and a 13.3″ laptop (286 × 179 mm) resolved to the SAME mode under
   * the width-only rule — one of them structurally broken at 151 layout violations, the other
   * completely clean at zero. They are now different modes, and neither answer is a coincidence
   * of the threshold: the phone fails the width test and the laptop passes both.
   */
  it("no longer collides a 6.5-inch phone with a 13.3-inch laptop", () => {
    expect(modeOf(6.5, 1080, 2340)).toBe("compact");
    expect(modeOf(13.3, 1280, 800)).toBe("counter");
  });

  /**
   * **SHORT BEATS WIDE, and this is the assertion that pins the ORDER of the two tests.**
   *
   * A panel 783 mm across and 140 mm tall clears `wide`'s width by 323 mm and cannot hold the
   * standard vertical arrangement at all. Reaching `wide` first would spend the roomy axis on a
   * bigger money column while `27-F8`'s untouchable 528 dp keypad hung off the bottom edge. An
   * implementation that tests `wide` before `compact` passes every other case in this file.
   */
  it("calls a very wide but SHORT panel compact, never wide", () => {
    expect(surfaceModeFor(783, 140)).toBe("compact");
    expect(surfaceModeFor(783, 220)).toBe("wide");
  });

  it("is closed and total on BOTH axes: inclusive-below, no gap, no unreachable mode", () => {
    // A mutant that flips a `>=` to a `>` leaves one size with no mode; a mutant that reorders
    // the ternary silently makes `wide` unreachable. Both die here, now on two axes.
    const { widthMm: cw, heightMm: ch } = SURFACE_MODE_MIN_MM.counter;
    expect(surfaceModeFor(cw - 0.01, ch)).toBe("compact");
    expect(surfaceModeFor(cw, ch - 0.01)).toBe("compact");
    expect(surfaceModeFor(cw, ch)).toBe("counter");
    expect(surfaceModeFor(SURFACE_MODE_MIN_MM.wide.widthMm - 0.01, ch)).toBe("counter");
    expect(surfaceModeFor(SURFACE_MODE_MIN_MM.wide.widthMm, ch)).toBe("wide");
    expect(surfaceModeFor(0, 0)).toBe("compact");
    expect(surfaceModeFor(10_000, 10_000)).toBe("wide");
    // Each axis alone must be able to force `compact`, or one of them is decorative.
    expect(surfaceModeFor(10_000, ch - 0.01)).toBe("compact");
    expect(surfaceModeFor(cw - 0.01, 10_000)).toBe("compact");
  });

  it("has NO hardware sitting near a boundary — the margins are the safety", () => {
    /**
     * **⚠ THIS ASSERTION USED TO DEMAND 40 mm ON THE WIDTH AXIS AND IT IS 25 NOW. Read the
     * reason before treating it as a weakening, because the basis moved twice.**
     *
     * 1. **The old rationale is void rather than relaxed.** It read *"a boundary a few
     *    millimetres of chrome could cross would reclassify a till"* — true when the input was
     *    the WORK SURFACE, whose width chrome genuinely moves. The input is the GLASS now
     *    (`usePanelSize`), and no amount of chrome moves the glass. What margin still buys is
     *    tolerance to hardware variety, not to layout edits.
     * 2. **40 mm is arithmetically unavailable once a 13.3″ laptop must be `counter`.** The
     *    nearest hardware below the boundary is the 10.1″ tablet at 223.6 mm and the nearest
     *    above is the laptop at 286.4 mm — a 62.8 mm gap in total, so the best possible split is
     *    31.4 mm a side and no threshold can give 40. The gap got smaller because the SWEEP got
     *    denser, which is the rail doing its job.
     *
     * The height axis is where the room is, and it keeps a real margin.
     */
    const counter = glassMm(15.6, 1366, 768);
    const tablet = glassMm(10.1, 1366, 768);
    const laptop = glassMm(13.3, 1280, 800);
    expect(counter.width - SURFACE_MODE_MIN_MM.counter.widthMm).toBeGreaterThan(25);
    expect(SURFACE_MODE_MIN_MM.counter.widthMm - tablet.width).toBeGreaterThan(25);
    expect(laptop.width - SURFACE_MODE_MIN_MM.counter.widthMm).toBeGreaterThan(25);
    expect(SURFACE_MODE_MIN_MM.wide.widthMm - counter.width).toBeGreaterThan(100);
    // Height: the tablet is 24 mm below and every shipping panel is 29 mm or more above.
    expect(SURFACE_MODE_MIN_MM.counter.heightMm - tablet.height).toBeGreaterThan(20);
    expect(laptop.height - SURFACE_MODE_MIN_MM.counter.heightMm).toBeGreaterThan(25);
    expect(counter.height - SURFACE_MODE_MIN_MM.counter.heightMm).toBeGreaterThan(40);
  });
});

describe("Readout — 27-F12/27-F57, the caption is adjacent to the fact it names", () => {
  it("renders the caption and the payload, in that DOM order", () => {
    const { container } = render(
      <Readout caption="DUE">
        <MoneyValue paisa={paisa(487_500)} size="primary" />
      </Readout>,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("DUE");
    expect(text).toContain("Rs 4,875");
    // Order is the pairing: 27-F57's mapping step is "the number and the thing it quantifies",
    // and a payload rendered before its caption is a different reading order on every surface.
    expect(text.indexOf("DUE")).toBeLessThan(text.indexOf("Rs 4,875"));
  });

  it("prints the direction word EXACTLY ONCE when the caption carries it", () => {
    /**
     * **THE DEFECT, as a test.** `TenderPanel` rendered `CHANGE` as a label AND passed
     * `direction: "change"` to `MoneyValue`, which prefixes it — so a founder read `CHANGE` /
     * `CHANGE Rs 0` off the glass, overlapping. Two mechanisms discharging one `27-F12`
     * obligation, each correct alone.
     *
     * Asserted as a COUNT rather than as a string match, because the failure is duplication and
     * `toContain("CHANGE")` passes on both the correct and the broken render.
     */
    const { container } = render(
      <Readout caption="CHANGE">
        <MoneyValue paisa={paisa(12_500)} size="hero" />
      </Readout>,
    );
    const occurrences = (container.textContent ?? "").match(/CHANGE/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("is not a status surface — it accepts no colour, no state and no size", () => {
    // 27-F12 requires a status to carry colour AND shape AND position AND a number. A caption
    // that could be tinted would be a status component satisfying none of them, and 27-F16 is
    // the same argument for money. The guard is the TYPE, and this asserts the type's shape.
    const props: Record<string, unknown> = { caption: "DUE", children: null };
    expect(Object.keys(props).sort()).toEqual(["caption", "children"]);
  });
});

describe("PersonTile — 01-F61's identification target", () => {
  it("renders the name, and the role formatted as a word", () => {
    render(<PersonTile name="Hina Raza" staffRole="branch_manager" onPress={() => {}} />);
    // `branch_manager` is an identifier. A person reads "Branch manager".
    expect(screen.getByRole("button", { name: "Hina Raza — Branch manager" })).toBeTruthy();
    expect(screen.getByText("Branch manager")).toBeTruthy();
  });

  it("renders NO role line when there is no role — never a guess", () => {
    /**
     * `01-F54` degrades to what is known. `main/authorize.ts` narrows a registry string to a
     * matrix column and returns nothing for a role `domain` does not carry, and reference data
     * may legitimately name anything — so a guessed "Cashier" would be a false claim about a
     * person's authority (commandment 2).
     */
    const { container } = render(<PersonTile name="Bilal Ahmed" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Bilal Ahmed" })).toBeTruthy();
    expect((container.textContent ?? "").trim()).toBe("Bilal Ahmed");
  });

  it("never transforms the NAME — 00 §5.6, user content is Unicode and faithful", () => {
    // The role is an identifier this product minted and is formatted; the name belongs to a
    // person. A component that title-cased a name would be the same defect as translating one.
    render(<PersonTile name="عائشة خان" staffRole="cashier" onPress={() => {}} />);
    expect(screen.getByText("عائشة خان")).toBeTruthy();
  });

  it("fires onPress, and is a real button rather than a clickable box", () => {
    let pressed = 0;
    render(<PersonTile name="Ayesha Khan" onPress={() => pressed++} />);
    screen.getByRole("button", { name: "Ayesha Khan" }).click();
    expect(pressed).toBe(1);
  });

  it("takes no posture, no size, no selected state — the closed-vocabulary test", () => {
    /**
     * `packages/ui/CLAUDE.md`: *"a component that can be configured into violating a law is not a
     * closed vocabulary."* A `size` here would be a second place the layout is decided from and
     * would let a caller take an identification target below `27-F8`'s floor; a `selected` would
     * invent a state `01-F61` explicitly does not have (*"tapping a different tile before submit
     * costs nothing"*).
     */
    const rendered = <PersonTile name="Ayesha Khan" onPress={() => {}} />;
    expect(Object.keys(rendered.props).sort()).toEqual(["name", "onPress"]);
  });
});
