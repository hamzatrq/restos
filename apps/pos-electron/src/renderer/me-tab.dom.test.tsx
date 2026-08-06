// S-5 — the ME tab: `02-F23`'s "I'm clean".
//
// Authored from spec text only (`24 §3` step 2), by a session that does not implement it.
//
// This is a PROTECTION surface, not an admin one, which is why it is a peer tab and not buried
// inside Cash: `02-F23`'s framing is that the cashier sees her OWN reconciliation and concludes
// she is clean. Adoption depends on staff believing the system is on their side rather than
// watching them (`04-F20` states the same principle for the waiter, `09-F16` for the rider), and
// a role that can be QUESTIONED by the record but cannot READ it is being watched.
//
// Scope: `02-F23` (own reconciliation: expected by method vs counted, over/short, own shifts
// only), `02-F37` (the unbound settlement surfaces "on the cashier's own day view"), `02-F43`
// (unbound drawer opens and paid-outs surface there too, and the silent path is forbidden),
// `26 §7` (over/short is a CARRIED fact — never recomputed at read time), `01-F1` (no mutation),
// `27-F12` (direction is a word), `27-F23`, `27-F24` (the system computes; staff read).
//
// The seam and the pinned labels are declared at the head of `cash-tab.dom.test.tsx` and are the
// same here: one bridge read, `window.restos.cashState()`, carrying the `shift_cash` fold's own
// rows.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS DELIBERATELY NOT TESTED HERE, AND WHY
//
// **"Cashiers see only their own shifts" is not a renderer assertion.** Commandment 8 puts
// authorization server-side always and forbids trusting a client role claim, and
// `domain/permissions.ts` already resolves it (`report.sales_view` → `own_shift` for a cashier,
// checked against `scope.subject_user_id`). So the scoping belongs to main, on the read; a
// renderer test that fed this screen two cashiers' shifts and asserted it drew one would be
// asserting that the CLIENT filters — the exact thing Commandment 8 bans. It also cannot be
// written honestly yet: `02-F45` says the `cashier` column projects `null` until the PIN session
// exists, so there is no "own" to scope by. Owed to S-0b/S-0c and to main's read handler.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem } from "../shared/ipc";
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

type CashShift = {
  shift_id: string;
  cashier: string | null;
  prev_shift_id: string | null;
  open_at: number;
  expected_json: string;
  paid_out_paisa: number;
  no_sale_count: number;
  closed: number;
  counted_cash_paisa: number | null;
  expected_at_close_json: string | null;
  variance_paisa: number | null;
  exceptions_json: string;
};

type CashDay = {
  day_id: string;
  business_date: string;
  prev_day_id: string | null;
  opening_float_paisa: number;
  deposit_paisa: number;
  closed: number;
  counted_cash_paisa: number | null;
  exceptions_json: string;
};

type UnboundSettlement = {
  settlement_attempt_id: string;
  order_id: string | null;
  method: string | null;
  amount_paisa: number;
  anomaly: string;
};

type CashState = {
  shifts: CashShift[];
  days: CashDay[];
  unbound: UnboundSettlement[];
  unbound_drawer: { no_sale_count: number; paid_out_paisa: number; exceptions_json: string };
};

const aShift = (over: Partial<CashShift> = {}): CashShift => ({
  shift_id: "shift-1",
  cashier: null,
  prev_shift_id: null,
  open_at: 1_780_000_000_000,
  expected_json: JSON.stringify({ cash: 45_000 }),
  paid_out_paisa: 0,
  no_sale_count: 0,
  closed: 0,
  counted_cash_paisa: null,
  expected_at_close_json: null,
  variance_paisa: null,
  exceptions_json: "[]",
  ...over,
});

const aDay = (over: Partial<CashDay> = {}): CashDay => ({
  day_id: "day-1",
  business_date: "2026-08-04",
  prev_day_id: null,
  opening_float_paisa: 0,
  deposit_paisa: 0,
  closed: 0,
  counted_cash_paisa: null,
  exceptions_json: "[]",
  ...over,
});

const aCashState = (over: Partial<CashState> = {}): CashState => ({
  shifts: [],
  days: [],
  unbound: [],
  unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
  ...over,
});

const DEVICE = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-04",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
} as DeviceState;

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

let appended: AppendRequest[];
let unexpectedBridgeCalls: string[];

const mountWith = (cash: CashState) => {
  appended = [];
  unexpectedBridgeCalls = [];
  const known = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => []),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    cashState: vi.fn(async () => cash),
    // ── AMENDED August 2026 (K-7) ────────────────────────────────────────────────────────
    // `03-F5`'s print-failure band. Added to the KNOWN map, which does NOT weaken the guard
    // below: the assertion is "reached for an *unknown* bridge member", and `alarms` is now a
    // member of `RestosBridge` read by the SHELL's own reload — the same class as `deviceState`
    // and `menu`, which have always been here for the same reason. This harness could never
    // distinguish a shell read from a Me-surface read; what it catches is a surface inventing a
    // channel, and every other name still trips it.
    alarms: vi.fn(async () => []),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    onChanged: vi.fn(() => () => {}),
  } as Record<string, unknown>;
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

