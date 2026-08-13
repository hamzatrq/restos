// Acceptance tests — T-2 (`02-F42`). Authored from spec text ONLY, by a session that has
// seen no implementation and no implementation plan (`24 §3` step 2):
//   `specs/02-pos-app.md`      — `02-F42` (the target), `02-F1` (the two axes it separates)
//   `specs/01-kernel-sync.md`  — `01-F4` (what an off-catalog value must do at emit)
// RED-AWAITING-IMPLEMENTATION: `ORDER_CHANNELS` does not exist and `order.created.channel`
// is still an open string. **Five of the nine tests below are red at authorship time** — the
// three that need the export, and the two that need the enum to refuse something. The other
// four PASS against the pre-`02-F42` schema and are pinned as regression guards, not as
// evidence of the closure: `channel` is already required, an open string already accepts the
// five legal values, already carries both axes, and already survives parse verbatim. Which is
// which is stated on each test, so no test in this file is credited with coverage it does not
// carry.
//
// Pinned interpretations — the places the FRs stop short. Recorded so the implementer can
// contest the reading rather than discover it:
//
// 1. EXPORT NAME. `02-F42` names no symbol. The set is pinned as `ORDER_CHANNELS` by exact
//    analogy with `PAYMENT_METHODS`, which `registry.ts` already declares for the same reason
//    and on the same argument (`02-F12`/`01-F32`) that `02-F42` cites for itself.
// 2. WIRE SPELLING. `02-F1`'s prose writes the fifth tag "WhatsApp"; `02-F42`'s normative list
//    writes `whatsapp` in code font. The code-font spelling is taken as the wire value and the
//    capitalised form is therefore refused — a price key that resolves case-insensitively is
//    two price keys.
// 3. WHAT "AN `01-F4` ERROR" IS. `02-F42` names no error class. `01-F4` puts the payload
//    schemas in `domain` **in Zod** and makes an invalid payload a runtime error, so a refusal
//    is a `ZodError` whose issue path names the offending field. These tests assert that path.
//    Asserting only that something threw cannot tell "refused because the channel is
//    off-catalog" from "refused because the fixture was malformed", and a negative test that
//    cannot distinguish those is the `oracle-round-2-findings.md §C` "guard passed by not
//    looking" pattern.
// 4. SET ORDER IS NOT PINNED. `02-F1` and `02-F42` list the five in the same order, but neither
//    gives the order a meaning, so membership is asserted and sequence is not.
//
// Deliberately NOT covered here, so no coverage is claimed that does not exist:
//
// - The price lookup itself. `02-F42`'s second half — the channel *selects* the price — is
//   `01-F60`'s mechanism and lives on the catalog, which `domain` does not hold. What this file
//   can pin, and does, is the half that is a `domain` fact: the channel a line will price
//   against is the ORDER's own value, carried through parse verbatim and never derived from
//   the emitting device.
// - `order_type`. `02-F42` closes `channel` and says the two axes do not substitute for each
//   other; it does NOT close `order_type`, which remains an open optional string in the
//   registry. Nothing here refuses an off-vocabulary `order_type` — that would be inventing
//   an FR.
// - `order.channel_tagged`. `02-F1` names it alongside `order.created`; it is not in the
//   `01 §4` catalog and `02-F42` constrains only `order.created.channel`. Flagged as a finding,
//   not asserted.
import { describe, expect, it } from "vitest";
import * as domainNs from "../index.js";
import { newId, parseEvent } from "../index.js";

// The one export `02-F42` requires, reached through a namespace cast so this file typechecks
// before the implementation exists; a missing export is then a loud, named failure inside the
// test rather than a module-load crash that takes the whole file's reporting with it.
// (Same device as `merge-schema.test.ts`, T-01-15.)
const maybeExports = domainNs as unknown as {
  ORDER_CHANNELS?: readonly string[];
};

const mustExport = <T>(value: T | undefined, name: string): T => {
  if (value === undefined)
    throw new Error(`@restos/domain does not export ${name} yet (T-2 red-awaiting-implementation)`);
  return value;
};

/**
 * `02-F1`'s channel tags — "channel tags: counter, phone, storefront, WhatsApp, foodpanda" —
 * in the code-font spelling `02-F42` gives them: **`counter`, `phone`, `storefront`,
 * `whatsapp`, `foodpanda`**.
 *
 * Transcribed here so the closed set is asserted against the SPEC rather than against itself.
 * `expect(ORDER_CHANNELS).toEqual(ORDER_CHANNELS)` passes for any five values, including five
 * wrong ones.
 */
