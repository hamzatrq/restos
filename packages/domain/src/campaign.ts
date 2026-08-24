// Campaign definitions and the loyalty counter's arithmetic (`17-F22`, `17-F23`, `17-F24`).
//
// Declared HERE and nowhere else (`18 §2`/`18 §4`: a domain classification is declared in `domain`
// once, and redeclaring it elsewhere is a violation rather than a convenience). Three planes need
// this vocabulary and none may import another: the WRITER that validates a `campaign` artifact
// before publishing it (`01-F75`), the TILL that validates a redemption offline (`17-N3`), and the
// permission predicate that routes `17-F12`'s pre-approval (`17-F24`). `SELLABLE_KINDS` records
// what three copies of one list cost the last time this rule was broken.
//
// ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────────────────────
//
// No wire kinds. `17-F22` makes `campaign` the fifth `01-F75` resource and `01-F75` fixes the
// frames (`reference_request` / `reference_response` / `reference_notice`), so this module
// declares the ROW those frames carry and nothing about carrying it. `01-F87`'s `config` is the
// fourth member and is in exactly the same state — spec-closed, wire-owed — so a campaign
// reaching a till as data rather than as a seed is owed to the same change.
//
// No fold. `17-F23`'s projection is a device fold and lives in `packages/sync-client/src/folds`,
// beside the six that ship. What lives here is the RENDER-TIME arithmetic the fold may not do,
// because `01-F87` forbids a fold reading configuration and `every_n` / `min_order_paisa` are
// configuration.
import { z } from "zod";
import { applyRateBps, type Paisa, paisa } from "./money.js";

/**
 * `17-F22`'s `kind`, CLOSED at the writer.
 *
 * **`bearer_card` and `account_loyalty` differ in ONE field and that is the whole of `17-F21`.**
 * A redemption's `phone_e164` is present for an account programme and `null` for a bearer card —
 * the card IS the identity, so there is no customer record to key. They are not two mechanisms:
 * `17-F15`'s surviving clause still forbids a second *progress* mechanism (no manual stamp, no
 * adjustment, no counter anyone can type into), and a bearer card does not have one — its counter
 * was paper and we never saw it.
 *
 * `wallet_pass` is ABSENT on purpose. `17-F26` makes an Apple/Google Wallet pass a `bearer_card`
 * whose `proof_ref` happens to have been read off a phone, and costs the issuance half without
 * building it. A fourth kind here would be a name on a wire with nothing at either end —
 * `01-F81`'s rule about not letting a name land ahead of the thing that serves it.
 */
