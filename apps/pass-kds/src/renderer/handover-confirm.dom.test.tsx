// ACCEPTANCE TESTS — `03-F52` ON THE SCREEN: the second control, and the confirm that names the
// order reference.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author wrote no production code for
// `03-F52`. The contract shared with the rest of the suite is written out in
// `../main/__acceptance__/handover.test.ts`; the only thing added here is
// `PassSurfaceProps.onHandOver: ((order_id: string) => void) | null`, the exact sibling of
// `onBump`.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE FR, quoted:
//
//   03-F52  "the act is an explicit HANDOVER, never a widening of the ready-mark … **The act is
//           separate from the ready-mark, and that separation is the FR.** One press of DONE emits
//           `ready` and only `ready`."
//
//   03-F52  "**The handover press carries a confirm naming the order reference; the ready-mark does
//           not.** This is the one control in the kitchen whose mis-tap cannot be taken back —
//           `served` is terminal, and `03-F17`'s recall strip restores VISIBILITY, never STATE. The
//           confirm is not friction bolted on for safety: at counter service the pass person calls
//           the number aloud, so reading the reference off the confirm IS the call. **Naming the
//           reference is required** — a bare *'Are you sure?'* is the tap people learn to dismiss."
//
//   27-F5   no inert primary controls — a surface without the assignment renders no control at all,
//           which is how `03-F24`'s *"others render read-only"* is already discharged for `onBump`.
//   01-F17  nothing is blocked: backing out of a confirm leaves the kitchen exactly as it was.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ **HOW THIS FILE AVOIDS PINNING SHAPE, because the round-3 law cuts both ways here.** Wording,
// component choice and layout are the implementer's. So nothing below matches a label, a test id,
// a class or a component name for the confirm itself. It works by DIFFING the button set: press the
// trigger, take the controls that appeared, and drive each one from a FRESH render to see which
// commits. That measures the property the FR states — *there is a confirming step, exactly one of
// its controls hands over, and at least one lets you out* — and stays green under any labelling.
//
// ⚠ **WHAT IT CANNOT SEE, stated so a clean run is not read as coverage.** happy-dom performs no
// layout: every `getBoundingClientRect` is zeroes. This file can say *"the confirm is in the
// document"* and never *"the confirm is on the screen"* — which is `AGENTS.md`'s SECOND recurring
// defect, nine instances, zero of them found by a suite. A confirm that renders below the viewport
// on the 10.1″ panel would pass every row here. That claim belongs to
// `pnpm -C apps/pass-kds layout:check`, whose FIXTURE is its real coverage boundary — so the gate's
// fixture must be made to OPEN this confirm, or the gate is blind to it exactly as it was blind to
// `ManagerApproval`'s dead controls until `escalationFor` returned an offer.

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassTicketWire } from "../shared/ipc";
import { PassSurface } from "./PassSurface";

const BIG_PANEL = { width: 2000, height: 2000 } as DOMRectReadOnly;

class StubResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: BIG_PANEL } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const DINE_IN_ORDER = "0199cccc-0000-7000-8000-00000000abcd";
const DELIVERY_ORDER = "0199cccc-0000-7000-8000-00000000ef01";
/** `pass-queue.ts`'s `referenceOf` — the first eight characters of the order id. */
const DINE_IN_REF = DINE_IN_ORDER.slice(0, 8);
const DELIVERY_REF = DELIVERY_ORDER.slice(0, 8);

const ticket = (over: Partial<PassTicketWire> & { order_id: string }): PassTicketWire => ({
  reference: over.order_id.slice(0, 8),
  channel: "counter",
  order_type: "dine_in",
  tables: [],
  table_conflict: false,
  confirm_at: 1_754_300_000_000,
  minutes: 4,
  amberAt: 10,
  redAt: 20,
  lines: [{ line_id: "L0", name: "Karahi", quantity: 1, state: "ready", done: true }],
  linesDone: 1,
  linesTotal: 1,
  bumpable: false,
  handoverable: true,
  ...over,
});

/** One handed-over-able dine-in ticket and one delivery ticket that must draw no control. */
const TICKETS: readonly PassTicketWire[] = [
  ticket({ order_id: DINE_IN_ORDER }),
  ticket({
    order_id: DELIVERY_ORDER,
    order_type: "delivery",
    // Every line ready and still not handed over — `03-F52`'s delivery rule, on the glass.
    handoverable: false,
  }),
];

