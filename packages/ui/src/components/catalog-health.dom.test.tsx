// `01-F56` / `DEC-SYNC-011` (a) / `00 §5.7` — a refused catalog is OBSERVABLE, on the honesty UI.
//
// These RENDER. Every claim below is about what an operator would experience, which is the whole
// reason this package grew a `.dom.test.tsx` project: a structural guard can pin that the token
// is named and cannot pin that the word reaches the screen.
//
// ⚠ WHAT THIS FILE CANNOT SAY, and it is the boundary that matters here: happy-dom performs NO
// LAYOUT, so `getBoundingClientRect` is zeroes throughout. Nothing here is evidence that the chip
// is ON the screen rather than merely in the document — that is `pnpm layout:check`'s job, and the
// fixture in `apps/pos-electron/src/layout-gate/preload.ts` raises this exact condition so the
// strip's real height is measured against `27 §1a`'s two panels with it up.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme";
import { palette } from "../tokens/index";
import { AppShell } from "./AppShell";
import { CatalogHealth } from "./CatalogHealth";

afterEach(cleanup);

const REFUSAL = {
  version: 4,
  message: "this till refused the update it was sent — it needs a full menu, not a change list",
} as const;

const shell = (over: Partial<Parameters<typeof AppShell>[0]> = {}) => (
  <AppShell
    actor="Ayesha"
    deviceLabel="Counter 1"
    businessDay="2026-08-08"
    lan="ok"
    hub="ok"
    cloud="ok"
    alarms={[]}
    onAcknowledgeAlarm={() => {}}
    tabs={[{ id: "order", label: "Order" }]}
    activeTabId="order"
    onSelectTab={() => {}}
    {...over}
  >
    <p>work surface</p>
  </AppShell>
);

describe("27-F16 — colour is spent on the abnormal, so a healthy catalog draws NOTHING", () => {
  it("renders no element at all when the catalog is current", () => {
    const { container } = render(<CatalogHealth refusal={null} />);
    // Not "renders a muted chip", not "renders an OK word" — nothing. `27-F16`'s argument is that
    // the commonest state on screen must not spend the preattentive channel, and a catalog that
    // is up to date is the state of every till in the fleet nearly all of the time.
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is absent from the shell's strip when no refusal is supplied", () => {
    render(shell());
    expect(screen.queryByText(/NOT UPDATING/)).toBeNull();
  });
});

describe("01-F56 / 00 §5.7 — a refused catalog says so, and says which menu is being sold from", () => {
  it("names the condition in words a cashier can repeat down a phone", () => {
    render(<CatalogHealth refusal={REFUSAL} />);
    expect(screen.getByText("NOT UPDATING")).toBeTruthy();
    expect(screen.getByText(REFUSAL.message)).toBeTruthy();
  });

  it("carries 27-F12's NUMBER — the version this device is actually serving", () => {
    render(<CatalogHealth refusal={REFUSAL} />);
    // `00 §5.7`: "stale is never presented as live". The version is what makes the staleness a
    // measured quantity rather than a vague warning — one menu behind and forty read differently
    // to whoever is called, and nothing else on this device reports it.
    expect(screen.getByText(/still showing v4/)).toBeTruthy();
  });

  it("reaches the strip through the shell, on every operational surface", () => {
    render(shell({ catalog: REFUSAL }));
    // `27-F1` — there is nowhere to navigate, so chrome that carries this is chrome every
    // surface has. The shell is the only thing that guarantees it.
    expect(screen.getByText("NOT UPDATING")).toBeTruthy();
    expect(screen.getByText(/still showing v4/)).toBeTruthy();
  });
});

