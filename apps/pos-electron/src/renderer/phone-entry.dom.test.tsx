// ACCEPTANCE TESTS — `02-F28` phone quick-entry, the SCREEN half.
//
// ⚠ AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2), by the session that wrote
// `main/__acceptance__/phone-entry-seam.test.ts` beside it and no implementation of either. Read
// that file's header first: it carries the three RED-AWAITING-IMPLEMENTATION reasons, including
// the two that are SPEC gaps rather than missing code.
//
// Spec text this file is derived from: `02-F27` (the incoming-call flow), `02-F28` (≤ 30 s from
// NUMBER ENTRY), `02-N3`, `02-F1`/`02-F42` (channel set at creation, never inferred), `01-F17`
// (a sale is never blocked), `01-F23` (one identity per org, keyed E.164), `27-F5` (no invisible
// or context-dependent controls), `27-F6` (no critical-path task requires typing non-numeric
// text), `27-F8`/`27-F29` (numeric entry is the largest target and impossible values are blocked
// AT ENTRY), `21 §5` (the cashier is plausibly a non-reader; numerals carry the information).
//
// ── THE DEFECT THIS FILE IS BUILT AROUND, AND IT IS ALREADY SHIPPED IN packages/ui ──────────
//
// `packages/ui`'s `acceptKeystroke` — the rule behind `NumericKeypad`, the only numeric entry
// surface this product owns — begins:
//
//     const next = current === "0" ? key : current + key;
//
// **Leading-zero suppression.** It is exactly right for money (`07` is not a rupee amount anyone
// types) and it makes a Pakistani phone number IMPOSSIBLE TO ENTER: `registry.ts` names the local
// dialling form as `03001234567`, and every mobile number in this country begins `03`. Typing
// `0` then `3` yields `3`, so the operator ends up entering `3001234567` — ten digits that
// normalize to a DIFFERENT E.164 identity, miss the repeat customer `02-F28` exists to find, and
// (if she then saves) file a second permanent row for one human in a ledger `01-F1` forbids
// correcting in place. Its second default, `maxDigits = 7`, truncates the same number at seven.
//
// The component's own header already warns *"⚠ THIS IS A MONEY KEYPAD. DO NOT USE IT FOR A PIN"*
// and gives the leading zero as the first reason — found the hard way while building `C1`. A
// phone number is the second instance of the same trap and **nothing in the product says so**,
// so the single most likely implementation of this screen is `<NumericKeypad>` with a `max`.
// §B is the assertion that catches it, and it is written to catch it whatever the entry surface
// turns out to be.
//
// ── WHY THE ASSERTIONS ARE MECHANISM-INDEPENDENT ───────────────────────────────────────────
//
// A test that required "twelve buttons labelled 0–9" would pin a SHAPE, and `27-F6` permits
// numeric typing outright (*"27-F6 ... 02-F27 customer name are all legitimate under this
// reading"* — the test is whether a non-typing operator can complete the task by another route).
// So `enterNumber` below drives whatever the surface offers — keypad keys if they exist, a field
// otherwise — and every assertion is about the VALUE that reached the trusted side. The defect
// above survives a shape test and dies to a value test.
//
// ── WHAT IS NOT HERE ────────────────────────────────────────────────────────────────────────
//
// * `02-F27`'s ORDER HISTORY and *"repeat last order"* shortcut: unbuildable until an order can
//   name a customer. `order.created`'s payload has no customer field and `01 §4` has no
//   `order.customer_linked`. See the seam file's header note (3).
// * The channel row itself: `channel-and-soldout.dom.test.tsx` §B already asserts Phone →
//   `channel: "phone"`, and duplicating it here would pin the same behaviour twice.
// * Layout. happy-dom performs NO layout — every `getBoundingClientRect` is zeroes — so nothing
//   below can say "the control is on the screen", only "it is in the document". The nine layout
//   defects this repo has recorded were all found by launching and looking; `pnpm layout:check`
//   reads the tab list from the DOM and will measure this surface once its fixture reaches it,
//   and **the fixture is the real coverage boundary**, so the phone surface needs a fixture state
//   in the layout gate. Named here as owed rather than left to be discovered.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

/** happy-dom lays nothing out, so `usePhysicalSize` needs a panel or no grid ever renders. */
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
  businessDay: "2026-08-10",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/** `registry.ts`'s own worked example of the form an operator types. Leading zero, 11 digits. */