const buttons = (): HTMLButtonElement[] => [...document.querySelectorAll("button")];
const named = (re: RegExp): HTMLButtonElement[] =>
  buttons().filter((b) => re.test(b.textContent ?? ""));

/** Leaf elements whose text carries `ref` — the instrument for *"the confirm NAMES it"*. */
const leavesNaming = (ref: string): Element[] =>
  [...document.querySelectorAll("*")].filter(
    (el) => el.children.length === 0 && (el.textContent ?? "").includes(ref),
  );

const HANDOVER = /hand\s*over/i;

const mount = (props?: {
  onHandOver?: ((order_id: string) => void) | null;
  onBump?: ((order_id: string) => void) | null;
  tickets?: readonly PassTicketWire[];
}) => {
  const onHandOver = vi.fn();
  const onBump = vi.fn();
  render(
    <PassSurface
      tickets={props?.tickets ?? TICKETS}
      onBump={props?.onBump === undefined ? onBump : props.onBump}
      onHandOver={props?.onHandOver === undefined ? onHandOver : props.onHandOver}
      readySignalOwner="pass"
    />,
  );
  return { onHandOver, onBump };
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — TWO CONTROLS, NOT ONE. The separation is the FR.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F52 — the handover is a SECOND control", () => {
  it("a handed-over-able ticket draws BOTH a ready-mark control and a handover control", () => {
    // The implementation this row exists to fail is the one that closes `03-F17` by making DONE
    // emit `served` — cheaper, invisible to every main-side suite that only reads the ledger, and
    // the FR's rejected option (b). Here it shows up as a screen with one control where the FR
    // requires two.
    mount({ tickets: [ticket({ order_id: DINE_IN_ORDER, bumpable: true, handoverable: true })] });
    expect(named(/^\s*DONE\s*$/).length).toBe(1);
    expect(named(HANDOVER).length).toBe(1);
    // …and they are DIFFERENT elements, not one control matched twice.
    expect(named(/^\s*DONE\s*$/)[0]).not.toBe(named(HANDOVER)[0]);
  });

  it("27-F5 — no handover control where the assignment is elsewhere", () => {
    // `03-F52`: *"Surfaces without the assignment are read-only for `served`."* `null` renders no
    // control at all rather than a disabled one — the shape `onBump` already ships and `TicketCard`
    // argues for at length: *"a cook who presses a grey DONE twice and gets nothing learns to
    // distrust the screen."*
    mount({ onHandOver: null });
    expect(named(HANDOVER)).toHaveLength(0);
  });

  it("27-F5 — and none on a ticket the emitter would refuse", () => {
    // Both tickets are on the screen and the assignment is `pass`; only the eligible one carries
    // the control. Without this row a surface that drew the control on every card would pass §B
    // and hand a delivery ticket to a confirm that can only ever refuse. §B's second row is what
    // says the one control that IS drawn belongs to the dine-in ticket.
    mount();
    expect(named(HANDOVER)).toHaveLength(1);
    // …and it is not that the delivery ticket failed to render at all.
    expect(leavesNaming(DELIVERY_REF).length).toBeGreaterThan(0);
  });

  it("the ready-mark carries NO confirm — *'the ready-mark does not'*", () => {
    // Half of the FR's sentence, and the half a session adding a confirm component is most likely
    // to over-apply. A DONE behind a confirm costs a bump per ticket on a wet-hands surface, and
    // `03-F19`'s undo window already covers the mis-tap it would be guarding.
    const { onBump } = mount({
      tickets: [ticket({ order_id: DINE_IN_ORDER, bumpable: true, handoverable: false })],
    });
    fireEvent.click(named(/^\s*DONE\s*$/)[0] as HTMLButtonElement);
    expect(onBump).toHaveBeenCalledTimes(1);
    expect(onBump).toHaveBeenCalledWith(DINE_IN_ORDER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE CONFIRM. It exists, it NAMES the reference, and it can be left.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F52 — the confirm names the order reference", () => {
  /** Press the trigger and return the controls that appeared because of it. */
  const openConfirm = () => {
    const before = new Set(buttons());
    const trigger = named(HANDOVER)[0];
    expect(trigger).toBeDefined();
    fireEvent.click(trigger as HTMLButtonElement);
    return buttons().filter((b) => !before.has(b));
  };

  it("one press does NOT hand over — a confirming step appears first", () => {
    // ⚠ THE ROW THAT SEPARATES A CONFIRM FROM A LABEL. An implementation that renders the words
    // "hand over 0199cccc" on the button itself and fires on the first tap satisfies every reading
    // of *"naming the reference"* and none of *"carries a confirm"*. This is the assertion that
    // tells them apart, and it is why the trigger's own label is never matched for.
    const { onHandOver } = mount();
    const appeared = openConfirm();
    expect(onHandOver).not.toHaveBeenCalled();
    expect(appeared.length).toBeGreaterThan(0);
  });

  it("the confirming step NAMES this ticket's reference, and not the other one's", () => {
    // > **Naming the reference is required** — a bare *"Are you sure?"* is the tap people learn to
    // > dismiss … at counter service the pass person calls the number aloud, so reading the
    // > reference off the confirm IS the call.
    //
    // Measured as *elements that did not exist before the press and carry the reference*, so it
    // holds whether the confirm is an overlay that replaces the grid or a panel inside the card,
    // and so the card's own reference — which was always on the screen — cannot satisfy it.
    mount();
    const before = new Set(leavesNaming(DINE_IN_REF));
    const otherBefore = leavesNaming(DELIVERY_REF).length;
    openConfirm();
    const added = leavesNaming(DINE_IN_REF).filter((el) => !before.has(el));
    expect(added.length).toBeGreaterThan(0);
    // The confirm is about the ticket that was pressed. A confirm that named the wrong order would
    // make the pass person call the wrong number aloud, which is worse than naming none.
    expect(leavesNaming(DELIVERY_REF).length).toBe(otherBefore);
  });

  it("EXACTLY ONE of the confirm's controls hands over, and at least one does not", () => {
    // ⚠ THE ASSERTION THAT MATTERS, and it is driven rather than matched: each control the confirm
    // added is pressed from a FRESH render, so nothing here depends on what any of them is called.
    //
    // *"Exactly one commits"* is the FR's terminal act having one door. *"At least one does not"* is
    // `01-F17` and `27-F5`: `served` cannot be taken back (`03-F17`'s recall strip *"restores
    // VISIBILITY, never STATE"*), so a confirm a wet hand cannot back out of is a worse control
    // than no confirm at all, on the surface where `27-F9`'s 21.34% mis-tap rate was measured.
    const first = mount();
    const count = openConfirm().length;
    cleanup();

    const committed: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const run = mount();
      const appeared = openConfirm();
      fireEvent.click(appeared[i] as HTMLButtonElement);
      if (run.onHandOver.mock.calls.length > 0) {
        committed.push(i);
        expect(run.onHandOver).toHaveBeenCalledTimes(1);
        expect(run.onHandOver).toHaveBeenCalledWith(DINE_IN_ORDER);
      }
      cleanup();
    }
    expect(committed).toHaveLength(1);
    expect(count).toBeGreaterThan(1);
    // Not vacuous — the very first mount really did have a trigger to press.
    expect(first.onHandOver).not.toHaveBeenCalled();
  });

  it("01-F17 — leaving the confirm leaves the kitchen exactly as it was", () => {
    // After backing out, the surface is usable again: the trigger is on the glass and the ticket
    // is still there to press. A confirm that stayed up, or that consumed the control on its way
    // out, would take the ticket off the pass visually without taking it off the pass in the
    // ledger — `00 §5.7`'s failure, one screen over.
    mount();
    const count = openConfirm().length;
    cleanup();

    let dismissals = 0;
    for (let i = 0; i < count; i += 1) {
      const run = mount();
      const appeared = openConfirm();
      fireEvent.click(appeared[i] as HTMLButtonElement);
      if (run.onHandOver.mock.calls.length === 0) {
        dismissals += 1;
        expect(named(HANDOVER).length).toBeGreaterThan(0);
      }
      cleanup();
    }
    expect(dismissals).toBeGreaterThan(0);
  });
});
