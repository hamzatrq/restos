// `17-F22`'s campaign artifact on THIS device, and `17-F24`'s pre-approval predicate built from it.
//
// ── WHY THE ARTIFACT ARRIVES AS A v0 SEED AND NOT OVER THE WIRE ───────────────────────────────
//
// `17-F22` makes `campaign` the fifth `01-F75` resource, org-scoped. `01-F75`'s frames
// (`reference_request` / `reference_response` / `reference_notice`) are generic and would carry it
// unchanged — and they carry three of the five today, because `01-F87`'s `config` is in exactly
// this state too: **spec-closed, wire-owed**. `plans/v0.md`'s gap 3 names all three seeds together
// (the tax cell, R70's rounding granularity and R71's campaigns) and says `01-F87`'s carrier
// deletes them in one change. So this file is the campaign half of that seed and it is built on
// `tax-posture.ts`'s shape deliberately, not coincidentally: same env-var door, same
// pure-in-its-input resolver, same "no memo, no boot-time capture" rule, so the change that lands
// the wire deletes two files with one argument instead of reconciling two conventions.
//
// ⚠ **AND IT DIFFERS FROM `tax-posture.ts` IN EXACTLY ONE WAY, WHICH IS THE POINT OF `17-F22`.**
// A malformed tax cell THROWS and the till does not start, because charging the wrong tax is worse
// than not trading. A malformed campaign artifact yields **NO CAMPAIGNS** and the till starts and
// sells. That is `01-F56`'s `malformed` disposition scoped to the thing that was malformed —
// which is the entire argument `17-F22` makes for a fifth resource rather than a key inside
// `config`, and it would be undone by an implementation that threw here. Commandment 4 and
// `01-F17`: a sale is never blocked, and least of all by a promotion.
import {
  businessDate,
  type CampaignCitation,
  type CampaignRow,
  CampaignRowSchema,
  campaignApplies,
  campaignBenefitPaisa,
} from "@restos/domain";
import type { OpenOrderRow } from "@restos/sync-client";
import { AppendRequestSchema, type AppendResult, type CampaignOffer } from "../shared/ipc";
import type { RendererWrites } from "./settlement-guard";

/** The v0 seed: a JSON array of `17-F22` rows. Deleted by `01-F87`'s carrier. */
export const CAMPAIGNS_ENV = "RESTOS_CAMPAIGNS";
/**
 * The artifact VERSION this seed stands for (`01-F76`: a version is meaningless without its key).
 *
 * Seeded rather than derived, because `discount.recorded.campaign_version` and
 * `loyalty.reward_redeemed.campaign_version` are what let `17-F25`'s reconciliation answer *under
 * what rule?* years later — and a version this device invented would answer it with a number no
 * publisher ever minted. `1` is the default so a single-pilot seed needs one variable, not two.
 */
export const CAMPAIGNS_VERSION_ENV = "RESTOS_CAMPAIGNS_VERSION";

/**
 * What this device holds for the `campaign` resource.
 *
 * `malformed` is a STATE and not an error, on `01-F56`'s own vocabulary: the till has no campaigns
 * and knows why, which is a different fact from an org that has published none (`01-F77`'s
 * omitted-never-zero rule makes those two indistinguishable ON THE WIRE, and this is the one place
 * they can be told apart at all, because here the bytes were present and unreadable).
 */
export type CampaignArtifact = {
  readonly rows: readonly CampaignRow[];
  readonly version: number;
  readonly malformed: boolean;
};

const EMPTY_MALFORMED: CampaignArtifact = { rows: [], version: 0, malformed: true };
const EMPTY: CampaignArtifact = { rows: [], version: 0, malformed: false };

/**
 * Resolve the seeded artifact. **Total — it never throws**, see the header.
 *
 * Pure in its input so a suite can drive every arm without touching `process.env`; the shipping
 * caller passes `process.env` itself. No memo and no construction-time capture, on
 * `resolveTaxCell`'s stated reasoning: a value read once at boot is a value that disagrees with the
 * variable an operator has since corrected.
 *
 * **One bad row refuses the WHOLE artifact** (`01-F56`, `01-F87` (b)) rather than being skipped.
 * Skipping is the tempting shape and it is wrong: an owner who published five campaigns and typed
 * one badly would get four, silently, and would have no way to tell that from having published
 * four. `17-F22`'s separate-resource argument is what makes refusing the whole thing survivable.
 */
