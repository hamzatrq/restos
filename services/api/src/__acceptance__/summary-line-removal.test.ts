/**
 * ACCEPTANCE TESTS — `12-F10`'s nightly sales figure and `02-F8`'s `order.line_removed`.
 *
 * ⚠ **AUTHORED FROM SPEC TEXT ONLY, by a session that did not implement these FRs and has not
 * edited `summary.ts`.** `24 §3` step 2. The neighbouring `summary.test.ts` carries an explicit
 * authorship departure (its author wrote the fold); this file does not, and is deliberately a
 * separate file so that the independent-oracle guarantee applies to it without qualification.
 *
 * ── WHAT IS ASSERTED, AND THE FRs THAT RESOLVE IT ─────────────────────────────────────────
 *
 * `12-F10` bullet 1 is *"sales total & order count by channel"*. What a "sale" is, is not left
 * to this fold: `01-F30` fixes the money side as `billed_total − void_value − comp_value −
 * discounts`, and **there is no `removed_value` term in it**. `02-F8` names the event that takes
 * a line off a bill before the kitchen ever hears of it — *"Line removal pre-confirm is
 * `order.line_removed`; post-confirm it must be `void.recorded` with an approver"* — so a line
 * that stayed in `billed_total` after its removal would make `01-F30`'s identity unsatisfiable
 * without a `void.recorded`, which is precisely the event `02-F8` says a pre-confirm removal is
 * NOT. That argument is not this file's invention: `packages/sync-client/src/folds/merge.ts`
 * states it verbatim at its own `order.line_removed` arm, which is the device-side fold whose
 * numbers `12-F21`/`12-F12` forbid this surface to disagree with — *"one number, everywhere"*.
 *
 * Applying the removal to the total ALONE is not most of the fix: `12-F10` names six blocks, and
 * a Coke the customer said no to must leave the channel row, the top-items table and the hourly
 * curve too, or an owner reads three different days off one screen.
 *
 * ── THE SHAPE OF THE LIKELY WRONG IMPLEMENTATION, which every assertion below is aimed at ──
 *
 * The removal is a **fact about a key**, not an arithmetic operation. Two plausible wrong builds:
 *
 *   (i)  `total -= qty × unit_price` on seeing the removal. Passes the headline. Dies in §B: a
 *        redelivered removal (`01-F31` — folds are idempotent over a delivered SET) subtracts
 *        twice, and a removal delivered before its own `order.line_added` (`01-F34` — the answer
 *        is a function of the SET, never of delivery order) subtracts a line it has not seen.
 *   (ii) `lines.delete(line_id)` on seeing the removal. Passes §A and the redelivery case, and
 *        dies on the same out-of-order delivery — the add lands afterwards and resurrects the
 *        line. A LAN reorder makes that the ordinary case rather than an exotic one.
 *
 * Both are killed only by fixtures pointed at them, which is why §B exists at all. A per-order
 * tombstone G-Set — the build `merge.ts` already ships on the device — passes everything here, so
 * nothing in this file blocks a correct implementation.
 *
 * ── MUTATION MATRIX (the round-3 law: a claim that a test bites is not evidence that it does) ──
 *
 * Measured OUT OF TREE: `summary.ts` was copied to a scratchpad, given the tombstone build, and
 * mutated there — `services/api/src/summary.ts` was never edited by this session. Control:
 * **11/11 green**. Every row is this file's 11 tests; each mutant differs in exactly one branch.
 *
 *   R1  the `order.line_removed` arm absent — **THE SHIPPED TREE**            9 killed
 *   R2  build (i): arithmetic subtraction at fold time                        7 killed
 *   R3  build (ii): `lines.delete(line_id)`                                   2 killed (§B, both)
 *   R4  the tombstone keyed by `line_id` GLOBALLY, not per order              2 killed (§C, both)
 *   R5  the removal applied to the TOTAL only                                 4 killed
 *   R6  the removal takes one UNIT off the line instead of the line           3 killed
 *   R7  over-eager: `order.note_added` tombstones too                         1 killed — the CONTROL, alone
 *   R8  NEGATIVE CONTROL: the same set, reshaped (`[...set].includes`)        **0 killed**
 *
 * R3 and R7 are the rows to re-run after any change here. R3 is the only mutant §B was written
 * for and it is invisible to every other assertion in this file; R7 is the only mutant the
 * control test can see, and without it "tombstone anything unhandled" passes the other ten.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES **NOT** ASSERT, and why that is not an omission ───────
 *
 * **Whether the figure is confirmed-based or settlement-based is UNRESOLVED in the corpus, so it
 * is not tested here and must not be guessed by the implementer either (commandment 2).** The
 * evidence, so the next session inherits an argument rather than a blank page:
 *
 *   · `12-F10`, `12-F5` and `restaurant-os.md` Appendix C all say "sales total by channel" and
 *     none of them names a gate. `13-F1` puts a metric's *definition text* and `13-F3` its golden
 *     fixtures in `services/intelligence/metrics` — which is a two-line scaffold stub — so
 *     `sales.total`'s definition does not exist anywhere in this product.
 *   · `order.cancelled` — `06-F27`'s auto-close for an order nobody confirmed — has **no payload
 *     schema in `packages/domain`**, so `01-F4` makes it unemittable: there is no "abandoned"
 *     event to gate on today.
 *   · `order.rejected` has a schema and no production emitter, and `merge.ts`'s own arm for it
 *     records its disposition as *"genuinely UNDECIDED rather than merely unbuilt … `01 §4`'s
 *     canonical states carry no `rejected` at all (its exit states are `voided / cancelled`).
 *     Guessing a removal here would invent an order state (commandment 2)."* An oracle asserting
 *     that a rejected order bills zero would pin, in a test, a decision `26 §7` reserves for a
 *     spec PR — and would then block the implementer against the only build the corpus allows.
 *   · The two figures already disagree in the shipped product, which is a finding rather than a
 *     licence to pick: `apps/pos-electron/src/main/printing.ts`'s `02-F24` day slip sums
 *     `order.pay_total` over orders with `confirmed_at !== null`, i.e. it is confirm-gated AND
 *     payment-based, while this fold is billed-lines-based and ungated. `12-F21` says those may
 *     never be two numbers. Resolving that is a spec change, not a test.
 *
 * A removed line is the half that IS resolved — it is subtracted under every candidate gate,
 * because no gate can make a line the customer never bought into revenue.
 */