export const CAMPAIGN_KINDS = ["auto_deal", "coupon", "bearer_card", "account_loyalty"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

/**
 * `17-F22`'s `status`. **A departure is a MARK and never an absence** — `01-F75`'s rule for every
 * resource, because the frame carries no removals list. A paused campaign travels as `paused`; it
 * does not travel as a row that stopped arriving, which a device could not tell from a delta it
 * missed.
 */
export const CAMPAIGN_STATUSES = ["active", "paused", "completed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * `17-F22`'s `benefit.form`. Taken from Como Sense's classic-vs-custom punch-card split (a free
 * item, or a percentage/amount), which is also what Foodics ships in the closest market to ours.
 *
 * `percent_bps` is integer **basis points** and `amount_paisa` integer **paisa** — `DEC-MONEY-005`
 * without exception. `free_item` carries a catalog entry id and resolves through `01-F53`'s
 * SNAPSHOTTED line price, so a free coffee is worth what the coffee was rung at and not what the
 * menu says today; that resolution is the caller's, because this module has no catalog.
 */
export const BENEFIT_FORMS = ["percent_bps", "amount_paisa", "free_item"] as const;
export type BenefitForm = (typeof BENEFIT_FORMS)[number];

/** `17-F22`'s `proof` — what the cashier must be holding. `17-F25` is why it is an attestation. */
export const CAMPAIGN_PROOF_KINDS = ["none", "code", "bearer_card", "attested"] as const;
export type CampaignProofKind = (typeof CAMPAIGN_PROOF_KINDS)[number];

/** `17-F10`'s single-use constraints, as `17-F22` names them. Merge-arbitrated per `17-F13`. */
export const CAMPAIGN_USE_LIMITS = ["unlimited", "once_per_order", "once_per_customer"] as const;
export type CampaignUseLimit = (typeof CAMPAIGN_USE_LIMITS)[number];

/**
 * `17-F22`'s benefit, validated at the writer.
 *
 * **`cap_paisa` is REQUIRED-AND-NULLABLE**, on the standing rule `customer.created.name` follows:
 * `null` is a stated *no cap* and `undefined` is a writer who forgot, and an `.optional()` field
 * cannot tell them apart afterwards. It matters more here than on a name — `17-F24` makes the cap
 * the boundary of a PRE-APPROVAL, so a forgotten cap read as "no cap" is an unbounded discount
 * that needs no manager, permanently (`01-F1`).
 *
 * **`value` is `nonnegative`, and zero is legal for a reason `01-F60` already states**: an explicit
 * `0` is what makes "free"/"nothing off" distinguishable from "forgotten". A `percent_bps` of 0 is
 * a campaign that gives nothing, which is a strange thing to author and not a malformed row.
 */
export const CampaignBenefitSchema = z.object({
  form: z.enum(BENEFIT_FORMS),
  /** bps for `percent_bps`, paisa for `amount_paisa`; refined per form below. */
  value: z.number().int().nonnegative(),
  /** Catalog entry id when `form` is `free_item`; `null` otherwise. `01-F21`'s id space. */
  item_id: z.union([z.string().min(1), z.null()]),
  cap_paisa: z.union([z.number().int().nonnegative(), z.null()]),
});
export type CampaignBenefit = z.infer<typeof CampaignBenefitSchema>;

/**
 * `17-F22`'s row — **typed and validated at the WRITER, never only at the device**.
 *
 * `01-F75` states why in the imperative: *"A resource whose row is loose at the wire is a resource
 * whose bad row is discovered on a till: one unparseable member refuses the entire update
 * (`01-F56` `malformed`)"*. For `staff` that is a branch nobody can sign in to. For `campaign` it
 * is milder by construction — `17-F22` made this a SEPARATE resource precisely so a bad campaign
 * row cannot refuse the org's tax posture — but it is still an org whose promotions all vanish at
 * once, which is why the schema lives here rather than at the reader.
 *
 * ⚠ **A STRICT OBJECT, unlike every `payloadSchemas` member.** Event payloads are `looseObject` so
 * `00 §6`'s additive evolution can carry a field a later doc declares. An artifact row is the
 * opposite case: `01-F75` makes the entries a golden-fixture CONTRACT and an unknown key here is a
 * writer that thinks it published something this reader will honour. Refusing it at the writer is
 * the whole point of the clause — and it is safe here in a way it would NOT be on a payload,
 * because an artifact is republished wholesale (`01-F56`) rather than kept for ever (`01-F1`).
 *
 * ⚠ **This paragraph said "A STRICT OBJECT" while the schema was a plain `z.object`, which
 * SILENTLY STRIPS an unknown key rather than refusing it** — written in the same change that made
 * the rest of the sentence true, and caught by `campaign-model.test.ts` §A on its first run. It is
 * `L11` exactly: a protection claimed in prose retires the assertion the next session would have
 * written. The assertion existed here only because the round-3 law made writing it mandatory.
 */
export const CampaignRowSchema = z
  .strictObject({
    campaign_id: z.string().min(1),
    kind: z.enum(CAMPAIGN_KINDS),
    status: z.enum(CAMPAIGN_STATUSES),
    /**
     * `17-F22`: business-day bounds, Asia/Karachi 05:00 (`01-F46`). ISO business dates
     * (`YYYY-MM-DD`), never instants — a campaign runs for a service day, and a `05:00` cutover
     * means the day is the unit the owner authors in. `null` on either end is open-ended.
     */
    valid_from: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
    valid_to: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
    /** `null` = whole org; else the branch ids. The branch axis as DATA (`01-F60`'s precedent). */
    branches: z.union([z.array(z.string().min(1)), z.null()]),
    /** Subset of `02-F42`'s `ORDER_CHANNELS`; EMPTY means every enabled channel. */
    channels: z.array(z.string().min(1)),
    /** `null` = the whole order; else catalog entry ids (`01-F21`). */
    item_scope: z.union([z.array(z.string().min(1)), z.null()]),
    min_order_paisa: z.number().int().nonnegative(),
    benefit: CampaignBenefitSchema,
    proof: z.enum(CAMPAIGN_PROOF_KINDS),
    /** `17-F10`'s code, uppercase base32 + one check character. `null` when the kind carries none. */
    code: z.union([z.string().regex(/^[A-Z2-7]{4,16}$/), z.null()]),
    use_limit: z.enum(CAMPAIGN_USE_LIMITS),
    requires_customer: z.boolean(),
    /** `account_loyalty` only — the `N` of `17-F14`'s "every Nth order". */
    every_n: z.union([z.number().int().min(1), z.null()]),
  })
  .superRefine((row, ctx) => {
    // `17-F14`: "every Nth order" is what an account programme IS, so a row without `every_n`
    // is not an under-specified campaign — it is a campaign whose reward can never become
    // available, which `17-F23`'s division would have to answer with a divide by null.
    if (row.kind === "account_loyalty" && row.every_n === null) {
      ctx.addIssue({
        code: "custom",
        path: ["every_n"],
        message: "17-F14: an account_loyalty campaign must state every_n",
      });
    }
    // And the mirror, which is the half a validator usually forgets: `every_n` on any other kind
    // is a number nothing divides by, so it would sit in a published artifact reading like a
    // promise. `17-F22` names it "`account_loyalty` only".
    if (row.kind !== "account_loyalty" && row.every_n !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["every_n"],
        message: "17-F22: every_n is account_loyalty only",
      });
    }
    // `17-F22`'s `benefit.form: free_item` resolves through the catalog, so the id is the whole
    // of the benefit — a `free_item` with no id gives away nothing and reads as if it gives away
    // something. Both directions again: an `item_id` on a percentage benefit is a second answer.
    if (row.benefit.form === "free_item" && row.benefit.item_id === null) {
      ctx.addIssue({
        code: "custom",
        path: ["benefit", "item_id"],
        message: "17-F22: a free_item benefit must name a catalog entry",
      });
    }
    if (row.benefit.form !== "free_item" && row.benefit.item_id !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["benefit", "item_id"],
        message: "17-F22: item_id belongs to a free_item benefit only",
      });
    }
    // `17-F22` as amended (August 2026): **a percentage benefit is bounded at 10,000 bps.**
    // 10,000 bps is 100%, which is the largest discount that can exist — a benefit can never
    // exceed what it is taken off, and `campaignBenefitPaisa` already clamps to the base for
    // that reason. Without this arm a seed typo of `500000` for `5000` parses clean, and
    // `17-F24` then pre-approves `min(gross, base)` = the whole bill with no manager,
    // permanently (`01-F1`). REFUSED rather than clamped, on `01-F75`'s rule: a writer that
    // published 5000% did not mean 100%, and honouring a number nobody typed is how a bad row
    // becomes invisible. The five arms around this one bounded every OTHER field of the
    // benefit and left the one that multiplies the bill unbounded.
    if (row.benefit.form === "percent_bps" && row.benefit.value > 10_000) {
      ctx.addIssue({
        code: "custom",
        path: ["benefit", "value"],
        message: "17-F22: percent_bps may not exceed 10000 (100%)",
      });
    }
    // `17-F10`: a coupon IS its code. A `coupon` row with no code cannot be entered at a till.
    if (row.kind === "coupon" && row.code === null) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "17-F10: a coupon campaign must carry its code",
      });
    }
  });