export const resolveCampaignArtifact = (
  env: Record<string, string | undefined>,
): CampaignArtifact => {
  const raw = env[CAMPAIGNS_ENV]?.trim();
  if (raw === undefined || raw === "") return EMPTY;

  const version_raw = env[CAMPAIGNS_VERSION_ENV]?.trim();
  const version = version_raw === undefined || version_raw === "" ? 1 : Number(version_raw);
  if (!Number.isSafeInteger(version) || version < 1) return EMPTY_MALFORMED;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_MALFORMED;
  }
  if (!Array.isArray(parsed)) return EMPTY_MALFORMED;

  const rows: CampaignRow[] = [];
  for (const candidate of parsed) {
    const row = CampaignRowSchema.safeParse(candidate);
    if (!row.success) return EMPTY_MALFORMED;
    rows.push(row.data);
  }
  // `01-F75`: `campaign_id` is org-unique and minted at the writer. A duplicate id in one artifact
  // is a writer that minted two — and honouring the first would make WHICH campaign applied depend
  // on array position, which is `01-F34`'s defect arriving through a seed file.
  if (new Set(rows.map((r) => r.campaign_id)).size !== rows.length) return EMPTY_MALFORMED;

  return { rows, version, malformed: false };
};

/** The shipping resolution — every reader of the campaign artifact on this device calls THIS. */
export const deviceCampaignArtifact = (): CampaignArtifact => resolveCampaignArtifact(process.env);

export type CampaignCitationDeps = {
  /** The device's own open-order projection. Never the renderer's — Commandment 8. */
  readonly openOrders: () => readonly OpenOrderRow[];
  /** `01-F30`'s billed total for one order, as this device's fold projects it. */
  readonly orderTotalPaisa: (order_id: string) => number | null;
  /** `02-F64`: does this order carry a link to a customer? From the `customer_orders` fold. */
  readonly orderHasLinkedCustomer: (order_id: string) => boolean;
  /** Branch time in ms (`01-F43`) — the device clock plus the measured offset, never raw. */
  readonly branchNowMs: () => number;
  /** This device's branch (`01-F76` scope), from the store identity and never from a payload. */
  readonly branchId: () => string;
  /** The seeded artifact, injected so a suite drives it without `process.env`. */
  readonly artifact: () => CampaignArtifact;
};

/**
 * `17-F24`'s campaign arm, resolved **on the trusted side**.
 *
 * ⚠ **THE PAYLOAD'S `campaign_id` IS A CLAIM AND NOTHING MORE (Commandment 8).** The renderer says
 * *"this discount is campaign X"*; this function decides whether X exists in THIS device's
 * artifact, whether it reaches THIS order, and whether the amount asked for is within its own
 * `cap_paisa`. A gate that read `within_campaign_bounds` off the payload would let any renderer
 * mint an unbounded pre-approved discount, permanently (`01-F1`).
 *
 * **Returns `null` for every reason a campaign does not apply** — unknown id, no artifact, wrong
 * branch, wrong channel, outside the window, under the minimum, over the cap — and `null` means
 * *fall through to the discretionary predicate untouched*, which is `17-F12`'s own last clause.
 * There is no third answer and no refusal: a campaign that does not apply never blocks anything.
 *
 * **`free_item` benefits return `null` too, and that is a stated limit rather than an oversight.**
 * `campaignBenefitPaisa` answers `null` for them because the value is the LINE's snapshotted
 * `unit_price_paisa` (`01-F53`) and this predicate has no line. So a free-item campaign takes the
 * ordinary discretionary path today — which is the SAFE direction (a large one asks for a manager)
 * and is the honest one, because pre-approving an amount we cannot bound is the defect `17-F24`'s
 * `within_campaign_bounds` field exists to prevent.
 */