import { businessDayBoundsOfDate, paisa, sumPaisa } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { type NightlySummary, type SummaryEvent, summarise } from "../summary.js";

const BRANCH = "branch-lahore";

/** `2026-08-09` in Asia/Karachi at the 05:00 cutover (`01-F46`). */
const DAY = businessDayBoundsOfDate("2026-08-09");

/** Karachi wall hour → instant. `05:00` is hour offset 0. */
const at = (wall_hour: number, minute = 0): number =>
  DAY.start_ms + (((wall_hour - 5 + 24) % 24) * 60 + minute) * 60_000;

/**
 * Envelope ids are given EXPLICITLY rather than generated, because §B shuffles delivery order and
 * a generated id would then change with the shuffle — which would make an id-relabel the thing
 * under test instead of the delivery order (`01-F34` separates those two properties on purpose).
 */
const event = (
  id: string,
  type: string,
  payload: Record<string, unknown>,
  at_ms: number,
): SummaryEvent => ({
  id,
  type,
  branch_id: BRANCH,
  branch_created_at: at_ms,
  time_basis: "branch",
  actor_user_id: null,
  payload,
});

const created = (id: string, order_id: string, at_ms: number, channel = "counter"): SummaryEvent =>
  event(id, "order.created", { order_id, channel }, at_ms);

const line = (
  id: string,
  spec: {
    order_id: string;
    line_id: string;
    item_id: string;
    qty: number;
    unit_price_paisa: number;
  },
  at_ms: number,
): SummaryEvent => event(id, "order.line_added", spec, at_ms);

/** `02-F8`'s plain event: `{ order_id, line_id }` and nothing else (`packages/domain` pins it). */
const removed = (id: string, order_id: string, line_id: string, at_ms: number): SummaryEvent =>
  event(id, "order.line_removed", { order_id, line_id }, at_ms);

const fold = (events: readonly SummaryEvent[]): NightlySummary =>
  summarise(events, DAY.start_ms + 1);

const channelOf = (summary: NightlySummary, name: string) =>
  summary.sales.by_channel.find((row) => row.channel === name);

const itemOf = (summary: NightlySummary, item_id: string) =>
  summary.top_items.find((row) => row.item_id === item_id);

/**
 * ONE counter order, two lines, and the second one removed.
 *
 *   l-1  item-karahi  2 × Rs 450 = Rs 900   rung 13:05 → hour offset 8
 *   l-2  item-naan    1 × Rs 320 = Rs 320   rung 19:00 → hour offset 14, then REMOVED at 19:05
 *
 * The two lines sit in different hours and carry different items on purpose: a build that fixes
 * only the total leaves Rs 320 standing in both the curve and the top-items table, and a fixture
 * with one hour and one item could not tell.
 */
const KARAHI_PAISA = 900_00;
const oneRemoval = (): SummaryEvent[] => [
  created("ev-1", "ord-1", at(13)),
  line(
    "ev-2",
    { order_id: "ord-1", line_id: "l-1", item_id: "item-karahi", qty: 2, unit_price_paisa: 450_00 },
    at(13, 5),
  ),
  line(
    "ev-3",
    { order_id: "ord-1", line_id: "l-2", item_id: "item-naan", qty: 1, unit_price_paisa: 320_00 },
    at(19),
  ),
  removed("ev-4", "ord-1", "l-2", at(19, 5)),
];

