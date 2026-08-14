// ACCEPTANCE TESTS — **authored from spec text only** (`24 §3` step 2), by a session that
// implemented NONE of what they require. `Counter.tsx` was not touched; the assertions that carry
// a verdict are RED against the shipped renderer on purpose.
//
// PROVENANCE: written from `02-F57`, `00 §5.7`, `01-F17`, `02-F20`, `02-F37`, `02-F47`, `21 §5`,
// `27-F5`, `27-F12` and `27-F14`. `02-F45` was read (the task naming it as background) and is NOT
// cited by any assertion: it rules that attribution rides the envelope, which decides nothing
// about what a refused write puts on the glass. Saying so here rather than letting a reader
// assume a citation was dropped.
//
// ── THE DEFECT, AS OBSERVED ────────────────────────────────────────────────────────────────
//
// A cashier without `day.open_close` pressed **Open the day** on a live till and **nothing
// happened at all**. Not a message, not a mark, not a changed word: the surface after the refusal
// was the surface before the press. So *"you may not do this"*, *"this device cannot reach the
// ledger"* and *"this till is broken"* are one picture, and the only way she can tell them apart
// is to fetch somebody.
//
// `Counter.tsx`'s shared helper is `void op.catch(() => {}).then(reload)` and its own comment
// records the cost rather than paying it — *"What is deliberately NOT here: a visible alarm …
// inventing a local error banner would put a second, competing error surface on the screen …
// Recorded rather than improvised."* That was an honest thing to record and `02-F57` is the FR
// that answers it. **Both write helpers are in scope**, and that is the whole reason this file
// exists beside `caller-refusal.dom.test.tsx`: `Open the day` is refused through
// `escalatableWrite` (whose escalation offer is `null` for an act with no `escalate` cell — so it
// falls through to silence) and `Send to kitchen` through the plain `write`. **A fix to one is
// not a fix to the other**, and the cashier's experience of both is identical today.
//
// ── WHAT IS PINNED, AND WHY THE SHAPE IS PINNED AT ALL ─────────────────────────────────────
//
// §A1, §A3, §B1 and §B2 are **mechanism-free**: they compare what an operator can READ in two
// states and require the two to differ. They name no element, role, colour or word.
//
// §A2 and §C pin the ANNOUNCEMENT CHANNEL — `role="status"`, and neither `role="alert"` nor a
// modal — and that is deliberate rather than lazy. `02-F57` states the shape and inherits
// `02-F47`'s reasons, which already ship one surface over: `27-F14` allocates red to a closed
// list this is not on; `21 §5` reserves alarm severities to itself (*"no module invents its own
// alarm behavior"*), so assigning one is a spec change and not an implementation choice;
// `27-F11g` makes `03-F5`'s band the only signal that food is not being cooked, and a second
// claimant is how it stops being the loudest thing on the glass; and `02-F37` forbids anything
// going between the cashier and the customer. A file that left the shape open would license a
// second, competing error surface — which is precisely what `Counter.tsx`'s comment was right to
// refuse to improvise.
//
// The absence assertions are gated on the refusal having ANNOUNCED SOMETHING first, and the
// `role="alert"` query is proved to WORK by a positive control (a real `03-F5` band). Both
// guards exist because `caller-refusal.dom.test.tsx` measured the alternative: its three absence
// assertions all passed against an unbuilt surface, because with nothing announced there is
// trivially no band to find.
//
// ── WHAT THIS FILE DOES NOT DECIDE ────────────────────────────────────────────────────────
//
// The wording (`00 §5.6` binds it and nothing else), whether the refusal names the permission or
// only the act, whether it clears itself, and whether the two helpers converge on one
// implementation. `02-F57` leaves all four open and so does this.
//
// ── MUTATION MATRIX (the round-3 law: report the numbers, do not claim the tests bite) ─────
//
// Run OUT OF TREE — a scratchpad copy of this app with `node_modules` symlinked — because this
// session authored the tests and edits no implementation. The CONTROL is a plausible `02-F57`
// surface: a `writeRefusal` state set in both helpers' `catch`, cleared on success, rendered as
// one announced line in the work area. Each mutant is exactly one branch off it.
//
//   CONTROL (plausible surface)                    12/12 PASS   killed: none
//   M1  the plain `write` half swallows again      10/12        killed: B1, B2
//   M2  the `escalatableWrite` half swallows       6/12         killed: A1, A2, A3, C1, C2, C3
//   M3  it announces "refused" on SUCCESS too      10/12        killed: A3, B2
//   M4  announced as `role="alert"` (03-F5's band) 6/12         killed: A2, A3, B2, C1, C2, C3
//   M5  drawn, but not announced                   6/12         killed: A2, A3, B2, C1, C2, C3
//   M6  the act stops reaching the ledger after a
//       refusal (the "safe" repair)                11/12        killed: A4
//   M7  NEGATIVE CONTROL — a real refactor         12/12 PASS   killed: none
//   M3b it never clears a stale refusal            12/12 PASS   — see below
//
// **CONTROL 12/12 is the number that matters most**: nothing here blocks a correct
// implementation, which `24 §3`'s second corollary makes as important as the kills. **M7 is what
// makes every red row mean anything.** M1 and M2 kill disjoint sets, which is the measured form
// of *"a fix to one helper is not a fix to the other"*. M3 kills the two CONTROL rows and
// nothing else, which is exactly what they exist for — without them, a surface that shouts
// "refused" at every press satisfies §A1 and §B1. M6 is the anti-fix row.
//
// **M3b SURVIVES ALL TWELVE AND IS REPORTED RATHER THAN FIXED.** A refusal that lingers after a
// later attempt succeeds is not caught by anything here — because `02-F57` deliberately leaves
// *"whether it clears itself"* open, and a test that closed it would be this file deciding an
// FR. It is named so the next reader knows it is a gap by construction and not by oversight.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Alarm,
  AppendRequest,
  CashDay,
  CashState,
  DeviceState,
  MenuItem,
  OpenOrder,
} from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

