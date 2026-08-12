// ACCEPTANCE TESTS — **authored from spec text only** (`24 §3` step 2).
//
// PROVENANCE: written by an acceptance-test session from `02-F27`, `02-F47`, `27-F6`, `27-F5`,
// `21 §5`, `00 §5.6`, `06-F9`, `06-F11`, `09-F10`, `01-F1` and `01-F23`, plus the two shipped
// contracts this surface writes through (`RecordCustomerRequestSchema` in
// `apps/pos-electron/src/shared/ipc.ts`, and `customer.address_added`'s payload in
// `packages/domain/src/registry.ts`). No implementation of the capture surface was read, because
// there is none — this file is expected to be RED on the commit that introduces it.
//
// The three files it must not duplicate and did not edit: `phone-entry.dom.test.tsx` (the
// independent oracle), `phone-entry-save.dom.test.tsx` (the implementer's seam assertion) and
// `phone-entry-honesty.dom.test.tsx` (the adversary's clearing assertions).
//
// ── THE DEFECT THIS CLOSES: AN EVENT TYPE WITH NO PRODUCER ──────────────────────────────────
//
// `customer.address_added` has a payload schema, a `WRITE_ACTIONS` row, an authorization guard,
// a fold, a store table and a seam test — and **no production writer**. Measured symbol-precisely
// over `apps/*/src services/*/src packages/*/src` minus tests: the only writer of `address_text`
// is `gateway.recordCustomer`, and its only production caller — `Counter.tsx`'s `recordCaller` —
// sends `{ dialled, name: null }`. So the whole chain is reachable from tests and from nothing
// else. That is `AGENTS.md`'s named defect in the shape it explicitly says the CI rail cannot
// see: *"nor can it see a missing PRODUCER for an event type — a key in an object literal is not
// an export, which is how `audit.print_acknowledged` sat in the registry with nothing emitting
// it."*
//
// `Counter.tsx` records the blocker in its own words and is right about it: *"the typed name and
// `06-F9`'s free-text address have no surface here at all, so a delivery order taken from a new
// caller still has nowhere to send the food. The blocker is not this screen — `packages/ui`
// ships no text-entry component at all."* That component is specified by
// `packages/ui/src/components/text-entry.dom.test.tsx`; this file specifies the surface that
// uses it.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT ASK FOR ────────────────────────────────────────────
//
// **Only the UNKNOWN-caller branch.** `02-F27`'s clause is *"unknown number → inline customer
// creation (`customer.created`, `customer.address_added`)"* — both events, one branch. Attaching
// an address to a caller who is already on file is `06-F11`'s *"name/address attach on
// subsequent orders"*, which is doc 06's clause and a different surface. An implementer sent
// here should build the one branch the FR names and no more (`24 §3b`).
//
// **No address PICKER for a repeat caller.** `02-F27`'s *"saved addresses"* already renders
// (`phone-entry.dom.test.tsx` §C). Choosing which saved address an order goes to needs an event
// linking a customer to an order, and `01 §4`'s order family has none — `ipc.ts` records that
// finding in full on `CustomerLookup`. Nothing here asks for it.
//
// **Nothing about which control captures a keystroke.** See the `TextEntry` suite's header.
//
// ── THE PINS THIS FILE MAKES, STATED RATHER THAN HIDDEN ─────────────────────────────────────
//
// It finds the two fields by the two NOUNS `02-F27` and `06-F9` use — *name* and *address*. A
// caption using neither reddens this file, and that is a real cost, taken with the same argument
// `phone-entry-save.dom.test.tsx` makes for pinning `Save caller`: *"a renamed control fails
// loudly, where a decorative one fails nothing."* `00 §5.6` makes both words English by law, so
// the pin cannot rot through translation.
//
// ⚠ It does NOT pin the shorthand-property shape of the emitted request. That mistake is
// recorded in `main/__acceptance__/phone-entry-host.test.ts` §C — an assertion matching
// `{ dialled, name: null }` in the SOURCE reddened when a variable was renamed while the emitted
// object stayed identical. Every claim below reads the object that actually crossed the bridge.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
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
  businessDay: "2026-08-10",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/** `registry.ts`'s own worked example of what an operator types. Leading zero, eleven digits. */
