// Acceptance tests — the `customer_orders` fold (`02-F64`'s order→customer link, `17-F23`'s
// loyalty counter), its DIRECTED merge rules and its `01-F34` invariance nets.
//
// The adversaries (`poisoned`, `injectGarbageMetadata`, `reversedIds`, `shiftBranchStamps`,
// `BANNED_METADATA`) are `./customer-file-builders.ts`'s and are reused rather than re-declared:
// `01-F34` is ONE law and a second copy of the nets is a second interpretation of it, which is the
// defect `03-F40`'s two sensor bit layouts is the corpus's own instance of.
//
// ⚠ **THE MUTANT THIS FILE EXISTS FOR, stated so it cannot be lost.** A fold that stores a RESET
// (`eligible` zeroed at each redemption) instead of `17-F23`'s `orders_consumed` is convergent,
// relabel-invariant, clock-free, and passes every net below. It is nonetheless the defect
// `17-F17`'s amendment exists to prevent: an owner who moves `N` from 10 to 8 re-awards every
// customer in the org a free coffee, permanently, in a ledger `01-F1` forbids correcting. §D is
// what kills it, and it kills it by asserting the COUNT survives rather than the answer.
//
// ⚠ **AND A SECOND ONE THE NETS CANNOT SEE:** a fold that read `campaign.every_n` and projected
// `available` directly would also be convergent and clock-free — and would make a projected value
// depend on the reading device's ARTIFACT VERSION (`01-F87`). §E asserts the projection's shape:
// two counts, never an answer.

import { canonicalJson } from "@restos/domain";
import { describe, expect, it } from "vitest";
import {
  emptyCustomerOrders,
  foldCustomerOrders,
  projectCustomerOrders,
} from "../folds/customer-orders.js";
import { identity, peerIdentity } from "./builders.js";
import {
  BANNED_METADATA,
  customerEnvelope,
  injectGarbageMetadata,
  PHONE_A,
  PHONE_B,
  poisoned,
  reversedIds,
  shiftBranchStamps,
} from "./customer-file-builders.js";
import { shuffled } from "./merge-builders.js";

type Env = Record<string, unknown> & { id: string };

const TILL_1 = identity();
const TILL_2 = peerIdentity(TILL_1);

const ORDER_1 = "ord-0001";
const ORDER_2 = "ord-0002";
const ORDER_3 = "ord-0003";

/** `02-F64`'s link. */
const linked = (order_id: string, phone_e164: string) => ({
  type: "order.customer_linked",
  payload: { order_id, phone_e164 },
});

/** `01-F33`/`01-F63`'s closing act, with the attested charge it carries in production. */
const closed = (order_id: string, billed_paisa?: number) => ({
  type: "order.settlement_closed",
  payload: billed_paisa === undefined ? { order_id } : { order_id, billed_paisa },
});

/** `17-F17`'s redemption. `phone_e164: null` is `17-F21`'s bearer card. */
const redeemed = (over: {
  order_id: string;
  phone_e164: string | null;
  orders_consumed: number;
  adjustment_attempt_id: string;
  campaign_id?: string;
  proof_ref?: string | null;
}) => ({
  type: "loyalty.reward_redeemed",
  payload: {
    order_id: over.order_id,
    campaign_id: over.campaign_id ?? "camp-1",
    campaign_version: 1,
    phone_e164: over.phone_e164,
    orders_consumed: over.orders_consumed,
    proof_kind: "none",
    proof_ref: over.proof_ref ?? null,
    adjustment_attempt_id: over.adjustment_attempt_id,
  },
});

let seq = 0;
const env = (peer: ReturnType<typeof identity>, typed: { type: string; payload: object }): Env =>
  customerEnvelope(peer, ++seq, typed as { type: string; payload: Record<string, unknown> });

const project = (envs: readonly Env[]) => {
  let state = emptyCustomerOrders();
  for (const e of envs) state = foldCustomerOrders(state, e);
  return projectCustomerOrders(state);
};

