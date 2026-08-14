// ACCEPTANCE TESTS — `03-F56` ON THE GLASS: the note is on the cook's ticket, on the right dish,
// in the right place, and it is NOT a modifier.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The session that wrote this file wrote no
// production code for `03-F56` and edited nothing outside these tests. The wire half — that the
// projection reads the note the kernel stores, and that the schema does not strip it at the plane
// boundary — is `../main/__acceptance__/item-note.test.ts`. **Neither file alone is evidence:** a
// wire that carries a note nobody draws is decorative, and a renderer fed a hand-built fixture is
// not a product.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE FRs, quoted so an assertion can be argued with:
//
//   03-F56  "**`27-F55`'s cheap-glass twin binds too.** `packages/ui`'s `QuantityItemLine` serves
//           glass and paper from one arrangement, and it already renders a note by weight and
//           position for this FR's reason. **The two must not diverge.**"
//   03-F56  "**A note is NOT a modifier** and must not be routed through `KotLine.modifiers`. They
//           arrive from different events … `27-F59` gives a *removal* modifier the item block's one
//           inverted marker. Feeding a note in as a modifier would either steal that marker from a
//           removal — the allergen case `27-F59` exists for — or make a note's emphasis depend on
//           whether the dish happens to have a removal."
//   03-F56  "**The reading order applies WITHIN the item block: item → modifiers → note.** … So the
//           note is the last row of its own item block, indented like a modifier."
//   03-F56  "**NO third inversion** … `27-F58`'s answer is the one the document actually has:
//           **vertical position encodes urgency; whitespace encodes grouping.**"
//   03-F3   "item notes visually emphasized"
//   27-F55  "**the KOT must therefore carry LESS information than a pass-screen ticket**, not the
//           same information in a narrower column." — a note that prints and does not display is
//           this sentence inverted.
//   27-F57  the mapping step is where comprehension collapses (readers who *decode* a line at ~71%
//           *execute* it correctly at ~35%), so a note separated from its dish is worse than none.
//   02-F50  "**One tag is one `order.note_added`, and tags ACCUMULATE.**"
//   00 §5.7 a dish with nothing to say says nothing — no blank emphasised row.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ THE FIXTURE IS TWO DISHES, AND THAT IS THE ROUND-3 LAW APPLIED RATHER THAN CITED. `K-4` varied
// `spec` and `profile` across ~90 renders and **never varied `data`**, so an implementation
// ignoring `data` entirely passed 38 tests. A one-line ticket here is the same defect: it cannot
// distinguish *"the note is on the ticket"* from *"the note is on the right dish"*, and `27-F57`
// says the second is the whole point. Every row below renders **one noted dish and one plain
// dish** and asks which block the note landed in.
//
// ⚠ WHAT THIS FILE CANNOT SEE, stated so a clean run is not read as coverage. happy-dom performs
// **NO LAYOUT** — every `getBoundingClientRect` is zeroes — so nothing here says *"the note is on
// the screen"*, only *"the note is in the document"*. That is `AGENTS.md`'s SECOND recurring
// defect: nine layout defects, zero found by a suite. A note row lengthens every ticket, and
// `27-F28` costs a ticket in millimetres — so a noted ticket can push the last row of a page off
// the glass and every row here stays green. **That claim belongs to
// `pnpm -C apps/pass-kds layout:check`, whose FIXTURE is its real coverage boundary: unless the
// gate's tickets carry notes, the gate is blind to it exactly as it was blind to `ManagerApproval`'s
// dead controls until `escalationFor` returned an offer.** Owed, and named here rather than left
// to look intentional.

import { cleanup, render } from "@testing-library/react";
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

const ORDER = "0199cccc-0000-7000-8000-00000000abcd";

const NOTED_DISH = "KARAHI";
const PLAIN_DISH = "NAAN";
const NO_PEANUTS = "NO PEANUTS";
const EXTRA_SPICY = "EXTRA SPICY";

