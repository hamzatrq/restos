// `Panel` — the bounded, captioned region (`27-F58` grouping, `27-F66` boundary, `27-F14` tone).
//
// These RENDER. The structural guards in `discipline.test.ts` can pin that a token is NAMED; only
// a render can pin that the caption reaches the document and that an abnormal region is still
// achromatic where `27-F16` requires it to be.
//
// ⚠ WHAT THIS FILE CANNOT SAY. happy-dom performs NO LAYOUT — every `getBoundingClientRect` is
// zeroes — so nothing here is evidence that a region is ON the screen, that its boundary is
// visible, or that the grouping reads as grouping. The first is `pnpm layout:check`'s job; the
// last is `27-F35`'s ≥85% comprehension gate on real staff and is **owed** (`27 §2b`: the grouping
// argument is a reasoned construction, and no study of this population parsing operational UI
// exists at all).

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { palette } from "../tokens/index";
import { Panel } from "./Panel";

afterEach(cleanup);

/**
 * Asserted against the PALETTE rather than a hex, so these survive a repaint (the idiom
 * `catalog-health.dom.test.tsx` already uses). Named `LIGHT` and not `color` on purpose:
 * `discipline.test.ts`'s `27-F67` polarity rule scans every non-story `.tsx` in this directory —
 * **including this one** — for a subscript read off a binding named `color` that did not come
 * from `useColor()`, and a test file aliasing the static record to that name reads to the guard
 * exactly like a component bypassing the provider. The guard is doing its job by a substring
 * match, so even naming the pattern in prose here trips it; that is a note for the guard's owner,
 * not a reason to loosen it.
 */
const LIGHT = palette.light;

describe("the region says what it is (27-F1, 27-F58)", () => {
  it("renders its title as a heading and its children inside the same region", () => {
    render(
      <Panel title="The day">
        <p>float</p>
      </Panel>,
    );
    const region = screen.getByRole("region", { name: "The day" });
    expect(region.querySelector("h2")?.textContent).toBe("The day");
    expect(region.textContent).toContain("float");
  });

  it("upper-cases in CSS, so the DOM text an oracle matches is the natural-language title", () => {
    // The reason this is a test and not a comment: `OrdersSurface` recorded that it could NOT
    // upper-case its headings because `orders-tab.dom.test.tsx` finds both lists by their
    // heading text, and "changing five oracle assertions to buy a typographic flourish is not a
    // trade an implementer gets to make". `text-transform` resolves that — the glass gets the
    // capital and `textContent` is untouched. A future edit that upper-cases the STRING instead
    // would break those five assertions, so this pins which mechanism is in use.
    render(<Panel title="New orders">{null}</Panel>);
    expect(screen.getByText("New orders")).toBeTruthy();
    expect(screen.getByText("New orders").style.textTransform).toBe("uppercase");
  });

  it("draws no note when none is given, and never invents one", () => {
    // `00 §5.7` in miniature: a region with nothing to qualify says nothing about itself. An
    // empty `note` element would reserve a place a reader keeps checking.
    const { container } = render(<Panel title="My shift">{null}</Panel>);
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });

  it("shows the note beside the title, for 27-F7's ordering rule", () => {
    render(
      <Panel title="Open orders" note="oldest first">
        {null}
      </Panel>,
    );
    expect(screen.getByText("oldest first")).toBeTruthy();
  });
});

describe("27-F16 / 27-F14 — the tone is a BUDGET, and neutral spends nothing", () => {
  it("a neutral region carries no status colour at all", () => {
    // `27-F16`'s argument, applied to a container: the commonest state on the glass must not
    // spend the preattentive channel. Every region on the Cash tab is neutral all day.
    render(<Panel title="The drawer">{null}</Panel>);
    const heading = screen.getByText("The drawer");
    expect(heading.style.background).toBe("");
    expect(heading.style.color).toBe(LIGHT["fgColor-muted"]);
    const region = screen.getByRole("region", { name: "The drawer" });
    expect(region.style.border).toContain(LIGHT["borderColor-default"]);
  });

  it("an abnormal region claims 27-F14's AMBER slot and no other", () => {
    render(
      <Panel title="Not accounted for" tone="abnormal">
        {null}
      </Panel>,
    );
    const heading = screen.getByText("Not accounted for");
    expect(heading.style.background).toBe(LIGHT["bgColor-status-abnormal"]);
    // `27-F43` — the foreground is the fill's declared pairing, never a guess.
    expect(heading.style.color).toBe(LIGHT["fgColor-on-status-abnormal"]);
    // `27-F64` — the fill is relieved of SC 1.4.11 ON THE OUTLINE'S ACCOUNT, so a fill without
    // one has no perceivable boundary and the relief was granted for nothing.
    expect(heading.style.border).toContain(LIGHT["outlineColor-status-abnormal"]);
    // Red is NOT reachable through this component. `27-F14`'s fault claimants are enumerated and
    // `03-F5`'s S1 band owns them; a second red region is how the band stops being the loudest
    // thing on the glass. There is deliberately no `tone="fault"` to assert against.
    expect(heading.style.background).not.toBe(LIGHT["bgColor-status-fault"]);
  });

  it("keeps the abnormal fill OFF the body, so money inside is still uncoloured (27-F16)", () => {
    // The live case is the Me tab's unbound bucket: the BUCKET is abnormal, the rupees in it are
    // an ordinary number. Colouring them would say "this figure is wrong", which it is not.
    render(
      <Panel title="Not accounted for" tone="abnormal">
        <p>Rs 150</p>
      </Panel>,
    );
    const body = screen.getByText("Rs 150");
    expect(body.style.background).toBe("");
    expect(body.style.color).toBe("");
  });
});

describe("27-F66 — elevation is depth, and the BOUNDARY is what carries the region", () => {
  it("raises a working surface and sinks a tray, both bounded", () => {
    const { rerender } = render(<Panel title="Count">{null}</Panel>);
    const raised = screen.getByRole("region", { name: "Count" });
    expect(raised.style.background).toBe(LIGHT["bgColor-surface-raised"]);
    expect(raised.style.border).toContain(LIGHT["borderColor-default"]);

    rerender(
      <Panel title="Count" elevation="sunken">
        {null}
      </Panel>,
    );
    const sunken = screen.getByRole("region", { name: "Count" });
    expect(sunken.style.background).toBe(LIGHT["bgColor-surface-sunken"]);
    // The same 3:1 boundary on both. `27-F66`'s measurement is that the ~1.1:1 fill step cannot
    // be load-bearing, so a sunken tray with no border would be a region with no edge.
    expect(sunken.style.border).toContain(LIGHT["borderColor-default"]);
  });

  it("takes a flex ratio and never a size (27-F11c)", () => {
    // A caller declares a RATIO of the surface it measured; there is no width or height prop,
    // because a fixed one is a layout costed for a panel that may not be in front of the
    // operator. `OrdersSurface` gives the inbox 1 and the open list 2 on exactly these terms.
    render(
      <Panel title="New orders" grow={1}>
        {null}
      </Panel>,
    );
    expect(screen.getByRole("region", { name: "New orders" }).style.flex).toBe("1 1 0%");
  });
});
