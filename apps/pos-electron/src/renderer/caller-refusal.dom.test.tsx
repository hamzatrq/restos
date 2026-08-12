// ACCEPTANCE TESTS — **authored from spec text only** (`24 §3` step 2).
//
// PROVENANCE: written by an acceptance-test session from `00 §5.7`, `01-F17`, `01-F1`, `02-F27`,
// `02-F37`, `02-F47`, `03-F5`, `21 §5`, `27-F5`, `27-F11d`, `27-F12`, `27-F14` and `27-F16`.
// No implementation of the refusal surface was read, because there is none.
//
// ── THE DEFECT: A FAILED `Save caller` IS SILENT, AND SO IS A SUCCESSFUL ONE ────────────────
//
// `Counter.tsx`'s `write` helper is `void op.catch(() => {}).then(reload)`, and it says in its
// own comment what that costs: *"What is deliberately NOT here: a visible alarm … nothing
// constructs one yet, and inventing a local error banner would put a second, competing error
// surface on the screen that the alarm model is meant to own. Recorded rather than improvised."*
// That was the right call to record and it is the wrong state to ship: the record path can be
// refused by the `domain` matrix (`02-F47` gives a storekeeper `—`), by `01-F23`'s key rule, or
// by a store error, and the operator sees nothing at all.
//
// **The success is silent too, and that is the half a reader will not expect.** The lookup
// effect's dependency list is `[pendingChannel, dialled]`, so it does not re-ask when the ledger
// moves. Main already pushes — `main/index.ts`'s record handler calls `notifyChanged()` and
// `phone-entry-host.test.ts` §B asserts it, with the reason spelled out: *"without this the
// surface goes on saying 'New caller' for the customer it has just created, and the operator taps
// Save again — a second permanent row for one human (`01-F1`)."* The wire is there and the
// renderer does not listen to it. So today the strip says the same three words before the tap,
// after a success and after a refusal, and **the operator cannot tell those three states apart.**
//
// ── THE SHAPE DECISION, AND WHY IT IS NOT `03-F5`'s BAND ────────────────────────────────────
//
// The precedent this product already carries is a pair, and the pair is a distinction rather
// than a menu. `CatalogHealth`'s own comment states it: *"`AlarmBand` clears on an attributed
// acknowledgement (`03-F5`: the alert repeats until acknowledged). That is right for an EVENT —
// a ticket that did not print already failed, once, in the past … A refused catalog is a STATE:
// it is true until the catalog un-sticks, and an `I SAW THIS` that took it off the screen would
// hide a condition that is still happening. `00 §5.7` forbids precisely that."*
//
// A refused `Save caller` is a **STATE**. What is true after the refusal is *this caller is not
// on file*, and it stays true until she is filed or the call ends. So the shape is
// `CatalogHealth`'s, not `AlarmBand`'s — and three further FRs make the band positively
// forbidden rather than merely unnecessary:
//
//   1. `27-F14` allocates red to a CLOSED list — *"ticket overdue, print failure, cash variance
//      past threshold, void & refund actions, revoked device"* — and adds *"a module needing a
//      distinction not on this table expresses it with shape, position or a number (`27-F12`),
//      never a fourth hue. Adding a colour requires an amendment here, not a local decision."*
//      A refused customer record is on neither the red list nor the amber one.
//   2. `21 §5`'s interrupt-priority law enumerates S1/S2/S3 by claimant and closes with *"No
//      module invents its own alarm behavior — new signal types are assigned a severity here."*
//      Assigning one is a spec change, not an implementation choice (commandment 2).
//   3. `03-F5`'s band is `27-F11g`'s ONLY signal that food is not being cooked. A second
//      claimant on it is how it stops being the loudest thing on the glass — the argument
//      `CatalogHealth` makes about the honesty strip, one surface over.
//
// **So: a WORD, in the position the strip already owns, announced and never interrupting.** The
// word is `27-F12`'s non-colour channel; `role="status"` and not `role="alert"` is the same
// choice `CatalogHealth`, `PanelHealth`, `ConnectionFacts` and `AgeBadge` all made, for
// `27-F11d`'s stated reason (*"the work underneath a cashier's hands stays usable"*). No
// acknowledgement control, because acknowledging a condition that is still true hides it.
//
// ── WHAT THIS FILE PINS, AND THE COST ───────────────────────────────────────────────────────
//
// §A and §C are mechanism-free: they compare what the operator can READ in three states and
// require the three to differ. §B is the shape decision above, and it is where the pins are —
// `role="status"` present, `role="alert"` and `role="dialog"` absent. Each carries its FR inline
// so a future session that wants a different shape argues with the FR rather than with a test.
// The `role="alert"` query is proved to WORK by a positive control (a real print alarm), because
// an absence assertion that cannot see a presence proves nothing.
//
// ── NOT IN SCOPE, DELIBERATELY ──────────────────────────────────────────────────────────────
//
// Nothing here asks for a refusal surface on the OTHER writes. `escalatableWrite` already owns
// `02-F20`'s refusals on the Cash surface and `write` is shared by `startOrder`, `sendToKitchen`
// and `addLine`; widening this to every append is a bigger design than `02-F27` licenses, and
// `24 §3b` says the minimum that closes the FR. If a later session generalises it, this file's
// claims should survive unchanged — they are about what the operator sees, not about which
// helper produced it.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alarm, AppendRequest, DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
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
const DIALLED = "03001234567";
const E164 = "+923001234567";
/** `26 §8`'s business key, minted by the WRITER — the renderer never sees or supplies one. */
const FILED_ADDRESS_ID = "addr-filed-1";