/**
 * A wire line, with the note declared as an INTERSECTION rather than assumed onto `PassLineWire`.
 *
 * `03-F56` is unimplemented as this file is written, so `PassLineSchema` has no `note` yet and a
 * plain object literal would be an excess-property error. The intersection lets this file compile
 * today and stay correct after the field lands — and it deliberately does not decide between
 * `note?: string` and `note: string | null`, which `03-F56` does not rule on either.
 *
 * The field NAME is not a free choice: `KotLine.note`, `OpenOrder.lines[].note` and
 * `QuantityItemLineProps.note` are three shipped declarations of one fact, and `03-F56`'s
 * *"the two must not diverge"* is about exactly that.
 */
type NotedLineWire = PassTicketWire["lines"][number] & { note?: string };

const line = (name: string, quantity: number, note?: string): NotedLineWire => ({
  line_id: `L-${name}`,
  name,
  quantity,
  state: "confirmed",
  done: false,
  ...(note === undefined ? {} : { note }),
});

/** One dine-in ticket: a dish WITH a note and a dish WITHOUT one. Both halves are load-bearing. */
const ticketWith = (note: string | undefined): PassTicketWire =>
  ({
    order_id: ORDER,
    reference: ORDER.slice(0, 8),
    channel: "counter",
    order_type: "dine_in",
    tables: [],
    table_conflict: false,
    confirm_at: 1_754_300_000_000,
    minutes: 4,
    amberAt: 10,
    redAt: 20,
    lines: [line(NOTED_DISH, 1, note), line(PLAIN_DISH, 2)],
    linesDone: 0,
    linesTotal: 2,
    bumpable: true,
    handoverable: false,
  }) as PassTicketWire;

const mount = (note: string | undefined): void => {
  render(
    <PassSurface
      tickets={[ticketWith(note)]}
      onBump={vi.fn()}
      onHandOver={null}
      readySignalOwner="pass"
    />,
  );
};

const squash = (text: string | null): string => (text ?? "").replace(/\s+/g, " ").trim();

/** Every leaf element (no children) whose own text is exactly `text`. */
const leavesReading = (text: string): Element[] =>
  [...document.querySelectorAll("*")].filter(
    (el) => el.children.length === 0 && squash(el.textContent) === text,
  );

/**
 * **The ITEM BLOCK for one dish — the region `03-F56` and `27-F59` both talk about.**
 *
 * Found structurally rather than by component name or test id, so it survives any arrangement an
 * implementer chooses: start at the leaf that reads the dish's name, and walk up for as long as the
 * ancestor is still about THIS dish and no other. The last such ancestor is *"the largest region of
 * the document that is about this dish alone"*, which is what an item block is.
 *
 * The two-dish fixture is what makes this well-defined; with one dish the walk would run to `<body>`
 * and every assertion below would be about the whole screen instead of about one item block.
 */