// ── §A · the money leaves every block, not only the total ──────────────────────────────────────

describe("§A · 12-F10 / 02-F8 — a removed line is not a sale", () => {
  it("excludes a removed line from the sales total and from its channel row (12-F10, 02-F8, 01-F30)", () => {
    const summary = fold(oneRemoval());

    // Rs 900, not Rs 1,220. The wrong answer is the sum of every line ever added, which is what
    // `01-F30` has no term for and what no drawer will ever hold.
    expect(summary.sales.total_paisa).toBe(KARAHI_PAISA);
    expect(channelOf(summary, "counter")?.billed_paisa).toBe(KARAHI_PAISA);
  });

  it("excludes a removed line from the hourly curve, not only the total (12-F10, 02-F8)", () => {
    const summary = fold(oneRemoval());

    // 13:05 → offset 8 keeps its money; 19:00 → offset 14 must be EMPTY, not Rs 320.
    expect(summary.hourly[8]?.billed_paisa).toBe(KARAHI_PAISA);
    expect(summary.hourly[14]?.billed_paisa).toBe(0);
    // And the curve still sums to the headline — a build that zeroed the bucket by subtracting
    // twice, or that dropped the whole hour, fails here rather than being read off the total.
    const curve = sumPaisa(summary.hourly.map((bucket) => paisa(bucket.billed_paisa)));
    expect(curve).toBe(summary.sales.total_paisa);
  });

  it("excludes a removed line from top items by revenue (12-F10, 02-F8)", () => {
    const summary = fold(oneRemoval());

    expect(itemOf(summary, "item-karahi")).toEqual({
      item_id: "item-karahi",
      qty: 2,
      revenue_paisa: KARAHI_PAISA,
    });
    // The naan was rung and taken off. Whether the implementation omits the row or renders it at
    // zero is not pinned here — what is pinned is that it never carries the Rs 320 or the unit.
    expect(itemOf(summary, "item-naan")?.revenue_paisa ?? 0).toBe(0);
    expect(itemOf(summary, "item-naan")?.qty ?? 0).toBe(0);
  });

  it("removes the WHOLE line and never a single unit of its quantity (02-F8, 12-F10)", () => {
    // `order.line_removed` is `{ order_id, line_id }` — it carries no quantity and no amount, so
    // there is nothing partial it could express. `packages/domain`'s own note on the schema:
    // "Removing two of three is a removal plus a re-add." A build that decremented `qty` by one
    // leaves Rs 200 of a Rs 300 line standing here.
    const summary = fold([
      created("ev-1", "ord-1", at(12)),
      line(
        "ev-2",
        {
          order_id: "ord-1",
          line_id: "l-1",
          item_id: "item-roti",
          qty: 3,
          unit_price_paisa: 100_00,
        },
        at(12, 1),
      ),
      removed("ev-3", "ord-1", "l-1", at(12, 2)),
    ]);

    expect(summary.sales.total_paisa).toBe(0);
    expect(itemOf(summary, "item-roti")?.qty ?? 0).toBe(0);
  });

  it("bills ZERO on the channel when every line of an order was removed (12-F10, 01-F30)", () => {
    // `01-F30`: "a fully-voided order nets to zero". The order-COUNT is deliberately not asserted
    // — no FR decides whether an emptied order is still an order, and pinning it here would be
    // this oracle inventing policy.
    const summary = fold([
      created("ev-1", "ord-1", at(14), "foodpanda"),
      line(
        "ev-2",
        {
          order_id: "ord-1",
          line_id: "l-1",
          item_id: "item-biryani",
          qty: 1,
          unit_price_paisa: 600_00,
        },
        at(14, 1),
      ),
      removed("ev-3", "ord-1", "l-1", at(14, 2)),
    ]);

    expect(channelOf(summary, "foodpanda")?.billed_paisa).toBe(0);
    expect(summary.sales.total_paisa).toBe(0);
  });
});

// ── §B · the removal is a FACT ABOUT A KEY, not an arithmetic operation ────────────────────────