/**
 * (17-F24 AS AMENDED) THE THREE ROW FIELDS THIS PREDICATE CANNOT EVALUATE, AND THE REFUSAL IS THE
 * WHOLE FIX (August 2026, adversarial review).
 *
 * The first build read none of these and still answered *within bounds*, which is the round-3
 * shape on a money field: the mechanism was correct and was never aimed at the case that matters.
 * Measured on this branch before the fix:
 *
 * - `item_scope` — `campaignBenefitPaisa`'s own docstring says the base is *"the scoped lines'
 *   total when `item_scope` names some"* and this resolver passed the ORDER total regardless. A
 *   *20% off pizzas* campaign on a Rs 10,000 bill carrying one Rs 500 pizza pre-approved
 *   **Rs 2,000** — 20x the intended bound, with no manager, permanently (`01-F1`).
 * - `use_limit` — `once_per_order` / `once_per_customer` need a count of prior citations and this
 *   function has no history. Measured: one citation repeated 50 times, every one within bounds.
 * - `proof` — `code` / `bearer_card` / `attested` name a thing the cashier must be holding and
 *   **nothing in this product collects one**, so a `coupon` campaign was pre-approved with no code.
 *
 * **`free_item`'s exit is the precedent and it is a few lines below:** a bound this predicate
 * cannot compute is not a blessing, so the row resolves to `null`, the discretionary predicate runs
 * untouched (`17-F12`'s last clause), and a large one asks for a manager. **The class this closes
 * and the one it does not (`L11`):** it closes *the arm blessing an amount it never bounded*; it
 * implements none of the three — an item-scoped campaign is REFUSED, not scoped. Whoever builds the
 * scoped base, the use counter or the proof capture DELETES an arm here rather than adding one.
 *
 * It lives here rather than in `campaignApplies` deliberately — see that function's own note. The
 * domain predicate answers *does this campaign reach this ORDER*, and none of these three is that
 * question; this is the caller that resolves the base, so this is where a base it cannot resolve
 * has to be refused.
 */
const unresolvableScope = (row: CampaignRow): boolean =>
  row.item_scope !== null || row.use_limit !== "unlimited" || row.proof !== "none";

/**
 * The ONE resolution both readers share (`02-F45`: two resolutions of one question disagree, and
 * here the disagreement is a cashier offered a campaign the write guard then refuses).
 *
 * Returns the bound this campaign allows on this order, or `null` for every reason a campaign does
 * not apply. `17-F27` (a) requires the offer list and the citation to come from this function and
 * not from two that look alike.
 */
const reachOf =
  (deps: CampaignCitationDeps) =>
  (order_id: string, row: CampaignRow): { readonly bound_paisa: number } | null => {
    if (unresolvableScope(row)) return null;

    const order = deps.openOrders().find((o) => o.order_id === order_id);
    if (order === undefined) return null;
    const order_total_paisa = deps.orderTotalPaisa(order_id);
    if (order_total_paisa === null) return null;

    const applies = campaignApplies(row, {
      branch_id: deps.branchId(),
      channel: order.channel,
      // `01-F46` — the business date is derived ONCE, from branch time, at the reading edge.
      // `campaignApplies` compares ISO dates and derives nothing, which is what keeps a clock out
      // of the predicate itself.
      business_date: businessDate(deps.branchNowMs()),
      order_total_paisa,
      has_linked_customer: deps.orderHasLinkedCustomer(order_id),
    });
    if (!applies) return null;

    const bound = campaignBenefitPaisa(row.benefit, order_total_paisa);
    if (bound === null) return null;
    return { bound_paisa: bound };
  };

export const campaignCitationFor =
  (deps: CampaignCitationDeps) =>
  (order_id: string, campaign_id: string, amount_paisa: number): CampaignCitation | null => {
    const row = deps.artifact().rows.find((r) => r.campaign_id === campaign_id);
    if (row === undefined) return null;
    const reach = reachOf(deps)(order_id, row);
    if (reach === null) return null;
    return { campaign_id, within_campaign_bounds: amount_paisa <= reach.bound_paisa };
  };

/**
 * `17-F27` (a) — **the offer list, and it is the PRODUCER half of `17-F24` that did not exist.**
 *
 * Until this shipped, nothing anywhere in the product put a `campaign_id` on a `discount.recorded`:
 * the only emitter built five literal fields, so `payload.campaign_id` was `undefined` on every
 * event any surface could emit, `canDiscount`'s campaign arm could never fire, and this file's own
 * citation resolver was never asked a question with a non-null answer. That is `L8` in the shape
 * `seams:check` says out loud it cannot see — a missing producer for a payload KEY.
 *
 * **Display-only, and it authorizes nothing** (`02-F20`'s `escalationFor` precedent). A renderer
 * that forged this list gains nothing: every fact that decides the verdict is re-read at the writer
 * from this same `reachOf`, so an offer the screen invents is refused there (Commandment 8).
 *
 * **The tile carries the `campaign_id` itself**, because `17-F22`'s row has no display name and
 * inventing one here would be a field no FR asked for (Commandment 2). `17-F27` records that a name
 * belongs to the authoring surface.
 *
 * Order is the ARTIFACT's, which is the writer's, and it is not sorted here: sorting by
 * `bound_paisa` would put the biggest discount first on a surface a cashier is choosing from.
 */