const DIALLED = "03001234567";
const NAME = "Fatima Bibi";
const ADDRESS = "House 12, Street 4, Gulberg III, Lahore";

/** What the trusted side answered for a KNOWN caller — `02-F27`: "name, saved addresses". */
const KNOWN = {
  phone_e164: "+923001234567",
  known: { name: NAME, addresses: [{ address_id: "addr-1", address_text: ADDRESS }] },
};
/** `02-F27`'s "unknown number" — a STATE, not an error. */
const UNKNOWN = { phone_e164: "+923001234567", known: null };

let appended: AppendRequest[];
/** Every argument `lookupCustomer` was called with, in order — §B and §C read this. */
let lookedUp: unknown[];
let recorded: unknown[];

type LookupAnswer = typeof KNOWN | typeof UNKNOWN;

const mount = (opts: { lookup?: (dialled: unknown) => Promise<LookupAnswer> } = {}) => {
  appended = [];
  lookedUp = [];
  recorded = [];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async (): Promise<OpenOrder[]> => []),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    toggleAvailability: vi.fn(async () => ({ id: "evt-86" })),
    lookupCustomer: vi.fn(async (dialled: unknown) => {
      lookedUp.push(dialled);
      return opts.lookup ? await opts.lookup(dialled) : UNKNOWN;
    }),
    recordCustomer: vi.fn(async (req: unknown) => {
      recorded.push(req);
      return { id: `evt-cust-${recorded.length}` };
    }),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const tap = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/**
 * Put the till on the phone channel — the state `02-F27`'s flow begins in. Deliberately uses the
 * SHIPPED channel row rather than a prop, so this file cannot pass against a phone surface that
 * is unreachable from the counter (this wave's second recurring defect: a correct component that
 * is not on the screen).
 */
const choosePhone = async () => {
  await screen.findByRole("button", { name: /^Phone$/i });
  tap(/^Phone$/i);
};

/**
 * Enter `digits` through WHATEVER the surface offers, and fail loudly if it offers nothing.
 *
 * Keypad keys first (`27-F8` makes numeric entry the 126 dp kiosk condition, so that is the
 * expected shape), a text field as the fallback that `27-F6` explicitly permits for numerals.
 * Neither is required by this file; ONE of them is.
 */
