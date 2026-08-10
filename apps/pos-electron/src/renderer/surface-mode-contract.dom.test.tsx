// `27-F4` / `27-F5` ACROSS SURFACE MODES — the set of controls, and their order.
//
// Authored from spec text only (`24 §3` step 2, `.claude/rules/tests-and-conformance.md`), by a
// session that is not implementing responsive modes and has not read the implementation plan. If
// an assertion here is wrong, that is a FINDING for this session, cited by FR ID — never an edit.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE PROPERTY, AND THE TWO FRs IT COMES FROM
//
// `27-F4`: *"Adding, removing or reordering an item on an operational grid is a **breaking
// change** … For the VENDOR's shipped grid structure it binds **absolutely**."* Plus: *"No
// adaptive, frecency-sorted or personalised ordering anywhere staff-facing"* — 23 of 34 field
// subjects could not perform a task they knew well on a differently-arranged device.
//
// `27-F5`: *"No context-dependent or invisible controls … **Every action has a persistent,
// visible, labelled target.**"*
//
// A responsive layout is the most natural way in the world to break both by accident: a control
// that collapses into an overflow at one width is a control that MOVED, and one that is dropped
// to make a layout fit is a control that stopped being persistent. **Nothing in this repo asserted
// either across modes.** A mode that silently dropped `TAKE CASH` on small glass passed every
// suite, `pnpm verify`, `seams:check` and `layout:check`.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE CAN AND CANNOT SEE — read this before trusting a green run
//
// **happy-dom performs NO LAYOUT.** Every `getBoundingClientRect()` is zeroes and no
// `ResizeObserver` fires on its own. So this file can express *"the control is in the document,
// at this position in reading order"* and can NEVER express *"the control is on the screen"* or
// *"this target is 20 mm"*. Those are `src/layout-gate/mode-contract.ts`, which opens a real
// `BrowserWindow` and measures in Blink.
//
// The split is therefore:
//
// | claim | where | why |
// |---|---|---|
// | the SET of controls is identical across modes | here | set membership is structural |
// | the **DOM/reading** order is identical across modes | here | DOM order is structural |
// | the **VISUAL** order is identical across modes | the gate | needs real geometry |
// | `27-F8`'s millimetres hold in every mode | the gate | needs real geometry |
// | the mode is a two-axis function of size | `packages/ui/src/surface-mode-axes.oracle.test.ts` | pure logic |
//
// **DOM ORDER AND VISUAL ORDER CAN DIVERGE, AND `27-F4` IS ABOUT THE SECOND ONE.** That FR
// protects an operator's hand: what it forbids is the tile moving on the glass. A reflow from one
// column to two, or a `flex-direction: column; flex-wrap: wrap` container of the kind
// `CashSurfaces.tsx` already ships, changes the visual sequence while leaving the DOM untouched —
// so a suite that asserts DOM order alone would pass the exact defect. **Both are asserted, in
// two places, on purpose**: DOM order here (it is also the tab order and the screen-reader order,
// and `27-F5`'s "persistent" is a structural claim), and visual order in the gate, where the
// controls are sorted by measured (y, x). Neither substitutes for the other and a reader must not
// treat this file's green as covering the geometric half.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS PINNED HERE THAT THE FRs DO NOT DECIDE (declare it, do not discover it)
//
//  1. **A "control" is what the layout gate already calls one** — `button`, `[role=button]`,
//     `a[href]`, form fields, and anything focusable. Same selector as `layout-gate/probe.ts`, so
//     the two halves of this contract are counting the same population and a control that is
//     invisible to one is invisible to the other for one stated reason rather than two accidents.
//
//  2. **A control's IDENTITY is its accessible name** (`aria-label`, else trimmed text). That is
//     what `27-F5` calls a *labelled* target and what an operator reads. It is deliberately not a
//     `data-testid`: an identity the product does not ship is an identity the operator cannot
//     use, and it would let a mode rename a control without this suite noticing.
//
//  3. **The MODE IS NOT NAMED ANYWHERE IN THIS FILE.** The fixtures are `27 §1a`'s own panels,
//     converted to millimetres; which mode each produces is the implementer's business. What is
//     asserted is that the fixtures produce **at least two DISTINCT modes** (read out of the
//     shipped `useSurfaceMode`, so no signature is assumed) and that the surfaces do not differ
//     between them. That is the `24-F14` guard without which every comparison below is a
//     comparison of a thing with itself.
//
//  4. **`ItemGrid`'s PAGED tiles are excluded from the exact-set claim, and paging is not a
//     `27-F4` violation.** `27-F2` is explicit: *"page capacity is derived from the surface's
//     usable area and 27-F8's target size, **never fixed by this document**"* — so a smaller
//     surface legitimately shows fewer tiles per page, and `27-F1`/`27-F2a` make lateral paging
//     depth ONE rather than a hidden control. An oracle that demanded an identical tile count on
//     a 223 mm tablet and a 531 mm desktop would be demanding a spec violation, and would stay
//     RED against a correct implementation. So the exact-set sweep uses a catalogue small enough
//     to fit one page on the SMALLEST fixture (no pager renders at all — `ItemGrid` and
//     `OrderList` both gate theirs on `pages > 1`), and a SECOND sweep runs the product's own
//     design case — `02-N2`'s 300-item catalogue, sampled at the gate's 46 — and asserts the
//     weaker, still-decisive property: **every label that differs between modes must be a
//     catalogue item.** A chrome control may never be what a mode drops.

