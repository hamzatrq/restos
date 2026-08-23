// ACCEPTANCE TESTS — S-6: `02-F37`, settling with NO SHIFT OPEN.
//
// PROVENANCE (24 §3 step 2): written from spec text by a session that has seen no
// implementation of these FRs and did not write the plan. Sources: `02-F37`, `02-F22`,
// `01-F17`, `01-F1`, `02-F12`, `02-F45`, `26 §7`. Read the FR before changing anything here:
//
//   "Settling with no shift open succeeds, and records that it did. ... The settlement is
//    recorded with a null shift reference plus an `unbound_settlement` anomaly ... Never a
//    modal, never a block: a customer is standing there, and a rule that stops a sale to
//    protect a report has its priorities inverted. Opening a shift later does not retro-bind
//    it — that would be a mutation (01-F1); the anomaly is resolved by an explicit linked
//    correction."
//
// ⚠ THE DIRECTION OF THIS SUITE IS THE POINT. A test asserting that this path throws, refuses,
// confirms or prompts asserts the OPPOSITE of the FR. `01-F17` forbids blocking a sale, and
// this is the exact shape a well-meaning shift implementation reaches for first: "you must open
// a shift before taking payment." Every assertion below is written so that such an
// implementation FAILS it.
//
// ⚠ THIS SUITE IS A REGRESSION GUARD, NOT A RED-THEN-GREEN TASK, AND SAYS SO. Its assertions
// describe what the tree already does, and their value is entirely in the future edit: they are
// aimed at the session that touches shift open/close and has to leave this path alone. Each one
// names the mutation it exists to catch.
//
// ⚠⚠ CORRECTION (August 2026) — THE PROSE BELOW THIS LINE ONCE MADE A CLAIM THAT WAS TRUE OF
// THIS FIXTURE AND FALSE OF THE PRODUCT, AND A LIVE MONEY DEFECT HID BEHIND IT FOR A WAVE.
// It read: *"`Counter.tsx` already emits `shift_id: null` and already has no gate — which is
// CORRECT under `02-F37`, not a stopgap awaiting shifts."* The second half is right and the
// first half was a hardcode. `Counter.tsx` wrote a LITERAL `shift_id: null` into every
// `payment.recorded` — under its own comment claiming "the POS has no shift concept yet", while
// that same component read `cashState()` and three sibling call sites in `CashSurfaces.tsx`
// resolved the shift correctly. So NO sale ever reached `02-F23`'s expected-cash map: a cashier
// closed her shift, read Rs 0 expected from sales, and every settlement raised
// `unbound_settlement` — `02-F22` violated on 100% of settlements and `02-F37`'s exceptional-case
// anomaly firing always, which is noise, not signal.
//
// **Every assertion in this file passed throughout**, because the fixture below never opens a
// shift, so an implementation hardcoding null satisfies it. Nothing here was wrong; the suite
// simply had only one fixture. That is the round-3 law's exact shape — the guard was built
// correctly and never pointed at the dangerous case, and here the dangerous case is the money.
// The fix is the LAST describe block: a fixture that DOES open a shift. Nothing above it was
// weakened, and nothing should be — see the next paragraph for why.
//
// ⚠ THE NO-SHIFT CASE IS LOAD-BEARING AND MUST SURVIVE. `02-F37` genuinely requires that
// settling with no shift open SUCCEEDS, records a null reference, and never blocks; `01-F17`
// forbids stopping a sale with a customer standing there. A session "fixing" the null by making
// settlement conditional on a shift breaks the FR — these tests are what stop that, and they are
// pointed at the plausible wrong fix, not at the defect. Keep both fixtures: the product has to
// bind when there IS a shift and record the truth when there is not, and one fixture can only
// ever prove one of those.
//
// ⚠ THE SHIFT SURFACE IS `cashState()`, NOT `DeviceState`. This section once anticipated the
// shift landing on `DeviceState` and asked that the fixture keep naming it absent. It landed on
// the `shift_cash` projection instead, so the way this fixture says "no shift is open" is that
// its stub bridge supplies **no `cashState` member at all** — the contract marks it optional and
// `Counter` optional-chains the read. That is still a deliberate absence and still the case
// under test; it is just spelled somewhere else than predicted.
//
// OUT OF THIS PACKAGE, and named rather than faked:
//   · the `unbound_settlement` ANOMALY itself is raised by a fold (`packages/sync-client`) and
//     surfaces on `05` and on `02-F23`'s own-day view. Nothing in `apps/pos-electron` can
//     observe it today — there is no anomaly read on the IPC contract — so nothing here
//     asserts it. A test that claimed to would be asserting its own stub.
//   · ~~the POSITIVE control (a settlement made WHILE a shift is open carries that shift's id,
//     `26 §7`'s carried key) needs the shift surface, which this session does not own.~~
//     **DELIVERED — it is the last describe block.** Recorded as owed by the authoring session,
//     and it is worth naming that the coverage hole was FLAGGED here in writing and the defect
//     still shipped: the note was read as scope, not as risk. Same shape as `01-F60`, where a
//     test author flagged a hole, the founder ruled, and nobody carried it back into the suite.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddLineRequest,
  type AppendRequest,
  type CashShift,
  type CashState,
  CHANNELS,
  type DeviceState,
  type MenuItem,
  type OpenOrder,
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