/**
 * The rail's tab buttons, found by their LABEL text rather than by accessible name: an
 * unavailable tab folds its reason into the name ("Cash not built yet"), so a name query
 * cannot find it at all and the failure reads as a missing tab instead of an unbuilt one.
 * `27-F4` distinguishes those two cases and so must this helper.
 */
const tabButton = (label: string): HTMLButtonElement => {
  const rail = document.querySelector('nav[aria-label="Main"]');
  const found = [...(rail?.querySelectorAll("button") ?? [])].find(
    (b) => (b.querySelector("span")?.textContent ?? "").trim() === label,
  );
  expect(
    found,
    `27-F4 — the rail must carry a ${label} tab, disabled in place if unbuilt`,
  ).toBeDefined();
  return found as HTMLButtonElement;
};

const goToTab = async (label: string) => {
  await screen.findByText("Order", { exact: true });
  const tab = tabButton(label);
  expect(
    tab.disabled,
    `27-F4 — the ${label} tab must be reachable, not disabled in place, once its surface ships`,
  ).toBe(false);
  fireEvent.click(tab);
  await waitFor(() => expect(tabButton(label).getAttribute("aria-current")).toBe("page"));
};

/** The five methods, exhaustive, as `shift.closed` snapshots them (`02-F23`, `01-F32`). */
const byMethod = (over: Partial<Record<string, number>> = {}) => ({
  cash: 0,
  card: 0,
  raast: 0,
  khata_credit: 0,
  aggregator_receivable: 0,
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("02-F23 — the cashier's own reconciliation is a peer surface", () => {
  it("Me is reachable and reads only — it carries no shift-close control", async () => {
    // The control/treatment pair matters more than either half alone: `C33`'s WRITE half lives
    // on Cash (`screen-map §3.1`) and its READ half lives here. A test that only asserted the
    // absence would pass on a Me tab that renders nothing at all.
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);

    await goToTab("Cash");
    expect(
      screen.queryAllByRole("button", { name: /close\s+(my\s+)?shift/i }).length,
      "C33's write half belongs to the Cash tab",
    ).toBeGreaterThan(0);

    await goToTab("Me");
    expect(
      screen.queryAllByRole("button", { name: /close\s+(my\s+)?shift/i }),
      "02-F23 — Me is a protection surface, not an admin one",
    ).toEqual([]);
    expect(appended, "a read surface appends nothing").toHaveLength(0);
    expect(unexpectedBridgeCalls, "the Me surface reached for an unknown bridge member").toEqual(
      [],
    );
  });

  it("shows the expected cash so far for an OPEN shift, and fabricates no over/short", async () => {
    // Nothing has been counted, so there is no difference to state. `27-F24` says every number
    // that reaches an operator arrives finished; a variance shown against an uncounted drawer is
    // not a finished number, it is a guess with a word in front of it. The fold says so too —
    // `variance_paisa` is null until a close carries one.
    mountWith(
      aCashState({
        shifts: [
          aShift({ shift_id: "shift-open", expected_json: JSON.stringify({ cash: 45_000 }) }),
        ],
        days: [aDay()],
      }),
    );
    render(<Counter />);
    await goToTab("Me");

    expect(screen.getAllByText("Rs 450").length).toBeGreaterThan(0);
    expect(
      screen.queryAllByText(/\b(OVER|SHORT)\b/),
      "02-F23 — an uncounted drawer has no over/short",
    ).toEqual([]);
  });
});

describe("26 §7 — over/short is a CARRIED fact, read here and never re-derived", () => {
  /**
   * One closed shift, built so that the three plausible implementations give three different
   * answers. This is the whole point of the fixture:
   *
   *   carried               `variance_paisa`               → OVER  Rs 500   ← the only correct one
   *   recomputed at close   counted − expected_at_close    → OVER  Rs 200
   *   recomputed live       counted − expected_json        → SHORT Rs 300
   *
   * The live expectation has MOVED since she closed: a payment from her shift arrived on this
   * device after the close (ordinary offline behaviour, not an edge case). `01-F1` forbids
   * mutating what she already signed, and a read-time recompute performs that mutation in
   * effect. The at-close recompute is wrong for a second reason: a `02-F26` paid-out is drawer
   * cash the naive subtraction never sees (`02-F44`) — Rs 300 left this drawer for a supplier.
   */
  const CLOSED = aShift({
    shift_id: "shift-77",
    closed: 1,
    expected_json: JSON.stringify({ cash: 150_000 }),
    expected_at_close_json: JSON.stringify(byMethod({ cash: 100_000 })),
    paid_out_paisa: 30_000,
    counted_cash_paisa: 120_000,
    variance_paisa: 50_000,
  });

  it("shows the variance the close event carries, not either recomputation", async () => {
    mountWith(aCashState({ shifts: [CLOSED], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Me");

    expect(screen.getAllByText("OVER Rs 500").length).toBeGreaterThan(0);
    expect(
      screen.queryAllByText("OVER Rs 200"),
      "26 §7 — the screen re-derived the variance from the at-close snapshot",
    ).toEqual([]);
    expect(
      screen.queryAllByText("SHORT Rs 300"),
      "01-F1 — a late payment moved a number the cashier had already signed",
    ).toEqual([]);
  });

  /**
   * ADDED August 2026 — the NEGATIVE carried variance, which nothing rendered.
   *
   * `variance_paisa: +50_000` is covered above and `0` below, and `cash-tab.dom.test.tsx`
   * asserts a live-computed SHORT reaches the payload as `-10_000`. The gap between those is the
   * hazard path: a shift whose variance arrives NEGATIVE **through the seam**, already signed,
   * already signed-off — the read side of the write that suite covers. It is the dangerous case
   * for two independent reasons and neither is theoretical:
   *
   *   1. `Paisa` is non-negative and `rupeesFromPaisa` THROWS on a negative — during render,
   *      which in React 19 unmounts the root and blanks the till (`MoneyValue`'s own doc says
   *      so). A signed value reaching `MoneyValue.paisa` does not show a wrong number; it shows
   *      nothing at all, on the counter, mid-shift.
   *   2. The obvious defensive fix — take the magnitude and move on — silently turns a SHORT
   *      drawer into an OVER one. The fixture below is built so that mistake is VISIBLE: the
   *      at-close recompute lands on `OVER Rs 500`, the same magnitude as the carried fact and
   *      the opposite word. A cashier told she is Rs 500 over when she is Rs 500 short signs off
   *      on a discrepancy that is now hers.
   *
   * `directedPaisa` is the only correct route (`27-F12`): one call, both halves, magnitude to
   * `MoneyValue` and direction as a WORD.
   *
   *   carried               `variance_paisa`               → SHORT Rs 500  ← the only correct one
   *   magnitude-only        `abs(variance_paisa)`          → OVER  Rs 500
   *   recomputed at close   counted + paid_out − at_close  → OVER  Rs 500
   *   recomputed live       counted + paid_out − expected  → SHORT Rs 300
   */
  const CLOSED_SHORT = aShift({
    shift_id: "shift-78",
    closed: 1,
    expected_json: JSON.stringify({ cash: 180_000 }),
    expected_at_close_json: JSON.stringify(byMethod({ cash: 100_000 })),
    paid_out_paisa: 30_000,
    counted_cash_paisa: 120_000,
    variance_paisa: -50_000,
  });

  it("renders a carried NEGATIVE variance as a SHORT, in words and without a minus sign", async () => {
    mountWith(aCashState({ shifts: [CLOSED_SHORT], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Me");

    // `27-F23` — `Rs`, symbol-first, no decimals on an operational screen. `27-F12`/`27-F24` —
    // the direction is a word she reads, not a sign she has to interpret.
    expect(screen.getAllByText("SHORT Rs 500").length).toBeGreaterThan(0);
    expect(
      screen.queryAllByText("OVER Rs 500"),
      "27-F12 — the magnitude was taken and the direction dropped: a short drawer read as over",
    ).toEqual([]);
    expect(
      screen.queryAllByText("SHORT Rs 300"),
      "26 §7 — the screen re-derived the variance from the live expectation",
    ).toEqual([]);

    const rendered = document.body.textContent ?? "";
    expect(
      rendered.length,
      "the surface rendered at all — a blanked till passes every not-match",
    ).toBeGreaterThan(100);
    // `MoneyValue.paisa` took the signed value: `rupeesFromPaisa` throws mid-render and React 19
    // unmounts the root, so this catches the blank-till failure by its output rather than by an
    // exception nobody is listening for.
    expect(screen.getAllByText("Rs 1,200").length, "what she counted").toBeGreaterThan(0);
    for (const wrong of ["-500", "−500", "500.00", "Rs -", "(500)"]) {
      expect(
        rendered,
        `27-F12/27-F23 — ${wrong} is not how a short drawer is stated`,
      ).not.toContain(wrong);
    }
    // `27-F22` — Western digits everywhere, never Arabic-Indic or Eastern Arabic.
    expect(rendered).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("shows the expectation AS AT CLOSE beside it, not the one that has since moved", async () => {
    // The two numbers are one fact: a variance is meaningless without the expectation it was
    // measured against, and pairing a carried variance with a live expectation would show her
    // an arithmetic that does not work — which `27-F24` makes worse, not better, because she is
    // being asked to notice a discrepancy rather than read a result.
    mountWith(aCashState({ shifts: [CLOSED], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Me");

    expect(screen.getAllByText("Rs 1,000").length, "the expectation as at close").toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Rs 1,200").length, "what she counted").toBeGreaterThan(0);
    expect(
      screen.queryAllByText("Rs 1,500"),
      "02-F23 — this is the live expectation, not the one she signed",
    ).toEqual([]);
  });

  it("shows the closed shift's expectation BY METHOD, exhaustively", async () => {
    // `02-F23` requires it by method and `01-F32`/`DEC-MONEY-007` make four of the five tenders
    // behave differently in conservation. A single scalar passes a naive test and is wrong for
    // four of five.
    mountWith(
      aCashState({
        shifts: [
          aShift({
            shift_id: "shift-88",
            closed: 1,
            expected_at_close_json: JSON.stringify(
              byMethod({ cash: 100_000, card: 70_000, raast: 20_000 }),
            ),
            counted_cash_paisa: 100_000,
            variance_paisa: 0,
          }),
        ],
        days: [aDay()],
      }),
    );
    render(<Counter />);
    await goToTab("Me");

    expect(screen.getAllByText("Rs 700").length, "card").toBeGreaterThan(0);
    expect(screen.getAllByText("Rs 200").length, "raast").toBeGreaterThan(0);
    // Explicit zeros, in place: a row that vanishes when it is empty moves the rows below it
    // (`27-F4`) and is indistinguishable from a tender that was never taken.
    expect(screen.queryAllByText("Rs 0").length).toBeGreaterThanOrEqual(2);
  });
});

describe("02-F37 / 02-F43 — the anomalies surface on her own day view", () => {
  it("shows the unbound settlement, the unbound no-sales and the unbound petty cash", async () => {
    // Both FRs name this screen by ID as one of the two places the anomaly must appear ("the
    // manager's reconciliation (05) and the cashier's own day view (02-F23)"), and `02-F43`
    // names the failure it exists to prevent: "an unbound no-sale that is stored and uncounted,
    // or unbound petty cash that leaves the drawer accounted for in no shift, no day, and no
    // anomaly — money vanishing from 02-F23's expected cash and 02-F24's day close WITH NOTHING
    // TO POINT AT." A Me tab that renders only the shift rows satisfies every other test in this
    // file and leaves exactly that hole.
    mountWith(
      aCashState({
        shifts: [
          aShift({ shift_id: "shift-open", expected_json: JSON.stringify({ cash: 45_000 }) }),
        ],
        days: [aDay()],
        unbound: [
          {
            settlement_attempt_id: "attempt-1",
            order_id: "order-3",
            method: "cash",
            amount_paisa: 50_000,
            anomaly: "unbound_settlement",
          },
        ],
        unbound_drawer: {
          no_sale_count: 11,
          paid_out_paisa: 15_000,
          exceptions_json: JSON.stringify(["unbound_drawer_open", "unbound_paid_out"]),
        },
      }),
    );
    render(<Counter />);
    await goToTab("Me");

    // The money is pointable-at, in `Rs` symbol-first with no decimals (`27-F23`).
    expect(
      screen.getAllByText("Rs 500").length,
      "02-F37 — a settlement taken with no shift open",
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Rs 150").length,
      "02-F43 — petty cash that left the drawer against no shift",
    ).toBeGreaterThan(0);
    // And the COUNT, because `02-F21` requires a no-sale open to be "logged AND counted" — an
    // implementation that logs it and drops it from every total satisfies the word "logged"
    // while defeating the theft detection the FR exists for. 11 collides with nothing else on
    // this surface, including a keypad's single digits.
    expect(
      screen.queryAllByText(/\b11\b/).length,
      "02-F21/02-F43 — the unbound no-sale opens were logged and never counted",
    ).toBeGreaterThan(0);
  });

  it("does not invent anomalies when there are none", async () => {
    // The control for the test above: without it, a Me tab that printed the words unconditionally
    // would pass, and the assertion would prove nothing about whether it read the bucket.
    mountWith(
      aCashState({
        shifts: [
          aShift({ shift_id: "shift-open", expected_json: JSON.stringify({ cash: 45_000 }) }),
        ],
        days: [aDay()],
      }),
    );
    render(<Counter />);
    await goToTab("Me");

    expect(screen.queryAllByText("Rs 500")).toEqual([]);
    expect(screen.queryAllByText("Rs 150")).toEqual([]);
    expect(screen.getAllByText("Rs 450").length, "her own shift is still shown").toBeGreaterThan(0);
  });
});