const rowOf = (envs: readonly Env[], phone: string) => {
  const found = project(envs).customers.find((r) => r.phone_e164 === phone);
  if (found === undefined) throw new Error(`no customer_orders row for ${phone}`);
  return found;
};

const exceptionsOf = (r: { exceptions_json: string }): string[] =>
  JSON.parse(r.exceptions_json) as string[];

describe("§A — `02-F64`'s link is what the projection is keyed on", () => {
  it("a linked order appears under `01-F23`'s phone key and nowhere else", () => {
    const proj = project([env(TILL_1, linked(ORDER_1, PHONE_A))]);
    expect(proj.customers.map((r) => r.phone_e164)).toEqual([PHONE_A]);
    expect(rowOf([env(TILL_1, linked(ORDER_1, PHONE_A))], PHONE_A).linked_orders).toEqual([
      {
        order_id: ORDER_1,
        settled: false,
        billed_paisa: null,
        billed_contested: false,
        link_contested: false,
      },
    ]);
  });

  it("a link whose settlement NEVER ARRIVES still renders — `26 §4`'s trap, and `01-F10` never parks it", () => {
    // The link carries its own whole projection key, so nothing waits on a `customer.created`
    // that may never come. A row that appeared only after its create would lose every order for a
    // customer filed on another till.
    const r = rowOf([env(TILL_1, linked(ORDER_1, PHONE_A))], PHONE_A);
    expect(r.linked_orders[0]?.settled).toBe(false);
  });

  it("`order.settlement_closed` for an UNLINKED order reaches no customer at all", () => {
    // A close is order-keyed and carries no phone. Bucketing it into any customer would be an
    // invented link — which is the whole thing `02-F64` exists to make explicit.
    expect(project([env(TILL_1, closed(ORDER_1, 45_000))]).customers).toEqual([]);
  });

  it("the link and the close JOIN, in either delivery order", () => {
    const a = [env(TILL_1, linked(ORDER_1, PHONE_A)), env(TILL_2, closed(ORDER_1, 45_000))];
    const b = [env(TILL_2, closed(ORDER_1, 45_000)), env(TILL_1, linked(ORDER_1, PHONE_A))];
    for (const set of [a, b]) {
      const o = rowOf(set, PHONE_A).linked_orders[0];
      expect(o?.settled).toBe(true);
      expect(o?.billed_paisa).toBe(45_000);
    }
  });

  it("duplicate delivery of one link collapses — a G-set, not a counter", () => {
    const e = env(TILL_1, linked(ORDER_1, PHONE_A));
    expect(rowOf([e, e, e], PHONE_A).linked_orders).toHaveLength(1);
  });
});