/**
 * The device row. It carries no shift field and never did — the shift lives on the `shift_cash`
 * projection behind `cashState()`, not here.
 *
 * ⚠ The comment this replaces said the absence was "because no shift concept exists on it", and
 * that was the same false premise `Counter.tsx` shipped its hardcode under. The concept exists;
 * it is simply on another read. What makes this fixture's device have NO SHIFT OPEN is that
 * `mountWith` supplies no `cashState` member — see the last describe block, which passes the same
 * device a `CashState` with a shift open.
 */
const DEVICE: DeviceState = {
  actor: "Counter 1",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-04",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/** Rs 450 owed, so a real tender can cover it rather than settling a zero bill. */
const DUE_PAISA = 45_000;

const openOrder = (over: Partial<OpenOrder> = {}): OpenOrder => ({
  order_id: "order-77",
  reference: "order-77",
  total_paisa: DUE_PAISA,
  paid_paisa: 0,
  lines: [],
  ...over,
});

let appended: AppendRequest[];
let lines: AddLineRequest[];

/**
 * `cash` is OPTIONAL and omitting it is the no-shift condition, not a shortcut: the IPC contract
 * marks `cashState` optional and `Counter` optional-chains it, so a bridge without the member is
 * exactly a device whose shift projection has answered nothing. Every pre-existing call below
 * omits it and is unchanged by this parameter.
 */
const mountWith = (orders: OpenOrder[], cash?: CashState) => {
  appended = [];
  lines = [];
  let current = orders;
  const listeners = new Set<() => void>();
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => current),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    ...(cash === undefined ? {} : { cashState: vi.fn(async () => cash) }),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push(req);
      return { id: `evt-line-${lines.length}` };
    }),
    onChanged: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return {
    bridge,
    /**
     * The folds moved and the screen re-reads — main's own push, which carries no data. Used
     * below to stand in for "a shift was opened elsewhere, after the fact": the push is the
     * ONLY thing that could prompt this screen to go back and touch a settled payment.
     */
    foldsMoved: (next: OpenOrder[]) => {
      current = next;
      for (const fn of listeners) fn();
    },
  };
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/**
 * Reach the tender panel. `screen-map §3.1` gives settling its own **Pay** tab — *"separate
 * surface because `27-F8` puts numeric entry at 126 dp — it cannot share a layout with 76 dp
 * tiles"* — so getting there is one lateral act from the rail, which `27-F2a` and
 * `screen-map §4` both class as depth ZERO rather than navigation.
 *
 * **This is a relocation, not a relaxation.** Every assertion below is unchanged and still
 * bites: the panel is still never behind a mode switch, still never greyed, still never
 * modal, and `TAKE CASH` still settles on the first tap. What moved is which tab it is on.
 *
 * ⚠ **Finding for this file's owning session (`02-F37`).** The header this replaced read
 * *"the panel `02-F12` puts beside the cart"*, and `02-F12` says no such thing — it is a list
 * of payment methods and their paisa units, with no placement clause anywhere in it
 * (`specs/02-pos-app.md:42`). The layout rule it was credited with does not exist, so nothing
 * in the corpus was contradicted by moving the panel. Recorded rather than quietly corrected,
 * because an FR cited for a rule it does not contain is the failure commandment 2 names.
 */
