// ACCEPTANCE TESTS — `03-F56`: THE ITEM NOTE REACHES THE KITCHEN, ON THE ROUTE THE KITCHEN HAS.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The session that wrote this file wrote no
// production code for `03-F56` and edited nothing outside these tests. Every symbol named below
// was read out of shipping source to get the call shapes right; no behaviour was implemented.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   03-F56  "**The item note reaches the chit** … `03-F3` has required *'item notes visually
//           emphasized'* since Wave 0 and `03 §1` lists `order.note_added` among this module's
//           consumed events — but `03-F31`'s data contract declares no note field at all, so
//           `02-F6`'s *'printed prominently on the KOT'* was **unrenderable rather than merely
//           unrendered**."
//   03-F56  "**`27-F55`'s cheap-glass twin binds too.** `packages/ui`'s `QuantityItemLine` serves
//           glass and paper from one arrangement, and it already renders a note by weight and
//           position for this FR's reason. **The two must not diverge** — `03-F40`'s two sensor bit
//           layouts is this corpus's own worked example of what one fact with two readings costs."
//   03-F56  "**A note is NOT a modifier and must not be routed through `KotLine.modifiers`.**"
//   03-F56  "The kernel must not truncate either: a ledger and a projection that disagree about the
//           same event is `catalog-fetch.ts`'s dropped-field defect moved into `packages/domain`."
//   27-F55  "**the KOT must therefore carry LESS information than a pass-screen ticket**, not the
//           same information in a narrower column."
//   02-F6   "Item notes to kitchen: free text + org-configurable quick-tags ('less spicy') →
//           `order.note_added`, printed prominently on the KOT (doc 03)."
//   02-F50  "**One tag is one `order.note_added`, and tags ACCUMULATE.** A pick list whose second
//           tap erased the first would be a control that silently discards an instruction."
//   27-F57  the mapping step is where comprehension collapses (~71% decode → ~35% execute), so a
//           note must never be separated from — or attached to the wrong — dish.
//   03-F13  the pass card's contents, and `27-F11e`/`27-F11g`: **paper is optional glass**, so on a
//           branch with no printer transport this screen is the ONLY kitchen route.
//   00 §5.7 a line with nothing to say says nothing; an invented blank row is a zero on a clock.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ WHY THE TWO SECTIONS ARE BOTH NEEDED — this is `AGENTS.md`'s named recurring defect, and the
// dropped-field half of it has already shipped here once (`catalog-fetch.ts`'s `toEntry` dropped
// `prices` and `station` while the gateway served them, the wire carried them and the store read
// them — **0 of 579 tests failed**).
//
//   §A asks whether the PROJECTION reads the note the kernel already stores. An implementation that
//     declares `note` on the wire schema and never populates it passes every type check and every
//     schema parse, and shows the cook nothing. §A drives a REAL `openStore` and the REAL merge
//     engine, so the note under test is one the kernel actually wrote, not one this file invented.
//
//   §B asks whether the WIRE carries it across the plane. `main/index.ts:426` is
//     `.map((t) => PassTicketSchema.parse(t))`, and `z.object` **strips undeclared keys** — so a
//     populated projection whose schema was not extended is deleted, silently, at one line, with
//     every suite green. §B parses the REAL projection through the REAL schema, exactly as the host
//     composes them.
//
// The RENDERER half — that the note is on the glass and attached to its own dish — is
// `../../renderer/item-note.dom.test.tsx`. Neither file alone is evidence: a wire that carries a
// note nobody draws is decorative, and a renderer fed a fixture is not a product.
//
// ⚠ WHAT NO ROW HERE ASSERTS, stated so a clean run is not read as coverage:
//   - **Modifiers.** `03-F3` names them and the read models carry NO modifier detail yet (`02-F3`'s
//     line composition is unbuilt; `gateway.ts` and `printing.ts` both ship `modifiers: []` and say
//     so). Asserting modifiers reach the pass would be a test a correct implementation cannot pass,
//     which this repo has already paid for three times in one round. What IS asserted is `03-F56`'s
//     actual ruling — that the note is not smuggled through the modifier slot — and that assertion
//     lives in the renderer file, where the two slots are distinguishable.
//   - **A length cap.** `03-F56`: *"No length cap and no truncation … capping here would be
//     inventing one (commandment 2)."* So there is no maximum-note row, on purpose.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAging } from "@restos/device-config";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { PassTicketSchema } from "../../shared/ipc";
import { type PassLine, type PassTicket, passQueue } from "../pass-queue";