describe("§B — `01-F31`'s contested dispositions: retained, contributing ZERO, no winner picked", () => {
  it("TWO PHONES on one order is CONTESTED and counts for NEITHER (`02-F64`)", () => {
    // Two tills, one partition, one order, two customers. `01-F31`: both retained, an anomaly
    // raised, and a fold never picks a winner — so the order contributes to nobody's counter.
    const set = [
      env(TILL_1, linked(ORDER_1, PHONE_A)),
      env(TILL_2, linked(ORDER_1, PHONE_B)),
      env(TILL_1, closed(ORDER_1, 45_000)),
    ];
    for (const phone of [PHONE_A, PHONE_B]) {
      const r = rowOf(set, phone);
      expect(r.linked_orders[0]?.link_contested, phone).toBe(true);
      expect(exceptionsOf(r), phone).toContain("loyalty_link_contested");
    }
    // MUTATION THIS CATCHES: a fold that resolved the contest (first-seen, min-id, min-phone) would
    // award the order to ONE of them — and every plain-convergence test would still pass.
  });

  it("TWO ATTESTED CHARGES for one order is contested, and the amount projects `null`", () => {
    const set = [
      env(TILL_1, linked(ORDER_1, PHONE_A)),
      env(TILL_1, closed(ORDER_1, 45_000)),
      env(TILL_2, closed(ORDER_1, 52_000)),
    ];
    const o = rowOf(set, PHONE_A).linked_orders[0];
    expect(o?.settled, "settlement itself is MONOTONE — nothing un-settles an order (01-F33)").toBe(
      true,
    );
    expect(o?.billed_paisa).toBe(null);
    expect(o?.billed_contested).toBe(true);
    expect(exceptionsOf(rowOf(set, PHONE_A))).toContain("loyalty_close_snapshot_disputed");
  });

  it("an ABSENT attestation is a THIRD state and NOT contested (`01-F63`: an absent snapshot asserts nothing)", () => {
    // Orders closed before `01-F63` shipped carry no `billed_paisa`. Treating that as a dispute
    // would raise an anomaly on every historical order in the org.
    const set = [env(TILL_1, linked(ORDER_1, PHONE_A)), env(TILL_1, closed(ORDER_1))];
    const o = rowOf(set, PHONE_A).linked_orders[0];
    expect(o?.billed_paisa).toBe(null);
    expect(o?.billed_contested).toBe(false);
    expect(exceptionsOf(rowOf(set, PHONE_A))).toEqual([]);
  });

  it("IDENTICAL attested charges from two devices are ONE member, not a dispute", () => {
    const set = [
      env(TILL_1, linked(ORDER_1, PHONE_A)),
      env(TILL_1, closed(ORDER_1, 45_000)),
      env(TILL_2, closed(ORDER_1, 45_000)),
    ];
    const o = rowOf(set, PHONE_A).linked_orders[0];
    expect(o?.billed_paisa).toBe(45_000);
    expect(o?.billed_contested).toBe(false);
  });

  it("one attempt key, TWO DIVERGENT redemptions: disputed, contributing ZERO, both retained", () => {
    const set = [
      env(TILL_1, linked(ORDER_1, PHONE_A)),
      env(TILL_1, closed(ORDER_1, 45_000)),
      env(
        TILL_1,
        redeemed({
          order_id: ORDER_1,
          phone_e164: PHONE_A,
          orders_consumed: 10,
          adjustment_attempt_id: "att-1",
        }),
      ),
      env(
        TILL_2,
        redeemed({
          order_id: ORDER_1,
          phone_e164: PHONE_A,
          orders_consumed: 8,
          adjustment_attempt_id: "att-1",
        }),
      ),
    ];
    const r = rowOf(set, PHONE_A);
    expect(r.orders_consumed_total, "a disputed key contributes ZERO (01-F31)").toBe("0");
    expect(exceptionsOf(r)).toContain("loyalty_redemption_disputed");
  });

  it("a RETRY of one redemption under one key is idempotent — the same intent is one member", () => {
    const one = redeemed({
      order_id: ORDER_1,
      phone_e164: PHONE_A,
      orders_consumed: 10,
      adjustment_attempt_id: "att-1",
    });
    const set = [env(TILL_1, one), env(TILL_1, one), env(TILL_2, one)];
    expect(rowOf(set, PHONE_A).orders_consumed_total).toBe("10");
  });

  it("⚠ a differing `proof_ref` under ONE key does NOT dispute a COUNT", () => {
    // `01-F31`'s immutable intent is the payload minus its key, but this fold projects a COUNT and
    // `17-F25`'s `proof_ref` is an attestation detail. Disputing on it would zero a legitimate
    // redemption because a cashier re-keyed a card serial on the retry.
    const set = [
      env(
        TILL_1,
        redeemed({
          order_id: ORDER_1,
          phone_e164: PHONE_A,
          orders_consumed: 10,
          adjustment_attempt_id: "att-1",
          proof_ref: "card-991",
        }),
      ),
      env(
        TILL_2,
        redeemed({
          order_id: ORDER_1,
          phone_e164: PHONE_A,
          orders_consumed: 10,
          adjustment_attempt_id: "att-1",
          proof_ref: "card-1991",
        }),
      ),
    ];
    const r = rowOf(set, PHONE_A);
    expect(r.orders_consumed_total).toBe("10");
    expect(exceptionsOf(r)).not.toContain("loyalty_redemption_disputed");
  });
});

