// The first tests in this package that RENDER anything.
//
// Every other suite here is structural (does the source contain X?) or arithmetic (does this
// contrast ratio hold?). An oracle reviewer noted the consequence: no test ever rendered a
// component, so `27-F67`'s training inversion was token-correct and never observed, and
// `01-F59`'s "greyed is not disabled" could only be asserted by grepping for an attribute.
//
// These assert what an OPERATOR would experience. Where a structural guard already covers the
// same law, this is the second, independent witness — the two fail for different reasons, which
// is the point.

import { paisa } from "@restos/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { palette } from "../tokens/index";
import { AppShell } from "./AppShell";
import { MoneyValue } from "./MoneyValue";
import { Tile } from "./Tile";

afterEach(cleanup);

// `children` is destructured OUT of the overrides rather than spread with them: JSX children
// written between the tags win over a spread `children` prop, so spreading it silently dropped
// the tile these tests are about and left them looking for a button that was never rendered.
const shell = ({
  children = <p>work surface</p>,
  ...over
}: Partial<Parameters<typeof AppShell>[0]> = {}) => (
  <AppShell
    actor="Ayesha"
    deviceLabel="Counter 1"
    businessDay="2026-07-29"
    lan="ok"
    hub="ok"
    cloud="down"
    alarms={[]}
    onAcknowledgeAlarm={() => {}}
    tabs={[{ id: "counter", label: "Counter" }]}
    activeTabId="counter"
    onSelectTab={() => {}}
    {...over}
  >
    {children}
  </AppShell>
);

describe("01-F59 — an 86'd item is greyed, and STILL SELLABLE", () => {
  it("fires onPress when an unavailable tile is pressed", () => {
    // The behaviour the spec requires and a `disabled` attribute silently removed: "the counter
    // may still sell it deliberately — 02-F31 owns the oversell path." The structural guard
    // checks the attribute is absent; this checks the operator can actually complete the act.
    const onPress = vi.fn();
    render(
      <ThemeProvider>
        <Tile
          posture="counter"
          label="Mutton Karahi"
          unavailable
          unavailableReason="86'd"
          onPress={onPress}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onPress, "an 86'd item could not be sold — 01-F59 violated").toHaveBeenCalledTimes(1);
  });

  it("still SHOWS the reason, so the deliberate act is an informed one", () => {
    // 27-F4 — disabled IN PLACE, with the reason. Selling anyway is only a decision if the
    // operator can see what they are deciding about.
    render(
      <ThemeProvider>
        <Tile
          posture="counter"
          label="Mutton Karahi"
          unavailable
          unavailableReason="86'd"
          onPress={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button").textContent).toContain("86'd");
  });
});

describe("27-F67 — training renders the OPPOSITE polarity, and it is TOTAL", () => {
  // The claim 27-F67 rests on is that the inversion reaches everything, because one component
  // rendering production colours inside a training shell is the "staff member treats a real
  // order as practice" failure 27-F63 exists to prevent. Until now nothing observed it.
  const bg = (el: HTMLElement): string => el.style.background || el.style.backgroundColor;

  it("a training shell paints the DARK surface where a live one paints light", () => {
    const { container: live } = render(<ThemeProvider polarity="light">{shell()}</ThemeProvider>);
    const liveShell = live.firstElementChild as HTMLElement;
    cleanup();
    const { container: training } = render(
      <ThemeProvider polarity="light">{shell({ training: true })}</ThemeProvider>,
    );
    // AppShell wraps its body in its own provider, so the painted element is one level in.
    const trainingShell = training.querySelector("div > div") as HTMLElement;

    expect(bg(liveShell)).not.toBe("");
    expect(bg(trainingShell), "the training shell did not invert").not.toBe(bg(liveShell));
  });

  it("reaches a DESCENDANT the shell did not paint — the totality claim", () => {
    // A tile inside the shell must follow too. This is the assertion that would fail if a single
    // component held the static record, which is exactly the bypass a reviewer demonstrated.
    render(
      <ThemeProvider polarity="light">
        {shell({
          training: true,
          children: <Tile posture="counter" label="Karahi" onPress={() => {}} />,
        })}
      </ThemeProvider>,
    );
    const tile = screen.getByRole("button", { name: "Karahi" });
    expect(bg(tile), "a tile inside a training shell kept production colours").toBe(
      palette.dark["bgColor-surface-raised"],
    );
  });

  it("a KDS that opted into dark inverts to LIGHT, not to dark again", () => {
    // 27-F19's opt-in and 27-F67's inversion are one mechanism, so the inversion has to be
    // relative to the surface's own normal — not a hardcoded "training means dark".
    render(
      <ThemeProvider polarity="dark">
        {shell({
          training: true,
          children: <Tile posture="counter" label="Karahi" onPress={() => {}} />,
        })}
      </ThemeProvider>,
    );
    const tile = screen.getByRole("button", { name: "Karahi" });
    expect(bg(tile), "a dark KDS in training did not invert to light").toBe(
      palette.light["bgColor-surface-raised"],
    );
  });

  it("names the mode in words, because an inverted shell alone reads as a display fault", () => {
    render(<ThemeProvider polarity="light">{shell({ training: true })}</ThemeProvider>);
    expect(screen.getByText(/TRAINING/)).toBeTruthy();
  });
});

describe("27-F23/F24 — money arrives finished", () => {
  it("renders symbol-first with no decimals", () => {
    render(
      <ThemeProvider>
        <MoneyValue paisa={paisa(125_000)} />
      </ThemeProvider>,
    );
    // 1250 rupees. Western grouping (CLDR gives en-PK `#,##0.###`), `Rs` first, no paisa shown:
    // ~60% of this population recognise numbers against 9.5% who can do any arithmetic, so the
    // number has to be complete on arrival.
    expect(screen.getByText("Rs 1,250")).toBeTruthy();
  });

  it("27-F12 — a direction is a WORD, never a minus sign", () => {
    // A lone `-` is one glyph wide, is the first mark lost at distance or on a scratched panel,
    // and means nothing to a non-reader. It is also what a cashier repeats back to a customer.
    render(
      <ThemeProvider>
        <MoneyValue paisa={paisa(45_000)} direction="refund" />
      </ThemeProvider>,
    );
    const text = screen.getByText(/REFUND/).textContent ?? "";
    expect(text).toContain("REFUND");
    expect(text, "a minus sign leaked into a money value").not.toContain("-");
  });
});
