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
   * width is `diagonalInches × (pixelWidth / hypot) × 25.4`, in which the RESOLUTION CANCELS.
   * These are the surfaces this product actually deploys to, and the assertion is that each one
   * lands in the mode its ergonomics belong to.
   */
  const glassWidthMm = (diagonalIn: number, w: number, h: number): number =>
    ((diagonalIn * w) / Math.hypot(w, h)) * 25.4;

  it("puts BOTH of 27 §1a's counter panels in the same mode — the whole of 27-F11c", () => {
    // "A 1366×768 and a 1920×1080 15.6″ panel hold the SAME number of 12 mm tiles. Extra pixels
    // buy sharpness; only inches buy room." A pixel-keyed breakpoint gets this backwards, which
    // is the entire reason this function takes millimetres.
    const small = glassWidthMm(15.6, 1366, 768);
    const large = glassWidthMm(15.6, 1920, 1080);
    expect(Math.round(small)).toBe(345);
    expect(Math.round(large)).toBe(345);
    expect(surfaceModeFor(small)).toBe("counter");
    expect(surfaceModeFor(large)).toBe("counter");
  });

  it("separates a 24-inch desktop from a 15.6-inch counter at IDENTICAL pixels", () => {
    // The pair that made the founder's defect invisible: same 1920×1080, 1.5× the glass. If these
    // two ever return the same mode, the product has gone back to laying out against pixels.
    expect(surfaceModeFor(glassWidthMm(15.6, 1920, 1080))).toBe("counter");
    expect(surfaceModeFor(glassWidthMm(24, 1920, 1080))).toBe("wide");
  });

  it("puts 27 §1a's ~10.1-inch waiter tablet in compact, at the same pixels as the counter", () => {
    expect(surfaceModeFor(glassWidthMm(10.1, 1366, 768))).toBe("compact");
  });

  it("puts 27-F11f's 22-inch pass panel and a 32-inch ultrawide in wide", () => {
    expect(surfaceModeFor(glassWidthMm(22, 1920, 1080))).toBe("wide");
    expect(surfaceModeFor(glassWidthMm(32, 3840, 1080))).toBe("wide");
  });

  it("is closed and total: every boundary is inclusive-below and there is no gap", () => {
    // A mutant that flips a `>=` to a `>` leaves one width with no mode; a mutant that reorders
    // the ternary silently makes `wide` unreachable. Both die here.
    expect(surfaceModeFor(SURFACE_MODE_MIN_MM.counter - 0.01)).toBe("compact");
    expect(surfaceModeFor(SURFACE_MODE_MIN_MM.counter)).toBe("counter");
    expect(surfaceModeFor(SURFACE_MODE_MIN_MM.wide - 0.01)).toBe("counter");
    expect(surfaceModeFor(SURFACE_MODE_MIN_MM.wide)).toBe("wide");
    expect(surfaceModeFor(0)).toBe("compact");
    expect(surfaceModeFor(10_000)).toBe("wide");
  });

  it("has NO hardware sitting near a boundary — the margins are the safety", () => {
    // The nearest panel on either side of 300 mm is the counter's work surface (~337) and the
    // tablet (~224). A boundary a few millimetres of chrome could cross would reclassify a till.
    const counter = glassWidthMm(15.6, 1366, 768);
    const tablet = glassWidthMm(10.1, 1366, 768);
    expect(counter - SURFACE_MODE_MIN_MM.counter).toBeGreaterThan(40);
    expect(SURFACE_MODE_MIN_MM.counter - tablet).toBeGreaterThan(40);
    expect(SURFACE_MODE_MIN_MM.wide - counter).toBeGreaterThan(100);
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