const REFERENCE_PANEL = { width: 1366, height: 768 };
class StubResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: REFERENCE_PANEL as DOMRectReadOnly } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const DEVICE: DeviceState = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-14",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
} as DeviceState;

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/** An order with a line on it, so `Send to kitchen` has something to send. */
const OPEN_ORDER: OpenOrder = {
  order_id: "order-42",
  reference: "A-042",
  total_paisa: 45000,
  paid_paisa: 0,
  lines: [],
} as OpenOrder;

const EMPTY_CASH: CashState = {
  shifts: [],
  days: [],
  unbound: [],
  unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
};

/**
 * What `main/authorize.ts` throws when the matrix says DENY, arriving at the renderer as a
 * rejected promise — `ipcMain.handle` serialises the error to its message and drops everything
 * else, which is why `escalatableWrite` has to ask `escalationFor` a second question and why an
 * act with no `escalate` cell falls through to nothing.
 */
const DENIED = "day.open_close is not permitted for this role (02-F22)";

let appended: AppendRequest[];
/** Every bridge member the screen reached for that this harness does not implement. */
let unexpectedBridgeCalls: string[];
let notify: () => void;

const mount = (opts: { refuse?: readonly string[]; alarms?: readonly Alarm[] } = {}): void => {
  appended = [];
  unexpectedBridgeCalls = [];
  notify = () => {};
  const refuse = new Set(opts.refuse ?? []);

  /**
   * A MUTABLE cash projection, because a static one cannot tell the three states apart.
   *
   * `02-F57`'s property is that *untried*, *refused* and *done* are distinguishable, and *done*
   * is only itself if the fold actually moves — a harness whose `cashState` never changed would
   * make "the day opened" and "the day was refused" identical on the trusted side too, and every
   * comparison below would be measuring the renderer against itself.
   */
  const days: CashDay[] = [];

  const known = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => [OPEN_ORDER]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    quickTags: vi.fn(async () => []),
    alarms: vi.fn(async () => opts.alarms ?? []),
    cashState: vi.fn(async (): Promise<CashState> => ({ ...EMPTY_CASH, days: [...days] })),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      if (refuse.has(req.type)) throw new Error(DENIED);
      if (req.type === "day.opened") {
        days.push({
          day_id: String(req.payload.day_id),
          business_date: DEVICE.businessDay,
          prev_day_id: null,
          opening_float_paisa: Number(req.payload.opening_float_paisa ?? 0),
          deposit_paisa: 0,
          closed: 0,
          counted_cash_paisa: null,
          exceptions_json: "[]",
        });
      }
      // Exactly what `main/index.ts` does after a successful append: the fold moved, so the
      // surfaces reading it are told to re-read. Firing it here means an implementation may
      // re-read on this push or on the append's own resolution — this file decides neither.
      notify();
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    /**
     * `02-F20` through `main/authorize.ts`: an offer exists only where the matrix says
     * *escalate*. `day.open_close` for a cashier is a plain DENY, so this is the shipped answer
     * and it is what makes the refusal fall through to silence today. A harness that returned an
     * offer here would be testing the manager pad, which already works.
     */
    escalationFor: vi.fn(async () => null),
    onChanged: vi.fn((cb: () => void) => {
      notify = cb;
      return () => {};
    }),
  } as Record<string, unknown>;

  // An unknown member is RECORDED rather than thrown, so a missing seam reads as a named finding
  // instead of an unhandled rejection that React 19 turns into a blank till.
  const bridge = new Proxy(known, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      unexpectedBridgeCalls.push(prop);
      return async () => undefined;
    },
    has: () => true,
  });
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/** Everything on the glass. Used only where the claim is "these two states differ". */
const readable = (): string => document.body.textContent ?? "";