/** What `main` actually throws when the matrix says no — `authorize.ts` refuses, `ipcMain` */
/** serializes the error to its message, and the renderer receives a rejected promise. */
const REFUSAL = new Error("customer.record is not permitted for this role (02-F47)");

let appended: AppendRequest[];
let recorded: Record<string, unknown>[];
/** The `onChanged` subscriber, so the mock can push exactly as `main/index.ts` does. */
let notify: () => void;

const mount = (opts: { record?: "accept" | "refuse"; alarms?: readonly Alarm[] } = {}) => {
  appended = [];
  recorded = [];
  notify = () => {};
  /**
   * The FOLD, as the trusted side would hold it: unknown until a record succeeds, known after.
   *
   * This is what makes §C a real negative control rather than a second copy of §A. A harness
   * whose lookup answered `known: null` for ever could not tell a surface that reports success
   * from one that reports nothing, because both would keep saying "New caller".
   */
  /**
   * ⚠ `addresses` was `never[]` — always empty — until the mutation pass, and that is what made
   * §C's re-read claim unfalsifiable. The trusted side MINTS the `address_id` (`26 §8`), so a
   * saved address is a fact the renderer cannot invent; serving one is what lets a test tell a
   * surface that re-read the fold from one that echoed its own optimistic guess.
   */
  let filed: {
    name: string | null;
    addresses: { address_id: string; address_text: string }[];
  } | null = null;
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async (): Promise<OpenOrder[]> => []),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    alarms: vi.fn(async () => opts.alarms ?? []),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    toggleAvailability: vi.fn(async () => ({ id: "evt-86" })),
    lookupCustomer: vi.fn(async () => ({ phone_e164: E164, known: filed })),
    recordCustomer: vi.fn(async (req: Record<string, unknown>) => {
      recorded.push(req);
      if (opts.record === "refuse") throw REFUSAL;
      filed = {
        name: (req.name as string | null) ?? null,
        // What `gateway.recordCustomer` does with an address-carrying request: the text as sent,
        // under an id only the writer can mint. `02-F27`'s *"→ name, saved addresses"*.
        addresses:
          typeof req.address_text === "string"
            ? [{ address_id: FILED_ADDRESS_ID, address_text: req.address_text }]
            : [],
      };
      // Exactly what `main/index.ts` does after a successful record, and the reason
      // `phone-entry-host.test.ts` §B gives for it: *"the fold moved and the caller strip is
      // reading it."* Firing it here means an implementation may re-ask on this push OR on the
      // record's own resolution — this file decides neither.
      notify();
      return { id: `evt-cust-${recorded.length}` };
    }),
    onChanged: vi.fn((cb: () => void) => {
      notify = cb;
      return () => {};
    }),
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

const reachUnknownCaller = async () => {
  await screen.findByRole("button", { name: /^Phone$/i });
  tap(/^Phone$/i);
  await waitFor(() => enterNumber(DIALLED));
  await screen.findByRole("button", { name: /^Save caller$/i });
};