export type CampaignRow = z.infer<typeof CampaignRowSchema>;

/**
 * `17-F22`'s money, and it is the ONE place a campaign benefit becomes paisa.
 *
 * **`applyRateBps` then `min(cap)`, never a float and never a division** (`DEC-MONEY-005`,
 * standing law 3). The order matters and is not interchangeable: capping the RATE instead of the
 * result would make a 50%-capped-at-10,000 campaign give Rs 10,000 off a Rs 100 bill.
 *
 * `base_paisa` is what the benefit applies TO — the order's billed total for a whole-order
 * campaign, or the scoped lines' total when `item_scope` names some. **Resolving that base is the
 * CALLER's**, because it needs the order's lines and this module has no order.
 *
 * ⚠ **AND THE ONLY SHIPPING CALLER RESOLVES ONLY THE FIRST OF THOSE TWO — it REFUSES the second
 * (`17-F24` as amended, August 2026).** The sentence above stated the obligation and the caller
 * dropped it silently: `apps/pos-electron/src/main/campaigns.ts` passed the ORDER total for an
 * item-scoped row, so a *20% off pizzas* campaign pre-approved 20% of a Rs 10,000 bill — 20× its
 * intended bound, with no manager, permanently (`01-F1`). The fix is at that caller and it takes
 * `free_item`'s exit below rather than inventing a base: an `item_scope` row resolves to `null`
 * and the discretionary predicate runs. **This function is unchanged and correct**; what is
 * recorded here is that *"resolving that base is the CALLER's"* is a load-bearing obligation and
 * not a note, so the next caller either resolves it or refuses it in terms.
 *
 * **`free_item` returns `null` rather than a number, and that is a refusal to guess.** Its value is
 * the LINE's snapshotted `unit_price_paisa` (`01-F53`), which lives on the order and not on the
 * campaign; returning `0` here would read as "this benefit is worth nothing" and a caller that
 * forgot to resolve it would silently give away nothing at all.
 */
