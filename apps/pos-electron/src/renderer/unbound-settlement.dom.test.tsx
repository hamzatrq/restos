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
// ⚠ THIS SUITE IS A REGRESSION GUARD, NOT A RED-THEN-GREEN TASK, AND SAYS SO. `Counter.tsx`
// already emits `shift_id: null` and already has no gate — which is CORRECT under `02-F37`, not
// a stopgap awaiting shifts. So these pass on the current tree by describing what it already
// does. Their value is entirely in the future edit: they are aimed at the session that adds
// shift open/close and has to leave this path alone. Each one names the mutation it exists to
// catch.
//
// ⚠ WHEN A SHIFT SURFACE IS ADDED to `DeviceState`, this fixture must name it ABSENT
// (`shift: null` or equivalent). "No shift is open" is the case under test — a fixture updated
// to have one open silently converts this file into a test of something else.
//
// OUT OF THIS PACKAGE, and named rather than faked:
//   · the `unbound_settlement` ANOMALY itself is raised by a fold (`packages/sync-client`) and
//     surfaces on `05` and on `02-F23`'s own-day view. Nothing in `apps/pos-electron` can
//     observe it today — there is no anomaly read on the IPC contract — so nothing here
//     asserts it. A test that claimed to would be asserting its own stub.
//   · the POSITIVE control (a settlement made WHILE a shift is open carries that shift's id,
//     `26 §7`'s carried key) needs the shift surface, which this session does not own.
// Both are recorded in the session report as owed coverage.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddLineRequest,
  type AppendRequest,
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
 * A device with NO SHIFT OPEN — which is every field this state carries, because no shift
 * concept exists on it. That is the condition under test, not an omission.
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

const mountWith = (orders: OpenOrder[]) => {
  appended = [];
  lines = [];
  let current = orders;
  const listeners = new Set<() => void>();
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => current),
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
    expect(appended[0]?.payload["amount_paisa"]).toBe(DUE_PAISA);
    expect(appended[0]?.payload["method"]).toBe("cash");
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
    expect(payload["shift_id"]).toBeNull();
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
