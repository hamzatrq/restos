/**
 * # `17-F22` / `17-F23` / `17-F24` — the campaign row, its money, and the loyalty arithmetic
 *
 * Three FRs meet in `campaign.ts` and each has one property this file owns:
 *
 * - **`17-F22`** — the row is validated at the WRITER (`01-F75`), and the validation is what stops
 *   a bad campaign reaching a till. `01-F87` (b) refuses a whole artifact on one malformed key, so
 *   a row that parses when it should not is an org whose promotions are wrong everywhere at once.
 * - **`17-F23`** — the counter is ARITHMETIC and the division happens here, at render time, over
 *   two counts a fold projects. `01-F87` forbids a fold reading `every_n`; this module is where
 *   that division is legal.
 * - **`17-F24`** — the benefit's money is `applyRateBps` then `min(cap)`, in that order, and never
 *   a float (`DEC-MONEY-005`, standing law 3).
 *
 * **What this file deliberately does NOT own:** `canDiscount`'s routing (that is
 * `discount-authorization.test.ts`), the fold (that is `packages/sync-client`), and the seam that
 * reaches any of it (that is `apps/pos-electron`).
 */

import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_KINDS,
  type CampaignBenefit,
  type CampaignContext,
  type CampaignRow,
  CampaignRowSchema,
  campaignApplies,
  campaignBenefitPaisa,
  loyaltyAvailable,
  loyaltyOrdersToNextReward,
} from "../campaign";

/** A minimal VALID row. Every case below states only what it changes. */
const row = (over: Partial<CampaignRow> = {}): CampaignRow =>
  ({
    campaign_id: "camp-1",
    kind: "auto_deal",
    status: "active",
    valid_from: null,
    valid_to: null,
    branches: null,
    channels: [],
    item_scope: null,
    min_order_paisa: 0,
    benefit: { form: "percent_bps", value: 1000, item_id: null, cap_paisa: null },
    proof: "none",
    code: null,
    use_limit: "unlimited",
    requires_customer: false,
    every_n: null,
    ...over,
  }) as CampaignRow;

const ctx = (over: Partial<CampaignContext> = {}): CampaignContext => ({
  branch_id: "branch-1",
  channel: "counter",
  business_date: "2026-08-24",
  order_total_paisa: 100_000,
  has_linked_customer: false,
  ...over,
});