describe("27-F11d — it does not interrupt, and it is not the S1 band", () => {
  it("is a status and never an alert, so it cannot take a half-built cart away", () => {
    render(<CatalogHealth refusal={REFUSAL} />);
    // `role="alert"` is what `AlarmBand` uses and what assistive technology interrupts on.
    // `27-F11d`: the work underneath stays visible and usable. A cashier mid-order is not
    // stopped by a menu that is one version behind — `01-F17`, and `01-F53` means she is still
    // billing correctly from prices captured into the events already.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("offers NO acknowledgement control — it is a STATE, not an event", () => {
    const { container } = render(<CatalogHealth refusal={REFUSAL} />);
    // The structural difference from `03-F5`'s band, and the reason this is not one. An
    // acknowledgement clears an alarm; a button here would take a condition that is STILL TRUE
    // off the honesty surface, which is exactly what `00 §5.7` exists to forbid. It goes when the
    // catalog un-sticks and at no other moment.
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("leaves the work surface and the S1 band untouched when it is raised", () => {
    render(
      shell({
        catalog: REFUSAL,
        alarms: [{ id: "a1", message: "The kitchen printer did not answer.", subject: "TH230" }],
      }),
    );
    // Both signals coexist. If this had been built as an alarm it would have queued BEHIND the
    // print failure in `AlarmBand`'s head-plus-count (`27-F11d`, gap G13) and shown as "and 1
    // more" — a stuck menu reduced to a digit on a band about a different subject.
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("NOT UPDATING")).toBeTruthy();
    expect(screen.getByText("work surface")).toBeTruthy();
  });
});

describe("27-F14 — the ABNORMAL slot, not the fault slot", () => {
  /**
   * The allocation is a CLOSED table and this is the assertion that holds the reading. Red's
   * claimants are named — *"ticket overdue, print failure, cash variance past threshold, void &
   * refund actions, revoked device"* — and a stuck menu is not one. The only connectivity
   * claimant anywhere in `27-F14` is *"sync degraded"*, in amber.
   *
   * Asserted against the palette rather than against a hex, so it survives a repaint: what is
   * pinned is WHICH SLOT is spent, which is the thing `27-F14` allocates.
   */
  it("paints the abnormal fill and never the fault fill", () => {
    const { container } = render(<CatalogHealth refusal={REFUSAL} />);
    const chip = container.querySelector('[role="status"]') as HTMLElement;
    expect(chip.style.background).toBe(palette.light["bgColor-status-abnormal"]);
    expect(chip.style.background).not.toBe(palette.light["bgColor-status-fault"]);
  });

  it("carries 27-F64's outline, so the fill is legitimately relieved of SC 1.4.11", () => {
    const { container } = render(<CatalogHealth refusal={REFUSAL} />);
    const chip = container.querySelector('[role="status"]') as HTMLElement;
    expect(chip.style.border).toContain(palette.light["outlineColor-status-abnormal"]);
  });

  it("follows the polarity in force, so a training shell does not leak a production colour", () => {
    // `27-F67` — the training inversion is TOTAL. A component reading the static record would
    // render a production-coloured region inside a training shell, which is the "staff member
    // treats a real order as practice" failure `27-F63` exists to prevent. Asserted in BOTH
    // directions: it must take the dark value, not merely differ from the light one, or a
    // component rendering an unrelated third colour would pass.
    const { container } = render(
      <ThemeProvider polarity="dark">
        <CatalogHealth refusal={REFUSAL} />
      </ThemeProvider>,
    );
    const chip = container.querySelector('[role="status"]') as HTMLElement;
    expect(chip.style.background).toBe(palette.dark["bgColor-status-abnormal"]);
    expect(chip.style.background).not.toBe(palette.light["bgColor-status-abnormal"]);
  });
});

describe("27-F12 / 27-F13 — the state survives with the colour removed", () => {
  it("is readable in greyscale: a word, a number and a fixed position carry it", () => {
    render(shell({ catalog: REFUSAL }));
    // Nothing here reads a colour. If every one of these still passes with the hue stripped —
    // which it does, because none of them looks at one — the surface clears `27-F13`'s
    // "unreadable in greyscale is broken" bar on the channels `27-F18` puts ahead of colour.
    expect(screen.getByText("NOT UPDATING")).toBeTruthy();
    expect(screen.getByText(/still showing v4/)).toBeTruthy();
    expect(screen.getByLabelText(/Menu: not updating/)).toBeTruthy();
  });

  it("says something DIFFERENT from the reachability chips beside it", () => {
    // The distinction the whole surface exists to make. The strip already says whether the
    // device can REACH the cloud; this says whether it ACCEPTED what came back. A device that
    // is refusing its menu while every link is healthy is the case a fourth `ConnectionFacts`
    // chip would have reported as fine.
    render(shell({ catalog: REFUSAL, lan: "ok", hub: "ok", cloud: "ok" }));
    expect(screen.getAllByLabelText(/Cloud: ok/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Menu: not updating/)).toBeTruthy();
  });
});