const ORG = "0199aaaa-0000-7000-8000-000000000001";
const BRANCH = "0199aaaa-0000-7000-8000-000000000002";
const DEVICE = "0199aaaa-0000-7000-8000-000000000003";

const dirs: string[] = [];
const freshStore = (): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "pass-item-note-"));
  dirs.push(dir);
  return openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
  });
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
const uuid = (): string => `0199bbbb-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

/**
 * The note as this file reads it off a projected line, WITHOUT pinning the field's declared type.
 *
 * `note?: string` (the shape `KotLine` uses) and `note: string | null` (the shape
 * `OpenOrder.lines[].note` uses) are both defensible and `03-F56` rules on neither, so a row that
 * demanded one would be pinning an implementer's choice rather than the FR. **The NAME is pinned**
 * and is not a free choice: `KotLine.note`, `OpenOrder.lines[].note` and
 * `QuantityItemLineProps.note` are three shipped declarations of the same fact and a fourth
 * spelling would be a fourth vocabulary for one field (`03-F56`'s *"the two must not diverge"*).
 *
 * The cast is what lets this file compile against today's `PassLine` and fail as an ASSERTION
 * rather than as a type error — a crisper signal for the implementer, and the same reason
 * `pass-seam.test.ts` reads source strings rather than importing a module it cannot load.
 */
const noteOf = (line: PassLine): string => (line as PassLine & { note?: string | null }).note ?? "";

const NAMES: Record<string, string> = {
  "item-karahi": "KARAHI",
  "item-naan": "NAAN",
};
/** `03-F38`'s resolver, narrowed; `01-F54` — an unknown item degrades to its identifier. */
const kitchenName = (item_id: string): string => NAMES[item_id] ?? item_id;
const AGING = resolveAging(undefined);
const CONFIRMED_AT = 1_754_300_000_000;

type LineSpec = { line_id: string; item_id: string; qty: number; notes?: readonly string[] };

/**
 * Ring one order through the REAL store, so the MERGE ENGINE — not this file — decides what a
 * projected line cell holds. A fixture that hand-wrote `json_lines` would be asserting against
 * this file's belief about the kernel, which is precisely the vacuity the round-3 law names.
 */
const ringOrder = (
  store: DeviceStore,
  opts: { order_id: string; order_type: string; lines: readonly LineSpec[] },
): void => {
  const append = (type: string, payload: unknown): void => {
    store.append({
      id: uuid(),
      org_id: ORG,
      branch_id: BRANCH,
      device_id: DEVICE,
      actor_user_id: null,
      device_created_at: CONFIRMED_AT,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  append("order.created", {
    order_id: opts.order_id,
    channel: "counter",
    order_type: opts.order_type,
  });
  for (const line of opts.lines) {
    append("order.line_added", {
      order_id: opts.order_id,
      line_id: line.line_id,
      item_id: line.item_id,
      qty: line.qty,
      unit_price_paisa: 45_000,
    });
    // `02-F50` — ONE TAG IS ONE EVENT. Two tags are two appends, never one edited note.
    for (const note of line.notes ?? []) {
      append("order.note_added", { order_id: opts.order_id, line_id: line.line_id, note });
    }
  }
  append("order.confirmed", { order_id: opts.order_id });
};

const queueOf = (store: DeviceStore): readonly PassTicket[] =>
  passQueue({
    store,
    name: kitchenName,
    aging: AGING,
    // Fixed, one minute after the confirm: this file asserts nothing about age.
    now: () => CONFIRMED_AT + 60_000,
  });

const lineNamed = (ticket: PassTicket, name: string): PassLine => {
  const found = ticket.lines.find((l) => l.name === name);
  if (found === undefined) {
    throw new Error(`fixture: no line named ${name} on the ticket — the projection lost the line`);
  }
  return found;
};

const ORDER_A = "0199cccc-0000-7000-8000-00000000000a";
const ORDER_B = "0199dddd-0000-7000-8000-00000000000b";

const NO_PEANUTS = "NO PEANUTS";
const EXTRA_SPICY = "EXTRA SPICY";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE PROJECTION READS THE NOTE THE KERNEL ALREADY STORES.
//
// The defect this section exists to fail is the one measured in the tree the day it was written:
// `linesOf` builds `{line_id, name, quantity, state, done}` from a cell that ALSO carries `notes`,
// and never touches them. Every gate is green while that is true.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F56 — a line rung with a note arrives on the pass queue carrying it", () => {
  it("03-F56/02-F6 — the note the counter captured is on the pass line", () => {
    const store = freshStore();
    ringOrder(store, {
      order_id: ORDER_A,
      order_type: "dine_in",
      lines: [
        { line_id: "L0", item_id: "item-karahi", qty: 1, notes: [NO_PEANUTS] },
        { line_id: "L1", item_id: "item-naan", qty: 2 },
      ],
    });

    const [ticket] = queueOf(store);
    expect(ticket, "fixture: the confirmed order is not on the pass queue at all").toBeDefined();
    expect(
      noteOf(lineNamed(ticket as PassTicket, "KARAHI")),
      "03-F56 — the note is captured on the till, stored in the ledger, and shown to nobody",
    ).toContain(NO_PEANUTS);
  });

  it("03-F56/27-F57 — the note is on ITS dish and on no other", () => {
    // The dangerous implementation is the one that hoists any note in the order onto every line,
    // or onto the ticket. `packages/domain`'s own registry names it: *"A note with no line key can
    // only print at the foot of the ticket, qualifying every dish or none."* `27-F57` measures what
    // that costs — the mapping step is where execution collapses from ~71% to ~35%.
    const store = freshStore();
    ringOrder(store, {
      order_id: ORDER_A,
      order_type: "dine_in",
      lines: [
        { line_id: "L0", item_id: "item-karahi", qty: 1, notes: [NO_PEANUTS] },
        { line_id: "L1", item_id: "item-naan", qty: 2 },
      ],
    });

    const ticket = queueOf(store)[0] as PassTicket;
    expect(
      noteOf(lineNamed(ticket, "NAAN")),
      "03-F56 — the naan carries a note nobody asked for; a cook cannot tell which dish it qualifies",
    ).toBe("");
  });

  it("03-F56/02-F50 — two quick-tags on one line BOTH reach the cook", () => {
    // `02-F50`: *"One tag is one `order.note_added`, and tags ACCUMULATE … A pick list whose second
    // tap erased the first would be a control that silently discards an instruction."* The merge
    // fold is a grow-only value SET per line, so both facts are in `json_lines`; the failure this
    // row exists to catch is a projection that takes `notes[0]` and drops the rest — cheap,
    // plausible, and it silently discards *"no peanuts"* half the time.
    //
    // No separator is asserted. `03-F56` does not rule on one, and `printing.ts`/`gateway.ts` join
    // with `" / "` as a PRESENTATION decision taken in the host app. Pinning it here would pin an
    // implementer's choice; `toContain` twice pins the property the FR actually states.
    const store = freshStore();
    ringOrder(store, {
      order_id: ORDER_B,
      order_type: "dine_in",
      lines: [{ line_id: "L0", item_id: "item-karahi", qty: 1, notes: [NO_PEANUTS, EXTRA_SPICY] }],
    });

    const note = noteOf(lineNamed(queueOf(store)[0] as PassTicket, "KARAHI"));
    expect(note, "02-F50 — the second tag erased the first").toContain(NO_PEANUTS);
    expect(note, "02-F50 — the first tag erased the second").toContain(EXTRA_SPICY);
  });

  it("00 §5.7 — a line with nothing to say carries no note, and the CONTROL is a queue with none at all", () => {
    // The control row. Without it, an implementation that put a constant string on every line —
    // or that returned the item name as the note — would satisfy every assertion above.
    const store = freshStore();
    ringOrder(store, {
      order_id: ORDER_A,
      order_type: "dine_in",
      lines: [
        { line_id: "L0", item_id: "item-karahi", qty: 1 },
        { line_id: "L1", item_id: "item-naan", qty: 2 },
      ],
    });

    const ticket = queueOf(store)[0] as PassTicket;
    for (const line of ticket.lines) {
      expect(noteOf(line), `00 §5.7 — ${line.name} invented a note`).toBe("");
    }
  });

  it("03-F56 — the note is a FIELD OF ITS OWN and never joined into the item name", () => {
    // `03-F56` gives the note *"the last row of its own item block, indented like a modifier"* —
    // a row, not a suffix. `27-F57` is why: the quantity must sit immediately left of the item name
    // on the same line, and `1 KARAHI (NO PEANUTS)` is a name that wraps, which `27-F59` bans for
    // destroying the vertical alignment the whole layout depends on.
    //
    // This is also the cheapest wrong implementation available — one string concatenation in
    // `linesOf` — and it passes the first row of this section, because `toContain` on a `name` the
    // note was folded into is still true. That is why the name is asserted EXACTLY.
    const store = freshStore();
    ringOrder(store, {
      order_id: ORDER_A,
      order_type: "dine_in",
      lines: [{ line_id: "L0", item_id: "item-karahi", qty: 1, notes: [NO_PEANUTS] }],
    });

    const line = queueOf(store)[0]?.lines[0] as PassLine;
    expect(line.name, "03-F38/27-F57 — the note was folded into the item name").toBe("KARAHI");
    expect(noteOf(line)).toContain(NO_PEANUTS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE WIRE. `z.object` STRIPS WHAT IT DOES NOT DECLARE, AND THE HOST PARSES.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F56 — the note survives the plane boundary", () => {
  it("03-F56 — the REAL projection parsed by the REAL schema still carries the note", () => {
    // The composition `main/index.ts` performs, reproduced exactly:
    //   passQueue({...}).map((t) => PassTicketSchema.parse(t))
    //
    // The dangerous implementation is the one that populates `PassLine.note` and leaves
    // `PassLineSchema` at `{line_id, name, quantity, state, done}`. Zod strips undeclared keys, so
    // the note is deleted at that one line: `linesOf` is correct, the renderer is correct, the cook
    // sees nothing, and no suite in this package fails. It is `catalog-fetch.ts`'s `toEntry`
    // defect — *"the gateway served them, the wire schema carried them, the device store declared
    // and read them, and the reshape between did not copy them"* — one seam over.
    const store = freshStore();
    ringOrder(store, {
      order_id: ORDER_A,
      order_type: "dine_in",
      lines: [{ line_id: "L0", item_id: "item-karahi", qty: 1, notes: [NO_PEANUTS] }],
    });

    const projected = queueOf(store);
    // Attribution tripwire: if §A is already red this row must not be read as a schema failure.
    expect(
      noteOf(projected[0]?.lines[0] as PassLine),
      "attribution: the PROJECTION lost the note, so this row cannot judge the schema — fix §A first",
    ).toContain(NO_PEANUTS);

    const wire = projected.map((t) => PassTicketSchema.parse(t));
    const parsedLine = (wire[0] as PassTicket).lines[0] as PassLine;
    const parsedNote = noteOf(parsedLine);
    expect(
      parsedNote,
      "03-F56 — PassLineSchema does not declare `note`, so the plane boundary deletes it",
    ).toContain(NO_PEANUTS);
  });

  it("03-F56/18 §9 — and the host still PARSES the queue at the boundary", () => {
    // ⚠ A SOURCE READ, stated plainly, and it exists because of the shape of the fix above:
    // the cheapest way to make the row above green is to delete `PassTicketSchema.parse` from
    // `main/index.ts` rather than to extend the schema. That would carry the note AND retire the
    // only runtime check on the whole queue payload — a net loss dressed as a fix. `18 §9` puts the
    // words a screen shows on the trusted side, and `shared/ipc.ts` calls this boundary *"the ONE
    // plane boundary of this app"*.
    //
    // Comment-blind, for the reason `pass-seam.test.ts` records paying for three times in one week:
    // a mention is not a call, and the stripper can only ever REMOVE text, so a real call can never
    // be hidden by it.
    const main = readFileSync(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(
      main,
      "the comment stripper emptied the file — the assertion below would pass vacuously",
    ).toContain("ipcMain.handle");
    expect(main).toContain("PassTicketSchema.parse");
  });
});