export const campaignBenefitPaisa = (
  benefit: CampaignBenefit,
  base_paisa: number,
): number | null => {
  if (benefit.form === "free_item") return null;
  const gross: Paisa =
    benefit.form === "percent_bps"
      ? applyRateBps(paisa(base_paisa), benefit.value)
      : paisa(benefit.value);
  // A benefit can never exceed what it is taken off — a discount larger than the bill is a
  // negative total, which `01-F30`'s conservation equation has no room for. Clamped BEFORE the
  // cap so the cap means what it says about money actually given away.
  const bounded = Math.min(gross, base_paisa);
  if (benefit.cap_paisa === null) return bounded;
  return Math.min(bounded, benefit.cap_paisa);
};

/** What a campaign is being asked about — one order, one moment, on one branch. */
export type CampaignContext = {
  readonly branch_id: string;
  /** `02-F42`'s channel — a PRICE KEY, and a campaign scopes on it. */
  readonly channel: string;
  /** The `01-F46` business date the act falls in, `YYYY-MM-DD` — never a device clock. */
  readonly business_date: string;
  /** `01-F30`'s billed total for the order, integer paisa. */
  readonly order_total_paisa: number;
  /** Whether this order carries `02-F64`'s link to a customer. */
  readonly has_linked_customer: boolean;
};

/**
 * Does this campaign reach this order? A pure predicate over the row and the context — **no
 * clock, no network, no store** (`17-N3`: validation is a synchronous read of the till's own
 * artifact, and `17-F13` forbids a cloud round-trip).
 *
 * ⚠ **A `false` here NEVER refuses a sale** (Commandment 4, `01-F17`). It says one campaign does
 * not apply; the order, its lines, its tender and its close are untouched. A device that has never
 * received the artifact has no campaigns at all, which is the safe direction.
 *
 * ⚠ **WHAT THIS PREDICATE DELIBERATELY DOES NOT READ, and where the refusal for each lives
 * (`17-F24` as amended, August 2026).** `item_scope`, `use_limit` and `proof` are `17-F22` row
 * fields and **none of them is a question about whether a campaign reaches an ORDER** — the first
 * changes the BASE the benefit is taken of, the second needs a count of prior citations, the
 * third names something the cashier must be holding. This function has an order total and no
 * lines, no history and no hands, so an arm here would be a guess. The refusal is at the caller
 * that resolves the base (`campaignCitationFor`), which answers `null` for all three, and
 * `campaign-model.test.ts` §D pins that this function is blind to them ON PURPOSE. **Adding an
 * arm here is not the fix and would hide the one that is:** an implementation that returned
 * `false` for an item-scoped row would make the citation resolver's refusal untestable and would
 * still not scope anything. See `17-F24` for the class this closes and the one it does not.
 *
 * **The window is compared as ISO business DATES, which is a string compare and is correct** —
 * `YYYY-MM-DD` sorts lexicographically iff it sorts chronologically. That is deliberate rather
 * than lazy: parsing to a `Date` would introduce a timezone, and `01-F46` already fixed the
 * timezone at the point the business date was DERIVED. Re-deriving it here would be a second
 * answer (`02-F45`'s argument, one module over).
 */