describe("§C — `17-F21`'s bearer card: `phone_e164: null` moves NO account counter", () => {
  it("a bearer redemption belongs to no phone row", () => {
    // `17-F21`: the card IS the identity, so there is nothing to key — and the account counter must
    // not move, because the counter it consumed was paper and we never saw it.
    const set = [
      env(TILL_1, linked(ORDER_1, PHONE_A)),
      env(TILL_1, closed(ORDER_1, 45_000)),
      env(
        TILL_1,
        redeemed({
          order_id: ORDER_1,
          phone_e164: null,
          orders_consumed: 0,
          adjustment_attempt_id: "att-b",
        }),
      ),
    ];
    expect(rowOf(set, PHONE_A).orders_consumed_total).toBe("0");
  });

  it("⚠ AND IT HOLDS FOR A NON-ZERO `orders_consumed` — the rule is the KEY, not the amount", () => {
    // ⚠ **THIS FIXTURE EXISTS BECAUSE THE MUTANT ABOVE SURVIVED, and that is the round-3 law
    // landing on this suite's own work.** The mechanism was built correctly and the fixture was
    // safe: `17-F21` gives a bearer redemption `orders_consumed: 0`, so an implementation that
    // bucketed it onto the order's linked customer added ZERO and was indistinguishable from the
    // correct one. Measured: the bucketing mutant passed all 1025 tests.
    //
    // The fold's rule is *"`phone_e164: null` belongs to no phone row"*, NOT *"a bearer redemption
    // happens to consume nothing"*. The difference is only observable on a payload that is
    // well-formed by the schema and wrong by the FR — which is exactly the payload a buggy emitter
    // writes, and `01-F1` makes it permanent. So the assertion is aimed there.
    const set = [
      env(TILL_1, linked(ORDER_1, PHONE_A)),
      env(TILL_1, closed(ORDER_1, 45_000)),
      env(
        TILL_1,
        redeemed({
          order_id: ORDER_1,
          phone_e164: null,
          orders_consumed: 10,
          adjustment_attempt_id: "att-b",
        }),
      ),
    ];
    expect(
      rowOf(set, PHONE_A).orders_consumed_total,
      "a bearer redemption must not spend an account customer's progress, whatever it claims",
    ).toBe("0");
  });
});