import { DP_PER_INCH, PanelRoot, useSurfaceMode, WorkSurface } from "@restos/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  Alarm,
  AppendRequest,
  DeviceState,
  MenuItem,
  OpenOrder,
  RosterMember,
} from "../shared/ipc";
import { App } from "./App";

afterEach(cleanup);

// ── `27 §1a`'s hardware, in millimetres of glass ─────────────────────────────────────────────

/**
 * `diagonalIn × (px / hypot) × 25.4` — the identity `27-F11c` rests on, in which the RESOLUTION
 * CANCELS. Derived rather than transcribed for the reason `27-F68` gives: a pinned number is one
 * panel's answer, and `27 §1a`'s table is a range across panels.
 */
const glass = (diagonalIn: number, w: number, h: number) => ({
  widthMm: ((diagonalIn * w) / Math.hypot(w, h)) * 25.4,
  heightMm: ((diagonalIn * h) / Math.hypot(w, h)) * 25.4,
});

/**
 * Three surfaces the corpus itself names, spanning its whole range: `27 §1a`'s ~10.1″ waiter
 * tablet, its 15.6″ counter, and `27-F11f`'s 22″ pass panel.
 *
 * They are labelled by HARDWARE, never by mode (pinned reading 3). If the implementer moves a
 * boundary so that two of these land in one mode, the `24-F14` guard below says so out loud
 * rather than letting the sweep compare a surface with itself.
 */
const FIXTURE_GLASS = {
  "27 §1a waiter tablet ~10.1″": glass(10.1, 1366, 768),
  "27 §1a counter 15.6″": glass(15.6, 1366, 768),
  "27-F11f pass panel 22″": glass(22, 1920, 1080),
} as const;

type GlassName = keyof typeof FIXTURE_GLASS;
const GLASS_NAMES = Object.keys(FIXTURE_GLASS) as GlassName[];

// ── Driving the real measurement seam, with no new API ───────────────────────────────────────

/**
 * **The fixture drives `usePhysicalSize`'s own `ResizeObserver`, and that is deliberate.**
 *
 * happy-dom never fires one, so nothing in the tree would ever be measured and every surface in
 * this file would be rendered in exactly one mode — the vacuous green this file exists to
 * prevent. Stubbing the observer with a chosen `contentRect` is the ONLY way to reach the shipped
 * seam (`usePhysicalSize` → `PanelRoot` → `PanelSizeContext` → `useSurfaceMode`) without
 * inventing a mode override prop that the product would then have to carry for a test's benefit.
 *
 * **The unit is a dp**, because `usePhysicalSize` reads `contentRect` through `mmFromDp`: inside
 * `PanelRoot` the pixel Blink lays out in IS the dp (`27-F68`). `DP_PER_INCH` is imported rather
 * than written as 160, so this conversion cannot drift from the package's own.
 *
 * **By default every observed element gets the same rect**, so `Counter`'s grid box and
 * `OrdersSurface`'s two list boxes are told they are as large as the whole panel. That inflates
 * page capacity, never reduces it — which is why pinned reading 4 sizes the exact-set fixture
 * against the SMALLEST glass and why the 46-item sweep asserts a property that holds at any
 * capacity.
 *
 * **`NESTED_GLASS` is the exception, and it exists for exactly one test.** When it is set, any
 * observed box CONTAINED BY another observed box is told it is that size instead — which is the
 * physical situation `03-F5`'s band creates: the band takes 102 dp out of the WORK AREA and takes
 * nothing at all out of the GLASS. See the band-invariance test at the bottom of this file.
 *
 * The classification cannot be made when a box is first seen, because React attaches callback
 * refs **children-first**, so an inner box is observed before the outer one is in the set. Every
 * observer is therefore re-fired on each new `observe`, against the complete set. The callback ref
 * in `usePhysicalSize` is `useCallback([])`-stable, so a re-fire re-renders and does not
 * re-observe; this terminates.
 */
let CURRENT_GLASS: { widthMm: number; heightMm: number } = FIXTURE_GLASS["27 §1a counter 15.6″"];
let NESTED_GLASS: { widthMm: number; heightMm: number } | null = null;

const dp = (mm: number): number => (mm / 25.4) * DP_PER_INCH;

type Watched = { target: Element; cb: ResizeObserverCallback; self: GlassResizeObserver };
let watched: Watched[] = [];

const fireAll = (): void => {
  const nested = NESTED_GLASS;
  for (const w of watched) {
    const isNested =
      nested !== null &&
      watched.some((other) => other.target !== w.target && other.target.contains(w.target));
    const mm = isNested && nested !== null ? nested : CURRENT_GLASS;
    w.cb(
      [
        {
          target: w.target,
          contentRect: {
            width: dp(mm.widthMm),
            height: dp(mm.heightMm),
          } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      w.self as unknown as ResizeObserver,
    );
  }
};

class GlassResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element) {
    watched.push({ target, cb: this.cb, self: this });
    fireAll();
  }
  unobserve() {}
  disconnect() {
    watched = watched.filter((w) => w.self !== this);
  }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", GlassResizeObserver);
  watched = [];
  NESTED_GLASS = null;
  ALARMS_UP = true;
});

// ── Reading the surface (pinned readings 1 and 2) ────────────────────────────────────────────

