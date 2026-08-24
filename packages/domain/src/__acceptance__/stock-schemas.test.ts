/**
 * `specs/10` slice 1 — the supply plane's three physical acts, and the ONE property the whole
 * variance loop rests on.
 *
 * ## What this file is pointed at, stated so the round-3 law can be checked against it
 *
 * AGENTS.md `L10`: *"the mechanism was built correctly and simply never aimed at the case that
 * matters."* The case that matters here is **not** "does a schema reject a missing field" — every
 * Zod object does that, and a suite of those passes against any implementation of anything. It is
 * `10-F29`: **`counted: false` is a distinct value from `qty_base: 0`.**
 *
 * That distinction is invisible to any suite which submits COMPLETE counts, and every
 * implementation passes such a suite — **including the one that treats a blank as zero, which is
 * the shipped behaviour of the market leader** (its own documentation reports *"variance is, by
 * definition, zero for uncounted items"* and ships a report toggle for whether blanks are zeroes at
 * all). So §B is aimed at the incomplete count, and §B's mutant is *treat a blank as zero*.
 *
 * ⚠ **A schema cannot check what a REPORT does with an uncounted line.** It can only make the
 * uncounted line unrepresentable as a zero, which is the half that lives in this package.
 * `packages/inventory`'s `__acceptance__/variance-report.test.ts` owns the other half — that the
 * row reads *not counted*, that the PKR total is flagged a floor, and that no zero appears anywhere
 * for that item. Stated rather than implied, because a test that looked like it covered the report
 * would retire the assertion that must be written there (`L11`).
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED.** Written by the session that landed the schemas, so
 * `20 §4.3`'s independent-oracle guarantee is not available and is not claimed. The mutation matrix
 * in `packages/domain/CLAUDE.md` is what stands in for it, and its negative control is what stops
 * that matrix proving nothing.
 */

import { describe, expect, it } from "vitest";
import { COUNT_BASES, eventRegistry, parseEvent, UnknownEventTypeError } from "../index.js";

/** A minimal legal envelope. Only `type` and `payload` vary across this file. */
const envelope = (type: string, payload: unknown): unknown => ({
  id: "0193b0f0-0000-7000-8000-000000000001",
  org_id: "org-1",
  branch_id: "branch-1",
  device_id: "device-1",
  actor_user_id: "user-storekeeper",
  lamport_seq: 1,
  device_created_at: 1_755_000_000_000,
  branch_created_at: 1_755_000_000_000,
  time_basis: "branch",
  server_received_at: null,
  type,
  schema_version: 1,
  payload,
  refs: [],
});

const PURCHASE = {
  purchase_id: "purchase-1",
  supplier_id: "supplier-metro",
  location_id: "storage-1",
  lines: [
    {
      line_no: 0,
      item_id: "item-chicken",
      supplier_item_id: "si-metro-chicken-5kg",
      qty_base: 10_000_000, // 10 kg in mg
      line_total_paisa: 680_000, // Rs 6,800
    },
  ],
  invoice_total_paisa: 680_000,
};

const WASTAGE = {
  wastage_id: "wastage-1",
  location_id: "branch-1",
  item_id: "item-tomato",
  qty_base: 2_000_000,
  reason: "spoiled",
};

const COUNT = {
  count_id: "count-1",
  location_id: "branch-1",
  lines: [
    {
      item_id: "item-chicken",
      area_id: "walk-in",
      counted: true,
      qty_base: 8_400_000,
      basis: "exact",
    },
  ],
};

const parseCount = (payload: unknown) => parseEvent(envelope("stock.count_recorded", payload));

// ── §A · 01-F4 — the family was UNEMITTABLE, and these three are not ───────────────────────────

