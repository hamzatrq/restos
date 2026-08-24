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

describe("§A2 — `17-F22`'s percentage bound, the arm the row did not have", () => {
  it("⚠ `percent_bps` ABOVE 10,000 is REFUSED at the writer — a seed typo is not a 100% discount", () => {
    /*
      THE DEFECT VERBATIM (August 2026, adversarial review): the row carried five `superRefine`
      arms and no upper bound on the rate, so `500000` typed for `5000` parsed **clean**. It then
      reaches `campaignBenefitPaisa`, which clamps to the base — and `17-F24` pre-approves a
      within-bounds citation *regardless of magnitude*, so the result is the **entire bill**
      discounted with no manager, permanently (`01-F1`). Measured on the shipped resolver before
      the fix: `malformed: false`, one row, whole bill within bounds.

      10,000 bps is 100%, which is the largest discount that can exist — a benefit can never
      exceed what it is taken off.
    */
    const typo = row({
      benefit: { form: "percent_bps", value: 500_000, item_id: null, cap_paisa: null },
    });
    const parsed = CampaignRowSchema.safeParse(typo);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("percent_bps");

    // BOTH DIRECTIONS, which is this file's own convention: the boundary itself is legal.
    expect(
      CampaignRowSchema.safeParse(
        row({ benefit: { form: "percent_bps", value: 10_000, item_id: null, cap_paisa: null } }),
      ).success,
      "100% is a real campaign — a giveaway is not a malformed row",
    ).toBe(true);
    expect(
      CampaignRowSchema.safeParse(
        row({ benefit: { form: "percent_bps", value: 10_001, item_id: null, cap_paisa: null } }),
      ).success,
      "one basis point over 100% is refused",
    ).toBe(false);

    // ...and it is REFUSED rather than clamped (`01-F75`): a writer that published 5000% did not
    // mean 100%, and honouring a number nobody typed is how a bad row becomes invisible.
    expect(parsed.data).toBeUndefined();
  });

  it("the bound is on the PERCENTAGE form only — a large `amount_paisa` is a real campaign", () => {
    // The arm must not spread to the other form: Rs 50,000 off is an ordinary big promotion, and
    // 50,000 paisa is not 500%. A guard aimed at the wrong field is this repo's most-recorded
    // test defect, so both are pinned.
    expect(
      CampaignRowSchema.safeParse(
        row({
          benefit: { form: "amount_paisa", value: 5_000_000, item_id: null, cap_paisa: null },
        }),
      ).success,
    ).toBe(true);
  });

  it("⚠ `amount_paisa` and `cap_paisa` are bounded by the MONEY DOMAIN and by nothing narrower", () => {
    /*
      A re-review asked why `percent_bps` carries a stated ceiling and these two carry none —
      *"same class, one field away"*, since `campaignBenefitPaisa`'s `min(gross, base)` means a
      mistyped `4500000` for `45000` yields the whole bill, pre-approved.

      **The answer is that the two are not the same class, and this test is the answer written
      down** (`17-F22` as amended). 10,000 bps is a MATHEMATICAL maximum — a percentage above 100%
      describes a discount larger than the thing it is taken off, so the row is refusable without
      knowing anything about the restaurant. An absolute amount has no such maximum: Rs 45,000 off
      is a mistype at a chai stall and a Tuesday promotion at a wedding hall, and a refusal would
      have to be a number this FR invented (commandment 2). What CAN be stated is the domain:
      integer paisa a `Paisa` holds exactly (`DEC-MONEY-005`, standing law 3).

      **It is not decoration — it is the assertion that keeps a `paisa()` RangeError off the
      authorization path.** `campaignBenefitPaisa` calls `paisa(benefit.value)`, which throws on a
      non-safe integer, and its shipping caller is inside `apps/pos-electron`'s write guard: a row
      the schema admitted but the money type cannot hold would turn a discount into an exception,
      which is commandment 4 (`01-F17`) broken by a promotion. Measured: `1e15` parses (it is a
      safe integer), `1e16` and `1e30` are refused.
    */
    const amountAt = (value: number) =>
      CampaignRowSchema.safeParse(
        row({ benefit: { form: "amount_paisa", value, item_id: null, cap_paisa: null } }),
      ).success;
    expect(amountAt(1e15), "a safe integer is a legal amount, however large").toBe(true);
    expect(amountAt(Number.MAX_SAFE_INTEGER), "the boundary itself is legal").toBe(true);
    expect(amountAt(Number.MAX_SAFE_INTEGER + 2), "one step past the domain is refused").toBe(
      false,
    );
    expect(amountAt(1e30), "and a number no drawer could hold is refused").toBe(false);
    // `cap_paisa` is the same field one level down and is asserted separately, because the arm
    // that bounds one does not bound the other — which is the shape of the finding that produced
    // this test in the first place.
    const capAt = (cap_paisa: number) =>
      CampaignRowSchema.safeParse(
        row({ benefit: { form: "percent_bps", value: 5000, item_id: null, cap_paisa } }),
      ).success;
    expect(capAt(1e15)).toBe(true);
    expect(capAt(1e30)).toBe(false);
    // And the money helper agrees with the schema at the boundary rather than throwing behind it.
    expect(
      campaignBenefitPaisa(
        { form: "amount_paisa", value: Number.MAX_SAFE_INTEGER, item_id: null, cap_paisa: null },
        300_000,
      ),
      "clamped to the base, never a RangeError on the write path",
    ).toBe(300_000);
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

  it("⚠ BLIND TO `item_scope`, `use_limit`, `proof` AND `kind` ON PURPOSE — the refusal is the CALLER's", () => {
    /*
      ⚠ **THIS ASSERTION EXISTS BECAUSE `campaign.ts` CLAIMED IT ALREADY DID (`L11`, re-review
      August 2026).** `campaignApplies`'s docstring said *"`campaign-model.test.ts` §D pins that
      this function is blind to them ON PURPOSE"* — and no section of this file mentioned
      `item_scope` outside a fixture default. A protection claimed in prose retires the assertion
      the next session would have written; this is that assertion, and the pointer now names the
      section it is in.

      The property is not cosmetic and both directions of it matter. `17-F24` as amended REFUSES
      these rows, and the refusal lives at `apps/pos-electron`'s citation resolver because that is
      the caller with the order's lines, its history and the cashier's hands. If an arm were added
      HERE — returning `false` for a scoped row, which is the tempting "fix" — the caller's refusal
      would become untestable (every such row would already be out of reach), the offer list and
      the citation would agree for the wrong reason, and **nothing would be scoped**: the base
      would still be the order's total for every row that survived.

      So: a row that sets all four still REACHES the order. What it must not get is a BOUND, and
      that is `loyalty-seam.test.ts` §D's assertion, one package over.
    */
    const reaching = ctx({ order_total_paisa: 100_000, has_linked_customer: true });
    expect(campaignApplies(row({ item_scope: ["item-pizza"] }), reaching)).toBe(true);
    expect(campaignApplies(row({ item_scope: [] }), reaching)).toBe(true);
    for (const use_limit of ["once_per_order", "once_per_customer"] as const) {
      expect(campaignApplies(row({ use_limit }), reaching), use_limit).toBe(true);
    }
    for (const proof of ["code", "bearer_card", "attested"] as const) {
      expect(campaignApplies(row({ proof }), reaching), proof).toBe(true);
    }
    // And the KIND, which the caller's guard was widened to on re-review: an `account_loyalty`
    // row whose reward has NOT been earned still reaches the order here, because this function
    // holds neither of `17-F23`'s two counts and an arm keyed on the kind would be a guess.
    expect(
      campaignApplies(row({ kind: "account_loyalty", every_n: 10 }), reaching),
      "reaching is not the same question as earned",
    ).toBe(true);
    expect(campaignApplies(row({ kind: "coupon", code: "ABCD" }), reaching)).toBe(true);
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

  it("⚠ OVERDRAWN — the countdown counts back from the DEBT, and does not stick at `every_n`", () => {
    /*
      `17-F13`'s ruled partition outcome: two tills each redeem against the same ten orders, so
      consumed is twenty against ten eligible. **The countdown was wrong there and this assertion
      is why it is not now** (August 2026, adversarial review): it read
      `towards = remaining <= 0n ? 0n : remaining % every_n`, so it answered `every_n` for the
      WHOLE range of the overdraw and stayed there — eligible 10 through 19 all returned 10, where
      the truth is 20 then 11.

      The correct number is `every_n − remaining`, which needs no branch at all: this function is
      reached only when `available` is 0, i.e. when `remaining < every_n`, and the subtraction is
      the answer on both sides of zero. A cashier reading *"10 more orders"* to a customer who
      needs twenty is a promise the till will not keep.

      It is LATENT today and asserted anyway, because nothing emits `loyalty.reward_redeemed` yet
      (`17-F23` as amended) so consumed is always zero — which is exactly the condition under
      which a wrong arm survives a whole wave.
    */
    const at = (eligible: number, consumed: bigint) =>
      loyaltyOrdersToNextReward({ eligible, orders_consumed_total: consumed, every_n: 10 });
    expect(at(10, 20n), "ten eligible against twenty consumed").toBe(20);
    expect(at(19, 20n), "one short of clearing the debt").toBe(11);
    expect(at(20, 20n), "the debt exactly cleared — a full cycle to go").toBe(10);
    expect(at(29, 20n)).toBe(1);
    // ...and the boundary the other way: at 30 a reward IS available, so the countdown is 0.
    expect(at(30, 20n)).toBe(0);
    // The whole range is monotone decreasing by one, which is what "counts back from the debt"
    // means and what a stuck arm cannot produce.
    const walk = Array.from({ length: 21 }, (_, i) => at(10 + i, 20n));
    expect(walk).toEqual([
      20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    ]);
  });

  it("⚠ AN OVERDRAW PAST 2^53 IS CLAMPED — the countdown never returns a float (standing law 3)", () => {
    /*
      The fix above opened the other end and a re-review measured it: `every_n − Number(remaining)`
      narrows a BigInt the fold went to BigInt to protect. `registry.ts` bounds
      `loyalty.reward_redeemed.orders_consumed` by `int().nonnegative()` alone, so
      `orders_consumed_total: 10n ** 30n` is reachable — and the countdown answered **`1e+30`**,
      a non-safe float from a function whose contract is *a count of orders*.

      `Number(bigint)` past 2^53 loses precision SILENTLY, which is the same hazard standing law 3
      states for a running double one layer down. Exact where representable, clamped past it.
    */
    const at = (eligible: number, consumed: bigint) =>
      loyaltyOrdersToNextReward({ eligible, orders_consumed_total: consumed, every_n: 10 });
    const huge = at(0, 10n ** 30n);
    expect(Number.isSafeInteger(huge), "a count a surface can say, not 1e+30").toBe(true);
    expect(huge).toBe(Number.MAX_SAFE_INTEGER);
    // The boundary, both sides: an overdraw whose answer still fits is EXACT and not clamped, so
    // the clamp cannot be mistaken for "large debts all read the same".
    const exact = BigInt(Number.MAX_SAFE_INTEGER) - 10n;
    expect(at(0, exact), "one that fits is answered exactly").toBe(Number.MAX_SAFE_INTEGER);
    expect(at(1, exact)).toBe(Number.MAX_SAFE_INTEGER - 1);
    // ...and nothing about the ordinary range moved (the walk above is the same arithmetic).
    expect(at(10, 20n)).toBe(20);
    expect(at(19, 20n)).toBe(11);
  });
});