/**
 * Everything the surface is currently ANNOUNCING.
 *
 * `role="status"` is the four-component idiom already shipping in this tree — `CatalogHealth`,
 * `PanelHealth`, `ConnectionFacts` and `AgeBadge` — so this reads what the product already means
 * by *"a standing condition the operator should notice"*. The baseline is never empty (the
 * connection chips are `role="status"` too), which is what makes a CHANGE the signal rather than
 * a presence.
 */
const announced = (): string =>
  screen
    .queryAllByRole("status")
    .map((el) => el.textContent ?? "")
    .join(" | ");

const tabButton = (label: string): HTMLButtonElement => {
  const rail = document.querySelector('nav[aria-label="Main"]');
  const found = [...(rail?.querySelectorAll("button") ?? [])].find(
    (b) => (b.querySelector("span")?.textContent ?? "").trim() === label,
  );
  expect(found, `27-F4 — the rail must carry a ${label} tab`).toBeDefined();
  return found as HTMLButtonElement;
};

const goToTab = async (label: string) => {
  await screen.findByText("Order", { exact: true });
  fireEvent.click(tabButton(label));
  await waitFor(() => expect(tabButton(label).getAttribute("aria-current")).toBe("page"));
};

const press = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

const OPEN_DAY = /open\s+(the\s+)?day/i;
const SEND = /Send to kitchen/i;

/**
 * Press, and wait until the attempt has actually reached the bridge.
 *
 * The wait is on the APPEND rather than on a timer: what happens on the glass afterwards is what
 * every assertion here is about, so a helper that waited for the glass would decide the answer.
 */
const pressAndAwaitAttempt = async (name: RegExp, expectedAttempts: number) => {
  press(name);
  await waitFor(() => expect(appended).toHaveLength(expectedAttempts));
};

/**
 * Wait until the surface is announcing something it was not announcing before, and return it.
 *
 * Every comparison that needs the refusal to HAVE HAPPENED goes through here, and the gate is
 * load-bearing twice over. It is the settle point — the rejection resolves a tick after the
 * append is recorded, so a capture taken straight after `pressAndAwaitAttempt` would race a
 * correct implementation and flake. And it is what stops the absence assertions in §C being
 * vacuous: `caller-refusal.dom.test.tsx` measured all three of its own passing against an
 * unbuilt surface, because with nothing announced there is trivially no band to find.
 *
 * The baseline is passed in rather than compared against `""`: the connection chips are
 * `role="status"` too, so an empty-string check would be satisfied before the press.
 */