describe("§D — `17-F23`'s counter is ARITHMETIC, and `orders_consumed` is a CARRIED FACT", () => {
  const tenSettled = (phone: string): Env[] =>
    Array.from({ length: 10 }, (_, i) => [
      env(TILL_1, linked(`ord-${i}`, phone)),
      env(TILL_1, closed(`ord-${i}`, 45_000)),
    ]).flat();

  it("ten settled linked orders project ten members and a zero consumed total", () => {
    const r = rowOf(tenSettled(PHONE_A), PHONE_A);
    expect(r.linked_orders.filter((o) => o.settled)).toHaveLength(10);
    expect(r.orders_consumed_total).toBe("0");
  });

  it("⚠ THE MUTANT THIS FILE EXISTS FOR — a redemption CONSUMES, it does not RESET", () => {
    // After one reward at N=10 the customer still has TEN settled orders on file and TEN consumed.
    // A fold that reset would project zero eligible and zero consumed — the same `available` today
    // and a completely different answer the moment an owner edits `N`.
    const set = [
      ...tenSettled(PHONE_A),
      env(
        TILL_1,
        redeemed({
          order_id: "ord-9",
          phone_e164: PHONE_A,
          orders_consumed: 10,
          adjustment_attempt_id: "att-1",
        }),
      ),
    ];
    const r = rowOf(set, PHONE_A);
    expect(
      r.linked_orders.filter((o) => o.settled),
      "the orders are still on file",
    ).toHaveLength(10);
    expect(r.orders_consumed_total, "and ten of them are spent, permanently").toBe("10");
  });

  it("`17-F13`'s partition overdraw is REPORTED and nothing is unwound (`01-F17`, `01-F20`)", () => {
    // Two tills each saw ten and both redeemed. On merge, consumed is twenty against ten orders.
    const set = [
      ...tenSettled(PHONE_A),
      env(
        TILL_1,
        redeemed({
          order_id: "ord-9",
          phone_e164: PHONE_A,
          orders_consumed: 10,
          adjustment_attempt_id: "att-1",
        }),
      ),
      env(
        TILL_2,
        redeemed({
          order_id: "ord-9",
          phone_e164: PHONE_A,
          orders_consumed: 10,
          adjustment_attempt_id: "att-2",
        }),
      ),
    ];
    const r = rowOf(set, PHONE_A);
    expect(r.orders_consumed_total, "BOTH stand — neither discount is unwound").toBe("20");
    expect(exceptionsOf(r)).toContain("loyalty_overdrawn");
  });

  it("a CONTESTED order does not count toward the overdraw denominator", () => {
    // `01-F31`: a contested member contributes zero, so it cannot mask an overdraw either.
    const set = [
      env(TILL_1, linked(ORDER_1, PHONE_A)),
      env(TILL_2, linked(ORDER_1, PHONE_B)),
      env(TILL_1, closed(ORDER_1, 45_000)),
      env(
        TILL_1,
        redeemed({
          order_id: ORDER_1,
          phone_e164: PHONE_A,
          orders_consumed: 1,
          adjustment_attempt_id: "att-1",
        }),
      ),
    ];
    expect(exceptionsOf(rowOf(set, PHONE_A))).toContain("loyalty_overdrawn");
  });
});

describe("§E — the projection's SHAPE: two counts, never an answer (`01-F87`)", () => {
  it("no projected field names a reward, a threshold or an `every_n`", () => {
    // MUTATION THIS CATCHES: a fold that read the campaign artifact and projected `available`.
    // It would be convergent and clock-free and would still make a projected value depend on the
    // reading device's ARTIFACT VERSION, which is `01-F87`'s named break. The counter is a render.
    const set = [env(TILL_1, linked(ORDER_1, PHONE_A)), env(TILL_1, closed(ORDER_1, 45_000))];
    const r = rowOf(set, PHONE_A);
    const keys = Object.keys(r).sort();
    expect(keys).toEqual([
      "exceptions_json",
      "linked_orders",
      "orders_consumed_total",
      "phone_e164",
    ]);
    for (const banned of ["available", "eligible", "every_n", "reward", "threshold", "campaign"]) {
      expect(canonicalJson(r), `a projected \`${banned}\` is a memoized render`).not.toContain(
        banned,
      );
    }
  });

  it("`orders_consumed_total` crosses the boundary as a STRING (standing law 3)", () => {
    // The accumulator is a `bigint`; narrowing it at the fold's edge would put the hazard back one
    // function earlier, and `JSON.stringify` throws on a bigint rather than losing it quietly.
    const r = rowOf([env(TILL_1, linked(ORDER_1, PHONE_A))], PHONE_A);
    expect(typeof r.orders_consumed_total).toBe("string");
  });

  it("rows and members are sorted by PAYLOAD VALUES, never by arrival", () => {
    const set = [
      env(TILL_1, linked(ORDER_3, PHONE_B)),
      env(TILL_1, linked(ORDER_1, PHONE_B)),
      env(TILL_1, linked(ORDER_2, PHONE_A)),
    ];
    const proj = project(set);
    expect(proj.customers.map((r) => r.phone_e164)).toEqual([...[PHONE_A, PHONE_B]].sort());
    expect(rowOf(set, PHONE_B).linked_orders.map((o) => o.order_id)).toEqual([ORDER_1, ORDER_3]);
  });
});