/**
 * Everything the surface is currently ANNOUNCING, as text.
 *
 * `role="status"` is the four-component idiom already in this tree — `CatalogHealth`,
 * `PanelHealth`, `ConnectionFacts` and `AgeBadge` all use it — so this reads what the product
 * already means by *"a standing condition the operator should notice"*.
 */
const announced = (): string =>
  screen
    .queryAllByRole("status")
    .map((el) => el.textContent ?? "")
    .join(" | ");

/** Everything on the glass. Used only where the claim is "these two states differ". */
const readable = (): string => document.body.textContent ?? "";

const saveCaller = async () => {
  tap(/^Save caller$/i);
  await waitFor(() => expect(recorded.length).toBeGreaterThan(0));
};

/**
 * Tap `Save caller`, then WAIT until the surface has actually announced something new.
 *
 * ⚠ **THIS HELPER IS THE FIX FOR A VACUOUS FIRST DRAFT, AND THE MEASUREMENT IS WORTH KEEPING.**
 * §B's three absence assertions — no band, no modal, no acknowledgement control — were first
 * written as `await saveCaller()` followed by the query, and **all three passed against the
 * unbuilt surface**, because with no refusal announced at all there is trivially no band to
 * find. That is this round's law verbatim: *the mechanism was built correctly and never aimed
 * at the case that matters.* Gating each one on the announcement having CHANGED is what points
 * them at it. The guard that failed to bite was `announced() !== ""` — the connection chips are
 * `role="status"` too, so the baseline was never empty.
 */