describe("§A · 01-F4 — three of the ten stock.* types can now be appended, and seven still cannot", () => {
  it("the three slice-1 types carry payload schemas", () => {
    expect(eventRegistry.has("stock.purchase_recorded")).toBe(true);
    expect(eventRegistry.has("stock.wastage_recorded")).toBe(true);
    expect(eventRegistry.has("stock.count_recorded")).toBe(true);
  });

  it("the other seven remain unemittable — slice 1's omit list is a decision, not an oversight", () => {
    // `01 §4` catalog vocabulary with no payload schema is vocabulary, not data: `parseEvent`
    // throws at BOTH ends of the ledger (device append and gateway ingest), so this is a stronger
    // claim than "nothing emits one today". `stock.production_recorded` is the sharpest of the
    // seven — it additionally has NO permission action, so under the fail-closed default it is
    // denied for every role including owner. `services/api`'s OMISSIONS entries rest on this list.
    for (const type of [
      "stock.movement_recorded",
      "stock.transfer_sent",
      "stock.transfer_received",
      "stock.production_recorded",
      "stock.price_spike_flagged",
      "stock.low_level_flagged",
      "stock.count_overdue_flagged",
    ]) {
      expect(eventRegistry.has(type), `${type} must stay unemittable in slice 1`).toBe(false);
      expect(() => parseEvent(envelope(type, {}))).toThrow(UnknownEventTypeError);
    }
  });

  it("all three parse a minimal legal payload", () => {
    expect(parseEvent(envelope("stock.purchase_recorded", PURCHASE)).type).toBe(
      "stock.purchase_recorded",
    );
    expect(parseEvent(envelope("stock.wastage_recorded", WASTAGE)).type).toBe(
      "stock.wastage_recorded",
    );
    expect(parseCount(COUNT).type).toBe("stock.count_recorded");
  });
});

// ── §B · 10-F29 — THE ONE THAT MATTERS: `counted: false` is not `qty_base: 0` ──────────────────