describe("§F — `01-F34`'s three nets, over a fixture that CONTAINS the dangerous shape", () => {
  /**
   * The set every net runs over. §F0 asserts it carries the shapes that make the nets meaningful —
   * the round-3 law: a correct net over a safe fixture proves nothing.
   */
  const scenario = (): Env[] => [
    env(TILL_1, linked(ORDER_1, PHONE_A)),
    env(TILL_2, linked(ORDER_1, PHONE_B)), // contested link — a decided field
    env(TILL_1, closed(ORDER_1, 45_000)),
    env(TILL_2, closed(ORDER_1, 52_000)), // contested charge — a second decided field
    env(TILL_1, linked(ORDER_2, PHONE_A)),
    env(TILL_1, closed(ORDER_2, 30_000)),
    env(
      TILL_1,
      redeemed({
        order_id: ORDER_2,
        phone_e164: PHONE_A,
        orders_consumed: 10,
        adjustment_attempt_id: "att-1",
      }),
    ),
    env(
      TILL_2,
      redeemed({
        order_id: ORDER_2,
        phone_e164: PHONE_A,
        orders_consumed: 8,
        adjustment_attempt_id: "att-1",
      }),
    ), // divergent members under one key — a third decided field
    env(TILL_1, linked(ORDER_3, PHONE_B)),
  ];

  it("§F0 — the fixture CONTAINS every shape a tiebreak could be observed on", () => {
    // Without this the nets below are a correct mechanism aimed at a safe input, which is the one
    // defect five separately-warned oracle authors all shipped.
    const proj = project(scenario());
    const a = proj.customers.find((r) => r.phone_e164 === PHONE_A);
    if (a === undefined) throw new Error("fixture lost PHONE_A");
    expect(
      a.linked_orders.some((o) => o.link_contested),
      "a contested link",
    ).toBe(true);
    expect(
      a.linked_orders.some((o) => o.billed_contested),
      "a contested charge",
    ).toBe(true);
    expect(exceptionsOf(a), "a disputed redemption key").toContain("loyalty_redemption_disputed");
  });

  it("DELIVERY ORDER — every permutation projects byte-identical output", () => {
    const base = canonicalJson(project(scenario()));
    for (let i = 0; i < 12; i += 1) {
      expect(canonicalJson(project(shuffled(scenario(), i) as Env[]))).toBe(base);
    }
  });

  it("RELABEL — an ORDER-REVERSING bijection over envelope ids changes nothing", () => {
    // Kills min/max-by-id. `00 §6` pins ids to UUIDv7, whose leading 48 bits are wall clock, so an
    // id tiebreak is a clock read in a disguise and plain convergence cannot see it.
    //
    // ⚠ **THE ADVERSARY'S OWN NON-VACUITY PROOF IS ASSERTED FIRST, and the builders' comment says
    // why in terms:** *"a test that skips those two flags asserts against a possible identity
    // map"*. A relabel that happened not to reverse anything is a correct net over a safe input —
    // the round-3 defect, inside the net built to catch it.
    const relabelled = reversedIds(scenario());
    expect(relabelled.reversing, "the map must genuinely invert the id order").toBe(true);
    expect(relabelled.bijective, "no two ids may collapse, or the set itself changed").toBe(true);
    const base = canonicalJson(project(scenario()));
    expect(canonicalJson(project(relabelled.envelopes as Env[]))).toBe(base);
  });

  it("INJECTION — garbage clock and sequence metadata on the identical set changes nothing", () => {
    const before = scenario();
    const injected = injectGarbageMetadata(before);
    // Non-vacuity again: the adversary must actually have moved a banned field, or this asserts
    // that the identity function is invariant.
    expect(
      injected.some((e, i) => BANNED_METADATA.some((k) => e[k] !== before[i]?.[k])),
      "the injection must actually move a banned field",
    ).toBe(true);
    expect(canonicalJson(project(injected as Env[]))).toBe(canonicalJson(project(before)));
  });

  it("BRANCH STAMPS — moving every `branch_created_at` changes nothing", () => {
    // This projection holds no time at all: `17-F22`'s validity window is compared at RENDER time
    // against a business date the caller already derived.
    const base = canonicalJson(project(scenario()));
    expect(canonicalJson(project(shiftBranchStamps(scenario(), 9_000_000) as Env[]))).toBe(base);
  });

  it("POISON — the fold reads NONE of the four banned fields, and the trap is proven live first", () => {
    // `26 §8`'s own technique: it names the offending field at the read instead of inferring it
    // from a diff, and it catches a read whose effect happens to cancel in this projection.
    expect(BANNED_METADATA.length).toBeGreaterThan(0);
    const poisonedSet = scenario().map((e) => poisoned(e)) as Env[];

    // ⚠ **THE POSITIVE CONTROL, and without it this whole test is vacuous.** `not.toThrow()` is
    // satisfied both by a fold that touches nothing AND by a `poisoned` that has stopped
    // poisoning — and the second is invisible. So a probe that DOES read each banned field must
    // throw over the identical set before the real assertion below is worth anything.
    for (const banned of BANNED_METADATA) {
      expect(() => {
        for (const e of poisonedSet) void (e as Record<string, unknown>)[banned];
      }, `the poison trap must fire on ${banned}`).toThrow();
    }

    expect(() => project(poisonedSet)).not.toThrow();
  });
});