describe("§A — `17-F22`'s row is validated at the WRITER, and both directions of each rule bite", () => {
  it("the minimal valid row parses", () => {
    expect(CampaignRowSchema.safeParse(row()).success).toBe(true);
  });

  it("`kind` is CLOSED — an invented kind is refused, not carried through", () => {
    // `17-F22` closes the set at the writer precisely so a resource string an implementation
    // invents is caught here rather than becoming an artifact no device knows how to read
    // (`01-F75`: *"a resource string an implementation invents is a `01-F4`-shaped error one layer
    // down"*).
    expect(CampaignRowSchema.safeParse(row({ kind: "wallet_pass" as never }).kind).success).toBe(
      false,
    );
    for (const kind of CAMPAIGN_KINDS) {
      const candidate = row({
        kind,
        // `17-F14`: an account programme states `every_n`; nothing else may.
        every_n: kind === "account_loyalty" ? 10 : null,
        code: kind === "coupon" ? "ABCD" : null,
      });
      expect(CampaignRowSchema.safeParse(candidate).success, kind).toBe(true);
    }
  });

  it("`17-F14` — an `account_loyalty` row WITHOUT `every_n` is refused", () => {
    // Not an under-specified campaign: a reward whose `N` is absent can never become available,
    // and `17-F23`'s division would have to divide by null.
    const bad = CampaignRowSchema.safeParse(row({ kind: "account_loyalty", every_n: null }));
    expect(bad.success).toBe(false);
  });

  it("`17-F22` — `every_n` on a NON-account kind is refused too, which is the half a validator forgets", () => {
    // The mirror. A number nothing divides by sitting in a published artifact reads like a promise.
    const bad = CampaignRowSchema.safeParse(row({ kind: "auto_deal", every_n: 10 }));
    expect(bad.success).toBe(false);
  });

  it("`17-F22` — a `free_item` benefit must name a catalog entry, and only a `free_item` may", () => {
    const noItem = CampaignRowSchema.safeParse(
      row({ benefit: { form: "free_item", value: 0, item_id: null, cap_paisa: null } }),
    );
    expect(noItem.success, "free_item with no id gives away nothing while reading otherwise").toBe(
      false,
    );
    const strayItem = CampaignRowSchema.safeParse(
      row({ benefit: { form: "percent_bps", value: 1000, item_id: "item-1", cap_paisa: null } }),
    );
    expect(strayItem.success, "an item on a percentage benefit is a second answer").toBe(false);
  });

  it("`17-F10` — a `coupon` row must carry its code", () => {
    expect(CampaignRowSchema.safeParse(row({ kind: "coupon", code: null }).code).success).toBe(
      false,
    );
    expect(CampaignRowSchema.safeParse(row({ kind: "coupon", code: "ABCD" })).success).toBe(true);
  });

  it("`cap_paisa` is REQUIRED-AND-NULLABLE — an omitted cap is refused, a stated `null` is not", () => {
    // The distinction is load-bearing under `17-F24`: the cap is the boundary of a PRE-APPROVAL,
    // so a forgotten cap read as "no cap" is an unbounded discount needing no manager, permanently.
    const omitted = CampaignRowSchema.safeParse({
      ...row(),
      benefit: { form: "percent_bps", value: 1000, item_id: null },
    });
    expect(omitted.success).toBe(false);
    expect(
      CampaignRowSchema.safeParse(
        row({ benefit: { form: "percent_bps", value: 1000, item_id: null, cap_paisa: null } }),
      ).success,
    ).toBe(true);
  });

  it("an UNKNOWN key is refused — an artifact row is a contract, unlike a `looseObject` payload", () => {
    // `01-F75` makes the entries a golden-fixture contract, so an unknown key here is a writer that
    // thinks it published something this reader will honour. The opposite call from `00 §6`'s
    // additive payload evolution, and deliberately so.
    const extra = CampaignRowSchema.safeParse({ ...row(), budget_paisa: 500_000 });
    expect(extra.success, "17-F22 names `budget_paisa` as a REFUSAL, not an omission").toBe(false);
  });
});

describe("§B — `17-F24`'s money: `applyRateBps` then `min(cap)`, in that order", () => {
  const benefit = (over: Partial<CampaignBenefit> = {}): CampaignBenefit => ({
    form: "percent_bps",
    value: 5000,
    item_id: null,
    cap_paisa: null,
    ...over,
  });

  it("a percentage is integer basis points through `applyRateBps`", () => {
    // 50% of Rs 1,500.00. `DEC-MONEY-005` — never `base * 0.5`.
    expect(campaignBenefitPaisa(benefit(), 150_000)).toBe(75_000);
  });

  it("R71's OWN CASE — 50% off capped at PKR 10,000, on a bill above and below the cap", () => {
    // Founder's words: *"some go like 50% off if you use visa signature with a cap of 10,000pkr"*.
    const capped = benefit({ cap_paisa: 1_000_000 });
    // Rs 30,000 bill → 50% is Rs 15,000 → capped to Rs 10,000.
    expect(campaignBenefitPaisa(capped, 3_000_000)).toBe(1_000_000);
    // Rs 12,000 bill → 50% is Rs 6,000, under the cap, so the cap changes nothing.
    expect(campaignBenefitPaisa(capped, 1_200_000)).toBe(600_000);
  });

  it("⚠ THE ORDER IS NOT INTERCHANGEABLE — capping the RATE gives Rs 10,000 off a Rs 100 bill", () => {
    // MUTATION THIS CATCHES: `min(cap)` applied to the rate or returned unconditionally. A
    // 50%-capped-at-10,000 campaign must give Rs 50 off a Rs 100 bill, not Rs 10,000.
    expect(campaignBenefitPaisa(benefit({ cap_paisa: 1_000_000 }), 10_000)).toBe(5_000);
  });

  it("a benefit never exceeds the bill it comes off — `01-F30` has no room for a negative total", () => {
    expect(campaignBenefitPaisa(benefit({ form: "amount_paisa", value: 500_000 }), 100_000)).toBe(
      100_000,
    );
  });

  it("`free_item` answers `null` rather than `0`, because its value lives on the LINE (`01-F53`)", () => {
    // `0` would read as "this benefit is worth nothing" and a caller that forgot to resolve it
    // would silently give away nothing at all. `null` cannot be mistaken for an amount.
    expect(campaignBenefitPaisa(benefit({ form: "free_item", item_id: "item-1" }), 100_000)).toBe(
      null,
    );
  });
});