const awaitAnnouncementAfter = async (before: string): Promise<string> => {
  await waitFor(() =>
    expect(
      announced(),
      "RED-AWAITING-IMPLEMENTATION (02-F57): the refusal announced nothing, so every comparison " +
        "that follows would be measuring one silence against another",
    ).not.toBe(before),
  );
  return announced();
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — `02-F57`: THE OBSERVED ACT. `Open the day`, refused, through `escalatableWrite`.
//
// Driven with **nothing keyed on the pad**, and that is a deliberate choice rather than an
// oversight. `submit` clears the entry on every press, so a run that typed a float first would
// see the screen change whether or not a refusal was reported — and §A1 would pass today,
// vacuously, on the disappearance of four digits. An empty pad is a legitimate act (`02-F48`:
// *"`day.opened` accepts `opening_float_paisa: 0` because an empty drawer is a real thing"*) and
// it leaves the refusal as the ONLY thing that can have changed.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F57 — a refused `Open the day`", () => {
  it("§A1 00 §5.7 — the screen says something it did not say before the press", async () => {
    // THE assertion, and it is mechanism-free: no role, no element, no word. Today it fails
    // because `before === after` exactly — the refusal is swallowed by
    // `void op.catch(() => {}).then(reload)` and `reload` re-reads a fold that did not move.
    mount({ refuse: ["day.opened"] });
    render(<Counter />);
    await goToTab("Cash");

    const before = readable();
    await pressAndAwaitAttempt(OPEN_DAY, 1);

    await waitFor(() =>
      expect(
        readable(),
        "02-F57: the day open was refused and the surface is byte-identical to the surface " +
          "before the press — a refusal and a broken till are the same picture",
      ).not.toBe(before),
    );
  });

  it("§A2 02-F57/02-F47 — and it is ANNOUNCED, not merely drawn somewhere", async () => {
    // The channel pin. A word rendered into a corner nobody is looking at satisfies §A1 and
    // leaves an operator no better off; `02-F57` inherits `02-F47`'s shape, which is announced
    // and non-interrupting. `role="status"` is the idiom four shipped components already use.
    mount({ refuse: ["day.opened"] });
    render(<Counter />);
    await goToTab("Cash");

    const before = announced();
    await pressAndAwaitAttempt(OPEN_DAY, 1);
    await awaitAnnouncementAfter(before);
  });

  it("§A3 CONTROL — a press that SUCCEEDS does not read like a press that was refused", async () => {
    // THE ATTRIBUTION, and without it every assertion above is satisfied by a surface that
    // announces "refused" on every press. It also carries `02-F57`'s three-state property: what
    // the cashier reads after a refusal must not be what she reads after the act happened.
    //
    // It deliberately does NOT require silence on success — an implementation that says "day
    // open · float Rs 0" is fine and better. What it requires is that the two states differ.
    mount({ refuse: ["day.opened"] });
    render(<Counter />);
    await goToTab("Cash");
    const quiet = announced();
    await pressAndAwaitAttempt(OPEN_DAY, 1);
    // The announcement is awaited BEFORE either capture: reading `readable()` first would
    // snapshot the surface one tick early and compare the success state against a refusal state
    // that had not rendered yet.
    const said = await awaitAnnouncementAfter(quiet);
    const refused = { all: readable(), said };

    cleanup();
    mount({});
    render(<Counter />);
    await goToTab("Cash");
    await pressAndAwaitAttempt(OPEN_DAY, 1);
    // The fold moved, so the success state is a real state and not the absence of one.
    await waitFor(() => expect(readable()).not.toBe(refused.all));

    expect(
      announced(),
      "02-F57: the surface announces the same thing whether the act was refused or done, so the " +
        "announcement carries no information",
    ).not.toBe(refused.said);
  });

  it("§A4 01-F17/27-F5 — the act stays retryable and the till keeps working", async () => {
    // The anti-fix assertion. A refusal that disables the control leaves a branch whose day
    // cannot be opened at all — `02-F22` makes this a manager's act, so the FIRST attempt being
    // a cashier's is the ordinary case and the manager's PIN arrives afterwards. An inert
    // primary control is `27-F5`'s own failure mode, and `01-F17` is the standing law.
    mount({ refuse: ["day.opened"] });
    render(<Counter />);
    await goToTab("Cash");

    await pressAndAwaitAttempt(OPEN_DAY, 1);
    // Pressing again must REACH THE LEDGER — finding the button is not this assertion. A screen
    // that decided locally the act had failed for good would still render the control.
    await pressAndAwaitAttempt(OPEN_DAY, 2);
    expect(appended[1]?.type).toBe("day.opened");

    // And nothing else on the till was taken down with it (`01-F17`).
    await goToTab("Order");
    expect(await screen.findByRole("button", { name: /Karahi/i })).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — `02-F57`: THE OTHER HELPER. `Send to kitchen`, refused, through the plain `write`.
//
// Separate because a fix to `escalatableWrite` is not a fix to `write`, and this is the act with
// the worse consequence: the cashier believes the food is being cooked and it is not.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F57 — a refused `Send to kitchen`", () => {
  it("§B1 00 §5.7 — the screen says something it did not say before the press", async () => {
    mount({ refuse: ["order.confirmed"] });
    render(<Counter />);
    await screen.findByRole("button", { name: SEND });

    const before = readable();
    await pressAndAwaitAttempt(SEND, 1);

    await waitFor(() =>
      expect(
        readable(),
        "02-F57: `order.confirmed` was refused and the surface is unchanged — the cashier has " +
          "every reason to believe the kitchen has the order",
      ).not.toBe(before),
    );
  });

  it("§B2 CONTROL — a send that SUCCEEDS does not read like one that was refused", async () => {
    // Same attribution as §A3, on the other helper: without it, "always say refused" passes §B1.
    mount({ refuse: ["order.confirmed"] });
    render(<Counter />);
    await screen.findByRole("button", { name: SEND });
    const quiet = announced();
    await pressAndAwaitAttempt(SEND, 1);
    const refused = await awaitAnnouncementAfter(quiet);

    cleanup();
    mount({});
    render(<Counter />);
    await screen.findByRole("button", { name: SEND });
    await pressAndAwaitAttempt(SEND, 1);

    expect(
      announced(),
      "02-F57: the surface announces the same thing whether the kitchen was told or refused",
    ).not.toBe(refused);
  });

  it("§B3 01-F17 — the send stays retryable and the counter keeps working", async () => {
    mount({ refuse: ["order.confirmed"] });
    render(<Counter />);
    await screen.findByRole("button", { name: SEND });

    await pressAndAwaitAttempt(SEND, 1);
    await pressAndAwaitAttempt(SEND, 2);
    expect(appended[1]?.type).toBe("order.confirmed");
    expect(await screen.findByRole("button", { name: /Karahi/i })).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE SHAPE, AND THE POSITIVE CONTROLS THAT MAKE ITS ABSENCES MEAN ANYTHING.
//
// Every assertion here is gated on the refusal having announced something first. That gate is
// not ceremony: `caller-refusal.dom.test.tsx` measured its three absence assertions passing
// against an unbuilt surface, because with nothing announced there is trivially no band to find.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F57 — the refusal is a word, not an alarm and not a modal", () => {
  const refuseAndAwaitAnnouncement = async () => {
    mount({ refuse: ["day.opened"] });
    render(<Counter />);
    await goToTab("Cash");
    const before = announced();
    await pressAndAwaitAttempt(OPEN_DAY, 1);
    await awaitAnnouncementAfter(before);
  };

  it("§C0 POSITIVE CONTROL — `role=alert` IS findable on this screen when something raises it", () => {
    // Proof that §C1's absence query can see a presence. An absence assertion whose query is
    // broken proves nothing at all, and `03-F5`'s band is the real thing it must not become.
    mount({ alarms: [{ id: "a1", message: "KOT A-042 did not print — TH230", subject: "grill" }] });
    render(<Counter />);
    return waitFor(() =>
      expect(
        screen.queryAllByRole("alert").length,
        "the alert query found nothing even with a real 03-F5 band up — §C1 would be vacuous",
      ).toBeGreaterThan(0),
    );
  });

  it("§C1 27-F14/21 §5/27-F11g — a refused write does NOT raise an alert band", async () => {
    // `27-F14`'s red list is closed and a refused write is not on it; `21 §5` reserves alarm
    // severities to itself, so assigning one is a spec change (commandment 2); and `27-F11g`
    // makes that band the only signal that food is not being cooked — a second claimant is how
    // it stops being the loudest thing on the glass.
    await refuseAndAwaitAnnouncement();
    expect(
      screen.queryAllByRole("alert").length,
      "02-F57: the refusal claimed 03-F5's band, which 27-F14 and 21 §5 reserve",
    ).toBe(0);
  });

  it("§C2 02-F37/27-F5 — and it does NOT interrupt with a dialog", async () => {
    // `02-F37`: nothing goes between the cashier and the customer. A modal on a counter is a
    // gesture she must clear before she can serve anybody.
    await refuseAndAwaitAnnouncement();
    expect(
      screen.queryAllByRole("dialog").length,
      "02-F57/02-F37: the refusal interrupted with a modal",
    ).toBe(0);
    expect(screen.queryAllByRole("alertdialog").length).toBe(0);
  });

  it("§C3 — the refusal is on the surface where the act was taken", async () => {
    // `02-F57` puts the word *"where the act was taken"* and `27-F12` makes it a non-colour
    // channel. Anchored on the Cash surface's own subtree rather than on a component name, so an
    // implementation is free to build it however it likes as long as the cashier's eyes are
    // already there. `<main>` is `AppShell`'s work area — the region the tab rail switches.
    await refuseAndAwaitAnnouncement();
    const work = document.querySelector("main");
    expect(
      work,
      "AppShell renders no <main> — this anchor no longer means anything",
    ).not.toBeNull();
    const statuses = within(work as HTMLElement).queryAllByRole("status");
    expect(
      statuses.length,
      "02-F57: the refusal was announced outside the work area, away from the control she pressed",
    ).toBeGreaterThan(0);
  });

  it("§C4 — the screen invented no bridge member to say it", () => {
    // A harness guard rather than a product claim: if a refusal surface reaches main for its
    // words, this names the channel it invented instead of failing as an unhandled rejection.
    expect(unexpectedBridgeCalls, "the screen reached for an unknown bridge member").toEqual([]);
  });
});