describe("§B · 01-F34 / 01-F31 — the removal survives delivery order and redelivery", () => {
  it("applies a removal delivered BEFORE its own order.line_added (01-F34, 02-F8)", () => {
    // The ordinary case on a LAN reorder, not an exotic one — and the case that separates a
    // tombstone from a `delete`: under `delete` the add lands afterwards and resurrects Rs 320.
    const forward = oneRemoval();
    const reversed = [...forward].reverse();

    // The value assertion FIRST, because the equality below is satisfied by a build that is
    // wrong in both directions (Rs 1,220 twice is still equal to itself).
    expect(fold(reversed).sales.total_paisa).toBe(KARAHI_PAISA);
    expect(fold(reversed)).toEqual(fold(forward));
  });

  it("applies a removal delivered before its order.created too (01-F34, 02-F8)", () => {
    const events = oneRemoval();
    const removal = events[3] as SummaryEvent;
    expect(fold([removal, ...events.slice(0, 3)]).sales.total_paisa).toBe(KARAHI_PAISA);
  });

  it("subtracts a REDELIVERED removal exactly once (01-F31, 01-F34)", () => {
    // Two envelopes, one act — the shape `01-F31` exists for. A build that subtracts on each
    // delivery reads Rs 580 here and would report NEGATIVE sales on a busy retry.
    const twice = fold([...oneRemoval(), removed("ev-5", "ord-1", "l-2", at(19, 5))]);
    const once = fold(oneRemoval());

    expect(twice.sales.total_paisa).toBe(KARAHI_PAISA);
    // Every MONEY-BEARING block, not just the headline. The whole summary is deliberately NOT
    // compared: `honesty.events` is `00 §5.7`'s count of what the window actually held, so it
    // SHOULD read one higher — an oracle demanding otherwise would be pinning a lie about the
    // window and would fail a correct implementation.
    expect(twice.sales).toEqual(once.sales);
    expect(twice.top_items).toEqual(once.top_items);
    expect(twice.hourly).toEqual(once.hourly);
    expect(twice.honesty.events).toBe(once.honesty.events + 1);
  });
});

// ── §C · the removal touches exactly one line, and nothing else ────────────────────────────────

describe("§C · 02-F8 — the removal names an order AND a line, and both bind", () => {
  it("removes only the named ORDER's line when two orders share a line_id (02-F8, 12-F10)", () => {
    // `line_id` is `z.string().min(1)` in `packages/domain` — nothing makes it org-unique, and
    // two tills minting `l-1` is ordinary. A build keying tombstones by `line_id` alone wipes a
    // second customer's bill, silently and permanently (`01-F1`).
    const summary = fold([
      created("ev-1", "ord-1", at(13)),
      line(
        "ev-2",
        {
          order_id: "ord-1",
          line_id: "l-1",
          item_id: "item-karahi",
          qty: 1,
          unit_price_paisa: 450_00,
        },
        at(13, 1),
      ),
      created("ev-3", "ord-2", at(13, 30)),
      line(
        "ev-4",
        {
          order_id: "ord-2",
          line_id: "l-1",
          item_id: "item-karahi",
          qty: 1,
          unit_price_paisa: 450_00,
        },
        at(13, 31),
      ),
      removed("ev-5", "ord-1", "l-1", at(13, 40)),
    ]);

    expect(summary.sales.total_paisa).toBe(450_00);
    expect(itemOf(summary, "item-karahi")).toEqual({
      item_id: "item-karahi",
      qty: 1,
      revenue_paisa: 450_00,
    });
  });

  it("a removal for a line the window never delivered adds and takes NOTHING (01-F34, 12-F10)", () => {
    // A line rung before the 05:00 cutover and removed after it, or a straggler that never
    // arrived. There is no amount in the payload to subtract, so a build that guessed one — or
    // that let the total go negative — is caught here rather than by an owner reading a minus.
    const summary = fold([
      created("ev-1", "ord-1", at(13)),
      line(
        "ev-2",
        {
          order_id: "ord-1",
          line_id: "l-1",
          item_id: "item-karahi",
          qty: 1,
          unit_price_paisa: 450_00,
        },
        at(13, 1),
      ),
      removed("ev-3", "ord-1", "l-ghost", at(13, 5)),
      removed("ev-4", "ord-ghost", "l-1", at(13, 6)),
    ]);

    expect(summary.sales.total_paisa).toBe(450_00);
    expect(channelOf(summary, "counter")?.billed_paisa).toBe(450_00);
  });

  it("CONTROL — a note on a line is not a removal (02-F6, 12-F10)", () => {
    // The negative control. Without it, "subtract on any order.* event this fold does not
    // otherwise handle" passes every assertion above and quietly deletes a line whenever a
    // cashier types "no chilli" — `02-F6`'s note, which `01 §4` carries beside the removal.
    const summary = fold([
      created("ev-1", "ord-1", at(13)),
      line(
        "ev-2",
        {
          order_id: "ord-1",
          line_id: "l-1",
          item_id: "item-karahi",
          qty: 1,
          unit_price_paisa: 450_00,
        },
        at(13, 1),
      ),
      event(
        "ev-3",
        "order.note_added",
        { order_id: "ord-1", line_id: "l-1", note: "no chilli" },
        at(13, 2),
      ),
    ]);

    expect(summary.sales.total_paisa).toBe(450_00);
    expect(itemOf(summary, "item-karahi")?.qty).toBe(1);
  });
});