const DIALLED = "03001234567";
const SECOND_DIALLED = "03219876543";

/** `02-F27`'s *"unknown number"* — a number that keys fine and has no file. */
const UNKNOWN = { phone_e164: "+923001234567", known: null };

let appended: AppendRequest[];
let recorded: Record<string, unknown>[];

/**
 * `keyable: false` is `02-F27`'s OTHER unresolved branch — a number `01-F23` cannot key at all,
 * which the strip already renders as *"Key the caller's number"*. Added by the mutation pass;
 * every existing call leaves it defaulted and behaves exactly as before.
 */
const mount = (opts: { keyable?: boolean } = {}) => {
  appended = [];
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
    // Every number this file keys is unknown — that is `02-F27`'s creation branch and the only
    // branch this file is about.
    lookupCustomer: vi.fn(async (dialled: unknown) => ({
      ...UNKNOWN,
      phone_e164: opts.keyable === false ? null : `+92${String(dialled).slice(1)}`,
    })),
    recordCustomer: vi.fn(async (req: Record<string, unknown>) => {
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

const enterNumber = (digits: string) => {
  for (const d of digits)
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${d}$`) }));
};

/**
 * Put the till on `02-F27`'s unknown-caller branch, through the SHIPPED controls only.
 *
 * Deliberately not a prop and not a direct render of a sub-component: this wave's second
 * recurring defect is *a correct component that is not on the screen*, and a fixture that
 * mounted the capture surface directly would prove the component works and nothing about
 * whether an operator can reach it.
 */
const reachUnknownCaller = async (digits = DIALLED) => {
  await screen.findByRole("button", { name: /^Phone$/i });
  tap(/^Phone$/i);
  await waitFor(() => enterNumber(digits));
  await screen.findByRole("button", { name: /^Save caller$/i });
};

/**
 * One of the two capture fields, or a red that says which one is missing and what WAS on screen.
 *
 * A bare `getByRole` throws a testing-library message about a missing role, which sends the
 * reader looking for a rendering bug. This says the FR instead.
 */
const field = (which: RegExp, why: string): HTMLElement => {
  const found = screen.queryAllByRole("textbox", { name: which })[0];
  if (found !== undefined) return found;
  const present = screen
    .queryAllByRole("textbox")
    .map((el) => el.getAttribute("aria-label") ?? el.id ?? "(unlabelled)");
  throw new Error(
    `02-F27 red-awaiting-implementation: no text field matching ${which} on the caller strip. ` +
      `${why} Text fields present: ${present.length === 0 ? "NONE" : present.join(", ")}.`,
  );
};

const nameField = () =>
  field(
    /name/i,
    "`02-F27` names the customer NAME as part of inline creation and `27-F6` blesses it as an " +
      "optional escape hatch by that FR id.",
  );

const addressField = () =>
  field(
    /address/i,
    "`02-F27` names `customer.address_added` and `06-F9` calls the address free text; without " +
      "a field for it that event type has no producer anywhere in the product, and `09-F10` " +
      "reads this very text off the assigned order.",
  );

const type = (el: HTMLElement, text: string) => fireEvent.change(el, { target: { value: text } });

const save = async () => {
  tap(/^Save caller$/i);
  await waitFor(() => expect(recorded.length).toBeGreaterThan(0));
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE ADDRESS REACHES THE TRUSTED SIDE (the missing producer)
//
// THE test of this file. `customer.address_added` becomes emittable in production the moment a
// `RecordCustomerRequest` carrying `address_text` crosses this bridge, and not before — the
// gateway half is already built and already asserted (`phone-entry-seam.test.ts` §B).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F27 — a caller's name and address reach the trusted side", () => {
  const NAME = "Hina Raza";
  const ADDRESS = "House 12, Block C, Gulberg III, Lahore";

  it("sends the address as `address_text` beside the dialled digits", async () => {
    mount();
    render(<Counter />);
    await reachUnknownCaller();

    type(nameField(), NAME);
    type(addressField(), ADDRESS);
    await save();

    // ONE act, ONE request. `02-F27` names two events in one clause and `02-F47` gives them one
    // permission action for exactly that reason; a surface that saved the name and then the
    // address as two operator taps would make a matrix that permits one and denies the other
    // observable, which `02-F47` says nothing in the corpus decides.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      dialled: DIALLED,
      name: NAME,
      address_text: ADDRESS,
    });
  });

  it("normalizes nothing on the way — the digits and the text cross as typed", async () => {
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(addressField(), ADDRESS);
    await save();

    // `registry.ts` puts normalization *"at the WRITER, upstream of `parseEvent`"* and `18 §9`
    // makes main the trusted side. A renderer that trimmed, cased or keyed anything here would
    // be a SECOND writer of a permanent record (`01-F1`).
    expect(recorded[0]?.dialled).toBe(DIALLED);
    expect(recorded[0]?.address_text).toBe(ADDRESS);
    expect(recorded[0]).not.toHaveProperty("phone_e164");
    expect(recorded[0]).not.toHaveProperty("address_id");
  });

  it("sends the name WITHOUT an address when only a name was given", async () => {
    // The half that separates "one act with an optional half" from "two required fields".
    // `ipc.ts`: *"`address_text` is optional because `02-F27`'s two events are one act with an
    // optional half — a caller may be filed before she has said where she is."*
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(nameField(), NAME);
    await save();

    expect(recorded[0]).toMatchObject({ dialled: DIALLED, name: NAME });
    // ABSENT, never `""`. `RecordCustomerRequestSchema` declares `z.string().min(1).optional()`,
    // so an empty string is a Zod refusal at the seam and the whole record is lost — the name
    // with it. `06-F9`'s own reason: a rider cannot deliver to an empty string.
    expect(recorded[0]).not.toHaveProperty("address_text");
  });

  it("sends the address WITHOUT a name when only an address was given", async () => {
    // The other diagonal, and it is not symmetry for its own sake: `06-F11` creates a customer
    // *"on first sight from a checkout that captured only a number"*, so a stated absence of a
    // name is an ordinary, specified state — and a delivery still has to go somewhere.
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(addressField(), ADDRESS);
    await save();

    expect(recorded[0]).toMatchObject({ dialled: DIALLED, address_text: ADDRESS });
    // `null`, never `""` and never `undefined`. `registry.ts`: *"`null` is a stated fact and
    // `undefined` is a writer who forgot."*
    expect(recorded[0]?.name).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `27-F6`: THE OPERATOR WHO CANNOT TYPE STILL COMPLETES THE TASK
//
// The anti-scope section, and the one that stops this feature from breaking the FR that permits
// it. *"Of 27 field subjects, 24 could not type a single word. The test is whether a non-typing
// operator can complete the task by another route, not whether a keyboard appears anywhere."*
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 27-F6/21 §5 — the capture is an escape hatch, never a gate", () => {
  it("files the caller with both fields untouched", async () => {
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    await save();

    // Byte-identical to what the surface sends today, which is the compatibility claim:
    // `phone-entry-save.dom.test.tsx` asserts this exact shape and must keep passing.
    expect(recorded[0]).toMatchObject({ dialled: DIALLED, name: null });
    expect(recorded[0]).not.toHaveProperty("address_text");
  });

  it("offers `Save caller` before a single letter is typed", async () => {
    // The plausible wrong implementation this owns: a save control that appears, or enables,
    // only once a name is entered. `27-F4` also bears — *"a conditional surface is DISABLED IN
    // PLACE, never absent"* — but the sharper failure is `02-F28`'s stopwatch: a literacy
    // requirement inside a 30-second budget, in the branch `27-F11e` says has no manager.
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    const control = screen.getByRole("button", { name: /^Save caller$/i });
    expect(control.hasAttribute("disabled")).toBe(false);
  });

  it("offers no capture at all for a number `01-F23` cannot key", async () => {
    /**
     * ⚠ **ADDED BY THE MUTATION PASS — the branch was pinned at one end and open at the other.**
     * `02-F27`'s creation clause is *"unknown number → inline customer creation"*, and *unknown*
     * has two halves: a number that KEYS and has no file, and a number that does not key at all.
     * Rendering the capture for a known caller is caught (three tests in
     * `caller-refusal.dom.test.tsx` §C fail); dropping the `phone_e164 !== null` half passed
     * **846/846** when measured 2026-08-12.
     *
     * The consequence is not cosmetic and it undoes the other half of this wave's work: the card
     * says *"Key the caller's number"* while a `Save caller` sits under the pad, and
     * `gateway.recordCustomer` throws on a key no lookup will ever produce (`01-F1` — *"a key no
     * lookup will ever produce is permanent"*, asserted in
     * `main/__acceptance__/customer-address-producer.test.ts` §C). The refusal line lives inside
     * the resolvable branch, so that tap would be refused **silently** — the exact defect
     * `caller-refusal.dom.test.tsx` exists to end, reachable through a branch nothing pinned.
     */
    mount({ keyable: false });
    render(<Counter />);
    await screen.findByRole("button", { name: /^Phone$/i });
    tap(/^Phone$/i);
    await waitFor(() => enterNumber(DIALLED));
    await screen.findByText(/Key the caller's number/i);

    expect(screen.queryByRole("button", { name: /^Save caller$/i })).toBeNull();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("starts the order with both fields untouched", async () => {
    // `01-F17`, restated for this surface: the customer file never gates the sale. The oracle
    // asserts this for the number; this asserts it for the two new fields, which are the two
    // new things that could grow a gate.
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    tap(/^Delivery$/i);

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.created");
    expect(appended[0]?.payload).toMatchObject({ channel: "phone", order_type: "delivery" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — A BLANK FIELD IS A STATED ABSENCE, NOT A VALUE
//
// `01-F1` is the whole weight behind this section: a customer identity cannot be corrected in
// place, so a name of `"   "` is a permanent row for a human whose name nobody knows, and an
// address of `"   "` is a delivery `09-F10` sends a rider to.
//
// `RecordCustomerRequestSchema` uses `z.string().min(1)` on both, and `.min(1)` counts a space.
// The schema cannot express this; the surface has to.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F1/06-F9 — whitespace is not a name and not an address", () => {
  it("sends `null` for a name that is only spaces", async () => {
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(nameField(), "   ");
    await save();
    expect(recorded[0]?.name).toBeNull();
  });

  it("omits an address that is only spaces", async () => {
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(addressField(), "  \t ");
    await save();
    expect(recorded[0]).not.toHaveProperty("address_text");
  });

  it("trims the ends of a NAME too, not only of an address", async () => {
    /**
     * ⚠ **ADDED BY THE MUTATION PASS — this section pinned the trim for the address and left the
     * name asserted only in its all-blank form.** Measured 2026-08-12: sending the name
     * un-trimmed while leaving `stated()` on the address (`name: callerName.trim() === "" ? null
     * : callerName`) passed **846/846**, because `"   "` still resolves to `null` and every other
     * fixture types a name with no space at its ends.
     *
     * It is the same `01-F1` weight the section header already states: `customer.created` cannot
     * be corrected in place, so `"  Hina Raza  "` is a permanent row, and `07`'s templates and
     * `12`'s summaries all read that string back with the operator's slip inside it.
     */
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(nameField(), "  Hina Raza  ");
    await save();
    expect(recorded[0]?.name).toBe("Hina Raza");
  });

  it("does NOT trim the middle of a real address", async () => {
    // The control for the two above, and it is the assertion that keeps the fix honest: an
    // implementation that collapsed internal whitespace would pass both trimming tests while
    // rewriting user content, which `00 §5.6` forbids in terms (*"never transliterated"*).
    // Leading/trailing space is the operator's slip; interior spacing is the address.
    const spaced = "Flat 4,  Street 12,  F-7/1, Islamabad";
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(addressField(), ` ${spaced} `);
    await save();
    expect(recorded[0]?.address_text).toBe(spaced);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `00 §5.6`: THE CALLER'S OWN SCRIPT SURVIVES THE TRIP
//
// *"Customer-entered data (names, addresses, notes, messages, transcripts) is uncontrolled
// Unicode and may contain Urdu script — every surface renders it faithfully … User content is
// never transliterated or rejected for its script."*
//
// The trap this section exists for is real and is written down two docs away: `03-F8` proves no
// ESC/POS code page can print Urdu and has the encoder REFUSE a non-Latin user field. That is a
// fact about paper. A surface that pre-emptively refused the same text would make the customer
// unrecordable rather than the ticket unprintable — and `packages/escpos` already ships an
// `isPrintableLatin` predicate for an implementer to reach for.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 00 §5.6 — an Urdu name and address cross the bridge unchanged", () => {
  const URDU_NAME = "حنا رضا";
  const URDU_ADDRESS = "مکان نمبر ۱۲، گلبرگ، لاہور";

  it("carries both to the trusted side byte for byte", async () => {
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(nameField(), URDU_NAME);
    type(addressField(), URDU_ADDRESS);
    await save();

    expect(recorded[0]?.name).toBe(URDU_NAME);
    expect(recorded[0]?.address_text).toBe(URDU_ADDRESS);
  });

  it("shows her what it is about to file (27-F29, 21 §5)", async () => {
    // The read-back half. `27-F29` blocks impossible entries *at entry*, and the only way an
    // operator acts on that is to see what she entered — the same argument `Counter.tsx` makes
    // for rendering the dialled digits in a `Readout` rather than as a masked field.
    mount();
    render(<Counter />);
    await reachUnknownCaller();
    type(addressField(), URDU_ADDRESS);
    expect((addressField() as HTMLInputElement).value).toBe(URDU_ADDRESS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE CALL ENDS AND THE CALLER'S DETAILS END WITH IT
//
// `Counter.tsx`'s `clearCaller` already exists for the number and the lookup answer, and names
// the two exits: *"the order is started (`startOrder`), or a different channel is latched"*.
// `phone-entry-honesty.dom.test.tsx` was written because BOTH of those calls could be deleted
// with 791/791 still passing. Two new fields arrive on the same strip with the same two exits.
//
// **It is worse for these two than for the number.** A stale number renders as digits that are
// visibly not the ones she just pressed. A stale ADDRESS renders as a plausible address for the
// wrong customer, and `09-F10` reads it off the assigned order — a real rider at a real door.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 00 §5.7/09-F10 — one caller's address never reaches the next caller", () => {
  const FIRST_ADDRESS = "House 12, Block C, Gulberg III, Lahore";

  /**
   * Every test here fills the fields FIRST and then ends the call, because a test that started
   * from empty fields cannot tell "cleared" from "never populated" — the precise defect
   * `phone-entry-honesty.dom.test.tsx` records for the oracle's §E.
   */
  const fillFirstCaller = async () => {
    await reachUnknownCaller(DIALLED);
    type(nameField(), "Hina Raza");
    type(addressField(), FIRST_ADDRESS);
  };

  it("clears both fields when the order starts", async () => {
    mount();
    render(<Counter />);
    await fillFirstCaller();

    tap(/^Delivery$/i);
    await waitFor(() => expect(appended).toHaveLength(1));

    // Back on the phone channel for the NEXT call, at a different number.
    await reachUnknownCaller(SECOND_DIALLED);
    expect((nameField() as HTMLInputElement).value).toBe("");
    expect((addressField() as HTMLInputElement).value).toBe("");
  });

  it("clears both fields when a different channel is latched", async () => {
    mount();
    render(<Counter />);
    await fillFirstCaller();

    // The second exit `Counter.tsx` names: *"latching a different channel ends the call."*
    tap(/^Counter$/i);
    await reachUnknownCaller(SECOND_DIALLED);
    expect((nameField() as HTMLInputElement).value).toBe("");
    expect((addressField() as HTMLInputElement).value).toBe("");
  });

  it("does not file the second caller with the first caller's address", async () => {
    // The consequence, asserted where it lands rather than only where it shows. A field that
    // renders empty and holds its old value in state is a survivor the two tests above miss.
    mount();
    render(<Counter />);
    await fillFirstCaller();
    tap(/^Counter$/i);

    await reachUnknownCaller(SECOND_DIALLED);
    await save();

    expect(recorded[0]?.dialled).toBe(SECOND_DIALLED);
    expect(recorded[0]?.name).toBeNull();
    expect(recorded[0]).not.toHaveProperty("address_text");
  });
});