const saveAndAwaitAnnouncement = async () => {
  const before = announced();
  await saveCaller();
  await waitFor(() =>
    expect(
      announced(),
      "02-F27/00 §5.7 red-awaiting-implementation: the refusal announced nothing, so every " +
        "absence assertion below would pass without meaning anything",
    ).not.toBe(before),
  );
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `00 §5.7`: A REFUSED RECORD IS SAID OUT LOUD
//
// Mechanism-free. Every claim is about what a cashier can read, and none of them names an
// element, a role or a colour.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 00 §5.7/02-F27 — the till reports that the caller was NOT filed", () => {
  it("says something after a refusal that it did not say before", async () => {
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();

    const before = readable();
    await saveCaller();

    // The whole finding, as one assertion: today this passes only because `before === after`.
    await waitFor(() => expect(readable()).not.toBe(before));
  });

  it("does NOT flip into the state a SUCCESS produces (00 §5.7)", async () => {
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveCaller();

    // The refusal wrote nothing, so `02-F27`'s *"unknown number"* is still the true state and the
    // strip must still be in it. An implementation that optimistically flipped to "filed" and
    // then reported an error beside it would tell the operator two contradictory things.
    //
    // ⚠ **THE FIRST DRAFT OF THIS ASSERTION WAS `queryByText(/on file/i)` TO BE NULL, AND IT
    // FAILED AGAINST A CORRECT IMPLEMENTATION.** A refusal that says *"not on file"* — which is
    // the truest four words available — contains the phrase the assertion banned. That is `24 §3`
    // 's second corollary caught in the act: a test that reddens under a correct implementation
    // is as damaging as a vacuous one. The claim is re-anchored on the CONTROL, which is the same
    // anchor §C uses for the success side, so the two states are told apart by the same signal
    // rather than by two different string matches that can disagree.
    expect(screen.getByRole("button", { name: /^Save caller$/i })).toBeTruthy();
    // And she was not silently filed on the trusted side either: exactly one attempt was made.
    expect(recorded).toHaveLength(1);
  });

  it("leaves the act retryable — the control is still there and still works", async () => {
    // `27-F5`: every action has a *persistent* target. The remedy for "it did not save" is to
    // save it, and a refusal that removed or inerted the only control would leave the operator
    // with a caller she can never file — with `01-F1` making the eventual workaround permanent.
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveCaller();

    tap(/^Save caller$/i);
    await waitFor(() => expect(recorded).toHaveLength(2));
  });

  it("does not carry the refusal into the NEXT call", async () => {
    /**
     * ⚠ **ADDED BY THE MUTATION PASS — the refusal had no exit.** Every test in this file lives
     * inside one call, so deleting `setCallerRefused(false)` from `clearCaller` passed
     * **846/846** when measured 2026-08-12. `caller-details.dom.test.tsx` §E covers exactly this
     * hazard for the two capture FIELDS and cites `09-F10` for why a stale address is worse than
     * a stale number; the refusal flag arrived on the same strip, with the same two exits, and
     * was left out.
     *
     * What the operator would read: a caller she has not attempted to file, under a line saying
     * she failed to file her. That is `00 §5.7` inverted — the till reporting something that is
     * not true — and this file's own §C is the reason it matters, because the announcement is the
     * only signal separating a refusal from a success.
     *
     * Anchored on `announced()` and not on the sentence, for the reason recorded in §A: a
     * `queryByText` pin here has already reddened a correct implementation once. The claim is
     * that the strip goes back to ANNOUNCING WHAT IT ANNOUNCED before the tap — which is true
     * whatever words the refusal is eventually written in.
     */
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();
    const beforeAnyAttempt = announced();
    await saveAndAwaitAnnouncement();

    // `Counter.tsx`'s second exit: *"latching a different channel ends the call."*
    tap(/^Counter$/i);
    await reachUnknownCaller();
    expect(announced()).toBe(beforeAnyAttempt);
  });

  it("does not block the sale (01-F17)", async () => {
    // `02-F47` says it outright: *"A refused customer record never refuses a sale (`01-F17`).
    // `08-F2` has aggregator orders reach settlement writing no customer file at all, so a denied
    // verdict here costs a name and an address and nothing else."*
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveCaller();

    tap(/^Delivery$/i);
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.created");
    expect(appended[0]?.payload).toMatchObject({ channel: "phone", order_type: "delivery" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE SHAPE: A STATED CONDITION, NEVER AN S1 ALARM AND NEVER A MODAL
//
// The pins live here and nowhere else, so a session that wants to argue with the shape decision
// reddens exactly this section and reads the argument in the header.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 27-F14/21 §5/27-F11d — the refusal is announced, not alarmed", () => {
  it("announces it as a STATUS", async () => {
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();

    const before = announced();
    await saveCaller();
    await waitFor(() => expect(announced()).not.toBe(before));
  });

  it("raises no S1 band", async () => {
    // `27-F14`'s red claimants are enumerated and closed; `21 §5` forbids a module assigning its
    // own severity; `27-F11g` makes the band the only signal that food is not being cooked.
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveAndAwaitAnnouncement();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("PROVES that query can see a band, so the absence above means something", async () => {
    // The instrument check. An absence assertion whose query is broken passes for ever — this
    // round's own law (*"a mechanism built correctly and never aimed at the case that matters"*).
    // `03-F5`'s real alarm is raised through the shipped `alarms` read and must be found.
    mount({
      record: "refuse",
      alarms: [{ id: "al-1", message: "KOT #142 did not print", subject: "grill printer" }],
    });
    render(<Counter />);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());
  });

  it("interrupts nothing — no modal, no dialog", async () => {
    // `27-F11d`: *"An S1 alarm takes a BAND, never the screen … the work underneath stays
    // visible and usable. A half-built cart is never taken away from a cashier with a customer
    // waiting."* `02-F37` says the same of the anomaly it invents: *"Never a modal, never a
    // block."* This refusal is strictly less severe than either.
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveAndAwaitAnnouncement();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no acknowledgement control — the condition is still true", async () => {
    // `CatalogHealth`'s structural argument, applied: acknowledging a STATE takes a still-true
    // condition off the screen, which is exactly what `00 §5.7` forbids. The remedy on offer is
    // `Save caller`, which changes the fact; an `I SAW THIS` would only change the report of it.
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveAndAwaitAnnouncement();

    expect(
      screen.queryByRole("button", { name: /acknowledg|dismiss|i saw|got it|understood/i }),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE NEGATIVE CONTROL: A SUCCESS SAYS SOMETHING ELSE
//
// Without this section every assertion in §A and §B is satisfied by a surface that permanently
// says "not saved". With it, the three states — before the tap, after a refusal, after a success
// — must be three different things the operator can read.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 00 §5.7/01-F1 — a filed caller is reported as filed", () => {
  it("stops calling her a new caller once she is on file", async () => {
    mount({ record: "accept" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveCaller();

    // `phone-entry-host.test.ts` §B already asserts main pushes for this; the renderer has to
    // listen. Until it does, the surface goes on offering to file a customer it has just filed.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Save caller$/i })).toBeNull(),
    );
  });

  it("cannot file the same caller twice from one call (01-F1)", async () => {
    // The consequence, and the reason this is not cosmetic: `customer.created` is permanent and
    // uncorrectable in place, so a second tap is a second row for one human — caused by nothing
    // but the screen not updating.
    mount({ record: "accept" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveCaller();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Save caller$/i })).toBeNull(),
    );
    expect(recorded).toHaveLength(1);
  });

  it("shows the file it just created — the name she typed comes back", async () => {
    mount({ record: "accept" });
    render(<Counter />);
    await reachUnknownCaller();

    const nameBox = screen.queryAllByRole("textbox", { name: /name/i })[0];
    if (nameBox === undefined) {
      throw new Error(
        "02-F27 red-awaiting-implementation: no name field on the caller strip — see " +
          "caller-details.dom.test.tsx, which owns that claim.",
      );
    }
    fireEvent.change(nameBox, { target: { value: "Hina Raza" } });
    await saveCaller();

    // The strip's KNOWN branch already renders `caller.known.name`; what is new is that it is
    // reached at all after a record.
    //
    // ⚠ **THIS COMMENT CLAIMED ONE MORE THING THAN THE ASSERTION CARRIED, AND THE MUTATION PASS
    // DISPROVED IT (2026-08-12).** It read *"This also proves the surface re-READ the trusted side
    // rather than echoing its own optimistic guess — the harness only answers `known` after the
    // write."* It does not: the name the strip would echo IS the name she typed, so an
    // implementation replacing the re-ask with `setCaller({ ...c, known: { name, addresses: [] }})`
    // passed **846/846**. The claim is true of the test BELOW, which asks for a fact the renderer
    // cannot invent. Kept and corrected in place rather than deleted — a comment promising a
    // protection that does not exist retires the assertion someone would otherwise write.
    await waitFor(() => expect(screen.getByText(/Hina Raza/)).toBeTruthy());
  });

  it("shows the SAVED ADDRESS, which only the trusted side can have minted (26 §8)", async () => {
    /**
     * The re-read claim, made falsifiable. `02-F27`'s known branch is *"→ name, saved addresses"*,
     * and an `address_id` is minted by the WRITER (`26 §8`; asserted against a real store in
     * `main/__acceptance__/customer-address-producer.test.ts` §A) — so a surface answering from
     * its own optimistic guess has `addresses: []` and can never render this row, however
     * confidently it reports the name.
     *
     * `00 §5.7` is the FR: the till reports what is TRUE, which is what the fold holds, not what
     * the screen hoped for. `01-F1` is the cost of getting it wrong in the other direction — a
     * strip that says *filed* about a write that did not land invites the second tap this section
     * exists to prevent.
     */
    mount({ record: "accept" });
    render(<Counter />);
    await reachUnknownCaller();

    const addressBox = screen.queryAllByRole("textbox", { name: /address/i })[0];
    if (addressBox === undefined) {
      throw new Error(
        "02-F27 red-awaiting-implementation: no address field on the caller strip — see " +
          "caller-details.dom.test.tsx, which owns that claim.",
      );
    }
    const ADDRESS = "House 12, Block C, Gulberg III, Lahore";
    fireEvent.change(addressBox, { target: { value: ADDRESS } });
    await saveCaller();

    await waitFor(() => expect(screen.getByText(ADDRESS)).toBeTruthy());
  });

  it("reads DIFFERENTLY after a refusal than after a success", async () => {
    // The three-way distinction stated as one assertion. An implementation that reported the
    // same thing either way — the state this file exists to end — fails here even if it passes
    // every other test in this file.
    mount({ record: "refuse" });
    render(<Counter />);
    await reachUnknownCaller();
    const beforeTap = readable();
    await saveCaller();
    await waitFor(() => expect(readable()).not.toBe(beforeTap));
    const afterRefusal = readable();

    cleanup();
    mount({ record: "accept" });
    render(<Counter />);
    await reachUnknownCaller();
    await saveCaller();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Save caller$/i })).toBeNull(),
    );
    const afterSuccess = readable();

    expect(afterSuccess).not.toBe(afterRefusal);
    expect(afterSuccess).not.toBe(beforeTap);
  });
});