const enterNumber = (digits: string) => {
  const key = (d: string) => screen.queryAllByRole("button", { name: new RegExp(`^${d}$`) })[0];
  if (key(digits[0] as string) !== undefined) {
    for (const d of digits) {
      const k = key(d);
      if (k === undefined) {
        throw new Error(
          `02-F28: no key for digit "${d}" after entering "${digits}" — a phone number that ` +
            "cannot be finished is a customer who cannot be found",
        );
      }
      fireEvent.click(k);
    }
    return;
  }
  const field = screen.queryAllByRole("textbox")[0];
  if (field === undefined) {
    throw new Error(
      "02-F27/02-F28 red-awaiting-implementation: the phone channel offers no way to enter a " +
        "number — no digit keys and no field. `02-F27` begins \"operator types the caller's " +
        'number" and `02-F28` measures 30 seconds FROM THAT ACT.',
    );
  }
  fireEvent.change(field, { target: { value: digits } });
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SURFACE IS REACHABLE FROM THE COUNTER, ON THE PHONE CHANNEL
//
// This wave's SECOND recurring defect: a correct component that is not on the screen. A phone
// entry pad that exists as a component and is rendered by nothing is `02-F28` unbuilt.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F27 — choosing Phone puts a number-entry surface in front of the operator", () => {
  it("offers a way to enter the caller's number", async () => {
    mount();
    render(<Counter />);
    await choosePhone();

    // Throws with a named message if neither a keypad nor a field exists.
    await waitFor(() => enterNumber("0"));
  });

  it("does not put it in front of a COUNTER order (27-F5 — no context-dependent controls)", async () => {
    // The control for §A, and the thing that makes the surface a *phone* surface rather than a
    // permanent field on the order screen. `21 §5` makes screen position the real interface for
    // this operator; a customer-lookup pad that is always present on a walk-in sale is a control
    // with no task behind it, which `21 §5` calls feature tourism in terms.
    //
    // NOTE the direction: this asserts the LOOKUP is not performed on the counter channel, not
    // that some pad is absent from the DOM — the Cash tab owns a keypad of its own and a
    // presence assertion would be measuring that.
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^Counter$/i });
    tap(/^Counter$/i);
    tap(/^Takeaway$/i);

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(lookedUp).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE NUMBER THAT REACHES THE TRUSTED SIDE IS THE NUMBER SHE TYPED
//
// THE test of this file. Read the header: `packages/ui`'s only numeric entry surface eats the
// leading zero and caps at seven digits, and every Pakistani mobile number starts `03` and runs
// to eleven.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F23/02-F28 — the leading zero and all eleven digits survive entry", () => {
  it("hands the trusted side exactly what was entered", async () => {
    mount();
    render(<Counter />);
    await choosePhone();

    await waitFor(() => enterNumber(DIALLED));

    // The lookup may legitimately fire per keystroke (`02-F28` is a stopwatch — waiting for a
    // Search tap spends the budget it exists to protect), so the assertion is on the LAST answer
    // rather than on the call count. What it refuses is a lookup whose final argument is
    // `3001234567` (leading zero eaten) or `0300123` (capped at seven).
    await waitFor(() => expect(lookedUp.length).toBeGreaterThan(0));
    await waitFor(() => expect(lookedUp[lookedUp.length - 1]).toBe(DIALLED));
  });

  it("shows the operator all eleven digits she pressed (27-F29, 21 §5)", async () => {
    // `27-F29` blocks impossible numbers AT ENTRY rather than warning afterwards, and the only
    // way an operator can act on that is to SEE what she entered. `21 §5`: "numerals carry the
    // operational information — digits are readable by many who can't read words." A readout
    // showing `3001234567` while she pressed `03001234567` is the screen lying about the one
    // fact on it.
    mount();
    render(<Counter />);
    await choosePhone();

    await waitFor(() => enterNumber(DIALLED));

    await waitFor(() => {
      const shown = screen.getAllByText((_, el) => (el?.textContent ?? "").includes(DIALLED));
      expect(shown.length).toBeGreaterThan(0);
    });
  });

  it("keeps a SECOND caller's number distinct from the first", async () => {
    // The negative control. An entry surface that ignored its input and passed a constant — or
    // that reset to the previous caller — passes both assertions above.
    mount();
    render(<Counter />);
    await choosePhone();
    await waitFor(() => enterNumber("0300"));
    await waitFor(() => expect(lookedUp.length).toBeGreaterThan(0));
    const first = lookedUp[lookedUp.length - 1];

    enterNumber("1");

    await waitFor(() => expect(lookedUp[lookedUp.length - 1]).not.toBe(first));
    expect(lookedUp[lookedUp.length - 1]).toBe("03001");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE FILE'S ANSWER REACHES THE OPERATOR
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F27 — a repeat customer is recognised on the screen", () => {
  it("renders the name AND the saved address the trusted side returned", async () => {
    // `02-F27`: "→ name, saved addresses". Both, because a delivery order needs the address and
    // `09-F10` has a rider read it off the assigned order. An implementation that rendered the
    // name alone would look complete and leave the food with nowhere to go.
    mount({ lookup: async () => KNOWN });
    render(<Counter />);
    await choosePhone();

    await waitFor(() => enterNumber(DIALLED));

    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(NAME, "i")).length).toBeGreaterThan(0),
    );
    expect(
      screen.getAllByText((_, el) => (el?.textContent ?? "").includes("Gulberg III")).length,
    ).toBeGreaterThan(0);
  });

  it("does not claim to know an unknown caller", async () => {
    // The control for the test above: a surface that rendered a hardcoded row, or that kept the
    // previous caller's answer on screen, passes it. `02-F27` makes "unknown number" a real state
    // with its own branch (inline creation), so it must be distinguishable on the screen.
    mount({ lookup: async () => UNKNOWN });
    render(<Counter />);
    await choosePhone();

    await waitFor(() => enterNumber(DIALLED));
    await waitFor(() => expect(lookedUp.length).toBeGreaterThan(0));

    expect(screen.queryAllByText(new RegExp(NAME, "i"))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `27-F6` / `21 §5`: A NON-READER COMPLETES THE PHONE ORDER
//
// "No operational role is ever required to type non-numeric text to complete a CRITICAL-PATH
// task ... of 27 field subjects, 24 could not type a single word. The test is whether a
// non-typing operator can complete the task by another route." `02-F27`'s customer NAME is
// blessed by that FR as an optional escape hatch — optional being the whole of it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 27-F6/21 §5 — an unknown caller's order completes with zero letters typed", () => {
  it("starts the order after an unknown number, with no name entered", async () => {
    mount({ lookup: async () => UNKNOWN });
    render(<Counter />);
    await choosePhone();
    await waitFor(() => enterNumber(DIALLED));
    await waitFor(() => expect(lookedUp.length).toBeGreaterThan(0));

    // Not one letter has been typed. The order must still be startable — an implementation that
    // demanded a name before releasing the type row would put `02-F28`'s 30 seconds behind a
    // literacy requirement 24 of 27 field subjects do not have.
    tap(/^Delivery$/i);

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.created");
    expect(appended[0]?.payload).toMatchObject({ channel: "phone", order_type: "delivery" });
  });

  it("records the caller with a STATED ABSENCE of a name, never an empty string", async () => {
    // Conditional on the surface recording at all, and that is deliberate: whether an unknown
    // caller is filed automatically or on an explicit tap is not decided by any FR, so this
    // constrains only the SHAPE of what is written if something is.
    //
    // `registry.ts` is explicit: name is "REQUIRED AND NULLABLE ... `null` is a stated fact —
    // `06-F11` creates a customer on first sight from a checkout that captured only a number —
    // and `undefined` is a writer who forgot. `\"\"` is refused for the same reason: `null`
    // already says 'no name stated', so an empty string would be a SECOND encoding of one fact."
    // An empty string here is refused by the schema and the write is lost.
    mount({ lookup: async () => UNKNOWN });
    render(<Counter />);
    await choosePhone();
    await waitFor(() => enterNumber(DIALLED));
    tap(/^Delivery$/i);
    await waitFor(() => expect(appended).toHaveLength(1));

    for (const req of recorded) {
      expect((req as { name: unknown }).name).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `01-F17`: THE CUSTOMER FILE NEVER STOPS THE SALE
//
// The seam file asserts this on the trusted side. This is the SCREEN half, and it is the half
// that actually bites: a lookup is an `await` across a process boundary, and an unguarded
// rejection leaves a promise unhandled and the surface wedged with a customer on the line.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F17 — a failed lookup does not wedge the counter", () => {
  it("still starts the phone order when the lookup REJECTS", async () => {
    mount({
      lookup: async () => {
        throw new Error("main is busy / the store is locked / the seam is not wired yet");
      },
    });
    render(<Counter />);
    await choosePhone();
    await waitFor(() => enterNumber(DIALLED));
    await waitFor(() => expect(lookedUp.length).toBeGreaterThan(0));

    tap(/^Delivery$/i);

    // "A sale is never blocked — not by inventory math, sync, or approval timeouts" (`01-F17`),
    // and a lookup is none of those three, which is exactly why it is the one an implementation
    // forgets to guard. `01-F54` is the same disposition one layer down: the loss is a WORD.
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.payload).toMatchObject({ channel: "phone" });
  });

  it("does not fabricate a customer answer out of a failed lookup", async () => {
    // The other direction of the same guard, and the more dangerous one: a `.catch(() => KNOWN)`
    // or a stale answer left on screen would show the operator a name for a caller the file was
    // never asked about. `00 §5.7`'s honesty law — a surface that cannot answer says so.
    mount({
      lookup: async () => {
        throw new Error("the seam is down");
      },
    });
    render(<Counter />);
    await choosePhone();
    await waitFor(() => enterNumber(DIALLED));
    await waitFor(() => expect(lookedUp.length).toBeGreaterThan(0));

    expect(screen.queryAllByText(new RegExp(NAME, "i"))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — `02-F1`: ENTERING A NUMBER IS NOT STARTING AN ORDER
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 02-F1 — the order is created by a deliberate act, not by a number arriving", () => {
  it("appends nothing while the operator is still typing", async () => {
    // `02-F1` requires BOTH axes at creation — channel and order type — and a surface that
    // created the order the moment a number resolved would have to guess the type. `01-F1` makes
    // the guess permanent, and a wrong `order_type` is fabricated provenance in the tax posture
    // (doc 16) and the channel economics (docs 12/13).
    //
    // It is also `02-F28`'s own arithmetic: a caller who changes her mind mid-number would leave
    // an abandoned open order behind on every hang-up.
    mount({ lookup: async () => KNOWN });
    render(<Counter />);
    await choosePhone();

    await waitFor(() => enterNumber(DIALLED));
    await waitFor(() => expect(lookedUp.length).toBeGreaterThan(0));

    expect(appended).toEqual([]);
  });
});