describe("§C — `17-F22`'s scope predicate, and the two conventions that are NOT the same", () => {
  it("a paused or completed campaign reaches nothing", () => {
    expect(campaignApplies(row({ status: "paused" }), ctx())).toBe(false);
    expect(campaignApplies(row({ status: "completed" }), ctx())).toBe(false);
    expect(campaignApplies(row({ status: "active" }), ctx())).toBe(true);
  });

  it("`branches: null` is the WHOLE ORG and `branches: []` is NO BRANCH — different facts", () => {
    // MUTATION THIS CATCHES: treating an empty array as "unscoped", which reads as tidy and
    // silently turns a campaign a writer scoped to nothing into one that applies everywhere.
    expect(campaignApplies(row({ branches: null }), ctx())).toBe(true);
    expect(campaignApplies(row({ branches: [] }), ctx())).toBe(false);
    expect(campaignApplies(row({ branches: ["branch-1"] }), ctx())).toBe(true);
    expect(campaignApplies(row({ branches: ["branch-2"] }), ctx())).toBe(false);
  });

  it("`channels: []` is EVERY enabled channel — the OPPOSITE convention from `branches`, and both are the spec's", () => {
    expect(campaignApplies(row({ channels: [] }), ctx({ channel: "phone" }))).toBe(true);
    expect(campaignApplies(row({ channels: ["counter"] }), ctx({ channel: "phone" }))).toBe(false);
    expect(campaignApplies(row({ channels: ["counter"] }), ctx({ channel: "counter" }))).toBe(true);
  });

  it("the validity window compares ISO business DATES and derives no timezone (`01-F46`)", () => {
    const window = row({ valid_from: "2026-08-20", valid_to: "2026-08-25" });
    expect(campaignApplies(window, ctx({ business_date: "2026-08-19" }))).toBe(false);
    expect(campaignApplies(window, ctx({ business_date: "2026-08-20" })), "inclusive from").toBe(
      true,
    );
    expect(campaignApplies(window, ctx({ business_date: "2026-08-25" })), "inclusive to").toBe(
      true,
    );
    expect(campaignApplies(window, ctx({ business_date: "2026-08-26" }))).toBe(false);
    // `null` on either end is open-ended, which is what an always-on deal is.
    expect(
      campaignApplies(
        row({ valid_from: null, valid_to: null }),
        ctx({ business_date: "1999-01-01" }),
      ),
    ).toBe(true);
  });

  it("`min_order_paisa` is a floor and `requires_customer` needs `02-F64`'s link", () => {
    expect(
      campaignApplies(row({ min_order_paisa: 100_001 }), ctx({ order_total_paisa: 100_000 })),
    ).toBe(false);
    expect(
      campaignApplies(row({ min_order_paisa: 100_000 }), ctx({ order_total_paisa: 100_000 })),
    ).toBe(true);
    expect(
      campaignApplies(row({ requires_customer: true }), ctx({ has_linked_customer: false })),
    ).toBe(false);
    expect(
      campaignApplies(row({ requires_customer: true }), ctx({ has_linked_customer: true })),
    ).toBe(true);
  });
});

