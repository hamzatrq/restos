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
export const campaignCitationFor =
  (deps: CampaignCitationDeps) =>
  (order_id: string, campaign_id: string, amount_paisa: number): CampaignCitation | null => {
    const artifact = deps.artifact();
    const row = artifact.rows.find((r) => r.campaign_id === campaign_id);
    if (row === undefined) return null;

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
    return { campaign_id, within_campaign_bounds: amount_paisa <= bound };
  };