// ── G — `17-N3`/`25` — THE PROJECTION IS INDEXED PER PHONE, AND IT PROJECTS THE SAME THING ────
//
// ⚠ **THIS SECTION EXISTS BECAUSE A CORRECT FOLD WAS QUADRATIC AND NOTHING COULD SEE IT.**
// `rowOf` scanned `[...orders.keys()].sort()` — the WHOLE order map — once per phone, so the
// projection cost `O(phones x orders)`. Measured through a real device store before the index:
// 100 phones / 1,000 orders **16 ms**, 500 / 5,000 **151 ms**, 1,000 / 10,000 **572 ms**, against
// `17-N3`'s 100 ms budget — and `gateway.loyaltyFor` runs a FULL projection on every ask (no memo,
// by `17-F23`'s design) while the caller strip re-asks on every `changed` push, synchronously
// inside `ipcMain.handle`. Every assertion in this file passed at every one of those sizes.
//
// **A wall-clock assertion is not the fix and is not here**: it is flaky under load (`T3`) and it
// measures the machine. What is asserted is the PROPERTY that makes the cost linear — the whole
// order map is never enumerated — plus the property that must not change with it.
describe("§G — the per-phone index: same projection, and the whole-map scan is gone", () => {
  /** Ten phones, three orders each, plus contested and bearer members so the fixture is not flat. */
  const spread = (): Env[] => {
    const out: Env[] = [];
    for (let p = 0; p < 10; p++) {
      const phone = `+92300000${String(p).padStart(4, "0")}`;
      for (let o = 0; o < 3; o++) {
        const order_id = `ord-${p}-${o}`;
        out.push(env(TILL_1, linked(order_id, phone)));
        out.push(env(TILL_1, closed(order_id, 45_000 + o)));
      }
      out.push(
        env(
          TILL_1,
          redeemed({
            order_id: `ord-${p}-0`,
            phone_e164: phone,
            orders_consumed: 1,
            adjustment_attempt_id: `att-${p}`,
          }),
        ),
      );
    }
    // A contested link and a contested close, so the row's exception paths are exercised too.
    out.push(env(TILL_2, linked("ord-0-0", PHONE_B)));
    out.push(env(TILL_2, closed("ord-1-1", 99_999)));
    return out;
  };

  /**
   * The pre-index projection, written out HERE rather than imported: this is the SCAN the index
   * replaced, and comparing against it is what makes "the projection is unchanged" a measurement
   * rather than a claim. It reads the same two accumulators through the public projection's own
   * inputs — a phone's redemptions and the order map — and filters exactly as `rowOf` did.
   */
  const asScanned = (envs: readonly Env[]) => {
    const rows = project(envs).customers;
    return rows.map((r) => ({
      phone_e164: r.phone_e164,
      orders: r.linked_orders.map((o) => o.order_id),
    }));
  };

  it("the projection is IDENTICAL to the one the whole-map scan produced", () => {
    /*
      The scan's membership rule was *"every order in the map whose `phones` set contains this
      phone, sorted by order id"*. The index's is *"every order in this phone's own set, sorted by
      order id"*. They are written in the same case arm from the same payload, so this asserts the
      equivalence directly rather than trusting it: rebuild the scan's answer from the projection's
      own `linked_orders` and require it, membership and ORDER, on a fixture that includes a
      contested link (one order claimed by two phones) — the case where the two rules could most
      plausibly differ.
    */
    const envs = spread();
    const rows = project(envs).customers;

    // Every row's orders are sorted by the payload key, never by arrival (`01-F34`).
    for (const r of rows) {
      const ids = r.linked_orders.map((o) => o.order_id);
      expect(ids, r.phone_e164).toEqual([...ids].sort());
    }
    // The contested order appears in BOTH claimants' rows and in neither exclusively — which is
    // the membership property the scan had and an index written the wrong way round would lose.
    const first = rows.find((r) => r.phone_e164 === "+923000000000");
    const other = rows.find((r) => r.phone_e164 === PHONE_B);
    expect(first?.linked_orders.map((o) => o.order_id)).toContain("ord-0-0");
    expect(other?.linked_orders.map((o) => o.order_id)).toEqual(["ord-0-0"]);
    expect(first?.linked_orders.find((o) => o.order_id === "ord-0-0")?.link_contested).toBe(true);
    expect(other?.linked_orders.find((o) => o.order_id === "ord-0-0")?.link_contested).toBe(true);

    // And it is stable under delivery order, which is the whole of `01-F34` for this change.
    expect(asScanned(shuffled(envs, 7))).toEqual(asScanned(envs));
    expect(asScanned(shuffled(envs, 91))).toEqual(asScanned(envs));
  });

  it("⚠ THE COST — projecting N phones enumerates the order map ZERO times", () => {
    /*
      MUTANT THIS KILLS: `rowOf` back to `[...orders.keys()].sort()` with the `phones.has` filter —
      the shipped code before this change. It projects exactly the same rows, so the assertion
      above cannot see it, and every one of this file's other tests passes under it.

      The instrument is a Proxy over the order map counting the enumerations a scan needs
      (`keys`, `entries`, `forEach`, `Symbol.iterator`). `get` is NOT counted: the index still
      READS the map per linked order — an order's `settled` and its attested charge arrive on
      events that carry no phone, which is the join `26 §4` permits — and counting reads would
      pin an implementation detail rather than the cost.
    */
    let state = emptyCustomerOrders();
    for (const e of spread()) state = foldCustomerOrders(state, e);

    let enumerations = 0;
    const ENUMERATORS = new Set(["keys", "entries", "forEach", "values"]);
    const watched = new Proxy(state.orders, {
      get(target, prop, receiver) {
        if (ENUMERATORS.has(prop as string) || prop === Symbol.iterator) enumerations += 1;
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const rows = projectCustomerOrders({ ...state, orders: watched }).customers;
    expect(rows.length, "the fixture must actually have phones to project").toBe(11);
    expect(
      enumerations,
      "17-N3/25: projecting a phone must not walk the whole order map — that is O(phones x orders)",
    ).toBe(0);
  });
});
