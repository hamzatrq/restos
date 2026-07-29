// Acceptance tests — T-3, the WIRE layer of `01-F60` (price) and `03-F50` (station).
//
// Authored from spec text ONLY, by a session that has seen no implementation and, deliberately,
// not `plans/wave-1/channel-pricing-and-the-counter-loop.md` either (`24 §3` step 2):
//   `specs/01-kernel-sync.md`      — `01-F60` (the target): every sellable entry carries an
//                                    integer-paisa price per enabled (branch, channel) pair;
//                                    `01-F53` (after capture the catalog is display text only);
//                                    `01-F55` (a tombstone is a marked entry, not an absence);
//                                    `01-F56` (a version number is a claim about CONTENT).
//   `specs/03-kitchen-fulfillment.md` — `03-F50`: `station` joins `kitchen_name` on the catalog
//                                    entry, and INHERITS down the `01-F21` parent chain.
//   `specs/02-pos-app.md`          — `02-F42`: the channel set is closed, and it is a price key.
//   `specs/00-platform-overview.md §6` — money is integer paisa, never a float.
//
// ── RED-AWAITING-IMPLEMENTATION ─────────────────────────────────────────────────────────────
// `CatalogEntryWire` carries neither field today. Because `z.object` STRIPS unknown keys
// (`messages.ts` header: "Unknown keys are stripped"), a price put on an entry today does not
// fail to parse — it VANISHES silently, which is why every positive test here reads the field
// back off the parsed value rather than asserting `success`.
//
// **13 of the 15 tests below are red at authorship time. TWO ARE GREEN and say so on
// themselves** — the two optionality guards, which pass against the pre-`01-F60` schema for the
// uninteresting reason that a field the schema has never heard of is trivially optional. They
// are pinned as regression guards against a later implementation making either field REQUIRED
// (which would refuse a category and invalidate the golden fixtures), not as evidence of a
// closure that does not exist. `oracle-round-2-findings.md` A12 was a header claiming coverage
// the file did not carry; writing down which is which is the cheap defence.
//
// ── PINNED INTERPRETATIONS — where the FRs stop short ────────────────────────────────────────
// Recorded so the implementer can contest the reading rather than discover it. Each is a place
// the spec fixes the SEMANTICS and not the SHAPE.
//
// 1. PRICE SHAPE. `01-F60` says "an integer-paisa price for each (branch, channel) pair" and
//    names no field. Pinned as `prices: { branch_id, channel, price_paisa }[]` — a literal
//    transcription of "pair → price". The nested-record alternative
//    (`{ [branch_id]: { [channel]: paisa } }`) is the simpler one and is named here rather than
//    silently rejected; it was not chosen because `01-F60`'s refusal must name "the entry, the
//    branch and the channel", which reads off a triple directly.
// 2. `prices` AND `station` ARE OPTIONAL ON THE WIRE. `01-F60` puts completeness AT THE WRITER,
//    explicitly ("enforced at the WRITER"), and `03-F50` makes an absent station an INHERITANCE
//    instruction. A wire schema that required either would refuse a category — which carries no
//    price by `01-F60` and usually carries no station either — and would invalidate the
//    committed golden fixtures, which is a `20 §2.7` spec-review event this file does not take.
// 3. `price_paisa` IS BOUNDED TO A SAFE INTEGER, exactly as `sort` already is in this schema and
//    for a stronger reason: `sort` past 2^53 reorders a menu, a price past 2^53 is a money value
//    that cannot be represented exactly (`00 §6`, and law 3 — a total that cannot be represented
//    exactly contributes ZERO). `z.number().int()` alone admits `1e300`.
// 4. NEGATIVE PRICES ARE NOT ASSERTED EITHER WAY. No FR says a price is non-negative, and
//    inventing that bound here would be inventing an FR.
//
// ── DELIBERATELY NOT COVERED, so no coverage is claimed that does not exist ───────────────────
// - COMPLETENESS. "Every enabled (branch, channel) pair is priced" is a WRITER rule (`01-F60`);
//   the wire cannot see the enabled set at all. It is pinned in the gateway suite.
// - RESOLUTION. "the price resolves from the appending device's branch and the order's own
//   channel" is a DEVICE rule; pinned in the sync-client suite.
// - STATION INHERITANCE. `03-F50`'s parent-chain walk needs a store; pinned in the sync-client
//   suite. This file pins only that `station` survives the wire.
// - THE GOLDEN FIXTURES are not touched. `20 §2.7` makes changing one a spec-review event, and
//   under interpretation 2 they stay valid unchanged.

