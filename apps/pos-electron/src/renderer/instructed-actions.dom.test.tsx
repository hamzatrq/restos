// ACCEPTANCE TESTS — the counter never instructs an action it will silently ignore, and never
// tells a cashier to start an order when the act she needs is to RECALL one.
//
// PROVENANCE (`24 §3` step 2): authored from spec text by the test-authoring session for the
// August 2026 dress rehearsal. **Committed RED.** No new FR was written for this file: both
// defects are refused by FRs that already exist, and saying which is the whole of the work.
//
//   27-F4   an unready surface is "disabled IN PLACE with its reason". The REASON is the half a
//           surface loses first, and a reason naming a different precondition is worse than
//           none — it sends the operator to the wrong control.
//   27-F5   "Every action has a persistent, visible, labelled target." A sentence telling an
//           operator that tapping X does Y, over an X that does nothing, is that law inverted:
//           the target is visible and the action is not there.
//   02-F1   every order carries `order_type` + `channel` from creation; neither is ever inferred
//           later. This is WHY the type row is inert without a channel — the refusal is correct
//           and the sentence beside it is not.
//   02-F51  (a) recall is how a terminal chooses an order it is not already on; (c) a chosen
//           order is RELEASED when its money side closes and the surface returns to its resting
//           state; (d) a terminal that never chose still shows the branch's first open order.
//   02-F11  `orders` is BRANCH-wide, so "this terminal has nothing" and "the branch has nothing"
//           are different facts.
//   01-F33  settlement does not reopen; an unsettled bill is reached, not restarted.
//   00 §5.7 the device reports what is true.
//   01-F17  a sale is never blocked.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// §0 — THE TWO MEASUREMENTS (observed on a running till, August 2026)
//
// 1. **THE ORDER-TYPE TILES ARE INERT AND THE SCREEN SAYS THEY SHOULD NOT BE.** `Counter.tsx`
//    renders `Order in progress — a type starts another order` beside three tiles whose
//    `onPress` is `startOrder`, which returns immediately when no channel is latched. So the
//    sentence is an instruction and the tap is a no-op, and the surface's own state line — the
//    one place `27-F4` puts the reason — is spent asserting the opposite of what happens. The
//    resting state has the same shape one sentence along: `Choose an order type first` sits over
//    a row that will ignore the choice until a CHANNEL has been picked from the row below it.
//
// 2. **`No order to settle — start one on Order.` IS SHOWN WHILE AN UNSETTLED OPEN ORDER SITS ON
//    THE ORDERS TAB.** This is the failure mode created by making two open orders possible
//    (`02-F51` (c) releases the cart at settlement, correctly). The sentence is true about the
//    TERMINAL and false about the BRANCH, and the remedy it names is the wrong one: starting a
//    new order leaves the open bill exactly where it was, and `01-F33` does not reopen anything.
//    `02-F51` (a) already says what the cashier should press — the row on Orders.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE PINS THAT THE FRs DO NOT — declared, not discovered
//
// If the implementer needs any of these different, that is a FINDING FOR THIS SESSION and not an
// edit to this file (`24 §3` step 2, `.claude/rules/tests-and-conformance.md`).
//
//  1. **`INSTRUCTS_A_TAP` is a family of INSTRUCTIONS, not a pinned sentence.** It matches the
//     shapes an instruction takes about the order-type row (*"choose an order type"*, *"a type
//     starts another order"*) and is used only as an ANTECEDENT: if the surface says one of
//     these, the tap must work. An implementation that re-words honestly satisfies it by making
//     the tap work OR by not saying it; one that re-words dishonestly is a finding, and no regex
//     can close that — §A3 is the control that keeps the antecedent reachable.
//  2. **`NAMES_THE_CHANNEL` discharges the antecedent.** A surface may legitimately name a GOAL
//     ("choose an order type") as long as the precondition the tap is actually waiting for is
//     also on the glass — that is a two-step instruction, not a false one. This is what makes
//     §A1 and §A2 differ by exactly one branch, and without it §A1 would stay RED under a
//     correct implementation, which is as damaging as a vacuous assertion.
//  3. **`SAYS_START_ONE` is likewise the antecedent for §B**, and §B3 is its control: the remedy
//     the surface names must reach the bill. A test that banned the string outright would break
//     the resting state it exists to protect, so §B2 asserts the two states DIFFER rather than
//     asserting any wording.
//  4. **Nothing here pins a replacement wording.** `00 §5.6` fixes English; no FR fixes a
//     sentence.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// AIMED AT A PLAUSIBLE WRONG IMPLEMENTATION (the round-3 law):
//
//   §A1  **THE CONTROL, and it is what makes §A2 attributable.** The RESTING state already gets
//        this right — the channel row says `Choose a channel first — it sets the price`, so the
//        precondition is on the glass beside the goal. §A1 and §A2 differ in exactly one branch
//        of `Counter.tsx` (`current === undefined`), so a red §A2 belongs to that branch alone.
//   §A2  **THE MEASURED CASE** — an order in progress, no channel latched. The type row's line
//        becomes `a type starts another order` and the channel row's line switches to describing
//        the OPEN order's channel, so nothing on the surface names the precondition at all.
//   §A3  **THE CONTROL.** With a channel latched the tap MUST start a second order: this suite
//        must not be satisfiable by re-greying the row, which is `DEC-MONEY-009`'s contributing
//        defect restored.
//   §B1  **THE MEASURED CASE** — the Pay surface's resting state with an open bill in the branch.
//   §B2  the second half of the same defect: *"this terminal has nothing and so does the branch"*
//        and *"this terminal has nothing but A-001 is open"* render IDENTICALLY today, so the
//        surface is wrong in one of the two cases whichever sentence it picks.
//   §B3  **THE CONTROL** — the remedy `02-F51` (a) names actually works from where the sentence
//        sends her, so §B1 cannot be satisfied by deleting the sentence and offering nothing.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  AppendRequest,
  DeviceState,
  MenuItem,
  OpenOrder,
} from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