export const campaignOffersFor =
  (deps: CampaignCitationDeps) =>
  (order_id: string): readonly CampaignOffer[] => {
    const offers: CampaignOffer[] = [];
    for (const row of deps.artifact().rows) {
      const reach = reachOf(deps)(order_id, row);
      if (reach === null) continue;
      offers.push({ campaign_id: row.campaign_id, bound_paisa: reach.bound_paisa });
    }
    return offers;
  };

const DISCOUNT_RECORDED = "discount.recorded";

export type CampaignVersionStampDeps = {
  readonly writes: RendererWrites;
  /** The device's own `17-F22` artifact — the same getter the citation resolver is built from. */
  readonly artifact: () => CampaignArtifact;
};

/**
 * `17-F27` (c) — **`campaign_version` is stamped by the WRITER, from this device's own artifact.**
 *
 * (L11) `registry.ts` CLAIMED THIS PROTECTION BEFORE IT EXISTED, and that is why this module
 * carries it rather than the payload schema. Its `discount.recorded` header said *"Where the
 * pairing IS enforced: at the WRITER, structurally. `apps/pos-electron/src/main/campaigns.ts` …
 * takes `campaign_version` off that artifact, so an emitter cannot produce one without the
 * other."* This file contained the string for that field **zero** times; measured on a real store,
 * a `discount.recorded` carrying a campaign id and NO version was accepted and persisted, and so
 * was one carrying version 999 against an artifact at version 1. `17-F25`'s *"under what rule?"*
 * was unanswerable for both, permanently (`01-F1`). A protection claimed in prose retires the
 * assertion the next session would have written.
 *
 * **The renderer's version is OVERWRITTEN, not compared** — `line-void.ts` overwrites
 * `amount_paisa` from the device's own derivation for the same reason (`18 §9` makes the renderer
 * the untrusted side), and a version the renderer supplied answers `17-F25` with a number no
 * publisher minted.
 *
 * **A cited campaign this device's artifact does not hold cannot be paired, so the CLAIM IS
 * DROPPED.** The authorization has already fallen through to the discretionary predicate
 * (`campaignCitationFor` answers `null` for an unknown id), so keeping the id would record a rule
 * this device cannot state beside a verdict that says discretionary — two facts that disagree, for
 * ever. Dropping it makes the payload say what the act actually was.
 *
 * It does **NOT** refuse the write, and must not. A discount is not blocked because a campaign is
 * unknown (`01-F17`, Commandment 4); the citation simply does not survive.
 *
 * **Where it sits:** INSIDE `authorizeWrites`, in the same chain as `voidExitsLine`, so BOTH the
 * ordinary and the escalated write paths reach it. A stamp on one path only is a discount whose
 * recorded rule depends on whether a manager was asked.
 */
export const stampCampaignVersion = (deps: CampaignVersionStampDeps): RendererWrites => ({
  append: (req: unknown): AppendResult => {
    // Re-parsed rather than read raw, on `voidExitsLine`'s posture: `req` is `unknown` from an
    // untrusted renderer, and on anything malformed this narrowing MISSES and the request goes on
    // to the real validator. Fail-open here, fail-closed there.
    const parsed = AppendRequestSchema.safeParse(req);
    if (!parsed.success || parsed.data.type !== DISCOUNT_RECORDED) return deps.writes.append(req);
    const claimed = parsed.data.payload.campaign_id;
    const artifact = deps.artifact();
    const known =
      typeof claimed === "string" && artifact.rows.some((row) => row.campaign_id === claimed);
    if (!known) {
      // No citation this device can state. The id goes with the version rather than riding alone:
      // a version with no rule, or a rule this device does not hold, each answer `17-F25` with
      // something no publisher minted.
      const { campaign_id: _id, campaign_version: _version, ...payload } = parsed.data.payload;
      return deps.writes.append({ ...parsed.data, payload });
    }
    return deps.writes.append({
      ...parsed.data,
      payload: { ...parsed.data.payload, campaign_version: artifact.version },
    });
  },
  // Untouched, and written out rather than spread, on `voidExitsLine`'s reasoning: a member added
  // to `RendererWrites` later must be a decision here and not something a spread carries through.
  addLine: (req: unknown): AppendResult => deps.writes.addLine(req),
  toggleAvailability: (req: unknown): AppendResult => deps.writes.toggleAvailability(req),
  recordCustomer: (req: unknown): AppendResult => deps.writes.recordCustomer(req),
  linkCustomer: (req: unknown): AppendResult => deps.writes.linkCustomer(req),
});