describe("§D — `17-F23`'s arithmetic, and the property that stops an owner re-awarding the org", () => {
  it("`every Nth order` is integer division over the two counts", () => {
    expect(loyaltyAvailable({ eligible: 9, orders_consumed_total: 0n, every_n: 10 })).toBe(0);
    expect(loyaltyAvailable({ eligible: 10, orders_consumed_total: 0n, every_n: 10 })).toBe(1);
    expect(loyaltyAvailable({ eligible: 25, orders_consumed_total: 0n, every_n: 10 })).toBe(2);
  });

  it("a redemption CONSUMES orders, so the counter does not re-award what was already claimed", () => {
    expect(loyaltyAvailable({ eligible: 10, orders_consumed_total: 10n, every_n: 10 })).toBe(0);
    expect(loyaltyAvailable({ eligible: 21, orders_consumed_total: 10n, every_n: 10 })).toBe(1);
  });

  it("⚠ THE PROPERTY `17-F17`'s AMENDMENT EXISTS FOR — moving `N` from 10 to 8 does NOT re-award a past redemption", () => {
    // This is the whole reason `orders_consumed` is a CARRIED FACT and not a reset. A customer
    // with 10 eligible orders who has taken one reward consumed TEN orders, permanently. If an
    // owner then edits the campaign to every 8th order, she must still have nothing available —
    // not `(10 - 0) / 8 = 1`, which is a free coffee for every customer in the org, in a ledger
    // `01-F1` forbids correcting.
    const afterOneRedemption = { eligible: 10, orders_consumed_total: 10n };
    expect(loyaltyAvailable({ ...afterOneRedemption, every_n: 10 })).toBe(0);
    expect(
      loyaltyAvailable({ ...afterOneRedemption, every_n: 8 }),
      "N changed; a redemption already taken still consumes the ten orders it consumed",
    ).toBe(0);
    // And the mirror: had the fold stored a RESET instead, `eligible` would read 0 and the same
    // edit would be harmless — which is why the mutation to watch is the one that stores a reset.
  });

  it("`17-F13`'s partition overdraw yields 0 available, never a negative reward count", () => {
    // Two tills each see ten eligible orders and both redeem; on merge, consumed is twenty.
    // `Math.floor` of a negative would hand back a negative — the clamp is explicit.
    expect(loyaltyAvailable({ eligible: 10, orders_consumed_total: 20n, every_n: 10 })).toBe(0);
  });

  it("the consumed total is a BIGINT at the boundary (standing law 3)", () => {
    // A count that has left the exact-integer range must not silently become a float sum. The
    // fold accumulates in BigInt and this is the one place it narrows.
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 10n;
    expect(loyaltyAvailable({ eligible: 0, orders_consumed_total: huge, every_n: 10 })).toBe(0);
  });

  it("`every_n < 1` throws rather than dividing by zero", () => {
    expect(() => loyaltyAvailable({ eligible: 10, orders_consumed_total: 0n, every_n: 0 })).toThrow(
      RangeError,
    );
  });

  it("`17-F16`'s countdown is 0 exactly when a reward is available — the two arms cannot both be true", () => {
    // The renderer branches on `available > 0` and shows the countdown otherwise, so a countdown
    // that stayed positive while a reward was claimable would put two contradictory sentences one
    // state apart.
    expect(
      loyaltyOrdersToNextReward({ eligible: 10, orders_consumed_total: 0n, every_n: 10 }),
    ).toBe(0);
    expect(loyaltyOrdersToNextReward({ eligible: 0, orders_consumed_total: 0n, every_n: 10 })).toBe(
      10,
    );
    expect(loyaltyOrdersToNextReward({ eligible: 7, orders_consumed_total: 0n, every_n: 10 })).toBe(
      3,
    );
    expect(loyaltyOrdersToNextReward({ eligible: 9, orders_consumed_total: 0n, every_n: 10 })).toBe(
      1,
    );
    // After one redemption at N=10: 12 eligible, 10 consumed → 2 towards the next, 8 to go.
    expect(
      loyaltyOrdersToNextReward({ eligible: 12, orders_consumed_total: 10n, every_n: 10 }),
    ).toBe(8);
  });
});