/** The layout gate's own control selector, so both halves of this contract count one population. */
const CONTROL_SELECTOR =
  'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const accessibleName = (el: Element): string =>
  (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ");

/** Every control on the surface, in DOM order — which is reading order and tab order. */
const controlsInDomOrder = (): string[] =>
  [...document.body.querySelectorAll(CONTROL_SELECTOR)].map(accessibleName);

/** The rail, read from the DOM so a tab another session adds is measured without touching this. */
const tabRail = (): string[] =>
  [...document.body.querySelectorAll('nav[aria-label="Main"] button')].map(accessibleName);

// ── The fixture ──────────────────────────────────────────────────────────────────────────────

const ROSTER: RosterMember[] = [
  { user_id: "user-ayesha", display_name: "Ayesha Khan", role: "cashier" },
  { user_id: "user-bilal", display_name: "Bilal Ahmed", role: "cashier" },
  { user_id: "user-hina", display_name: "Hina Raza", role: "branch_manager" },
] as RosterMember[];

/**
 * FOUR items — small enough that `ItemGrid` draws one page on `27 §1a`'s ~10.1″ tablet
 * (223 × 126 mm at `tileMm: 28` is a 7 × 4 page), so **no pager renders on any fixture** and the
 * control set is exactly comparable. Pinned reading 4.
 */
const SMALL_MENU: MenuItem[] = [
  { id: "item-karahi", label: "Chicken Karahi" },
  { id: "item-biryani", label: "Beef Biryani" },
  { id: "item-naan", label: "Naan" },
  { id: "item-chai", label: "Chai" },
];

/**
 * `02-N2` is a 300-item catalogue and `27-F11a` sizes a tab at ~25 items. 46 is the number the
 * layout gate's own fixture settled on, and its reason transfers exactly: at 24 items the grid fit
 * one page on every shipping panel, so the pager was never drawn and the paged case was never
 * measured. A sweep that only ever ran the unpaged case would be blind to the mode most likely to
 * drop chrome — the one that has run out of room.
 */
const LARGE_MENU: MenuItem[] = Array.from({ length: 46 }, (_, i) => ({
  id: `item-${i}`,
  label: `Menu item ${i + 1}`,
}));

const DEVICE = (over: Partial<DeviceState> = {}): DeviceState =>
  ({
    actor: "Hina Raza",
    deviceLabel: "Counter 1",
    businessDay: "2026-08-10",
    training: false,
    lan: "ok",
    hub: "down",
    cloud: "ok",
    blocked: null,
    user: { user_id: "user-hina", display_name: "Hina Raza" },
    ...over,
  }) as DeviceState;

/**
 * `03-F5`'s band is UP for the whole sweep, and that is the ordinary state of this device rather
 * than an exotic one: no printer is attached, so every confirm raises one ~20 s later. It is also
 * the tighter vertical budget, which is where a mode is most tempted to drop something.
 */
const ALARMS: Alarm[] = [
  {
    id: "alarm-1",
    subject: "Counter 1 — order A-014",
    message: "KITCHEN TICKET DID NOT PRINT",
  },
];

/**
 * The band is up for every sweep in this file EXCEPT the one that compares the two device states
 * (`27-F11d`, at the bottom). Module-level rather than a `mountBridge` argument so the sweep — a
 * shared helper — needs no new parameter for one caller's benefit; reset in `beforeEach`.
 */
let ALARMS_UP = true;

const ONE_ORDER: OpenOrder[] = [
  {
    order_id: "order-1",
    reference: "A-014",
    total_paisa: 77_000,
    paid_paisa: 0,
    lines: [
      {
        line_id: "l1",
        name: "Chicken Karahi",
        quantity: 1,
        modifiers: [],
        removals: [],
        note: null,
      },
    ],
  } as OpenOrder,
];

const CASH_STATE = {
  shifts: [
    {
      shift_id: "shift-1",
      cashier: "user-hina",
      prev_shift_id: null,
      open_at: 1_780_000_000_000,
      expected_json: JSON.stringify({ cash: 100_000 }),
      paid_out_paisa: 0,
      no_sale_count: 0,
      closed: 0,
      counted_cash_paisa: null,
      expected_at_close_json: null,
      variance_paisa: null,
      exceptions_json: "[]",
    },
  ],
  days: [
    {
      day_id: "day-1",
      business_date: "2026-08-10",
      prev_day_id: null,
      opening_float_paisa: 500_000,
      deposit_paisa: 0,
      closed: 0,
      counted_cash_paisa: null,
      exceptions_json: "[]",
    },
  ],
  unbound: [],
  unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
};

const mountBridge = (opts: { locked: boolean; menu: MenuItem[] }) => {
  const bridge = {
    deviceState: vi.fn(async () => DEVICE(opts.locked ? { user: null } : {})),
    openOrders: vi.fn(async () => ONE_ORDER),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => opts.menu),
    staff: vi.fn(async () => ROSTER),
    cashState: vi.fn(async () => CASH_STATE),
    alarms: vi.fn(async () => (ALARMS_UP ? ALARMS : [])),
    acknowledgeAlarm: vi.fn(async () => {}),
    append: vi.fn(async (_req: AppendRequest) => ({ id: "evt-1" })),
    addLine: vi.fn(async (_req: AddLineRequest) => ({ id: "evt-2" })),
    unlock: vi.fn(async () => ({ unlocked: true })),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

// ── The sweep ────────────────────────────────────────────────────────────────────────────────

type Surfaces = Record<string, { controls: string[]; tabs: string[] }>;

/**
 * Render every surface the counter draws, on one piece of glass, and record what is there.
 *
 * The tabs are read FROM THE DOM and clicked by index, so a tab another session adds is swept
 * without touching this file — the same property the layout gate has and for the same reason
 * (`27-F4` makes adding one a breaking change, and a rail this suite did not know about would be
 * a rail this suite never compared).
 */
const sweep = async (menu: MenuItem[]): Promise<Surfaces> => {
  const out: Surfaces = {};

  // `02-F18` — a locked device shows ONLY the unlock screen, so it is its own render.
  mountBridge({ locked: true, menu });
  const locked = render(<App />);
  await screen.findByText("WHO ARE YOU?");
  out["unlock:identify"] = { controls: controlsInDomOrder(), tabs: tabRail() };

  // `01-F61` step two — identify, THEN the PIN. The pad is a surface of its own.
  fireEvent.click(screen.getByRole("button", { name: /^Hina Raza/ }));
  await screen.findByText("SIGNING IN AS");
  out["unlock:pin"] = { controls: controlsInDomOrder(), tabs: tabRail() };
  locked.unmount();

  mountBridge({ locked: false, menu });
  render(<App />);
  await waitFor(() => expect(tabRail().length).toBeGreaterThan(0));

  const rail = tabRail();
  for (const [i, label] of rail.entries()) {
    const button = document.body.querySelectorAll('nav[aria-label="Main"] button')[i];
    if (button !== undefined) fireEvent.click(button);
    // The surfaces are synchronous once the shell's reads have landed; a microtask flush is
    // enough and a timer would only make the suite slower.
    await waitFor(() => expect(controlsInDomOrder().length).toBeGreaterThan(0));
    out[`tab:${label}`] = { controls: controlsInDomOrder(), tabs: tabRail() };
  }

  return out;
};

/** Read the mode the shipped context actually resolves to — no selector signature assumed. */
const ModeProbe = () => <span data-mode={useSurfaceMode()}>{useSurfaceMode()}</span>;

/**
 * `27 §1a`'s counter panel. `PanelRoot` requires a density and `cssPxPerDp` throws on a
 * non-finite one, so it is supplied rather than defaulted — but **nothing here depends on the
 * value**: the observer is stubbed, so the millimetres come from the fixture and the density only
 * decides a `zoom` that happy-dom does not lay out against. `devicePixelRatio` is passed
 * explicitly for the same reason, so the probe does not inherit a host fact.
 */
const REFERENCE_PPI = Math.hypot(1366, 768) / 15.6;

/**
 * **The probe's tree is `PanelRoot > WorkSurface`, and the `PanelRoot` is the whole point.**
 *
 * ⚠ **THIS HELPER RENDERED A BARE `WorkSurface` AND THAT WAS A DEFECT IN THIS FILE.** It was
 * written when `WorkSurface` measured itself and published the mode; the implementation moved the
 * measurement up to `PanelRoot` (`27-F68`'s existing boundary), and `packages/ui/CLAUDE.md` now
 * states the consequence outright: *"a `WorkSurface` with no `PanelRoot` above it resolves to the
 * default `counter` on every panel."* So this helper reported ONE mode for all three fixtures and
 * the `24-F14` guard fired — correctly, and pointing at the wrong culprit, because the guard's own
 * tree was the thing that had gone stale. **Every other test in this file renders `<App/>`, which
 * wraps in `PanelRoot`, so they were measuring three real modes throughout.** The claim was true
 * and exceeded; only the tree was wrong.
 *
 * Kept as a worked example because it is this repo's named hazard in its purest form: **an oracle
 * that hand-copies a fragment of the product's arrangement instead of using the product's own**,
 * which is `K-3`'s dead-oracle defect one level up. The test directly below is the tripwire that
 * makes the next such move loud instead of confusing.
 */
const modeOnGlass = (mm: { widthMm: number; heightMm: number }): string => {
  CURRENT_GLASS = mm;
  const r = render(
    <PanelRoot panelPpi={REFERENCE_PPI} devicePixelRatio={1}>
      <WorkSurface>
        <ModeProbe />
      </WorkSurface>
    </PanelRoot>,
  );
  const text = (r.container.textContent ?? "").trim();
  r.unmount();
  return text;
};

const modeOn = (name: GlassName): string => modeOnGlass(FIXTURE_GLASS[name]);

describe("24-F14 — the fixtures actually produce different modes", () => {
  it("27 §1a's tablet, counter and 27-F11f's pass panel are not all one mode", () => {
    /**
     * Without this every comparison in this file is a comparison of a surface with itself, and a
     * product with no responsive construct at all would pass the whole suite. It is read through
     * the SHIPPED seam — the panel measured, `useSurfaceMode` reading — so it assumes nothing
     * about the selector's signature and it also proves the `ResizeObserver` fixture reaches the
     * measurement at all.
     *
     * `>= 2` rather than `=== 3`: the corpus names no count of modes, and an implementer who
     * decides the 22″ pass panel and the 15.6″ counter share one is making a call this oracle does
     * not own. Two distinct modes is the minimum at which "across modes" means anything.
     */
    const modes = GLASS_NAMES.map((n) => `${n} -> ${modeOn(n)}`);
    const distinct = new Set(GLASS_NAMES.map(modeOn));
    expect(
      distinct.size,
      `EMPTY MATCH (24-F14): every fixture resolved to ONE mode, so nothing in this file is ` +
        `comparing two modes. ${modes.join(" | ")}. Either the panel is not being measured, or ` +
        `the selector does not separate 27 §1a's ~10.1" tablet from its 15.6" counter from ` +
        `27-F11f's 22" pass panel. Check the FIRST of those before the second: if this probe's ` +
        `tree has drifted from the one <App/> renders, the mode it reads is a default and this ` +
        `message is accusing the wrong component. See modeOnGlass's header.`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("the mode comes from the PANEL, and a WorkSurface alone publishes nothing", () => {
    /**
     * **The footgun that broke the guard above, pinned so it cannot bite silently again — and it
     * is also the drift tripwire for where the mode is published from.**
     *
     * Two claims, asserted together because either alone is satisfiable by an accident:
     *
     * 1. A bare `WorkSurface` resolves to the SAME mode on every piece of glass. That is the
     *    documented consequence of the mode living at `PanelRoot`, and it is a real hazard for
     *    anyone writing a test here — `02-F18`'s lock surface uses a `WorkSurface` directly, so
     *    the fragment looks like a complete tree.
     * 2. The same three fixtures inside a `PanelRoot` do NOT all agree.
     *
     * If the publisher ever moves again — back down to `WorkSurface`, or up, or out — claim 1
     * stops holding and this test reddens BY NAME, instead of the `24-F14` guard reddening with a
     * message that blames the selector. That is the difference between a confusing failure and a
     * diagnostic one, and this session paid for the confusing version.
     *
     * **It pins WHERE the mode is published, which the corpus does not decide** — so it is a
     * pinned reading, not an FR. The reason it is worth pinning is `27-F4`'s, and it is the
     * implementation's own: `03-F5`'s band takes room out of the WORK AREA on every confirm, so a
     * mode read there would reflow the layout mid-service and destroy the single stated reason
     * reflow is legal at all — *a till lives in one mode for its service life and no operator
     * watches it change*. The glass does not move. If a future ruling moves the publisher, this
     * test is the finding to bring to the test-owning session.
     */
    const bare = GLASS_NAMES.map((name) => {
      CURRENT_GLASS = FIXTURE_GLASS[name];
      const r = render(
        <WorkSurface>
          <ModeProbe />
        </WorkSurface>,
      );
      const text = (r.container.textContent ?? "").trim();
      r.unmount();
      return text;
    });

    expect(
      new Set(bare).size,
      `a bare WorkSurface reported ${JSON.stringify(bare)} across 27 §1a's tablet, its counter ` +
        "and 27-F11f's pass panel. It is supposed to report ONE mode — the default — because it " +
        "publishes no measurement and the mode comes from PanelRoot. If it now varies, the mode " +
        "publisher has MOVED, and every probe tree in this file needs re-deriving from what " +
        "<App/> actually renders rather than being patched to match.",
    ).toBe(1);

    expect(
      new Set(GLASS_NAMES.map(modeOn)).size,
      "the same three fixtures inside a PanelRoot did not produce more than one mode, so claim 1 " +
        "above is vacuous — a tree that publishes nothing and a tree that publishes one answer " +
        "are indistinguishable here (24-F14).",
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("27-F4 / 27-F5 — a mode changes WHERE and HOW BIG, never WHAT or IN WHAT ORDER", () => {
  it("every surface carries the SAME SET of controls in every mode", async () => {
    /**
     * `27-F5`: *"Every action has a persistent, visible, labelled target."* A control that is
     * present on one piece of glass and absent on another is not persistent, and `27-F4` makes
     * removing an item from an operational surface a breaking change that binds **absolutely** on
     * the vendor's shipped structure.
     *
     * Asserted as a SET (sorted) so that this test fails for exactly one reason — something was
     * added or dropped — and the ordering test below fails for exactly the other. Two properties
     * collapsed into one assertion is how a reader loses the ability to tell which defect they
     * have.
     */
    const byGlass: Record<string, Surfaces> = {};
    for (const name of GLASS_NAMES) {
      CURRENT_GLASS = FIXTURE_GLASS[name];
      byGlass[name] = await sweep(SMALL_MENU);
      cleanup();
    }

    const [reference, ...others] = GLASS_NAMES;
    if (reference === undefined) throw new Error("EMPTY MATCH (24-F14): no fixture glass");
    const base = byGlass[reference];
    if (base === undefined) throw new Error("EMPTY MATCH (24-F14): reference sweep is missing");

    // `24-F14` — a sweep that reached no surfaces, or a surface that drew no controls, must fail
    // rather than compare two empty lists successfully.
    expect(
      Object.keys(base).length,
      "EMPTY MATCH (24-F14): the sweep found no surfaces at all",
    ).toBeGreaterThanOrEqual(6);
    for (const [surface, r] of Object.entries(base)) {
      expect(
        r.controls.length,
        `EMPTY MATCH (24-F14): '${surface}' drew no controls, so comparing it proves nothing`,
      ).toBeGreaterThan(0);
    }

    for (const other of others) {
      const theirs = byGlass[other];
      if (theirs === undefined) throw new Error(`EMPTY MATCH (24-F14): no sweep for ${other}`);
      expect(
        Object.keys(theirs).sort(),
        `the SURFACES themselves differ between '${reference}' and '${other}' — a mode may not ` +
          "add or remove a screen (27-F4)",
      ).toEqual(Object.keys(base).sort());

      for (const surface of Object.keys(base)) {
        const a = base[surface]?.controls ?? [];
        const b = theirs[surface]?.controls ?? [];
        expect(
          [...b].sort(),
          `27-F4 / 27-F5 BROKEN on '${surface}': the set of controls differs between ` +
            `'${reference}' and '${other}'.\n` +
            `  only on ${reference}: ${JSON.stringify(a.filter((x) => !b.includes(x)))}\n` +
            `  only on ${other}: ${JSON.stringify(b.filter((x) => !a.includes(x)))}\n` +
            "A mode may change WHERE a control is and HOW BIG it is. It may never change WHAT is " +
            "there: 27-F5 requires every action to have a PERSISTENT, visible, labelled target, " +
            "and 27-F4 makes adding or removing an item on an operational surface a breaking " +
            "change that binds absolutely on the vendor's shipped structure. A control that " +
            "collapses into an overflow, a 'more' affordance or nothing at all on smaller glass " +
            "is the defect both FRs name.",
        ).toEqual([...a].sort());
      }
    }
  });

  it("every surface carries its controls in the SAME READING ORDER in every mode", async () => {
    /**
     * `27-F4` is positional memory: *"23 of 34 field subjects could not perform a task they knew
     * well on a differently-arranged device."* The DOM order is the order a screen reader speaks,
     * the order the Tab key walks, and — on every surface here that does not reflow — the order
     * the eye reads.
     *
     * **It is NOT the whole of `27-F4`.** A two-column reflow can preserve DOM order and permute
     * the visual sequence, and happy-dom cannot see that at all. The visual half is asserted in
     * `src/layout-gate/mode-contract.ts`, where the controls are sorted by measured (y, x) in a
     * real Blink layout. Both are needed; this file's green does not imply the other's.
     */
    const byGlass: Record<string, Surfaces> = {};
    for (const name of GLASS_NAMES) {
      CURRENT_GLASS = FIXTURE_GLASS[name];
      byGlass[name] = await sweep(SMALL_MENU);
      cleanup();
    }

    const [reference, ...others] = GLASS_NAMES;
    if (reference === undefined) throw new Error("EMPTY MATCH (24-F14): no fixture glass");
    const base = byGlass[reference];
    if (base === undefined) throw new Error("EMPTY MATCH (24-F14): reference sweep is missing");

    let compared = 0;
    for (const other of others) {
      const theirs = byGlass[other];
      if (theirs === undefined) throw new Error(`EMPTY MATCH (24-F14): no sweep for ${other}`);
      for (const surface of Object.keys(base)) {
        const a = base[surface]?.controls ?? [];
        const b = theirs[surface]?.controls ?? [];
        // Compare only the labels both modes carry, so this assertion fails for REORDERING and
        // never for a dropped control — that is the test above, and one defect should produce one
        // red row.
        const common = new Set(a.filter((x) => b.includes(x)));
        const left = a.filter((x) => common.has(x));
        const right = b.filter((x) => common.has(x));
        if (left.length === 0) continue;
        compared += 1;
        expect(
          right,
          `27-F4 BROKEN on '${surface}': the reading order of the controls both modes carry ` +
            `differs between '${reference}' and '${other}'.\n` +
            `  ${reference}: ${JSON.stringify(left)}\n` +
            `  ${other}: ${JSON.stringify(right)}\n` +
            "Grid position is a compatibility contract: reordering an item on an operational " +
            "surface is a breaking change requiring PR justification and a dev-pilot acclimation " +
            "window, and it binds ABSOLUTELY on the vendor's shipped structure. 23 of 34 field " +
            "subjects could not perform a task they knew well on a differently-arranged device.",
        ).toEqual(left);
      }
    }
    expect(
      compared,
      "EMPTY MATCH (24-F14): no surface had two controls in common across modes, so the ordering " +
        "assertion never ran",
    ).toBeGreaterThanOrEqual(6);
  });

  it("the TAB RAIL is identical — same tabs, same order, on every piece of glass (27-F4)", async () => {
    /**
     * The rail is the chrome `27-F1` guarantees never leaves the screen, and `27-F4` makes it the
     * most position-dependent thing in the product after the keypad. `Counter.tsx`'s own header
     * says it: *"a tab added after the pilot costs every operator who learned the layout without
     * it"*.
     *
     * Read from the DOM rather than compared against a list this file keeps, so the day another
     * session adds a sixth tab it is measured here automatically — a hardcoded list would be the
     * one thing that then needed editing, and `screen-map.md`'s tab-rail rows have already gone
     * stale once in this wave.
     */
    const rails: Record<string, string[]> = {};
    for (const name of GLASS_NAMES) {
      CURRENT_GLASS = FIXTURE_GLASS[name];
      const surfaces = await sweep(SMALL_MENU);
      const railed = Object.values(surfaces).find((s) => s.tabs.length > 0);
      rails[name] = railed?.tabs ?? [];
      cleanup();
    }

    const [reference, ...others] = GLASS_NAMES;
    if (reference === undefined) throw new Error("EMPTY MATCH (24-F14): no fixture glass");
    const base = rails[reference] ?? [];
    expect(
      base.length,
      "EMPTY MATCH (24-F14): the rail rendered no tabs on the reference glass, so this assertion " +
        "compares two empty lists",
    ).toBeGreaterThanOrEqual(2);

    for (const other of others) {
      expect(
        rails[other],
        `27-F4 BROKEN: the tab rail differs between '${reference}' and '${other}'. The rail is ` +
          "the chrome 27-F1 guarantees never leaves the screen and 27-F4 makes adding, removing " +
          "or reordering an operational item a breaking change. A rail that sheds a tab on " +
          "smaller glass — or folds one into an overflow — destroys the positional memory of " +
          "every operator who learned it, and 27-F5 forbids the affordance that would replace it.",
      ).toEqual(base);
    }
  });
});

describe("27-F2 — paging is the ONLY thing a mode may change about a catalogue", () => {
  it("at 02-N2 scale, every label that differs between modes is a catalogue item", async () => {
    /**
     * The dangerous case, aimed at deliberately (the round-3 law): a mode with a 46-item
     * catalogue has genuinely run out of room, and that is when dropping a control to make the
     * layout fit is most tempting. `27-F2` permits exactly one thing to vary — how many tiles are
     * on a page — and `27-F1`/`27-F2a` make the pager depth ONE rather than a hidden control.
     * Everything else on the surface is still governed by `27-F4` and `27-F5`.
     *
     * So the property is: **the symmetric difference between two modes' control sets contains
     * nothing but catalogue item labels and page numbers.** A chrome control in that set — the
     * order-type row, `Send to kitchen`, a tab, `TAKE CASH`, a keypad key — is the defect.
     */
    const byGlass: Record<string, Surfaces> = {};
    for (const name of GLASS_NAMES) {
      CURRENT_GLASS = FIXTURE_GLASS[name];
      byGlass[name] = await sweep(LARGE_MENU);
      cleanup();
    }

    const catalogue = new Set(LARGE_MENU.map((i) => i.label));
    // `ItemGrid`/`OrderList` render page numbers as bare integers with no `aria-label`. They are
    // the mechanism `27-F2` mandates, so a differing page COUNT is the FR working, not a breach.
    const isPageNumber = (label: string) => /^\d+$/.test(label);
    // A tile disabled in place folds its reason into the accessible name (`Tile`'s
    // `aria-label={`${label} — ${reason}`}`), which is `27-F4`'s disable-in-place and still a
    // catalogue item.
    const isCatalogue = (label: string) =>
      catalogue.has(label) || [...catalogue].some((c) => label.startsWith(`${c} —`));

    const [reference, ...others] = GLASS_NAMES;
    if (reference === undefined) throw new Error("EMPTY MATCH (24-F14): no fixture glass");
    const base = byGlass[reference];
    if (base === undefined) throw new Error("EMPTY MATCH (24-F14): reference sweep is missing");

    let surfacesChecked = 0;
    for (const other of others) {
      const theirs = byGlass[other];
      if (theirs === undefined) throw new Error(`EMPTY MATCH (24-F14): no sweep for ${other}`);
      for (const surface of Object.keys(base)) {
        const a = base[surface]?.controls ?? [];
        const b = theirs[surface]?.controls ?? [];
        surfacesChecked += 1;
        const differing = [
          ...a.filter((x) => !b.includes(x)),
          ...b.filter((x) => !a.includes(x)),
        ].filter((label) => !isCatalogue(label) && !isPageNumber(label));
        expect(
          differing,
          `27-F4 / 27-F5 BROKEN on '${surface}' at 02-N2 scale: these are CHROME controls, not ` +
            `catalogue tiles, and they differ between '${reference}' and '${other}'. 27-F2 lets a ` +
            "mode change how many items are on a PAGE — capacity is derived from the surface's " +
            "usable area — and nothing else. A control that a mode drops because the catalogue " +
            "got big is a control that stopped being persistent (27-F5), on the surface an " +
            "operator uses ~300 times a shift.",
        ).toEqual([]);
      }
    }
    expect(
      surfacesChecked,
      "EMPTY MATCH (24-F14): no surface was compared at catalogue scale",
    ).toBeGreaterThanOrEqual(6);
  });
});

describe("27-F4 — the mode is a property of the GLASS, so 03-F5's band cannot flip it", () => {
  it("a nested measurement, however different, does not change the mode", () => {
    /**
     * **THE BAND-FLIP, which is the mutant the implementing session reported it could not kill.**
     * Its words: *"the harm of a band-flip is the layout changing under the operator, which no
     * rail measures."* Correct — and it is expressible here, because the harm is not a geometry
     * failure at all. Both arrangements FIT the panel; that is exactly why the layout gate stays
     * green under it and why no fit, clipping or composition check can ever see it.
     *
     * `27-F4` tolerates reflow for **one stated reason**: a till lives in one mode for its whole
     * service life, so no operator ever watches the layout change under them. `03-F5`'s band takes
     * room out of the WORK AREA on every confirm — on this device, with no printer attached, that
     * is ~20 s after every order — and puts it back on acknowledgement. A mode read from the work
     * area therefore reflows the entire counter mid-service, twice per order, which is not a
     * reflow the FR permits: it is the precise thing its one exemption is conditioned on NOT
     * happening. The band takes nothing out of the glass.
     *
     * **The mechanism.** `NESTED_GLASS` makes the fixture tell any observed box that sits INSIDE
     * another observed box that it is a different size — which is the physical situation exactly.
     * The outer box gets `27-F11f`'s 22″ pass panel; every nested box gets `27 §1a`'s ~10.1″
     * tablet. Those two resolve to different modes (asserted below, or this proves nothing), so
     * ANY implementation that reads its mode from a box inside the panel reports the tablet's
     * answer and this reddens. The correct implementation reports the glass's.
     *
     * A wildly different nested size rather than a realistic 102 dp is deliberate: it needs no
     * knowledge of where a boundary sits, so this test pins no threshold and survives the
     * implementer moving one. The realistic band-sized case is a strict subset of it.
     *
     * ⚠ **WHAT THIS CANNOT SEE, stated so a green run is not over-read.** The probe tree is
     * `PanelRoot > WorkSurface`, which is the arrangement both `AppShell`'s `<main>` and
     * `02-F18`'s lock surface use — so a work-area measurement in either of those places is
     * caught. A mode derived from somewhere this tree has no box for, or from something other
     * than a `ResizeObserver` (`window.innerHeight`, a media query, a threshold threaded down as
     * a prop), is invisible here. That is a named blind spot, not a claim of completeness.
     */
    const glass = FIXTURE_GLASS["27-F11f pass panel 22″"];
    const workArea = FIXTURE_GLASS["27 §1a waiter tablet ~10.1″"];

    // The fixture has to be able to tell the two answers apart, or the assertion below is true
    // for a reason that has nothing to do with the property (the round-3 law: run the harness
    // over the divergent case, or the kill count means nothing).
    const glassMode = modeOnGlass(glass);
    const workAreaMode = modeOnGlass(workArea);
    expect(
      workAreaMode,
      "EMPTY MATCH (24-F14): the panel and the work-area sizes resolve to the SAME mode, so an " +
        "implementation reading either one passes this test. Pick two fixtures the selector " +
        "separates.",
    ).not.toBe(glassMode);

    CURRENT_GLASS = glass;
    NESTED_GLASS = workArea;
    const r = render(
      <PanelRoot panelPpi={REFERENCE_PPI} devicePixelRatio={1}>
        <WorkSurface>
          <ModeProbe />
        </WorkSurface>
      </PanelRoot>,
    );
    const reported = (r.container.textContent ?? "").trim();
    r.unmount();

    expect(
      reported,
      `27-F4 BROKEN: with ${glass.widthMm.toFixed(0)} x ${glass.heightMm.toFixed(0)} mm of GLASS ` +
        `and a work area of ${workArea.widthMm.toFixed(0)} x ${workArea.heightMm.toFixed(0)} mm, ` +
        `the mode came out '${reported}' — the WORK AREA's answer ('${workAreaMode}'), not the ` +
        `panel's ('${glassMode}'). The work area is not a stable input: 03-F5's band takes room ` +
        "out of it on every confirm and gives it back on acknowledgement, so a mode keyed there " +
        "reflows the whole counter mid-service, twice per order. 27-F4 permits reflow for exactly " +
        "one reason — a till lives in ONE mode for its service life and no operator watches the " +
        "layout change under them — and this is that condition failing. Note that no geometry " +
        "rail can catch it: both arrangements fit the panel, so the layout gate stays green.",
    ).toBe(glassMode);
  });

  it("the whole app keeps every control, in order, when 03-F5's band goes up", async () => {
    /**
     * The same law from the other end, on the real tree rather than a probe, and it is the weaker
     * half by construction — said plainly rather than left to look like coverage it is not.
     *
     * `27-F11d` is the FR here: *"the work underneath stays visible and usable"* — a half-built
     * cart is never taken away from a cashier with a customer waiting. Raising the band may take
     * vertical room; it may not take a CONTROL, and it may not move one in the reading order.
     * That is `27-F5`'s persistence and `27-F4`'s ordering applied to a state change rather than
     * to a panel, and it stays meaningful whatever the mode turns out to be keyed on.
     *
     * **What it cannot see:** a mode flip that changes only margins, column counts or type sizes
     * is invisible to it, because happy-dom lays nothing out and the shipped `compact`
     * arrangement changes no accessible name and no DOM order. The test above is the one that
     * catches that; this one catches the band taking a control away, which is the harm `27-F11d`
     * names in words.
     */
    CURRENT_GLASS = FIXTURE_GLASS["27 §1a counter 15.6″"];

    const banded = await sweep(SMALL_MENU);
    cleanup();
    ALARMS_UP = false;
    const quiet = await sweep(SMALL_MENU);
    cleanup();
    ALARMS_UP = true;

    expect(
      Object.keys(quiet).sort(),
      "27-F11d BROKEN: raising 03-F5's band changed which SURFACES exist. The band takes a strip " +
        "of the shell; it may never take a screen.",
    ).toEqual(Object.keys(banded).sort());

    let compared = 0;
    for (const surface of Object.keys(quiet)) {
      const up = banded[surface]?.controls ?? [];
      const clear = quiet[surface]?.controls ?? [];
      // The band contributes its own acknowledgement control (`03-F5`), which is the one
      // legitimate difference: it is a control the band ADDS, not one it takes. Everything the
      // quiet state carries must survive the band, in the same relative order.
      compared += 1;
      expect(
        clear.filter((label) => up.includes(label)),
        `27-F11d / 27-F5 BROKEN on '${surface}': raising 03-F5's band took controls away from ` +
          "the work underneath. Missing under the band: " +
          `${JSON.stringify(clear.filter((l) => !up.includes(l)))}. That FR's whole ruling is ` +
          "that the work underneath stays visible and usable — a half-built cart is never taken " +
          "away from a cashier with a customer waiting.",
      ).toEqual(clear);
      expect(
        up.filter((label) => clear.includes(label)),
        `27-F4 BROKEN on '${surface}': raising 03-F5's band REORDERED the controls underneath it.`,
      ).toEqual(clear);
    }
    expect(
      compared,
      "EMPTY MATCH (24-F14): no surface was compared across the two device states",
    ).toBeGreaterThanOrEqual(6);
  });
});