/** happy-dom performs no layout. See `counter.dom.test.tsx`. */
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
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const order = (over: Partial<OpenOrder> & { order_id: string; reference: string }): OpenOrder => ({
  total_paisa: 45_000,
  paid_paisa: 0,
  lines: [],
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: 1_780_000_000_000,
  settled: 0,
  ...over,
});

let appended: AppendRequest[];
let lines: AddLineRequest[];
let orders: OpenOrder[];
let changed: (() => void) | null;

const mountWith = (initial: readonly OpenOrder[]) => {
  appended = [];
  lines = [];
  orders = [...initial];
  changed = null;
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => [...orders]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push(req);
      return { id: `evt-line-${lines.length}` };
    }),
    onChanged: vi.fn((cb: () => void) => {
      changed = cb;
      return () => {};
    }),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/** What main does when the fold moves: replace the projection, THEN push. Never one alone. */
const foldMovesTo = async (next: readonly OpenOrder[]) => {
  orders = [...next];
  changed?.();
  await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(0));
};

const railButtons = (): HTMLButtonElement[] => {
  const rail = document.querySelector('nav[aria-label="Main"]');
  return [...(rail?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];
};

const goToTab = async (label: string) => {
  const tab = railButtons().find(
    (b) => (b.querySelector("span")?.textContent ?? "").trim() === label,
  );
  expect(tab, `27-F4 — the rail must carry a ${label} tab`).toBeDefined();
  fireEvent.click(tab as HTMLButtonElement);
  await waitFor(() =>
    expect(
      railButtons()
        .find((b) => (b.querySelector("span")?.textContent ?? "").trim() === label)
        ?.getAttribute("aria-current"),
    ).toBe("page"),
  );
};

/** Everything the operator can read on the work surface, as one string. */
const surfaceText = (): string => document.querySelector("main")?.textContent ?? "";

const created = () => appended.filter((a) => a.type === "order.created");

const ORDER_TYPES = [/^Dine-in$/i, /^Takeaway$/i, /^Delivery$/i];

const pressEveryOrderType = async () => {
  for (const name of ORDER_TYPES) {
    fireEvent.click(await screen.findByRole("button", { name }));
  }
};

/**
 * The INSTRUCTION family (see the header). Used as an antecedent only: if the surface says one
 * of these about the order-type row, a tap on that row must start an order.
 */
const INSTRUCTS_A_TAP =
  /(choose|tap|pick|select)\s+(an?\s+)?order\s+type|(a\s+)?type\s+starts?\s+(an|another|a\s+new)\s+order/i;

/**
 * What DISCHARGES the antecedent: the precondition the tap is really waiting for, named on the
 * glass. `02-F1` needs both axes at creation, so a surface that says "choose a type" AND names
 * the channel has told the operator the truth in two steps.
 *
 * **Deliberately as wide as the WORD, not a sentence shape.** A narrower pattern
 * (`/choose a channel|channel first/`) rejected *"a type starts another order once a channel is
 * chosen"* — which is a correct implementation, and which is also the ONE wording that satisfies
 * `double-settlement.dom.test.tsx:264` at the same time (see this file's closing note). A test
 * that stays red under a correct implementation is as damaging as a vacuous one, and narrowing
 * this regex is how that would happen here.
 */
const NAMES_THE_CHANNEL = /channel|where\s+the\s+order/i;

/** §B's antecedent: the surface telling her to START an order. */
const SAYS_START_ONE = /start\s+(one|an\s+order|a\s+new\s+order)/i;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE ORDER-TYPE ROW. An instruction the surface will ignore.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 27-F4 / 27-F5 — the surface never instructs a tap it will silently ignore", () => {
  it("§A1 CONTROL — the RESTING state names the precondition, so the goal is honest", async () => {
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    const said = surfaceText();
    await pressEveryOrderType();

    // Three taps produce nothing here too — and that is CORRECT (`02-F1`), because the channel
    // row says `Choose a channel first — it sets the price` right underneath. The goal and its
    // precondition are both on the glass, which is `27-F4`'s reason discharged in two steps.
    // This test exists so that §A2's red belongs to the ONE branch the two states differ in.
    expect(
      !INSTRUCTS_A_TAP.test(said) || created().length > 0 || NAMES_THE_CHANNEL.test(said),
      `surface said: ${JSON.stringify(said)}`,
    ).toBe(true);
  });

  it("§A2 THE MEASURED CASE: an order in progress, no channel latched", async () => {
    // `02-F51` (d) — a terminal that has chosen nothing shows the branch's first open order, so
    // this is the ordinary state a cashier is in for most of a shift.
    mountWith([order({ order_id: "order-1", reference: "A-001" })]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    const said = surfaceText();
    expect(
      said,
      "the fixture is not in the state this test is about — no order is in progress",
    ).toMatch(/order in progress|A-001|Karahi/i);

    await pressEveryOrderType();

    expect(
      !INSTRUCTS_A_TAP.test(said) || created().length > 0 || NAMES_THE_CHANNEL.test(said),
      "27-F5 — every action has a persistent, visible, labelled target. Here the target is " +
        "visible, labelled and does nothing, while the sentence beside it promises that a type " +
        "starts another order — and unlike the resting state (§A1) NOTHING on this surface names " +
        "the channel the tap is waiting for: the channel row has switched to describing the " +
        "OPEN order's channel. Three taps, no `order.created`, nothing on the glass moved.\n" +
        `surface said: ${JSON.stringify(said)}`,
    ).toBe(true);
  });

  it("§A3 CONTROL — with a channel latched the tap DOES start another order", async () => {
    // `DEC-MONEY-009`'s contributing defect was the type row greyed whenever anything was open,
    // which is how two customers came to share one bill. This suite must not be satisfiable by
    // putting that back, so the live case is asserted here in the same file.
    mountWith([order({ order_id: "order-1", reference: "A-001" })]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    fireEvent.click(await screen.findByRole("button", { name: /^In restaurant$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Takeaway$/i }));

    await waitFor(() => expect(created()).toHaveLength(1));
    expect(created()[0]?.payload).toMatchObject({ channel: "counter", order_type: "takeaway" });
  });

  it("§A4 CONTROL — `02-F1` still refuses an order with no channel, and that refusal is right", async () => {
    // The defect is the SENTENCE, never the guard. An implementation that "fixed" this by
    // defaulting the channel would ring at counter prices on a foodpanda order — `01-F53`
    // freezes that price into a ledger `01-F1` forbids correcting — and would undo the founder
    // ruling that there is no default order type or channel.
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    await pressEveryOrderType();
    expect(
      created(),
      "02-F1 — an order was created without a channel the operator chose",
    ).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE PAY SURFACE. A true sentence about the terminal, naming the wrong remedy.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Put the terminal in `02-F51` (c)'s released state with a bill still open in the branch:
 * recall `A-002`, then let its money side close. `A-001` is untouched and unsettled throughout.
 */
const releaseTheCartLeavingABillOpen = async () => {
  const A1 = order({ order_id: "order-1", reference: "A-001" });
  const A2 = order({ order_id: "order-2", reference: "A-002" });
  mountWith([A1, A2]);
  render(<Counter />);
  await screen.findByRole("button", { name: /^Dine-in$/i });

  await goToTab("Orders");
  await screen.findByText("Open orders");
  const row = screen.getByText("A-002").closest("article");
  expect(row, "02-F51 (a) — the open-order row must carry the recall control").not.toBeNull();
  const controls = within(row as HTMLElement).getAllByRole("button");
  expect(controls, "02-F51 (a) / 27-F9 — the row carries exactly one control").toHaveLength(1);
  fireEvent.click(controls[0] as HTMLElement);

  // `02-F51` (c) — the money side closes, so the cart is RELEASED. `A-001` is still open.
  await foldMovesTo([A1, { ...A2, paid_paisa: A2.total_paisa }]);
  await goToTab("Pay");
};

describe("§B 02-F51 / 00 §5.7 — what the Pay surface says when this terminal has nothing", () => {
  it("§B1 THE MEASURED CASE: an unsettled bill is open on Orders and Pay says to start one", async () => {
    await releaseTheCartLeavingABillOpen();

    const said = surfaceText();
    expect(
      SAYS_START_ONE.test(said),
      "02-F51 (a) — `01-F33` does not reopen an order, so starting a new one leaves A-001 " +
        "unsettled exactly where it was. The act this cashier needs is the RECALL the FR " +
        "specifies, on the Orders tab, and the surface sends her to the wrong control.\n" +
        `surface said: ${JSON.stringify(said)}`,
    ).toBe(false);

    // And the sentence must not assert the branch is clear when it is not (`00 §5.7`,
    // `02-F11` — `orders` is branch-wide).
    expect(
      said.length,
      "00 §5.7 — a device that says nothing at all is not honest either",
    ).toBeGreaterThan(0);
  });

  it("§B2 the same defect from the other side: two different facts render identically", async () => {
    // The other half of `00 §5.7`, and the reason §B1 is not a ban on a string: *"this terminal
    // has nothing and neither does the branch"* and *"this terminal has nothing but A-001 is
    // open"* are DIFFERENT facts, and a surface that reports them identically is wrong in one of
    // the two cases whichever sentence it picks. Pinning no wording: only that they differ.
    await releaseTheCartLeavingABillOpen();
    const withABillOpen = surfaceText();

    cleanup();
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });
    await goToTab("Pay");
    const withNothingAnywhere = surfaceText();

    expect(withNothingAnywhere.length).toBeGreaterThan(0);
    expect(
      withABillOpen,
      "02-F11 / 00 §5.7 — the branch having an unsettled bill is a fact this surface has and " +
        "does not report",
    ).not.toEqual(withNothingAnywhere);
  });

  it("§B3 CONTROL — the remedy `02-F51` (a) names actually reaches the bill", async () => {
    // A surface that names a remedy must name one that works. This is the follow-through: from
    // the state §B1 measures, the recall on Orders puts A-001 on the Pay surface with a tender.
    await releaseTheCartLeavingABillOpen();

    await goToTab("Orders");
    const row = screen.getByText("A-001").closest("article");
    fireEvent.click(within(row as HTMLElement).getAllByRole("button")[0] as HTMLElement);
    await goToTab("Pay");

    expect(
      screen.queryAllByRole("button").some((b) => /take\s*cash/i.test(b.textContent ?? "")),
      "02-F51 (a) — after the recall the Pay surface must be able to settle the recalled order",
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ A PRE-EXISTING ORACLE ASSERTS THE SENTENCE §A2 CALLS A DEFECT — READ THIS BEFORE IMPLEMENTING
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `double-settlement.dom.test.tsx:264` — *"says on the surface that a type tap starts another
// order (27-F5)"* — mounts ONE open order, latches NO channel, and asserts `/starts another
// order/i` is on the glass. That is §A2's fixture exactly, and its comment states the belief the
// measurement contradicts: *"they are live now and the sentence says what they do"*. They are not
// live in that state — `startOrder` returns immediately with `pendingChannel === null` — so a
// green test is defending a claim the surface does not satisfy. It is `AGENTS.md`'s
// `catalog-pricing.test.ts:394` shape: an assertion that was true of the intent and never of the
// tree.
//
// **It is NOT edited here** (`24 §3` step 2 — that file belongs to its own test owner) and it does
// NOT have to block this one. Both are satisfied by a sentence that keeps the promise and names
// the precondition, e.g. *"Order in progress — a type starts another order once a channel is
// chosen"*: `/starts another order/i` matches, and so does `NAMES_THE_CHANNEL`. Measured, not
// predicted — see this session's report. Reported as a finding for that file's owner either way,
// because the comment beside the assertion is wrong whatever wording ships.