export const campaignApplies = (row: CampaignRow, ctx: CampaignContext): boolean => {
  if (row.status !== "active") return false;
  if (row.valid_from !== null && ctx.business_date < row.valid_from) return false;
  if (row.valid_to !== null && ctx.business_date > row.valid_to) return false;
  // `null` = whole org (`17-F22`). An EMPTY array is not the same thing and is not treated as one:
  // a writer that published `branches: []` scoped a campaign to no branch, and honouring that
  // literally is what makes the `null` spelling mean something.
  if (row.branches !== null && !row.branches.includes(ctx.branch_id)) return false;
  // EMPTY channels = every enabled channel (`17-F22`), which is the opposite convention from
  // `branches` directly above. Both are the spec's and neither is inferable from the other —
  // written out rather than unified, because unifying them would change one of them.
  if (row.channels.length > 0 && !row.channels.includes(ctx.channel)) return false;
  if (ctx.order_total_paisa < row.min_order_paisa) return false;
  if (row.requires_customer && !ctx.has_linked_customer) return false;
  return true;
};

/**
 * `17-F23`'s RENDER-TIME division — the whole reason the fold projects two counts instead of one
 * answer.
 *
 * ⚠ **THIS MUST NOT BE MEMOIZED INTO A MATERIALIZED STATE TABLE.** `01-F87` names that break by
 * name: at the moment this value is stored, it stops being recomputed per read and becomes a
 * PROJECTED one — and then two tills holding different artifact versions project different
 * rewards from an identical event set, which is standing law 1 broken through a cache. The counter
 * is a render. It is written here rather than only in the FR because the keystroke that breaks it
 * is one `const cached =` away and it would pass every test in this package.
 *
 * `eligible` counts orders and `orders_consumed_total` counts orders, so the subtraction is
 * dimensionally sound and the division is integer. **`orders_consumed_total` is a `bigint`**
 * because the fold accumulates it in BigInt (standing law 3) and narrowing it at the fold's edge
 * would put the hazard back one function earlier.
 *
 * **A NEGATIVE remainder yields 0 available and is not an error** — it is `17-F13`'s ruled
 * partition outcome (two tills each redeem against the same ten orders; on merge, consumed is
 * twenty). `Math.floor` of a negative would hand back a negative reward count, so the clamp is
 * explicit. The overdraw itself is raised by the fold as `loyalty_overdrawn`, for a manager to
 * read — **both discounts stand and no sale is unwound** (`01-F17`, `01-F20`).
 */
export const loyaltyAvailable = (input: {
  readonly eligible: number;
  readonly orders_consumed_total: bigint;
  readonly every_n: number;
}): number => {
  if (input.every_n < 1) {
    throw new RangeError(`loyaltyAvailable every_n must be >= 1, got ${input.every_n}`);
  }
  const remaining = BigInt(input.eligible) - input.orders_consumed_total;
  if (remaining <= 0n) return 0;
  return Number(remaining / BigInt(input.every_n));
};

/**
 * `17-F16`'s *"2 more orders to your free deal"* — the other rendering of the same two counts, and
 * it is here rather than in the UI so both readings come from one arithmetic.
 *
 * Returns `0` when a reward is already available, which is what the caller should say instead.
 *
 * ⚠ **THE OVERDRAWN ARM WAS WRONG AND IS FIXED (August 2026, adversarial review).** It read
 * `towards = remaining <= 0n ? 0n : remaining % every_n`, so while `17-F13`'s partition had
 * consumed MORE than the eligible count it answered `every_n` and stayed there — eligible 10
 * through 19 against consumed 20 all returned 10, where the truth is 20 then 11. The correct
 * form needs no branch at all: this line is only reached when `available` is 0, i.e. when
 * `remaining < every_n`, and the orders still owed are `every_n − remaining` for EVERY such
 * remaining including a negative one. A negative remaining is `17-F13`'s ruled outcome and not
 * an error, so it must produce a number the surface can say rather than a floor it sticks at.
 */
export const loyaltyOrdersToNextReward = (input: {
  readonly eligible: number;
  readonly orders_consumed_total: bigint;
  readonly every_n: number;
}): number => {
  if (loyaltyAvailable(input) > 0) return 0;
  // Reached only when `remaining < every_n` (that is what `available === 0` means), so the
  // subtraction is the whole answer on both sides of zero and no `%` is needed.
  const remaining = BigInt(input.eligible) - input.orders_consumed_total;
  return input.every_n - Number(remaining);
};