import { describe, expect, it } from "vitest";
import { CatalogEntryWire, decodeMessage, encodeMessage, parseMessage } from "../index.js";

/**
 * `02-F42`'s closed set, in the code-font spelling that FR gives it, transcribed here so the
 * price key is asserted against the SPEC and not against whatever the schema happens to hold.
 */
const SPEC_CHANNELS = ["counter", "phone", "storefront", "whatsapp", "foodpanda"] as const;

/** `02-F1` order TYPES. `02-F42`: "a channel value drawn from that vocabulary is invalid". */
const SPEC_ORDER_TYPES = ["dine_in", "takeaway", "delivery"] as const;

type WirePrice = { branch_id: string; channel: string; price_paisa: number };

/** The two fields `01-F60`/`03-F50` add, read off a parsed entry that does not declare them yet. */
type PricedEntry = {
  kind: string;
  id: string;
  name: string;
  prices?: readonly WirePrice[];
  station?: string | null;
};

const price = (branch_id: string, channel: string, price_paisa: number): WirePrice => ({
  branch_id,
  channel,
  price_paisa,
});

/** A sellable entry priced for one pair. Extra keys are spread LAST so a case can override. */
const sellable = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "item",
  id: "I1",
  name: "Chapli Kebab",
  prices: [price("br-dha", "counter", 45_000)],
  ...extra,
});

/** Parse an entry through the wire schema and read it back as the SHAPE `01-F60` requires. */
const parseEntry = (
  value: unknown,
): { ok: true; entry: PricedEntry } | { ok: false; why: string } => {
  const parsed = CatalogEntryWire.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, why: `${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "invalid"}` };
  }
  return { ok: true, entry: parsed.data as unknown as PricedEntry };
};

/** Assert a REFUSAL that names the field, never a bare "it threw" (§C: a negative test must fail). */
const refuses = (value: unknown, field: string): void => {
  const r = parseEntry(value);
  expect(r.ok, `CatalogEntryWire accepted ${JSON.stringify(value)}`).toBe(false);
  if (r.ok) return;
  expect(r.why, `refused, but not because of ${field}`).toContain(field);
};