describe("§B · 10-F29 — an uncounted line and a counted zero are different values, not different renderings", () => {
  const uncounted = { item_id: "item-oil", area_id: "dry-store", counted: false, basis: "exact" };
  const countedZero = {
    item_id: "item-oil",
    area_id: "dry-store",
    counted: true,
    qty_base: 0,
    basis: "exact",
  };

  it("an uncounted line parses and carries NO qty_base at all", () => {
    const parsed = parseCount({ ...COUNT, lines: [uncounted] });
    const line = (parsed.payload as { lines: readonly Record<string, unknown>[] }).lines[0];
    expect(line?.counted).toBe(false);
    // The absence IS the FR. A consumer reaching for a quantity here finds nothing to coerce,
    // which is what makes `qty_base ?? 0` impossible to write by accident.
    expect("qty_base" in (line as object)).toBe(false);
  });

  it("A COUNTED ZERO parses and is a MEASUREMENT — *I looked and there is none*", () => {
    const parsed = parseCount({ ...COUNT, lines: [countedZero] });
    const line = (parsed.payload as { lines: readonly Record<string, unknown>[] }).lines[0];
    expect(line?.counted).toBe(true);
    expect(line?.qty_base).toBe(0);
  });

  it("the two are DISTINGUISHABLE after a full parse round trip, which is the whole property", () => {
    // If this ever passed with one shape, an uncounted item would look on the owner's page exactly
    // like an item counted perfectly — the honesty rule broken at the quietest possible place.
    const a = parseCount({ ...COUNT, lines: [uncounted] }).payload;
    const b = parseCount({ ...COUNT, lines: [countedZero] }).payload;
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it("⚠ THE MUTANT'S OWN CASE — a blank that arrives AS a zero is REFUSED, not silently accepted", () => {
    // `00 §6` keeps payloads loose for additive evolution, so a discriminated union ALONE would
    // let `{counted: false, qty_base: 0}` through as an extra key — and that is exactly the shape
    // a "treat a blank as zero" writer produces. The refusal is what makes the union load-bearing
    // rather than decorative.
    expect(() => parseCount({ ...COUNT, lines: [{ ...uncounted, qty_base: 0 }] })).toThrow();
    // …and a NON-zero smuggled quantity is refused by the same rule, so the check is about the
    // FIELD and not about the value zero.
    expect(() => parseCount({ ...COUNT, lines: [{ ...uncounted, qty_base: 5 }] })).toThrow();
  });

  it("a counted line without a quantity is refused — the mirror of the rule above", () => {
    // `counted: true` asserts a reading was taken. A reading with no number is a writer that lost
    // one, and admitting it would recreate the blank-as-zero hole from the other end.
    expect(() =>
      parseCount({ ...COUNT, lines: [{ ...countedZero, qty_base: undefined }] }),
    ).toThrow();
  });

  it("`counted` is the discriminator and must be a boolean, not a truthy string", () => {
    for (const bad of ["false", "", 0, 1, null]) {
      expect(() => parseCount({ ...COUNT, lines: [{ ...uncounted, counted: bad }] })).toThrow();
    }
  });
});

// ── §C · 10-F29 — the basis is closed and travels ──────────────────────────────────────────────

describe("§C · 10-F29 — `basis` is a closed set on EVERY line, counted or not", () => {
  it("all three members parse", () => {
    for (const basis of COUNT_BASES) {
      expect(() => parseCount({ ...COUNT, lines: [{ ...COUNT.lines[0], basis }] })).not.toThrow();
    }
    expect(COUNT_BASES).toEqual(["exact", "weighed", "estimated"]);
  });

  it("a fourth precision class is REFUSED — an open string makes a typo permanent (01-F1)", () => {
    for (const bad of ["eyeballed", "Exact", "guessed", ""]) {
      expect(() => parseCount({ ...COUNT, lines: [{ ...COUNT.lines[0], basis: bad }] })).toThrow();
    }
  });

  it("an UNCOUNTED line still carries a basis — 10-F33 (g) (i) reads it as an investigation step", () => {
    // The ladder's first rung is "not counted, OR an estimated basis". An uncounted line whose
    // basis were optional would make the two halves of that rung unaskable together.
    expect(() =>
      parseCount({
        ...COUNT,
        lines: [{ item_id: "i", area_id: "a", counted: false }],
      }),
    ).toThrow();
  });
});

// ── §D · 10-F30 — the line is keyed (item, area), and the area is required ─────────────────────

describe("§D · 10-F30 — one balance, N lines: the area is part of the line's identity", () => {
  it("an item may appear on more than one line, one per area — the founder's ketchup case", () => {
    const parsed = parseCount({
      ...COUNT,
      lines: [
        {
          item_id: "item-ketchup",
          area_id: "kitchen",
          counted: true,
          qty_base: 15_000_000,
          basis: "exact",
        },
        {
          item_id: "item-ketchup",
          area_id: "store",
          counted: true,
          qty_base: 40_000_000,
          basis: "exact",
        },
      ],
    });
    expect((parsed.payload as { lines: readonly unknown[] }).lines).toHaveLength(2);
  });

  it("a line with no area is REFUSED — an org with no declared areas has ONE, and it is named", () => {
    // An absent area is not a fact about the sheet. The implicit area is a NAME the writer
    // supplies, not a null a reader guesses, or the rollup in `packages/inventory` would have to
    // invent a key and two writers would invent two.
    expect(() =>
      parseCount({
        ...COUNT,
        lines: [{ item_id: "i", counted: true, qty_base: 1, basis: "exact" }],
      }),
    ).toThrow();
    expect(() => parseCount({ ...COUNT, lines: [{ ...COUNT.lines[0], area_id: "" }] })).toThrow();
  });

  it("an EMPTY count is refused — it would close a period while stating nothing", () => {
    // Flow E's "an abandoned count writes nothing" covers the count never submitted. This is the
    // count submitted empty, which under 10-F28 still closes a period and would freeze every item
    // at `not counted` silently.
    expect(() => parseCount({ ...COUNT, lines: [] })).toThrow();
  });
});

// ── §E · 00 §6 — quantities are integer base units and money is integer paisa ──────────────────

describe("§E · 00 §6 / commandment 3 — no float reaches this ledger", () => {
  it("a fractional quantity is refused everywhere it can appear", () => {
    expect(() =>
      parseCount({ ...COUNT, lines: [{ ...COUNT.lines[0], qty_base: 8_400_000.5 }] }),
    ).toThrow();
    expect(() =>
      parseEvent(envelope("stock.wastage_recorded", { ...WASTAGE, qty_base: 0.5 })),
    ).toThrow();
    expect(() =>
      parseEvent(
        envelope("stock.purchase_recorded", {
          ...PURCHASE,
          lines: [{ ...PURCHASE.lines[0], qty_base: 1.5 }],
        }),
      ),
    ).toThrow();
  });

  it("a fractional or negative money figure is refused", () => {
    for (const bad of [0.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        parseEvent(
          envelope("stock.purchase_recorded", {
            ...PURCHASE,
            lines: [{ ...PURCHASE.lines[0], line_total_paisa: bad }],
          }),
        ),
      ).toThrow();
    }
  });

  it("a negative quantity is refused on wastage — direction comes from the event TYPE", () => {
    // `cash.paid_out.amount_paisa`'s argument, one plane over: a negative wastage is a production
    // entry in disguise and would net the theoretical balance the wrong way, silently.
    expect(() =>
      parseEvent(envelope("stock.wastage_recorded", { ...WASTAGE, qty_base: -1 })),
    ).toThrow();
    expect(() => parseCount({ ...COUNT, lines: [{ ...COUNT.lines[0], qty_base: -1 }] })).toThrow();
  });
});

// ── §F · 10-F13 — the receipt line carries a PAIR, never a rate ────────────────────────────────

describe("§F · 10-F13 / 10-F28 — a purchase line is (qty_base, line_total_paisa) and not a unit price", () => {
  it("a line states its quantity and its money, and both are exact integers", () => {
    const parsed = parseEvent(envelope("stock.purchase_recorded", PURCHASE));
    const line = (parsed.payload as { lines: readonly Record<string, unknown>[] }).lines[0];
    expect(line?.qty_base).toBe(10_000_000);
    expect(line?.line_total_paisa).toBe(680_000);
    // The rate this pair REFUSES to store: Rs 6,800 over 10 kg is 0.068 paisa per mg, which is not
    // an integer and never will be. `10-F28` values a quantity by one exact multiply-then-round
    // from the pair instead, so no rounding error is ever frozen into an append-only ledger.
    expect(680_000 / 10_000_000).not.toBe(Math.round(680_000 / 10_000_000));
  });

  it("a ZERO-QUANTITY line with money on it is LEGAL — 10-F31's khata-not-valuation rule", () => {
    // A delivery charge or minimum-order line: money spent is money spent (10-F14), and it must
    // NOT reach the weighted average (dividing by its quantity is the arithmetic form of the same
    // exclusion). The schema admits it; `packages/inventory` is what excludes it from valuation.
    expect(() =>
      parseEvent(
        envelope("stock.purchase_recorded", {
          ...PURCHASE,
          lines: [{ ...PURCHASE.lines[0], qty_base: 0, line_total_paisa: 15_000 }],
        }),
      ),
    ).not.toThrow();
  });

  it("a purchase with no lines is refused — an invoice total with nothing under it", () => {
    expect(() =>
      parseEvent(envelope("stock.purchase_recorded", { ...PURCHASE, lines: [] })),
    ).toThrow();
  });

  it("`supplier_item_id` is REQUIRED and NULLABLE — a free-hand line is a stated fact", () => {
    // `payment.recorded.shift_id`'s standing rule: `null` says "typed against no catalogued
    // supplier item", which `10-F13`'s "confirms/edits item" permits; `undefined` is a writer who
    // forgot, and an `.optional()` field cannot tell the two apart afterwards.
    expect(() =>
      parseEvent(
        envelope("stock.purchase_recorded", {
          ...PURCHASE,
          lines: [{ ...PURCHASE.lines[0], supplier_item_id: null }],
        }),
      ),
    ).not.toThrow();
    const { supplier_item_id: _dropped, ...withoutIt } = PURCHASE.lines[0] as Record<
      string,
      unknown
    >;
    expect(() =>
      parseEvent(envelope("stock.purchase_recorded", { ...PURCHASE, lines: [withoutIt] })),
    ).toThrow();
  });

  it("the invoice total is STATED, not summed — it may legitimately differ from the lines", () => {
    // A document-level discount, or a rounding line the storekeeper did not type. A khata that
    // re-derived its own total would disagree with the paper an owner is holding.
    expect(() =>
      parseEvent(
        envelope("stock.purchase_recorded", { ...PURCHASE, invoice_total_paisa: 675_000 }),
      ),
    ).not.toThrow();
  });
});

// ── §G · commandment 7 — English UI, but user content is Unicode ───────────────────────────────

describe("§G · commandment 7 / 00 §5.6 — user content is Unicode and survives verbatim", () => {
  it("an Urdu wastage reason and note round-trip byte-for-byte", () => {
    const urdu = "خراب ٹماٹر"; // "spoiled tomatoes"
    const note = "صبح کی ڈیلیوری میں ملا";
    const parsed = parseEvent(
      envelope("stock.wastage_recorded", { ...WASTAGE, reason: urdu, note }),
    );
    const payload = parsed.payload as { reason: string; note: string };
    expect(payload.reason).toBe(urdu);
    expect(payload.note).toBe(note);
    // Not merely equal — identical code point for code point, so no normalisation crept in.
    expect([...payload.reason].length).toBe([...urdu].length);
  });

  it("an empty reason is refused — a quick-tag that says nothing is not a tag", () => {
    expect(() =>
      parseEvent(envelope("stock.wastage_recorded", { ...WASTAGE, reason: "" })),
    ).toThrow();
  });

  it("`reason` is an OPEN string — the quick-tag set is 10 §7 layer-2 configuration", () => {
    // The contrast is `cash.drawer_opened.reason`, not `ORDER_REJECTION_REASONS`: closing this set
    // in the kernel would invent an org's configuration as platform law (commandment 2).
    for (const tag of ["spoiled", "dropped", "over_prepped", "زیادہ پک گیا"]) {
      expect(() =>
        parseEvent(envelope("stock.wastage_recorded", { ...WASTAGE, reason: tag })),
      ).not.toThrow();
    }
  });

  it("`note` is optional and, when present, non-empty", () => {
    const { note: _n, ...withoutNote } = { ...WASTAGE, note: "x" };
    expect(() => parseEvent(envelope("stock.wastage_recorded", withoutNote))).not.toThrow();
    expect(() =>
      parseEvent(envelope("stock.wastage_recorded", { ...WASTAGE, note: "" })),
    ).toThrow();
  });
});

// ── §H · 02-F45 / 01-F62 — what these payloads deliberately do NOT carry ───────────────────────

describe("§H · 02-F45 — the envelope owns org, branch and actor; no payload copies one", () => {
  it("none of the three requires an org_id, branch_id or actor_user_id", () => {
    // A payload copy is a second source for one fact that can disagree with the first
    // permanently (01-F1). All three parse without them, which is the checkable half.
    expect(() => parseEvent(envelope("stock.purchase_recorded", PURCHASE))).not.toThrow();
    expect(() => parseEvent(envelope("stock.wastage_recorded", WASTAGE))).not.toThrow();
    expect(() => parseCount(COUNT)).not.toThrow();
    for (const payload of [PURCHASE, WASTAGE, COUNT] as readonly Record<string, unknown>[]) {
      expect(Object.keys(payload)).not.toContain("org_id");
      expect(Object.keys(payload)).not.toContain("branch_id");
      expect(Object.keys(payload)).not.toContain("actor_user_id");
    }
  });

  it("`location_id` is NOT the envelope's branch and is required on all three", () => {
    // 10-F1 puts stock at a 01-F25 location. A storekeeper on the branch till records a delivery
    // INTO the storage location, so the two ids differ and neither can stand in for the other.
    expect(() =>
      parseEvent(envelope("stock.purchase_recorded", { ...PURCHASE, location_id: undefined })),
    ).toThrow();
    expect(() =>
      parseEvent(envelope("stock.wastage_recorded", { ...WASTAGE, location_id: undefined })),
    ).toThrow();
    expect(() => parseCount({ ...COUNT, location_id: undefined })).toThrow();
  });

  it("NO period key rides the count — 10-F28's period is DERIVED, never stamped", () => {
    // ⚠ This CORRECTS `plans/inventory/design.md` §4.8, which says the count "carries the period
    // key it closes". It cannot: a period is opened by the previous count and closed by the next,
    // so stamping one is an ordering read (01-F34), and two devices counting one location would
    // stamp the same key from different premises. The read model derives it from the count set.
    expect(Object.keys(COUNT)).not.toContain("period_id");
    expect(Object.keys(COUNT)).not.toContain("period_key");
    // Loose payloads mean a stray key would PASS rather than fail, so the assertion that bites is
    // in `packages/inventory`: nothing there reads a period key off an event.
  });
});

// ── §I · 00 §6 — additive evolution still works ────────────────────────────────────────────────

describe("§I · 00 §6 — extra fields pass through and are preserved for consumers", () => {
  it("a photo ref lands additively on purchase and wastage without a schema change", () => {
    // 10-N4's deferred photo queue is slice 2. The point of `looseObject` is that landing it is
    // additive rather than a breaking wire change.
    const parsed = parseEvent(
      envelope("stock.wastage_recorded", { ...WASTAGE, photo_ref: "obj://w/1" }),
    );
    expect((parsed.payload as { photo_ref: string }).photo_ref).toBe("obj://w/1");
  });

  it("a non-object payload is still refused on all three", () => {
    for (const type of [
      "stock.purchase_recorded",
      "stock.wastage_recorded",
      "stock.count_recorded",
    ]) {
      expect(() => parseEvent(envelope(type, "not-an-object"))).toThrow();
      expect(() => parseEvent(envelope(type, null))).toThrow();
    }
  });
});