const itemBlock = (dish: string, otherDish: string): Element => {
  const [nameEl] = leavesReading(dish);
  if (nameEl === undefined) {
    throw new Error(`fixture: no leaf reads ${dish} — the ticket did not render its lines`);
  }
  let block: Element = nameEl;
  while (
    block.parentElement !== null &&
    !squash(block.parentElement.textContent).includes(otherDish)
  ) {
    block = block.parentElement;
  }
  return block;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE NOTE IS ON THE GLASS, ON THE RIGHT DISH.
//
// The defect this section exists to fail is the one in the tree the day it was written:
// `PassSurface` maps `t.lines` to `{ id, quantity, name }` and drops everything else, so a note
// that survived the kernel, the projection and the wire is thrown away one line from the cook.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F56 — the note reaches the cook's ticket", () => {
  it("03-F56/27-F55 — a line whose wire carries a note DISPLAYS it", () => {
    mount(NO_PEANUTS);
    expect(
      squash(document.body.textContent),
      "03-F56 — the note is captured on the till, stored in the ledger, carried across the plane, " +
        "and shown to nobody. `27-F55`: the KOT must carry LESS than a pass-screen ticket, not more",
    ).toContain(NO_PEANUTS);
  });

  it("03-F56/27-F57 — the note is inside ITS dish's item block and not the other dish's", () => {
    // The implementation this row exists to fail is the one that renders the note once per ticket —
    // at the head of the card, or under the last line — which looks right in a screenshot of a
    // one-line order and is wrong on every real one. `27-F57` measures the cost: the mapping step
    // is where execution collapses from ~71% to ~35%, and a note under the wrong dish is a mapping
    // failure the cook cannot detect.
    mount(NO_PEANUTS);
    expect(
      squash(itemBlock(NOTED_DISH, PLAIN_DISH).textContent),
      "03-F56 — the note is not in the KARAHI block; it is somewhere else on the card",
    ).toContain(NO_PEANUTS);
    expect(
      squash(itemBlock(PLAIN_DISH, NOTED_DISH).textContent),
      "27-F57 — the NAAN carries a note that belongs to the karahi",
    ).not.toContain(NO_PEANUTS);
  });

  it("00 §5.7 — a dish with nothing to say draws nothing extra", () => {
    // The control, and it is what stops every row above passing against an implementation that
    // renders a constant. The plain dish's whole block is its quantity and its name.
    mount(NO_PEANUTS);
    expect(
      squash(itemBlock(PLAIN_DISH, NOTED_DISH).textContent).replace(/\s+/g, ""),
      "00 §5.7 — the naan drew a row it has nothing to put in",
    ).toBe(`2${PLAIN_DISH}`);
  });

  it("03-F56 — and the CONTROL: with no note on the wire, no note is on the glass", () => {
    // Without this row an implementation that hardcoded a string would satisfy §A entirely.
    mount(undefined);
    const body = squash(document.body.textContent);
    expect(body, "03-F56 — a note appeared for a line that has none").not.toContain(NO_PEANUTS);
    expect(
      squash(itemBlock(NOTED_DISH, PLAIN_DISH).textContent).replace(/\s+/g, ""),
      "00 §5.7 — an empty emphasised row is a zero on a clock",
    ).toBe(`1${NOTED_DISH}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — A NOTE IS NOT A MODIFIER, AND IT IS NOT A REMOVAL. `03-F56` RULES ON BOTH BY NAME.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F56 — the note is its own row, in its own slot", () => {
  it("03-F56/27-F57 — a row of its OWN, never appended to the item name", () => {
    // The cheapest wrong implementation available: one string concatenation, either in the
    // projection or in this file's `lines.map`. It passes §A's first row, because the note text is
    // then genuinely on the screen — inside the name. `27-F57` forbids it: the quantity must sit
    // immediately left of the item name on the same line, and `1 KARAHI (NO PEANUTS)` is a name
    // that wraps, which `27-F59` bans for destroying the vertical alignment the layout depends on.
    mount(NO_PEANUTS);
    expect(
      leavesReading(NOTED_DISH),
      "27-F57 — the note was folded into the item name; the dish no longer reads as one word",
    ).toHaveLength(1);
    expect(
      leavesReading(NO_PEANUTS),
      "03-F56 — the note is not a row of its own. It is `the last row of its own item block`",
    ).toHaveLength(1);
  });

  it("03-F56/03-F3 — the note carries the note slot's EMPHASIS, not the modifier slot's", () => {
    // ⚠ THE ROW THAT AIMS AT `03-F56`'s OWN RULING. *"A note is NOT a modifier and must not be
    // routed through `KotLine.modifiers`."* On this surface the smuggle is one character —
    // `modifiers: [l.note]` instead of `note: l.note` — and it puts the text on the glass, in the
    // right block, in the right order. Every other row in this file passes against it.
    //
    // What separates the two is what `03-F56` says the emphasis IS: *"`QuantityItemLine` … already
    // renders a note by weight and position for this FR's reason. The two must not diverge."*
    // `03-F3` requires notes *"visually emphasized"*, and `packages/ui` spends that on WEIGHT
    // (`fontWeight: 600`) — while a modifier is rendered muted and unweighted, because a modifier
    // is not urgent.
    //
    // So the assertion is: the note row is emphasised. The way to satisfy it is to pass the note
    // through `QuantityItemLine`'s `note` prop, which is `03-F56`'s cheap-glass twin clause said in
    // code. It is NOT satisfied by the modifier slot, and that is the whole point of the row.
    mount(NO_PEANUTS);
    const [noteEl] = leavesReading(NO_PEANUTS);
    const weight = Number.parseInt(
      (noteEl as HTMLElement | undefined)?.style.fontWeight ?? "0",
      10,
    );
    expect(
      Number.isNaN(weight) ? 0 : weight,
      "03-F56/03-F3 — the note is rendered unemphasised. If it is going through `modifiers`, that " +
        "is the routing `03-F56` forbids by name: it steals `27-F59`'s inverted marker from a " +
        "removal, or makes a note's emphasis depend on whether the dish happens to have one. " +
        "Pass it through `QuantityItemLine`'s `note` prop",
    ).toBeGreaterThanOrEqual(600);
  });

  it("03-F56/27-F56 — and it takes NO inversion: it is not dressed as a removal", () => {
    // *"NO third inversion, and no 2×2 … a note has no ink level available, and taking one would be
    // the third claimant on a budget whose own rule is that a ticket that uses inversion twice has
    // used it zero times."* `27-F59` reserves the item block's one inverted marker for a REMOVAL,
    // and `packages/ui` renders a removal as `✕ NO <thing>`. A note routed through `removals` would
    // read `✕ NO NO PEANUTS` — which is both an inversion it may not have and a sentence that means
    // the opposite of the instruction.
    mount(NO_PEANUTS);
    const block = squash(itemBlock(NOTED_DISH, PLAIN_DISH).textContent);
    expect(
      block,
      "03-F56/27-F59 — the note was routed through `removals`; it now wears the one inverted " +
        "marker the allergen case is reserved for, and it reads as a removal of itself",
    ).not.toContain(`NO ${NO_PEANUTS}`);
    expect(block).toContain(NO_PEANUTS);
  });

  it("27-F58/03-F56 — the note is the LAST row of its block, below the item", () => {
    // *"The reading order applies WITHIN the item block: item → modifiers → note."* `27-F58` fixes
    // it and calls it never configurable: *"A cook who reads nothing must still be able to point at
    // the top line and be understood by someone who can."* A note rendered ABOVE its dish takes that
    // top line away from the dish.
    mount(NO_PEANUTS);
    const [nameEl] = leavesReading(NOTED_DISH);
    const [noteEl] = leavesReading(NO_PEANUTS);
    expect(nameEl).toBeDefined();
    expect(noteEl).toBeDefined();
    expect(
      // The DOM's own ordering API is a bitmask; `FOLLOWING` is set iff the note comes after.
      (nameEl as Element).compareDocumentPosition(noteEl as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      "27-F58 — the note is rendered above its own dish; the reading order is item → note",
    ).toBeGreaterThan(0);
  });

  it("02-F50 — a line with two quick-tags shows BOTH, whole", () => {
    // `02-F50`: *"One tag is one `order.note_added`, and tags ACCUMULATE. A pick list whose second
    // tap erased the first would be a control that silently discards an instruction."* The wire
    // carries the accumulated notes as one row (`03-F56`: `KotLine.note` is ONE row of its item
    // block, and `QuantityItemLine` renders one). A renderer that split on the separator and drew
    // only the first — or truncated to fit a card — discards *"no peanuts"* half the time.
    //
    // `03-F56` again: *"No length cap and no truncation."*
    mount(`${EXTRA_SPICY} / ${NO_PEANUTS}`);
    const block = squash(itemBlock(NOTED_DISH, PLAIN_DISH).textContent);
    expect(block, "02-F50 — the second tag was dropped").toContain(NO_PEANUTS);
    expect(block, "02-F50 — the first tag was dropped").toContain(EXTRA_SPICY);
    expect(block, "03-F56 — the note was truncated; no FR states a maximum").not.toContain("…");
  });
});