const goToPay = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Pay$/i }));
};

/**
 * Back to the grid and the cart. The rail is `27-F4`'s positional memory, so this is the same
 * one act in the other direction and costs the cashier nothing.
 */
const goToOrder = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Order$/i }));
};

/** Take the whole bill in cash, on the Pay surface `screen-map §3.1` puts it on. */
const takeCash = async () => {
  await goToPay();
  for (const digit of "500") {
    fireEvent.click(await screen.findByRole("button", { name: digit }));
  }
  fireEvent.click(await screen.findByRole("button", { name: /TAKE CASH/i }));
};

describe("02-F37 — settling with no shift open SUCCEEDS", () => {
  it("records the payment on the first tap, with no shift anywhere in sight", async () => {
    // MUTATION THIS CATCHES: `if (!shift) return;` — or any guard, prompt or early return in
    // the tender handler. `01-F17`: a sale is never blocked, and `02-F22` binds settlements to
    // a shift without ever saying what happens when there is none. `02-F37` answers: it
    // succeeds.
    mountWith([openOrder()]);
    render(<Counter />);
    await takeCash();

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("payment.recorded");
    expect(appended[0]?.payload.amount_paisa).toBe(DUE_PAISA);
    expect(appended[0]?.payload.method).toBe("cash");
  });

  it("carries a NULL shift reference — present in the payload, not omitted", async () => {
    // `26 §7` makes the shift a CARRIED key: the bucket a payment lands in travels with the
    // event, and is never resolved at fold time from the reading device's state (`01-F34`).
    // So "no shift" has to be written down. An omitted key is not a null reference — it is a
    // fold's invitation to go and work one out, which is the law-1 break the carried key exists
    // to prevent, and it makes `unbound_settlement` underivable.
    //
    // MUTATION THIS CATCHES: dropping the field when the shift lands, or sending `undefined`.
    mountWith([openOrder()]);
    render(<Counter />);
    await takeCash();

    await waitFor(() => expect(appended).toHaveLength(1));
    const payload = appended[0]?.payload ?? {};
    expect(Object.hasOwn(payload, "shift_id"), "shift_id was omitted, not nulled").toBe(true);
    expect(payload.shift_id).toBeNull();
  });

  it("never a MODAL — nothing is put between the cashier and the customer", async () => {
    // `02-F37`'s own words. A confirmation step here costs a tap on every unbound settlement
    // and buys nothing: the operator cannot open a shift from inside the dialog and the sale
    // must complete either way.
    //
    // MUTATION THIS CATCHES: an "are you sure — no shift is open?" confirm before the append.
    mountWith([openOrder()]);
    render(<Counter />);
    await takeCash();

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(screen.queryByRole("dialog"), "a dialog stood between the tap and the sale").toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("never a BLOCK — the tender control is live, not greyed, with no shift open", async () => {
    // `27-F5` forbids context-dependent controls and `27-F4` disables in place — so the
    // plausible "safe" implementation greys the tender button and gives its reason. That reads
    // as caution and IS a block: the sale stops. Reaching the Pay tab is one lateral act and
    // is not a mode switch (`27-F2a`); a panel that appeared only after a SETTLE press would be.
    //
    // MUTATION THIS CATCHES: `disabled={!shift}` on the tender control, and any variant that
    // withholds the panel entirely.
    mountWith([openOrder()]);
    render(<Counter />);
    await goToPay();

    const take = await screen.findByRole("button", { name: /TAKE CASH/i });
    expect((take as HTMLButtonElement).disabled, "the tender control was disabled").toBe(false);
    expect(screen.getByRole("region", { name: /take payment/i })).toBeTruthy();
  });

  it("and the till keeps working afterwards — a second sale is not harder than the first", async () => {
    // `01-F17` again, one level up: whatever the first unbound settlement did to the screen, it
    // must leave the counter usable. An error banner that latches, or a screen that unmounts on
    // a rejected append, ends the shift rather than the sale.
    mountWith([openOrder()]);
    render(<Counter />);
    await takeCash();
    await waitFor(() => expect(appended).toHaveLength(1));

    // Back to Order, which is where the next sale is rung — and is itself part of what "the
    // till keeps working" means: a rail that stopped responding after a settlement would fail
    // here exactly as a latched error banner would.
    await goToOrder();
    fireEvent.click(await screen.findByRole("button", { name: /Send to kitchen/i }));
    await waitFor(() => expect(appended).toHaveLength(2));
    expect(appended[1]?.type).toBe("order.confirmed");
  });
});

describe("01-F1 — opening a shift later does NOT retro-bind the settlement", () => {
  it("a later fold change produces no correction, and rewrites nothing", async () => {
    // "Opening a shift later does not retro-bind it — that would be a mutation (01-F1); the
    // anomaly is resolved by an explicit linked correction." An explicit correction is an
    // operator's act on a manager surface (`05`), not something the counter does on its own the
    // moment a shift appears.
    //
    // The push is the only thing that could prompt it: `main/index.ts` notifies on every
    // append and the screen re-reads. So this fires that push and asserts the screen stays
    // still.
    //
    // MUTATION THIS CATCHES: an effect that walks unbound settlements on reload and emits a
    // binding event — the "helpful" fix, and a silent mutation of settled money.
    const h = mountWith([openOrder()]);
    render(<Counter />);
    await takeCash();
    await waitFor(() => expect(appended).toHaveLength(1));
    const recorded = structuredClone(appended[0]);

    // A shift opened somewhere else on the branch; the folds moved and this screen re-read.
    //
    // ⚠ THE WAIT IS THE TEST. Its first form waited for `openOrders` to have been called more
    // than once — which was ALREADY TRUE (settling re-reads), so the assertion ran before the
    // re-render and a retro-binding effect passed it untouched. Mutation-checked: that version
    // survived the mutation this test exists to catch. So the wait is now on evidence that
    // could not exist beforehand — a line the re-read introduced, rendered on screen — after
    // which any effect keyed on the new orders has already run.
    h.foldsMoved([
      openOrder({
        paid_paisa: DUE_PAISA,
        lines: [
          {
            line_id: "line-1",
            name: "Karahi",
            quantity: 1,
            modifiers: [],
            removals: [],
            note: null,
            // `02-F20`'s corrective needs the line's own money; the engine projects it (`26 §8`).
            billed_paisa: 45_000,
          },
        ],
      }),
    ]);
    // The evidence this waits on is a CART LINE, which lives on the Order surface — so the
    // wait has to be made from there.
    //
    // ⚠ **AND IT IS NOW SCOPED TO THE CART, which STRENGTHENS it.** The stub menu is
    // `[{ id: "item-karahi", label: "Karahi" }]`, so the item GRID renders a tile reading
    // "Karahi" too — from mount, before any re-read. An unscoped `findByText("Karahi")` can
    // therefore be satisfied by a tile that proves nothing, which is precisely the vacuous
    // shape the note above says this wait was rewritten to escape. It did not fire before only
    // because the grid had not measured itself; that is an accident of the stub
    // `ResizeObserver`, not a property anything asserts, and it is exactly the "already true"
    // trap in its second costume. Scoping to `Cart`'s own region pins the wait to the line the
    // re-read introduced and to nothing else.
    await goToOrder();
    await within(screen.getByRole("region", { name: /current order/i })).findByText("Karahi");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(appended, "the counter emitted something after the fact").toHaveLength(1);
    expect(appended[0]).toEqual(recorded);
    expect(appended[0]?.refs).toEqual([]);
  });

  it("the seam has no channel that could bind, patch or amend a recorded event", () => {
    // Structural `01-F1`, at the seam rather than in a handler. `shared/ipc.ts`: "There is no
    // update, no delete, no patch. A correction is a new linked event, so the absence of a
    // mutation channel is not an omission to fill in later — it is the law."
    //
    // Asserted against the REAL `CHANNELS` export, never against this file's stub bridge — a
    // stub cannot fail this, and a test that reads its own harness back is the vacuous shape
    // (`oracle-round-2-findings §C`, and K-3's dead-export defect in round 3).
    //
    // MUTATION THIS CATCHES: a `bindShift`/`setShift`/`amend` channel added when shifts land,
    // which is exactly how retro-binding would arrive.
    const names = Object.keys(CHANNELS);
    const mutating = names.filter((n) => /update|patch|delete|amend|bind|rewrite|set[A-Z]/.test(n));
    expect(mutating, `the IPC seam grew a mutation channel: ${names.join(", ")}`).toEqual([]);
  });
});

describe("02-F45 — the settlement's attribution rides the ENVELOPE, not the payload", () => {
  it("the counter names no cashier, user or actor in what it sends", async () => {
    // "A `cashier` field duplicated into the payload would be a second source for one fact, and
    // the two can disagree — in an append-only ledger, with no rule for which wins." The
    // envelope's `actor_user_id` is the one source (`02-F41`), stamped in main from the PIN
    // session; the renderer is the untrusted end of this bridge and has nothing to contribute.
    //
    // Asserted as a PATTERN rather than as a pinned key set: `payment.recorded`'s payload will
    // legitimately grow (`DEC-MONEY-004`'s tips are ratified and unmodelled), and freezing the
    // whole shape here would fail that change for the wrong reason.
    mountWith([openOrder()]);
    render(<Counter />);
    await takeCash();

    await waitFor(() => expect(appended).toHaveLength(1));
    const identityish = Object.keys(appended[0]?.payload ?? {}).filter((k) =>
      /user|cashier|actor|staff|operator|pin/i.test(k),
    );
    expect(identityish, "the renderer supplied an identity field").toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE OTHER HALF OF `02-F22`, ADDED AUGUST 2026 AFTER THE DEFECT IT WOULD HAVE CAUGHT SHIPPED.
//
// Everything above fixes "no shift open" and asserts the null. Nothing above could distinguish
// that from a HARDCODED null, because no fixture here ever opened a shift — so `Counter.tsx`
// shipped `shift_id: null` as a literal and all of it stayed green. `02-F22`: "A shift binds
// subsequent cash settlements and drawer events to that cashier." Binding is half the FR and it
// had no test; `02-F23`'s expected-cash map is what the missing half pays for.
// ─────────────────────────────────────────────────────────────────────────────

const aShift = (over: Partial<CashShift> = {}): CashShift => ({
  shift_id: "shift-open",
  cashier: "user-ayesha",
  prev_shift_id: null,
  open_at: 1_000,
  expected_json: JSON.stringify({}),
  paid_out_paisa: 0,
  no_sale_count: 0,
  closed: 0,
  counted_cash_paisa: null,
  expected_at_close_json: null,
  variance_paisa: null,
  exceptions_json: JSON.stringify([]),
  ...over,
});

const aCashState = (shifts: CashShift[]): CashState => ({
  shifts,
  days: [],
  unbound: [],
  unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: JSON.stringify([]) },
});

describe("02-F22 — with a shift OPEN, the settlement BINDS to it", () => {
  it("carries the open shift's id, not a null", async () => {
    // THE HEADLINE, and the one assertion the whole file was missing. `02-F22` binds settlements
    // to the shift; `shift-cash.ts` reads `payload.shift_id` and accumulates into `expected_json`,
    // which IS `02-F23`'s "system-expected cash (by method)". A payload that says null when a
    // shift is open does not merely mislabel a row — the money never reaches the cashier's
    // expected total, so she closes her shift reading Rs 0 expected from sales while every real
    // settlement sits in the unbound bucket.
    //
    // MUTATION THIS CATCHES: `shift_id: null` — the defect verbatim, which every other test in
    // this file passes. Also any resolution that reads something other than the open shift.
    mountWith([openOrder()], aCashState([aShift()]));
    render(<Counter />);
    await takeCash();

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("payment.recorded");
    expect(appended[0]?.payload.shift_id, "the settlement did not bind to the open shift").toBe(
      "shift-open",
    );
  });

  it("binds to the OPEN shift and ignores a closed one — the fixture that separates them", async () => {
    // A CONTROL, and it differs from the fixture above in exactly one field: `closed`. Without it
    // an implementation reading "the first shift in the array" or "the latest shift, open or not"
    // passes the headline test — a settlement would bind to a shift that was already reconciled
    // and signed, moving money into a closed cashier's total after she went home.
    //
    // MUTATION THIS CATCHES: dropping the `closed === 0` filter from `openShiftOf`.
    mountWith(
      [openOrder()],
      aCashState([
        aShift({ shift_id: "shift-closed", closed: 1, open_at: 5_000 }),
        aShift({ shift_id: "shift-open", closed: 0, open_at: 1_000 }),
      ]),
    );
    render(<Counter />);
    await takeCash();

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.payload.shift_id).toBe("shift-open");
  });

  it("a shift that has CLOSED leaves the settlement unbound — 02-F37's path is still reachable", async () => {
    // The two halves meeting. With a shift row present but closed there is no open shift, so this
    // is `02-F37` again — and it must still SUCCEED with a null rather than bind to the closed
    // row or refuse. This is the assertion that stops a future "always bind to something" fix.
    //
    // MUTATION THIS CATCHES: `?? someClosedShift.shift_id`, and any guard that refuses to settle
    // once the shift surface exists but reports nothing open.
    mountWith([openOrder()], aCashState([aShift({ shift_id: "shift-closed", closed: 1 })]));
    render(<Counter />);
    await takeCash();

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.payload.shift_id).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still never blocks with a shift open — binding is not a gate", async () => {
    // `01-F17` parity. The no-shift case above proves the null path never blocks; this proves the
    // resolution itself did not become a precondition. A `disabled={!openShift}` added while
    // "fixing" the null would fail here and pass every other test in this describe.
    mountWith([openOrder()], aCashState([aShift()]));
    render(<Counter />);
    await goToPay();

    const take = await screen.findByRole("button", { name: /TAKE CASH/i });
    expect((take as HTMLButtonElement).disabled, "binding became a gate").toBe(false);
  });

  it("binding adds a bucket, never an identity — 02-F45 holds in the bound case too", async () => {
    // The `02-F45` sweep above runs only on the unbound fixture, so it could not see a "helpful"
    // fix that resolved the shift AND copied its `cashier` across while it was there. The shift
    // row this fixture supplies HAS a `cashier` (`user-ayesha`), so that mistake is available to
    // make and this is what refuses it: attribution rides the envelope's `actor_user_id`, and a
    // payload copy would be the second source for one fact the FR forbids by name.
    mountWith([openOrder()], aCashState([aShift({ cashier: "user-ayesha" })]));
    render(<Counter />);
    await takeCash();

    await waitFor(() => expect(appended).toHaveLength(1));
    const payload = appended[0]?.payload ?? {};
    expect(payload.shift_id).toBe("shift-open");
    const identityish = Object.keys(payload).filter((k) =>
      /user|cashier|actor|staff|operator|pin/i.test(k),
    );
    expect(identityish, "the shift's cashier was copied into the payload").toEqual([]);
  });
});