const SPEC_CHANNELS = ["counter", "phone", "storefront", "whatsapp", "foodpanda"] as const;

/**
 * `02-F1`'s order **types** — "types: dine-in (table), takeaway, delivery" — in the code-font
 * spelling `02-F42` gives them: `dine_in`, `takeaway`, `delivery`. `02-F42`: "a channel value
 * drawn from that vocabulary is invalid".
 */
const SPEC_ORDER_TYPES = ["dine_in", "takeaway", "delivery"] as const;

const envelope = (type: string, payload: unknown) => ({
  id: newId(),
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
  actor_user_id: newId(),
  lamport_seq: 1,
  device_created_at: 1752800000000,
  branch_created_at: 1752800000000,
  time_basis: "branch" as const,
  server_received_at: null,
  type,
  schema_version: 1,
  payload,
  refs: [] as string[],
});

/**
 * A complete, valid `order.created` payload carrying BOTH `02-F1` axes. Every negative case
 * below is this payload with exactly one field changed, so a refusal can only be attributed to
 * that field.
 */
const orderCreated = (over: Record<string, unknown> = {}) => ({
  order_id: newId(),
  order_type: "dine_in",
  channel: "counter",
  ...over,
});

const channelOf = (payload: unknown): unknown => (payload as { channel?: unknown }).channel;

/** The Zod issue paths a refusal carries (`01-F4`), or `[]` if it carried none. */
const issuePaths = (error: unknown): readonly string[] => {
  const issues = (error as { issues?: readonly { path?: readonly PropertyKey[] }[] } | null)
    ?.issues;
  return Array.isArray(issues) ? issues.map((issue) => (issue.path ?? []).join(".")) : [];
};

/**
 * Asserts that emitting `payload` as `order.created` is refused, AND that the refusal names
 * `channel`. Two separate assertions on purpose: the first fails if nothing threw, the second
 * fails if something threw for an unrelated reason.
 */
const refuse = (payload: Record<string, unknown>, what: string) => {
  let accepted = false;
  let thrown: unknown;
  try {
    parseEvent(envelope("order.created", payload));
    accepted = true;
  } catch (error) {
    thrown = error;
  }
  expect(accepted, `02-F42: order.created must refuse ${what}`).toBe(false);
  expect(
    issuePaths(thrown),
    `01-F4: the refusal of ${what} must name the offending field — got ${String(thrown)}`,
  ).toContain("channel");
};

const refuseChannel = (value: unknown) =>
  refuse(orderCreated({ channel: value }), `channel ${JSON.stringify(value) ?? String(value)}`);

/** The single-variable anchor every negative case rests on: this payload is otherwise valid. */
const anchor = () =>
  expect(
    parseEvent(envelope("order.created", orderCreated())).type,
    "anchor: the base payload must parse, or a refusal below proves nothing",
  ).toBe("order.created");

describe("`channel` is a CLOSED set (02-F42)", () => {
  // RED at authorship: no such export.
  it("02-F42/02-F1: ORDER_CHANNELS is exactly the five channel tags 02-F1 names — no sixth, none missing", () => {
    const channels = mustExport(maybeExports.ORDER_CHANNELS, "ORDER_CHANNELS");
    expect([...channels].sort()).toEqual([...SPEC_CHANNELS].sort());
    expect(
      channels,
      "02-F1 names five channel tags and 02-F42 makes them the whole set",
    ).toHaveLength(5);
  });

  // GREEN at authorship (an open string accepts these too) — the guard is against a closure
  // that overshoots and refuses one of the five it must admit.
  it("02-F42: order.created.channel accepts each of the five, and parse returns the order's own value", () => {
    for (const channel of SPEC_CHANNELS) {
      const event = parseEvent(envelope("order.created", orderCreated({ channel })));
      expect(event.type).toBe("order.created");
      expect(channelOf(event.payload), `${channel} must survive parse verbatim`).toBe(channel);
    }
  });

  // RED at authorship: no such export.
  it("02-F42: the exported set and the set the schema enforces cannot drift — every ORDER_CHANNELS member is accepted", () => {
    // Catches a constant declared WIDER than the enum actually wired into the payload schema:
    // a sixth value that exists to be read but can never be emitted.
    const channels = mustExport(maybeExports.ORDER_CHANNELS, "ORDER_CHANNELS");
    for (const channel of channels) {
      expect(
        parseEvent(envelope("order.created", orderCreated({ channel }))).type,
        `ORDER_CHANNELS declares ${channel}, so order.created must accept it`,
      ).toBe("order.created");
    }
  });

  // RED at authorship: the open string accepts every non-empty one of these.
  it("02-F42: a value outside the set is refused at emit, and the refusal names `channel` (01-F4)", () => {
    anchor();
    // Near-misses, not nonsense: casing, padding, plausible synonyms, and the wrong-shape
    // values a hand-rolled string check would let through. `02-F42`: "order.created.channel
    // accepts nothing else".
    for (const bad of [
      "",
      " ",
      "counter ",
      " counter",
      "Counter",
      "COUNTER",
      "WhatsApp",
      "Whatsapp",
      "food_panda",
      "foodpanda_pk",
      "web",
      "walk_in",
      "pos",
      42,
      null,
      true,
      ["counter"],
      { channel: "counter" },
    ]) {
      refuseChannel(bad);
    }
  });
});