describe("01-F60 — the wire carries a price per (branch, channel) pair", () => {
  it("a sellable entry's prices survive the schema verbatim — paisa, branch and channel", () => {
    // RED: `z.object` strips unknown keys, so today this parses successfully and `prices` is
    // GONE. That silent loss is the whole reason this test reads the value back rather than
    // asserting `success` — a schema that does not know the field cannot refuse it either.
    const r = parseEntry(
      sellable({
        prices: [price("br-dha", "counter", 45_000), price("br-saddar", "counter", 38_000)],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.prices).toEqual([
      { branch_id: "br-dha", channel: "counter", price_paisa: 45_000 },
      { branch_id: "br-saddar", channel: "counter", price_paisa: 38_000 },
    ]);
  });

  it("every one of 02-F42's five channels is a legal price key", () => {
    for (const channel of SPEC_CHANNELS) {
      const r = parseEntry(sellable({ prices: [price("br-dha", channel, 45_000)] }));
      expect(r.ok, `channel ${channel} was refused as a price key`).toBe(true);
      if (!r.ok) continue;
      expect(r.entry.prices?.[0]?.channel, `channel ${channel} did not survive parse`).toBe(
        channel,
      );
    }
  });

  it("02-F42 — an ORDER TYPE is not a channel, so it cannot key a price", () => {
    // `dine_in` is the live instance: it sat in `order.created.channel` across 45 Wave-0
    // fixtures until T-2 moved it. A price keyed by it is a price no order can ever resolve.
    for (const orderType of SPEC_ORDER_TYPES) {
      refuses(sellable({ prices: [price("br-dha", orderType, 45_000)] }), "channel");
    }
  });

  it("02-F42 — a channel outside the closed set is refused, not carried", () => {
    refuses(sellable({ prices: [price("br-dha", "kiosk", 45_000)] }), "channel");
    // `02-F1`'s prose writes "WhatsApp"; `02-F42`'s normative list writes `whatsapp`. T-2 pinned
    // the code-font spelling as the wire value — a price key that resolves case-insensitively is
    // two price keys, and one of them silently never matches.
    refuses(sellable({ prices: [price("br-dha", "WhatsApp", 45_000)] }), "channel");
  });

  it("00 §6 — a price is INTEGER paisa; a fractional one is refused", () => {
    // Money is integers-in-a-double and the double is the hazard (law 3). A 449.99 that reaches
    // the wire is captured into `order.line_added.unit_price_paisa` by `01-F60` and frozen there
    // permanently by `01-F53`.
    refuses(sellable({ prices: [price("br-dha", "counter", 44_999.5)] }), "price_paisa");
    refuses(sellable({ prices: [price("br-dha", "counter", Number.NaN)] }), "price_paisa");
  });

  it("00 §6 — a price beyond exact representation is refused, as `sort` already is", () => {
    // `z.number().int()` admits 1e300: `Number.isInteger(1e300)` is true. The schema already
    // bounds `sort` for the weaker reason (a menu reorders); a money value that cannot be
    // represented exactly is law 3's `money_overflow` case arriving one layer too late.
    refuses(sellable({ prices: [price("br-dha", "counter", 2 ** 53)] }), "price_paisa");
  });

  it("a price with no branch names nothing — 01-F60's key has TWO halves", () => {
    refuses(sellable({ prices: [{ channel: "counter", price_paisa: 45_000 }] }), "branch_id");
    refuses(sellable({ prices: [price("", "counter", 45_000)] }), "branch_id");
    refuses(sellable({ prices: [{ branch_id: "br-dha", price_paisa: 45_000 }] }), "channel");
    refuses(sellable({ prices: [{ branch_id: "br-dha", channel: "counter" }] }), "price_paisa");
  });

  it("01-F60 — `prices` is OPTIONAL, because a category carries none [GREEN at authorship]", () => {
    // GREEN before the implementation, for the uninteresting reason that a field the schema has
    // never heard of is trivially optional. Pinned as a regression guard against a later
    // implementation making `prices` REQUIRED, not as evidence of anything.
    //
    // "Non-sellable kinds (`category`, `modifier_group`) carry none." A wire schema that
    // required prices would refuse the entries that legitimately have none — and completeness
    // is a WRITER rule, which is where the gateway suite pins it.
    const r = parseEntry({ kind: "category", id: "C1", name: "Breads" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.prices).toBeUndefined();
  });
});

describe("03-F50 — the wire carries the station, because it is catalog data", () => {
  it("a station survives the schema verbatim, on an item and on a category", () => {
    // RED for the same strip reason as `prices`. `03-F50`: "`station` joins `kitchen_name` and
    // the per-channel visibility flags on the catalog entry" — so it must reach the device the
    // same way `kitchen_name` does, which is this schema.
    const onItem = parseEntry(sellable({ station: "grill" }));
    expect(onItem.ok).toBe(true);
    if (onItem.ok) expect(onItem.entry.station).toBe("grill");

    // The COMMON case per `03-F50`: "a handful of values on categories, not one per dish."
    const onCategory = parseEntry({
      kind: "category",
      id: "C1",
      name: "Breads",
      station: "tandoor",
    });
    expect(onCategory.ok).toBe(true);
    if (onCategory.ok) expect(onCategory.entry.station).toBe("tandoor");
  });

  it("station is OPTIONAL, because absence is the INHERIT instruction [GREEN at authorship]", () => {
    // GREEN before the implementation, same uninteresting reason as the `prices` guard above.
    // Pinned so a later implementation cannot make `station` required and thereby delete
    // `03-F50`'s inheritance, which is expressed ENTIRELY by the field's absence.
    //
    // `03-F50`: "An entry with no `station` inherits its parent's through the `01-F21` chain."
    // Absence is meaningful, so the schema must admit it — and must not coerce it to a value.
    const r = parseEntry(sellable({}));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry.station).toBeUndefined();
  });

  it("an EXPLICIT null station is legal and is not the same as absent", () => {
    // `kitchen_name` and `parent_id` already take `string | null` in this schema: a back office
    // that CLEARS a station sends null, and null must survive so the device can tell "cleared,
    // inherit again" from a field the sender never wrote. Same shape, same reason.
    const r = parseEntry(sellable({ station: null }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry.station).toBeNull();
  });

  it("an empty station is refused — it routes to a station that cannot exist", () => {
    refuses(sellable({ station: "" }), "station");
  });
});

describe("01-F60 / 03-F50 — the fields survive the CODEC, not just the schema", () => {
  const response = (entries: readonly Record<string, unknown>[]): Record<string, unknown> => ({
    v: 1,
    kind: "catalog_response",
    form: "snapshot",
    version: 4,
    entries,
    complete: true,
    next_from: 0,
  });

  const entriesOf = (message: unknown): readonly PricedEntry[] =>
    (message as { entries: readonly PricedEntry[] }).entries;

  it("parseMessage carries prices and station through catalog_response", () => {
    // This is the test that would have caught the field never being added at all: the frame
    // parses either way, and only reading the value back distinguishes "carried" from "stripped".
    const message = response([
      sellable({ station: "grill", prices: [price("br-dha", "foodpanda", 52_000)] }),
    ]);
    const entry = entriesOf(parseMessage(message))[0];
    expect(entry?.station).toBe("grill");
    expect(entry?.prices).toEqual([
      { branch_id: "br-dha", channel: "foodpanda", price_paisa: 52_000 },
    ]);
  });

  it("encode → decode is lossless for prices and station", () => {
    const message = response([
      sellable({
        station: "tandoor",
        prices: [price("br-dha", "counter", 45_000), price("br-saddar", "whatsapp", 47_500)],
      }),
      { kind: "category", id: "C1", name: "Breads", station: "tandoor" },
    ]);
    const round = decodeMessage(encodeMessage(parseMessage(message)));
    expect(round).toEqual(parseMessage(message));
    const [item, category] = entriesOf(round);
    expect(item?.prices).toHaveLength(2);
    expect(item?.prices?.[1]).toEqual({
      branch_id: "br-saddar",
      channel: "whatsapp",
      price_paisa: 47_500,
    });
    expect(category?.station).toBe("tandoor");
    expect(category?.prices).toBeUndefined();
  });

  it("a bad price inside a catalog_response refuses the whole frame", () => {
    // `01-F56`: a version number is a claim about CONTENT. Half a menu applied because one
    // entry was quietly dropped is the divergence that FR calls undetectable at the till.
    expect(() =>
      parseMessage(response([sellable({ prices: [price("br-dha", "dine_in", 45_000)] })])),
    ).toThrow();
    expect(() =>
      parseMessage(response([sellable({ prices: [price("br-dha", "counter", 12.5)] })])),
    ).toThrow();
    // Anchor: the same frame one field away is accepted, so the refusals above are not the
    // fixture being malformed in some other way.
    expect(() => parseMessage(response([sellable({})]))).not.toThrow();
  });
});