describe("`channel` and `order_type` are different axes (02-F42, 02-F1)", () => {
  // RED at authorship: no such export.
  it("02-F42: the two vocabularies are disjoint — no order type is a channel", () => {
    const channels = mustExport(maybeExports.ORDER_CHANNELS, "ORDER_CHANNELS");
    for (const orderType of SPEC_ORDER_TYPES) {
      expect(
        channels,
        `${orderType} is an order TYPE (02-F1) and a channel drawn from that vocabulary is invalid`,
      ).not.toContain(orderType);
    }
  });

  // RED at authorship: `dine_in` in a `channel` field is exactly what the repo emits today.
  it("02-F42: dine_in / takeaway / delivery are refused as order.created.channel", () => {
    anchor();
    for (const orderType of SPEC_ORDER_TYPES) {
      refuseChannel(orderType);
    }
    // `02-F1` writes the first type "dine-in" in prose; the hyphenated form is no more a
    // channel than the underscored one.
    refuseChannel("dine-in");
  });

  // GREEN at authorship — the guard is against a closure that reaches the wrong field, or
  // that starts deriving one axis from the other.
  it("02-F1/02-F42: an order carries BOTH axes, and neither is derived from the other", () => {
    // A delivery ordered over WhatsApp: the two fields disagree in the ordinary way, and both
    // must survive. If either axis were being inferred from the other this pair could not exist.
    const event = parseEvent(
      envelope("order.created", orderCreated({ order_type: "delivery", channel: "whatsapp" })),
    );
    expect(event.payload).toMatchObject({ order_type: "delivery", channel: "whatsapp" });
  });
});

describe("`channel` is a price key (02-F42, 01-F60)", () => {
  // GREEN at authorship — `channel` has been required since Wave 0. Pinned because `02-F42`
  // is the FR that makes the requirement load-bearing rather than tidy: an order with no
  // channel has no resolvable price under `01-F60`, so optionality here would be a money bug.
  it("02-F42: channel is REQUIRED on order.created — a price key cannot be absent", () => {
    anchor();
    const { channel: _dropped, ...missing } = orderCreated();
    refuse(missing, "an order.created with no channel at all");
  });

  // GREEN at authorship — the guard is against a future "resolve the channel from the device"
  // convenience, which is the exact mistake `02-F42`'s closing paragraph forbids.
  it("02-F42: the channel is the ORDER's, not the emitting device's — a foodpanda order keyed in at the counter stays foodpanda", () => {
    // `02-F42`: "a foodpanda order keyed in at the counter (`C21`, `02-F30`) bills at foodpanda
    // prices — which ... would be lost if the price resolved from the *device* rather than the
    // *order*." What `domain` can hold of that is this: the parsed channel is the payload's,
    // and no envelope field reaches it. The price LOOKUP is `01-F60` and is tested with the
    // catalog, not here.
    const payload = orderCreated({ order_type: "delivery", channel: "foodpanda" });
    const atCounter = parseEvent(envelope("order.created", payload));
    const atAnotherDevice = parseEvent(envelope("order.created", payload));

    expect(
      atCounter.envelope.device_id,
      "anchor: the two emissions must really come from different devices",
    ).not.toBe(atAnotherDevice.envelope.device_id);
    expect(channelOf(atCounter.payload)).toBe("foodpanda");
    expect(channelOf(atAnotherDevice.payload)).toBe("foodpanda");
  });
});
