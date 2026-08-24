import {
  type AuthOutcome,
  type AuthScope,
  type AuthSubject,
  type CampaignCitation,
  can,
  canDiscount,
  canPayOut,
  type PermissionAction,
  ROLES,
  type Role,
  reportScope,
} from "@restos/domain";
import type { DeviceStore } from "@restos/sync-client";
import {
  AppendRequestSchema,
  type AppendResult,
  type CashState,
  type EscalationOffer,
  type EscalationRefusal,
  type EscalationResult,
  type Session,
} from "../shared/ipc";
import type { Gateway } from "./gateway";

/**
 * **Commandment 8, on the counter.** *"Server-side authorization always via the `domain`
 * permission matrix; client role claims are never trusted."*
 *
 * `18 §9` gives the renderer no Node access and one typed IPC bridge, so on this app the MAIN
 * process is what "server-side" means: it is the only side that holds the store, the session and
 * the staff registry, and the only side a compromised renderer cannot rewrite. A guard drawn in
 * the renderer — a hidden tile, a disabled button — is a client role claim, and the commandment
 * says never trust one. `CashSurfaces.tsx` may hide "Open the day"; **this file is what refuses
 * it**, and it refuses it whether or not the tile was ever drawn.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────────────────────
 *
 * It holds **no policy of its own**. Every verdict comes from `domain/permissions.ts` — the
 * matrix, `can`, `canPayOut` — which `18 §` names as the platform's only authorization consumer
 * and which has had 89 tests and 28/28 killed mutants and **zero production callers** since it
 * was written. This is that caller. What lives here is one thing the matrix cannot know: which
 * `01 §4` EVENT TYPE is an instance of which Appendix A ACTION.
 *
 * ── Fail-closed, and where the closure applies ──────────────────────────────────────────────
 *
 * `01-F27` puts authorization on every operation, so an event type absent from `WRITE_ACTIONS`
 * below is REFUSED rather than waved through. That direction is deliberate: a future event type
 * added to `domain`'s registry without a row here stops at this seam loudly, which is the
 * opposite of the wave's recurring defect (a subsystem the product never reaches).
 *
 * The closure applies to the **renderer's** two write channels and to those only. `main` also
 * appends `kot.printed` / `kot.print_failed` through `gateway.append` directly, and those are
 * device FACTS, not acts a person performs: nobody "does" a print failure, `02-F19`'s list of
 * attributed actions does not contain one, and Appendix A has no row for it — inventing one
 * would be exactly the speculative widening `24-F23` forbids. So the split is not an exemption
 * list to keep in sync; it is which object main hands to which caller (see `main/index.ts`).
 */

/**
 * `01 §4` event type → the Appendix A action it is an instance of.
 *
 * Every row is an event some surface performs or that `02-F20` names, and no row invents a
 * matrix entry — `permissions.ts` already carries all of them.
 *
 * - `order.created` / `order.confirmed` / `order.line_added` → Appendix A's ONE row
 *   *"Create order / print KOT"*. The confirm is the KOT, and a line is part of creating.
 * - `order.line_removed` / `order.note_added` → the SAME row, and `02-F49` rules it. This is the
 *   OPPOSITE case to `02-F46`/`02-F47`/`14-F30`, which each minted an action because Appendix A
 *   had **no row at all** and the fail-closed default therefore denied every attempt: here the row
 *   exists and is already mapped. Appendix B names the attributed acts as *"order, **line
 *   add/remove**, discount, void, comp, reprint, drawer open, settlement"* — add and remove in one
 *   clause, one act — and lists *"item notes"* under **Order capture**. So these two rows are
 *   transcription, and minting an `order.correct` would be the speculative widening `24-F23`
 *   forbids (and would have to be `allow` for a cashier anyway, since `02-F8` calls the
 *   pre-confirm removal a plain event). The POST-confirm act keeps its own, DIFFERENT row —
 *   `void.recorded → order.void_after_kot`, `escalate` for a cashier — which is what makes
 *   `02-F8`'s boundary observable in the MATRIX and not only inside `line-removal-guard.ts`.
 * - `day.opened` / `day.closed` / `cash.deposit_recorded` → `02-F22`'s **role guard** and
 *   `02-F24`'s day close. The deposit record is the second half of one act ("manager cash count
 *   **and** deposit record → `day.closed`, `cash.deposit_recorded`"), so it cannot be a lesser
 *   permission than the close it belongs to.
 * - `shift.opened` / `shift.closed` → `shift.open_close`, which `02-F22`/`02-F23` deliberately
 *   put in the cashier's OWN hands ("shift open **per cashier**"). This is the half of `02-F22`
 *   its role guard does not cover, and folding it in would leave a cashier unable to start her
 *   own shift on the device she is standing at.
 * - `cash.drawer_opened` → `cash.drawer_no_sale`, which every till-reachable role may perform:
 *   `02-F43` says in terms that a refusal produces "an unbound no-sale that is stored and
 *   uncounted", which is strictly worse than the act.
 * - `void.recorded` / `comp.recorded` / `order.line_price_overridden` → `02-F20`'s escalation
 *   family. **These three are mapped ahead of their events**, and that is stated rather than
 *   left to look like scope creep: `domain/registry.ts` carries no payload schema for them yet,
 *   so nothing can append one today. The row costs one line and buys the thing `02-F20` cannot
 *   survive losing — an `escalate` cell with a reachable entry point. Omitting them would make
 *   the fail-closed default answer `deny`, which is precisely the collapse that makes the
 *   feature unable to exist.
 * - `approval.granted` / `approval.denied` → `approval.grant`, so `02-F38`'s self-approval
 *   refusal is decided by the matrix and not by a screen.
 *
 * **`cash.paid_out` is deliberately ABSENT.** Its verdict depends on the amount against the org
 * threshold, and `can()` refuses that route on purpose; `canPayOut` is the only one that
 * resolves it. See `guard` below.
 *
 * **`discount.recorded` is deliberately ABSENT, for a REASON THAT HAS CHANGED — read the new one
 * (August 2026).** It used to be absent because the predicate did not exist: *"there is no
 * `canDiscount` predicate on `canPayOut`'s pattern, and no threshold in `00 §7` layer 2 to feed
 * one … the predicate is owed to `domain` before any discount surface can land"*. `canDiscount`
 * now ships in `permissions.ts` and `DISCOUNT_APPROVAL_THRESHOLD_BPS` below feeds it, so that
 * debt is CLOSED and `02-F61`'s *"specified and unbuilt"* no longer describes it.
 *
 * It stays out of this map for the structural reason that outlives the debt: Appendix A gives a
 * discount **two** actions — `Discount ≤ X%` and `Discount > X%` — and which one an act is an
 * instance of depends on its amount, which a `Record<event_type, action>` has no way to ask.
 * `cash.paid_out` is absent for the neighbouring but distinct reason (one action, amount-dependent
 * VERDICT). See `verdictFor`'s two branches, which is where both are resolved.
 */
export const WRITE_ACTIONS: Readonly<Record<string, PermissionAction>> = {
  "order.created": "order.create",
  "order.confirmed": "order.create",
  "order.line_added": "order.create",
  // `02-F8`/`02-F6` → the SAME Appendix A row the add rides, per `02-F49`. See the table's note.
  "order.line_removed": "order.create",
  "order.note_added": "order.create",
  "payment.recorded": "payment.settle",
  "shift.opened": "shift.open_close",
  "shift.closed": "shift.open_close",
  "day.opened": "day.open_close",
  "day.closed": "day.open_close",
  "cash.deposit_recorded": "day.open_close",
  "cash.drawer_opened": "cash.drawer_no_sale",
  "void.recorded": "order.void_after_kot",
  "comp.recorded": "order.comp_item",
  "order.line_price_overridden": "order.price_override",
  "approval.granted": "approval.grant",
  "approval.denied": "approval.grant",
  // `02-F7` → `02-F46`'s action. **Appendix A has no availability row**, so before that FR this
  // event type hit the fail-closed default below and every 86 was DENIED — which is why the
  // toggle could not be built, not merely why it was not. See `02-F46` for why the cashier cell
  // is `allow` and why this is neither `order.create` nor `catalog.edit_menu_prices`.
  "availability.changed": "availability.toggle",
  // `02-F27` → `02-F47`'s action, and **both types map to the ONE action** because `02-F27` names
  // them in one clause as one operator act. **Appendix A has no customer row**, so before that FR
  // these two hit the fail-closed default below and inline creation was DENIED for every role
  // including owner — which is why `02-F27`'s creation clause could not be built, not merely why
  // it was not. Third instance of the shape `02-F46` and `14-F30` each record.
  "customer.created": "customer.record",
  "customer.address_added": "customer.record",
  // `02-F64` → `02-F47`'s action, and it is the THIRD type that clause governs. **No new action is
  // minted**, on `02-F47`'s own argument: `customer.record` and `order.create` carry identical
  // cells (cashier ✔ · branch manager ✔ · storekeeper — · owner ✔), so two actions here would
  // differ in nothing an implementation can observe. `customer.record` is chosen over
  // `order.create` because the act is about the customer file's reach into an order, and because a
  // cashier who may not file a caller must not be able to attach one by another route.
  //
  // ⚠ Without this row the type hits the fail-closed default below and every link is DENIED for
  // every role including owner — which is why `02-F27`'s creation clause could not be BUILT before
  // `02-F47`, not merely why it was not. Fourth instance of the shape `02-F46` and `14-F30` record.
  "order.customer_linked": "customer.record",
  /**
   * `10-F13` receiving, `10-F17`/`10-F29`/`10-F30` the blind guided count, `10-F16` the wastage
   * log — the three `stock.*` acts `plans/inventory/design.md` §7 slice 1 puts on a DEVICE.
   *
   * **They live here and cannot live on the cloud plane.** `stock.*` is not in `01-F62`'s
   * org-scoped set, so every one of these needs a branch-scoped envelope stamped at append by an
   * originating device (`01-F43`..`F46`). A back-office page emitting one is the exact wall
   * `05-F28` records for the manager console — which is why the count is a till surface and not a
   * screen beside the menu editor. `10-F17`'s August 2026 amendment makes the till explicit: the
   * device is a layer-3 choice, so *"a till surface is in contract and a phone port is a port"*.
   *
   * ⚠ **NO ACTION IS MINTED, AND THAT IS WHAT MAKES THIS DIFFERENT FROM THE FOUR ROWS ABOVE.**
   * `02-F46`, `02-F47`, `02-F64` and `14-F30` each had to invent the action first, because
   * Appendix A carried no row. All three of these ship in `PERMISSION_ACTIONS` ALREADY, with role
   * cells, off Appendix A's own rows — `Receive stock / transfers`, `Physical count entry`,
   * `Record wastage`. So the authority to count has existed for this module's whole life and the
   * ROUTE to it did not: measured 2026-08-25 before this change, `WRITE_ACTIONS` held no `stock.*`
   * key at all, so all three fell to the fail-closed `action === null` default below and were
   * **DENIED for every role including owner** — while `can(owner, "stock.count_entry", …)`
   * answered `allow`. Inventory was therefore UNBUILDABLE rather than merely unbuilt, and no
   * device surface anyone wrote could have appended a count. `10-F34` records the identical shape
   * one surface over, for the READ.
   *
   * The mapping is 1:1 and Appendix A is why. `stock.receive`'s row reads *"Receive stock /
   * transfers"*, so `stock.transfer_sent`/`transfer_received` belong on this same action when
   * slice 2 builds them; they are absent here because nothing emits them yet and a row for an
   * unemittable type is a claim this file cannot keep. `stock.production_recorded` is absent for a
   * DIFFERENT and load-bearing reason — it has no action anywhere in the matrix, so it is
   * unbuildable in the `02-F46` sense and needs amendment **A7** first (design §6). Adding a row
   * pointing it at one of these three would be inventing policy (commandment 2).
   */
  "stock.purchase_recorded": "stock.receive",
  "stock.count_recorded": "stock.count_entry",
  "stock.wastage_recorded": "stock.wastage_record",
};

/** The one event type whose verdict needs an amount, so it never reaches `WRITE_ACTIONS`. */
const PAID_OUT = "cash.paid_out";

/**
 * The one event type whose ACTION needs an amount, so it never reaches `WRITE_ACTIONS` either.
 * Neighbouring shape to `PAID_OUT`, different question — see the map's note and `verdictFor`.
 */
const DISCOUNT = "discount.recorded";

/**
 * The two figures and the one projection read that `can()` cannot reach, gathered so the three
 * readings of `verdictFor` ask the identical question. It replaced a bare
 * `paidOutApprovalThresholdPaisa: number` positional when the discount branch landed: a second
 * loose number in the same slot is how a caller passes the right value to the wrong parameter.
 */
type MatrixLimits = {
  /** `05-F19`. See `PAID_OUT_APPROVAL_THRESHOLD_PAISA`. */
  readonly paidOutApprovalThresholdPaisa: number;
  /** `02-F20` + Appendix A's `X%`. See `DISCOUNT_APPROVAL_THRESHOLD_BPS`. */
  readonly discountApprovalThresholdBps: number | undefined;
  /**
   * `01-F30`'s `billed_total` for one order as THIS DEVICE's own fold projects it, or `null`
   * when this device has no such open order. Never the payload's — Commandment 8.
   */
  readonly orderTotalPaisa: ((order_id: string) => number | null) | undefined;
  /**
   * `17-F24` / `17-F12` — resolve the campaign a discount CLAIMS, on the trusted side.
   *
   * ⚠ **`undefined` MEANS "THIS HOST SERVES NO CAMPAIGNS", AND THAT IS THE OPPOSITE DIRECTION
   * FROM `orderTotalPaisa` DIRECTLY ABOVE — deliberately, and the asymmetry is the safe one.** An
   * absent order total DENIES, because a threshold with no base cannot be judged at all. An absent
   * campaign resolver falls through to the ordinary discretionary predicate, because that predicate
   * is the STRICTER of the two: a large discount then asks for a manager instead of being
   * pre-approved by a campaign nobody could look up. `17-F22` says the same thing about the wire —
   * *"a device that has never received the artifact has no campaigns, which is the safe direction
   * and never blocks a sale"*.
   *
   * Takes the amount because `17-F24`'s pre-approval is bounded by the campaign's own `cap_paisa`,
   * and the whole point of `within_campaign_bounds` being a separate field from the id is that
   * citing a campaign is not the same as being inside it.
   */
  readonly campaignCitation:
    | ((order_id: string, campaign_id: string, amount_paisa: number) => CampaignCitation | null)
    | undefined;
};

/**
 * `02-F20`'s org discount threshold, as integer basis points of the order's billed total
 * (Appendix A writes `X%`, so the unit is a RATE and not paisa — `DEC-MONEY-005` puts rates in
 * integer bps).
 *
 * **PINNED, not specified — and more thinly than `PAID_OUT_APPROVAL_THRESHOLD_PAISA` above, which
 * is stated rather than smoothed over.** That pin reproduces a worked scenario: `05 §5` has a
 * PKR 4,000 paid-out that must escalate, so Rs 2,000 is read off the corpus. **No FR anywhere
 * supplies a discount percentage.** Appendix A writes `Discount ≤ X% (configurable)` and leaves
 * `X` open; `02-F20` says only *"above the org threshold"*; R63 rules that the number is the
 * owner's and **not the vendor's** — *"this should be a feature for the restaurant owner or ops
 * lead to set not us"* — and its stated consequence is that `00 §7` layer 2 becomes MVP scope,
 * carrying `PAID_OUT_APPROVAL_THRESHOLD_PAISA` there with it. So this constant is a placeholder
 * for a configuration surface that does not exist, and it is the FIRST thing to delete when it
 * does.
 *
 * 1000 bps = 10%. Chosen as the round number an owner would recognise, and the direction of the
 * error is the one that costs least: too LOW makes a legitimate discount ask for a manager, which
 * `02-F20` already gives a one-tap answer to; too HIGH lets a cashier give money away
 * unsupervised, permanently (`01-F1`). A pin with no source should fail toward the manager.
 *
 * Exported and passed EXPLICITLY at the one call site, on `PAID_OUT_APPROVAL_THRESHOLD_PAISA`'s
 * reasoning: a default living inside this module is the optional-means-skip hole one layer up.
 */
export const DISCOUNT_APPROVAL_THRESHOLD_BPS = 1000;

/**
 * `05-F19`'s org threshold, in integer paisa (`00 §6`).
 *
 * **PINNED, not specified** — stated as a pin for the same reason `IDLE_LOCK_MS` and
 * `MAX_FAILED_ATTEMPTS` are in `main/index.ts`. `05-F19` fixes the RULE ("`cash.paid_out` above
 * the org threshold requires approval") and names no number, and `00 §7`'s layer-2 config plane
 * that would carry one does not exist yet. Rs 2,000 sits under `05 §5`'s own worked scenario
 * (a PKR 4,000 paid-out that must escalate), so the pin reproduces the spec's example rather
 * than a preference.
 *
 * Exported and passed EXPLICITLY at the one call site: `canPayOut` takes both figures as
 * required parameters on `01-F60`'s precedent, and a default living inside this module would be
 * the same optional-means-skip hole one layer up.
 */
export const PAID_OUT_APPROVAL_THRESHOLD_PAISA = 200_000;

/**
 * Why a write was refused, attached to the thrown error so a caller can tell the three outcomes
 * apart. `escalate` is NOT `deny`: `02-F20` gives it two equivalent paths (a local manager PIN
 * on the POS, a remote approval from the console), and a caller that could not distinguish them
 * would have no way to offer either.
 *
 * **The LOCAL path is built now** (`authorizeEscalation` below); the remote one is doc 05 and is
 * not Wave 1. So an escalation is still refused HERE — the unescalated write never lands — and
 * the roles that close the gap travel with the refusal, which is what lets the approval pad name
 * them off the matrix rather than hardcoding "manager" into a screen (`18 §5`'s banned inline
 * check, relocated into UI).
 */
export type WriteRefusal = {
  readonly event_type: string;
  readonly outcome: "deny" | "escalate";
  /** `null` when the event type carries no matrix action at all (the fail-closed default). */
  readonly action: PermissionAction | null;
  /** `02-F20` — whose credential closes the gap. Empty on a plain deny. */
  readonly satisfied_by: readonly Role[];
};

export type WriteRefusedError = Error & { readonly refusal: WriteRefusal };

/** The renderer-facing write surface, authorized. Same shapes as the gateway's own two. */
export type AuthorizedWrites = {
  append: (req: unknown) => AppendResult;
  addLine: (req: unknown) => AppendResult;
  /** `02-F7`/`02-F46` — the 86, guarded like every other renderer-originated append. */
  toggleAvailability: (req: unknown) => AppendResult;
  /** `02-F27`/`02-F47` — filing the caller, guarded like every other renderer-originated append. */
  recordCustomer: (req: unknown) => AppendResult;
  /** `02-F64`/`02-F47` — attaching an order to a customer, guarded like the four above it. */
  linkCustomer: (req: unknown) => AppendResult;
};

export type AuthorizedWritesDeps = {
  /** The unguarded writes this wraps. Narrowed by name so nothing else can slip past. */
  writes: Pick<
    Gateway,
    "append" | "addLine" | "toggleAvailability" | "recordCustomer" | "linkCustomer"
  >;
  /**
   * `01-F26`/`01-F28` — the assignments come from the SYNCED staff registry on this device, and
   * `store.identity` is where the org and branch come from. Neither is anything the renderer
   * sends: `02-F45` reads attribution off the envelope, and a role claim that arrived over the
   * bridge is the exact thing Commandment 8 forbids trusting.
   */
  store: Pick<DeviceStore, "identity" | "staff">;
  /** `02-F41` — a GETTER, for the same reason the gateway's is: the session moves 20–60×/shift. */
  session: () => Session | null;
  /** `05-F19` — REQUIRED, never defaulted. See `PAID_OUT_APPROVAL_THRESHOLD_PAISA`. */
  paidOutApprovalThresholdPaisa: number;
  /**
   * `02-F20`'s two discount inputs, and **they are OPTIONAL where
   * `paidOutApprovalThresholdPaisa` directly above is REQUIRED. That is not an inconsistency and
   * the difference decides which way each one fails.**
   *
   * `canPayOut`'s threshold is required because `cash.paid_out` is `allow` for **every** role: a
   * host that omitted it would be a host where nothing ever escalates, so absent-means-skip is a
   * Rs 4,000 withdrawal walking past `05-F19`. That is `01-F60`'s optional-completeness hole and
   * it is why that field cannot be optional.
   *
   * A discount's absent input fails the other way. `discount.recorded` has no `WRITE_ACTIONS` row,
   * so `verdictFor` reaching the end DENIES it — and the branch below refuses explicitly when
   * either input is missing rather than relying on that. **Absent therefore means `deny`, which is
   * exactly the shipped behaviour before this feature existed**: a host that forgets these cannot
   * authorize a discount it should have refused, it can only refuse one it should have allowed,
   * and the cashier sees `02-F57`'s refusal on the counter rather than money leaving quietly.
   *
   * They are optional rather than required for the reason `OpenOrderSchema`'s four `.optional()`
   * fields record one file over — a new required key on this bag is a compile error in a dozen
   * oracle files (`24 §3` step 2) — and that trade is only acceptable **because** the failure
   * direction is safe. It would not be acceptable one field up. `seams:check` Rule B watches both
   * from here: an optional member of an options bag on a factory shipping code already calls is
   * exactly its candidate shape, so a host that stops supplying them reddens `pnpm verify`.
   */
  discountApprovalThresholdBps?: number;
  /**
   * `01-F30`'s billed total for one order, from THIS DEVICE's own converged fold — the base
   * `canDiscount` takes its percentage of. A function rather than a value because the projection
   * moves with every line added: a total captured at construction would authorize a discount
   * against a bill that has since doubled.
   *
   * `null` for an order this device has no row for, which `verdictFor` refuses. Supplied by the
   * host from `gateway.openOrders()` so the number is the engine's own (`26 §8`).
   */
  orderTotalPaisa?: (order_id: string) => number | null;
  /**
   * `17-F24` — resolve the campaign a `discount.recorded` CLAIMS, against THIS device's own
   * `17-F22` artifact. Supplied by the host from `main/campaigns.ts`'s `campaignCitationFor`.
   *
   * Optional on `discountApprovalThresholdBps`'s precedent and with its own safe direction: absent
   * means this host serves no campaigns, so every discount takes the ordinary discretionary
   * predicate — the STRICTER of the two, and the same disposition `17-F22` gives a device that has
   * never received the artifact. `seams:check` Rule B watches it from here, so a host that stops
   * supplying it reddens `pnpm verify:full` — which is the only rail that can see this seam at all,
   * because a stub supply is still a supply and no behavioural test injects the shipped wiring.
   */
  campaignCitation?: (
    order_id: string,
    campaign_id: string,
    amount_paisa: number,
  ) => CampaignCitation | null;
};

const refused = (refusal: WriteRefusal): WriteRefusedError => {
  const what = refusal.action ?? "no permission action";
  const message =
    refusal.outcome === "escalate"
      ? `${refusal.event_type} needs manager approval (02-F20, ${what}) — satisfied by ` +
        `${refusal.satisfied_by.join(" or ")}. This session cannot perform it unsupervised.`
      : `${refusal.event_type} is not permitted for this session (${what}) — ` +
        `refused by the domain permission matrix (Commandment 8).`;
  const error = new Error(message) as Error & { refusal: WriteRefusal };
  error.refusal = refusal;
  return error;
};

/**
 * A registry role string, narrowed to a matrix column.
 *
 * `StaffAssignment.role` is a plain `string` — it arrives over the sync chain as reference data
 * — so a row naming a role this matrix does not carry grants NOTHING rather than being coerced
 * into the nearest column. `01-F48`'s fail-closed direction, applied at the one place a wire
 * value becomes an authority.
 */
const roleOf = (name: string): Role | null => ROLES.find((role) => role === name) ?? null;

/**
 * The two facts a subject is built from, named separately so the WRITE guard and the READ guard
 * below share one construction. `02-F45`'s argument, applied to authorization: two sources for
 * one fact can disagree, and a second `AuthSubject` assembled beside this one is exactly that —
 * a session that could be denied a write and granted the read of its result.
 */
type SubjectDeps = {
  store: Pick<DeviceStore, "identity" | "staff">;
  session: () => Session | null;
};

/**
 * Who is asking (`01-F27`). `null` is a LOCKED device, and a locked device is a subject with no
 * authority at all — `01-F27` is explicit that a device identity is never promoted into a user
 * identity, so the answer is not "the device may do it".
 */
const subjectOf = (deps: SubjectDeps): AuthSubject | null => {
  const session = deps.session();
  if (session === null) return null;
  const member = deps.store.staff.lookup(session.user_id);
  // ── `11-F22` ON THE DEVICE PLANE, AND WHY ONE STATUS IS ENOUGH HERE ─────────────────────────
  //
  // `11-F22` carries participation per-(PERSON, BRANCH) and `01-F78` says "the status a row
  // carries is THIS branch's". A device holds exactly ONE branch's artifact (`01-F76`, R25 — the
  // scope IS the credential blast radius), so every assignment on this roster already reaches this
  // branch, and the member's single status is that pair's value for every one of them. The wire
  // carries it once on the ENTRY rather than on each assignment for the same reason (`01-F75`).
  //
  // So per-(person, branch) collapses to per-person WITHIN one artifact — it is not a second
  // reading of the FR, it is the same reading evaluated where only one branch exists. A device
  // that ever held two branches' rosters would have to stop doing this, and `01-F76` is what
  // stops it holding them.
  //
  // ⚠ An absent member is an EMPTY assignment list and therefore no authority (`01-F27`), which is
  // the same fail-closed answer `01-F48` gives for a state that cannot be read — and it is why a
  // missing status can never reach `can()` as `active` from this site.
  const status = member?.status;
  const assignments =
    status === undefined
      ? []
      : (member?.assignments ?? []).flatMap((assignment) => {
          const role = roleOf(assignment.role);
          return role === null ? [] : [{ role, branch_id: assignment.branch_id, status }];
        });
  return { user_id: session.user_id, org_id: deps.store.identity.org_id, assignments };
};

/**
 * The sentinel for "the matrix permits this outright". A singleton compared by IDENTITY (`allows`
 * below), never by field: a refusal that happened to carry the same three values must not read as
 * a permission, which is the one confusion a three-valued outcome squeezed into a refusal type
 * could produce.
 */
const ALLOWED: WriteRefusal = Object.freeze({
  event_type: "",
  outcome: "deny",
  action: null,
  satisfied_by: [],
});

const allows = (verdict: WriteRefusal): boolean => verdict === ALLOWED;

const scopeOf = (store: Pick<DeviceStore, "identity">): AuthScope => ({
  org_id: store.identity.org_id,
  branch_id: store.identity.branch_id,
});

/**
 * The deps that `can()` cannot reach, gathered for `verdictFor`. Reads the resolver off `deps`
 * rather than calling it, so the projection is consulted at VERDICT time and not at construction.
 */
const limitsOf = (deps: AuthorizedWritesDeps): MatrixLimits => ({
  paidOutApprovalThresholdPaisa: deps.paidOutApprovalThresholdPaisa,
  discountApprovalThresholdBps: deps.discountApprovalThresholdBps,
  // Read off `deps` at call time rather than captured, so the projection is consulted at VERDICT
  // time and not at construction.
  orderTotalPaisa:
    deps.orderTotalPaisa === undefined
      ? undefined
      : (order_id) => deps.orderTotalPaisa?.(order_id) ?? null,
  // Same shape and the same reason: read off `deps` at call time so the artifact and the order
  // projection are both consulted at VERDICT time. A citation captured at construction would judge
  // a discount against a campaign that has since been paused.
  campaignCitation:
    deps.campaignCitation === undefined
      ? undefined
      : (order_id, campaign_id, amount_paisa) =>
          deps.campaignCitation?.(order_id, campaign_id, amount_paisa) ?? null,
});

/**
 * The matrix's verdict on ONE event for ONE subject — the whole of this file's policy reading,
 * extracted so that two different subjects can be asked the identical question.
 *
 * It was inlined in `guard` and had exactly one caller. `02-F20`'s local path needs three
 * readings of it, not one: what the matrix says about the REQUESTER (which is what makes an act
 * escalatable at all), and what it says about the APPROVER (which is what `02-F20` means by "the
 * approver must hold the permission"). A second copy of this reasoning for the approver is how
 * an escalation quietly widens a cell the guard narrows — so there is one.
 *
 * Returns the outcome VERBATIM, including `allow`. Collapsing it to "refused or not" is what
 * loses `escalate`, and losing `escalate` is what made this feature unable to exist.
 */
const verdictFor = (
  subject: AuthSubject | null,
  scope: AuthScope,
  limits: MatrixLimits,
  event_type: string,
  payload: Record<string, unknown>,
): WriteRefusal => {
  const action = WRITE_ACTIONS[event_type] ?? null;
  const denied = (): WriteRefusal => ({ event_type, outcome: "deny", action, satisfied_by: [] });
  const from = (decision: {
    outcome: AuthOutcome;
    action: PermissionAction;
    satisfied_by?: readonly Role[];
  }): WriteRefusal => ({
    event_type,
    // `allow` is not a member of `WriteRefusal["outcome"]` and must not become one: the type is
    // what a REFUSAL carries. The allow case never reaches a `refused(...)` call — see `allows`.
    outcome: decision.outcome === "escalate" ? "escalate" : "deny",
    action: decision.action,
    satisfied_by: decision.satisfied_by ?? [],
  });

  // `01-F27` — a locked device is a subject with no authority at all, never "the device may".
  if (subject === null) return denied();

  if (event_type === PAID_OUT) {
    const amount = payload.amount_paisa;
    // `02-F44` — the amount is REQUIRED, and here it is the input the verdict turns on. A
    // paid-out that states none cannot be measured against `05-F19`'s threshold, and the
    // answer that cannot be right is "under it": that is how a Rs 4,000 paid-out walks past
    // the approval the FR exists to require. `01-F60`'s precedent, one layer down.
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) return denied();
    const decision = canPayOut(subject, scope, {
      amount_paisa: amount,
      threshold_paisa: limits.paidOutApprovalThresholdPaisa,
    });
    return decision.outcome === "allow" ? ALLOWED : from(decision);
  }

  /**
   * `02-F20`'s discount, on `cash.paid_out`'s pattern directly above and for a DIFFERENT
   * reason, which is why it is a second branch and not a row in `WRITE_ACTIONS`.
   *
   * The paid-out has one action whose verdict turns on an amount. A discount has **two
   * actions** — Appendix A's `Discount ≤ X%` and `Discount > X%`, both shipping in
   * `permissions.ts` — and the amount decides *which one the act is an instance of*. A
   * `Record<event_type, action>` cannot express that, so `discount.recorded` had no row at all
   * and hit the fail-closed default below: measured before this change, a discount was DENIED
   * for every role including owner, which is `02-F61`'s *"specified and unbuilt"* living in the
   * matrix rather than on the screen.
   *
   * **`canDiscount` holds the policy, not this file** (`18 §5`, and this module's own header:
   * *"It holds no policy of its own"*). What lives here is the two inputs the matrix cannot
   * reach: the org threshold, and the order's billed total.
   *
   * **The total is read from THIS DEVICE's own fold, never from the payload** (Commandment 8).
   * A renderer that sent its own base could make any discount read as within-threshold by
   * inflating one number, which is `02-F20`'s manager PIN deleted by a field. It is the same
   * synchronous local-projection read `02-F49` and `DEC-MONEY-009` already make — no peer, no
   * clock, no network — so a WAN outage cannot turn a refusal into an allow or the reverse.
   *
   * **An order this device cannot see is DENIED, not defaulted.** `01-F60`'s precedent: the
   * answer that cannot be right is the permissive one. A missing order treated as a zero base
   * would still be safe by accident (every positive discount escalates), but treated as
   * anything else it is an unapproved discount in an append-only ledger — so it refuses in
   * terms rather than relying on the arithmetic to refuse for it.
   */
  if (event_type === DISCOUNT) {
    // Absent inputs DENY — see `AuthorizedWritesDeps.discountApprovalThresholdBps` for why that
    // is safe here and would not be one field up.
    const { discountApprovalThresholdBps: threshold_bps, orderTotalPaisa } = limits;
    if (threshold_bps === undefined || orderTotalPaisa === undefined) return denied();
    const amount = payload.amount_paisa;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) return denied();
    const order_id = payload.order_id;
    if (typeof order_id !== "string") return denied();
    const order_total_paisa = orderTotalPaisa(order_id);
    if (order_total_paisa === null) return denied();
    // `17-F24` — **the payload's `campaign_id` is a CLAIM and the resolver is the judge**
    // (Commandment 8). The renderer may say a discount cites campaign X; whether X exists in this
    // device's own artifact, reaches this order and bounds this amount is decided here, from the
    // trusted side. Anything unreadable — a non-string id, no resolver, an unknown campaign, an
    // amount over its cap — is `null`, which means the discretionary predicate below runs
    // untouched (`17-F12`'s last clause).
    const claimed = payload.campaign_id;
    const campaign =
      typeof claimed === "string" && limits.campaignCitation !== undefined
        ? limits.campaignCitation(order_id, claimed, amount)
        : null;
    const decision = canDiscount(subject, scope, {
      amount_paisa: amount,
      order_total_paisa,
      threshold_bps,
      campaign,
    });
    return decision.outcome === "allow" ? ALLOWED : from(decision);
  }

  if (action === null) return denied();

  /**
   * `02-F38` — "a requester never sees an approve control for their own request … *and*
   * refused server-side by the `domain` permission matrix (a client that renders it anyway
   * must still fail)". `can` performs the refusal; this supplies the fact it needs.
   *
   * A grant that names NO requester is refused, for `canPayOut`'s reason exactly: without the
   * requester the self-approval rule cannot be evaluated, and the outcome that cannot be right
   * is the permissive one — an omitted field would re-open the hole by silence.
   *
   * **Owed, and named rather than left to look intentional:** `05-F7` puts `requester_id` on
   * the REQUEST and has the grant reference the request by id, so the trustworthy resolution
   * is request-id → requester through an approvals projection. That projection is doc-05 work
   * and does not exist, so this reads the field off the grant.
   */
  if (action === "approval.grant") {
    const requester = payload.requester_id;
    if (typeof requester !== "string") return denied();
    const decision = can(subject, action, { ...scope, requested_by_user_id: requester });
    return decision.outcome === "allow" ? ALLOWED : from(decision);
  }

  const decision = can(subject, action, scope);
  return decision.outcome === "allow" ? ALLOWED : from(decision);
};

export const authorizeWrites = (deps: AuthorizedWritesDeps): AuthorizedWrites => {
  /** Throws a `WriteRefusedError` unless the matrix allows this event outright. */
  const guard = (event_type: string, payload: Record<string, unknown>): void => {
    const verdict = verdictFor(
      subjectOf(deps),
      scopeOf(deps.store),
      limitsOf(deps),
      event_type,
      payload,
    );
    if (allows(verdict)) return;
    throw refused(verdict);
  };

  return {
    append: (req: unknown): AppendResult => {
      // Parsed with the SAME schema the gateway parses with, so there is no shape that slips
      // past this guard and is still accepted below: a request this cannot read is a request
      // `gateway.append` throws on, and authorizing what we cannot read would be answering a
      // question nobody asked.
      const parsed = AppendRequestSchema.safeParse(req);
      if (parsed.success) guard(parsed.data.type, parsed.data.payload);
      return deps.writes.append(req);
    },
    /**
     * `C5` — the counter's highest-frequency act, and the event type is fixed by the channel
     * rather than supplied by the caller (`gateway.addLine` always appends `order.line_added`),
     * so the action is known before the request is even read.
     */
    addLine: (req: unknown): AppendResult => {
      guard("order.line_added", {});
      return deps.writes.addLine(req);
    },
    /**
     * `02-F7` — the event type is fixed by the channel (`gateway.toggleAvailability` always appends
     * `availability.changed`), so the action is known before the request is read, exactly as for
     * `addLine` above.
     *
     * **This wrapper is why the method exists on its own channel rather than as an `append`
     * payload.** `authorizeWrites` guards the two renderer-facing write channels and nothing
     * else, so a third write channel wired straight to the gateway would be a Commandment 8
     * bypass — a renderer-originated append reaching the ledger with no matrix verdict. The
     * `Pick` above is what makes forgetting this a typecheck error.
     */
    toggleAvailability: (req: unknown): AppendResult => {
      guard("availability.changed", {});
      return deps.writes.toggleAvailability(req);
    },
    /**
     * `02-F27`/`02-F47` — the caller's file. The event types are fixed by the channel
     * (`gateway.recordCustomer` always appends `customer.created`, and `customer.address_added`
     * beside it), so the action is known before the request is read, exactly as for the two above.
     *
     * **BOTH types are guarded, not just the create.** They share one action (`02-F47`), so the
     * two `guard` calls ask one question twice — which is deliberate: if a later FR ever splits
     * the action, this reads as two separate refusals rather than one that silently covered both.
     * The address is guarded whether or not this request carries one, because what is authorized
     * is the ACT `02-F27` names, and a caller who supplies no address has not performed a lesser
     * one. Guarding only the half that happens to be present would make the verdict depend on the
     * payload, which is how a narrower cell gets routed around by omitting a field.
     */
    recordCustomer: (req: unknown): AppendResult => {
      guard("customer.created", {});
      guard("customer.address_added", {});
      return deps.writes.recordCustomer(req);
    },
    /**
     * `02-F64`/`02-F47` — attaching an order to a customer. The event type is fixed by the channel
     * (`gateway.linkCustomer` appends `order.customer_linked` and nothing else), so the action is
     * known before the request is read, exactly as for the three above.
     *
     * **The action is `customer.record` and no new one is minted** — `02-F64` argues it: that row
     * and `order.create` carry identical cells, and `02-F47`'s reasoning is that two actions whose
     * cells are identical differ in nothing an implementation can observe. `customer.record` is
     * chosen over `order.create` so a cashier who may not file a caller cannot attach one by
     * another route.
     *
     * ⚠ **`01-F17` IS NOT WEAKENED BY GUARDING THIS.** A refused link leaves the order, its lines,
     * its tender and its close exactly as they were; what is lost is a loyalty counter, a phone
     * search and a khata, which is the state every order in this product was in before `02-F64`.
     */
    linkCustomer: (req: unknown): AppendResult => {
      guard("order.customer_linked", {});
      return deps.writes.linkCustomer(req);
    },
  };
};

// ── 02-F20's LOCAL manager-PIN path ─────────────────────────────────────────────────────────────

/**
 * **`02-F20`: *"Two equivalent authorization paths: local manager PIN on the POS; remote approval
 * via manager console. First response wins; the recorded event carries actor + approver either
 * way."*** This is the first of the two. The second is doc 05 and is not Wave 1.
 *
 * Until this existed, `can()`'s third outcome had no surface anywhere in the product, so an
 * above-threshold paid-out (`05-F19`) was refused outright — not deferred, not queued, REFUSED —
 * on a device with no console attached, which is every device this wave ships. `05-F8` had to be
 * corrected for claiming the local path "remains fully available" when it had never existed.
 *
 * ── The four things this refuses, and why each one is a separate refusal ─────────────────────
 *
 * 1. **A PIN that does not verify** (`01-F28`). Delegated to `verifyApprover`, which is
 *    `createPinSession` — the SAME Argon2id verification and the SAME `01-F61` durable
 *    per-(device, user) counter as the unlock gate. A second comparison here would be a second
 *    credential surface with its own lockout to forget about.
 * 2. **A requester approving their own request** (`02-F38`) — "refused server-side by the
 *    `domain` permission matrix (a client that renders it anyway must still fail)". Refused
 *    below by asking `can()` for `approval.grant` with the requester named, which is the same
 *    call the `approval.granted` write path makes. The pad may also hide it; hiding is not this.
 * 3. **An approver who does not hold the permission.** The credential proves WHO, and nothing
 *    else. `02-F20` needs a manager, and "a manager PIN was entered" is a claim about a PIN —
 *    the fact it stands in for is a matrix verdict, and that is re-read here for the approver's
 *    OWN subject rather than inherited from the requester's escalation.
 * 4. **A write that was never escalatable.** If the requester's own verdict is `deny`, a manager
 *    PIN must not launder it into an append: `02-F20` names four escalatable acts and a `deny`
 *    cell is a different answer from an `escalate` cell (the matrix is explicit — "the cashier
 *    cell is `deny`, not `escalate`"). If it is `allow`, there is nothing to approve, and
 *    recording an approver for an unescalated act would put a false approval into a ledger
 *    `01-F1` forbids correcting in place.
 *
 * ── What lands in the ledger ─────────────────────────────────────────────────────────────────
 *
 * `02-F20`'s "actor + approver". The ACTOR is the envelope's `actor_user_id`, stamped by
 * `gateway.append` from the live session (`02-F41`) — the cashier who acted, unchanged, because
 * verifying the manager's PIN deliberately does not move the session. The APPROVER is a payload
 * field, because the envelope carries exactly one identity and there is no second slot; that is
 * not a breach of `02-F45` (which forbids duplicating the ACTOR into the payload) but the only
 * place a second identity can go.
 */
export type AuthorizedEscalation = {
  /**
   * `null` when the matrix allows or flatly denies the write, an offer naming the roles that
   * close the gap when it escalates. A READ — nothing is appended and nothing is authorized.
   */
  offer: (req: unknown) => EscalationOffer | null;
  approve: (req: unknown, approver_user_id: string, pin: string) => Promise<EscalationResult>;
  /**
   * The four refusals above, decided ONCE and **appending nothing**.
   *
   * `05-F6` is *"one-tap approve/**deny**"* and `registry.ts` makes a denial a record rather than
   * the absence of one — so a denial has to pass the identical gate as a grant (`01-F28`'s
   * credential, `02-F38`'s self-approval, the approver's own matrix verdict, and "the act was
   * never escalatable") without the write on the end. A second reading of those rules in another
   * module is the drift this file's header refuses in as many words: *"A second copy of this
   * reasoning for the approver is how an escalation quietly widens a cell the guard narrows — so
   * there is one."*
   *
   * It returns BOTH identities because `05-F7` requires both on the recorded decision and
   * `02-F41` puts them in two different places: the approver is an argument the caller supplied,
   * the requester is the live session this module read — and a caller that resolved the requester
   * itself would be a second source for the fact `02-F38` is judged against.
   */
  authorizeApprover: (
    req: unknown,
    approver_user_id: string,
    pin: string,
  ) => Promise<ApproverAuthorization>;
};

/** The verdict on a manager's credential for one escalatable act. No ledger effect either way. */
export type ApproverAuthorization =
  | {
      readonly ok: true;
      readonly approver_user_id: string;
      /** `02-F41` — the live session, never a field the caller supplied. */
      readonly requester_user_id: string;
    }
  | { readonly ok: false; readonly refused: EscalationRefusal };

export type AuthorizedEscalationDeps = AuthorizedWritesDeps & {
  /**
   * `01-F28`/`01-F61` — verify a PIN for this user WITHOUT moving the session.
   *
   * A function seam rather than the session object, and that is the whole safety property: the
   * host hands in a verifier built from `createPinSession` over the same registry and the same
   * DURABLE attempt store, and this file cannot reach anything that would sign the manager in.
   * A manager who authorised a paid-out and thereby took over the till would leave the next
   * twenty orders attributed to her (`02-F41`), permanently (`01-F1`).
   */
  verifyApprover: (user_id: string, pin: string) => Promise<boolean>;
};

export const authorizeEscalation = (deps: AuthorizedEscalationDeps): AuthorizedEscalation => {
  const scope = (): AuthScope => scopeOf(deps.store);
  const limits = limitsOf(deps);

  /** What the matrix says about the SIGNED-IN session for this request. */
  const requesterVerdict = (type: string, payload: Record<string, unknown>): WriteRefusal =>
    verdictFor(subjectOf(deps), scope(), limits, type, payload);

  /**
   * `02-F20`'s four refusals, decided ONCE for both routes out of an escalation.
   *
   * `approve` puts an append on the end of it and `authorizeApprover` does not — which is the
   * whole of the difference between granting and denying, and the reason this is one function.
   * A denial that skipped `01-F28`'s credential, or `02-F38`, or the approver's own matrix
   * verdict, would be a way to write a permanent refusal into somebody else's name with no
   * credential at all (`01-F1` — there is no unwinding it).
   *
   * The ORDER of the checks is load-bearing and is unchanged: the PIN is charged to `01-F61`'s
   * durable counter BEFORE the cheaper checks, because every PIN submitted at this pad is an
   * attempt and a pad that skipped the count for a self-approval would be an unmetered place to
   * guess a colleague's PIN.
   */
  const decide = async (
    req: unknown,
    approver_user_id: string,
    pin: string,
  ): Promise<ApproverAuthorization> => {
    const no = (refused: EscalationRefusal): ApproverAuthorization => ({ ok: false, refused });
    const parsed = AppendRequestSchema.safeParse(req);
    if (!parsed.success) return no("not_escalatable");

    // The REQUESTER is the live session, never a field on the request: `02-F41` makes
    // attribution whoever's PIN is in, and a renderer that could name its own requester could
    // name the approver as the requester and defeat `02-F38` by relabelling.
    const requester = deps.session();
    if (requester === null) return no("not_escalatable");

    // (4) — the act has to BE an escalation before a credential can close it.
    const verdict = requesterVerdict(parsed.data.type, parsed.data.payload);
    if (allows(verdict) || verdict.outcome !== "escalate") return no("not_escalatable");

    // (1) — `01-F28`. Charged to `01-F61`'s durable counter by the session behind this seam,
    // and charged BEFORE the cheaper checks below on purpose: see the note above.
    if (!(await deps.verifyApprover(approver_user_id, pin))) return no("bad_pin");

    // The approver's subject, assembled from the SAME registry and the SAME `roleOf` narrowing
    // the signed-in session goes through (`subjectOf`). A second construction would be a second
    // reading of `01-F26`'s assignments, and two readings of one fact can disagree.
    const approver = subjectOf({
      store: deps.store,
      session: () => ({ user_id: approver_user_id, display_name: approver_user_id }),
    });
    // A verified PIN for an id the registry does not carry cannot happen (`01-F28` verifies
    // against that registry) — but `01-F42` can revoke a member between the two reads, and the
    // answer that cannot be right is the permissive one.
    if (approver === null) return no("not_permitted");

    // (2) + (3a) — `02-F38`, and it is `can()` that refuses, not this file. The same call the
    // `approval.granted` write path makes, with the requester named, so a self-approval is
    // refused by the matrix on the identical rule whichever route reaches it.
    const grant = can(approver, "approval.grant", {
      ...scope(),
      requested_by_user_id: requester.user_id,
    });
    if (grant.outcome !== "allow") {
      return no(approver_user_id === requester.user_id ? "self_approval" : "not_permitted");
    }

    /**
     * (3b) — the approver's OWN verdict on the act itself. `02-F20`'s approver must HOLD the
     * permission; an approver whose cell is `escalate` cannot close a gap she is standing in,
     * and one whose cell is `deny` never could.
     *
     * **`cash.paid_out` is exempt, and the matrix is what says so.** `canPayOut` derives its
     * `satisfied_by` from `approval.grant`'s row rather than its own, in terms: *"the credential
     * that closes the gap is one that may GRANT an approval, not one that may record a
     * paid-out"*. It could not be otherwise — `cash.paid_out` is `allow` for **every** role, so
     * above `05-F19`'s threshold every role escalates, the owner included, and a rule demanding
     * the approver's own verdict be `allow` here would refuse every approval this path exists
     * to permit. For `02-F20`'s four acts the matrix derives `satisfied_by` from the action's
     * own row, so there this check IS the rule. One rule, two derivations, both the matrix's.
     */
    if (parsed.data.type !== PAID_OUT) {
      const approverVerdict = verdictFor(
        approver,
        scope(),
        limits,
        parsed.data.type,
        parsed.data.payload,
      );
      if (!allows(approverVerdict)) return no("not_permitted");
    }

    return { ok: true, approver_user_id, requester_user_id: requester.user_id };
  };

  return {
    offer: (req: unknown): EscalationOffer | null => {
      const parsed = AppendRequestSchema.safeParse(req);
      if (!parsed.success) return null;
      const verdict = requesterVerdict(parsed.data.type, parsed.data.payload);
      // `allows` first: `ALLOWED` carries `outcome: "deny"` by construction, and reading its
      // outcome instead of its identity would report "no escalation" for the right answer by
      // luck rather than by rule.
      if (allows(verdict) || verdict.outcome !== "escalate") return null;
      if (verdict.satisfied_by.length === 0) return null;
      return { satisfied_by: verdict.satisfied_by };
    },

    authorizeApprover: (req, approver_user_id, pin) => decide(req, approver_user_id, pin),

    approve: async (
      req: unknown,
      approver_user_id: string,
      pin: string,
    ): Promise<EscalationResult> => {
      const decision = await decide(req, approver_user_id, pin);
      if (!decision.ok) return { ok: false, refused: decision.refused };

      // Re-read rather than carried out of `decide`, so its return shape stays the two identities
      // `05-F7` asks for and nothing else. The schema is total and this request already passed it
      // inside `decide`, so the branch below is unreachable — it exists because a `safeParse`
      // result is the only honest way to spend one.
      const parsed = AppendRequestSchema.safeParse(req);
      if (!parsed.success) return { ok: false, refused: "not_escalatable" };

      // `02-F20` — "the recorded event carries actor + approver either way". The actor is stamped
      // into the envelope from the session by `gateway.append`; this is the other half.
      return {
        ok: true,
        ...deps.writes.append({
          type: parsed.data.type,
          payload: { ...parsed.data.payload, approver_user_id },
          refs: parsed.data.refs,
        }),
      };
    },
  };
};

/**
 * **Commandment 8 applied to a READ** — `02-F23`'s *"cashiers see only their own shifts
 * (`restaurant-os.md` Appendix A); cross-cashier views belong to manager/owner surfaces (docs
 * 05/12)."*
 *
 * The counterpart of `authorizeWrites`, and it lives here for the reason that file header gives:
 * `18 §9` gives the renderer no Node access, so MAIN is what "server-side" means on this app.
 * The renderer may draw less than it is handed — but it must not be able to ask for more, and a
 * filter drawn in `CashSurfaces.tsx` would be a client role claim deciding a privacy rule.
 *
 * ── Why a REACH and not a decision ──────────────────────────────────────────────────────────
 *
 * Appendix A's `View sales reports` row holds SCOPES, not verdicts: *own shift only* · *own
 * branch* · *stock reports* · *everything*. `domain`'s `reportScope` is the predicate that
 * resolves them, and this is its first caller anywhere in the product. Nothing below decides a
 * cell — it applies the one the matrix returned.
 *
 * `can(subject, "report.sales_view", …)` is deliberately NOT used: it answers a per-record
 * question by comparing `scope.subject_user_id`, which collapses `own_shift` and the null case
 * into one refusal. See the filter's own note.
 */
export type AuthorizedReads = {
  /** `02-F23`/`02-F37`/`02-F43` — the `shift_cash` projection, scoped to the asking subject. */
  cashState: () => CashState;
};

export type AuthorizedReadsDeps = SubjectDeps & {
  /** The unscoped read this wraps. Narrowed to one method so nothing else can slip past. */
  reads: Pick<Gateway, "cashState">;
};

/**
 * `02-F23`'s row test, and it is TWO clauses of one FR rather than one.
 *
 * The leak clause — "cashiers see only their own shifts" — is what hides `theirs`. The
 * protection clause in the same FR — "the cashier sees their own reconciliation on-screen at
 * close ('I'm clean') — the staff-protection framing" — is what forbids hiding `mine`, and it is
 * the half a narrowing inverts by accident: a filter that satisfies the first by hiding
 * everything satisfies it perfectly and leaves a protection surface showing a cashier nothing
 * about herself.
 *
 * **An UNATTRIBUTED row (`cashier: null`) is served.** It is not a colleague's shift, so the
 * leak clause does not reach it; and the fold projects null on exactly the case that most needs
 * to be seen — `01-F31`'s contested open, where the delivered members disagree, a fold never
 * picks a winner and `shift_open_divergence` is raised. Hiding a contested shift from the
 * cashier it is about is `02-F23`'s framing inverted, and `02-F37`/`02-F43` name this very
 * screen ("the cashier's own day view (`02-F23`)") as one of the two places an anomaly must
 * appear. **Reported as an interpretation, not settled:** the narrower reading of "only their
 * own" would hide it, and `can()`'s `own_shift` arm takes that narrower one.
 *
 * It is also the case that stays live after the fold conformed. `shift_cash` now projects
 * `cashier` from the envelope's `actor_user_id` (`02-F45`, landed August 2026 — the fold read a
 * payload field the FR forbids, and the stale pin recording that as "undecided" is retired), so a
 * row carrying an identity IS narrowed. A null still means one of two real things: an event
 * appended before identity reached the envelope, or an `01-F31` divergence where two devices
 * claimed one shift under different PINs and the fold refused to pick a winner. Serving both is
 * deliberate. Hiding the first would blank the Me tab for pre-identity shifts; hiding the second
 * would conceal a contested shift from the cashier it accuses, which inverts `02-F23`'s
 * protection guarantee in the same way the first inversion does.
 */
const isOwnShift = (cashier: string | null, user_id: string): boolean =>
  cashier === null || cashier === user_id;

export const authorizeReads = (deps: AuthorizedReadsDeps): AuthorizedReads => ({
  cashState: (): CashState => {
    const state = deps.reads.cashState();
    // Re-resolved on EVERY call, never at construction: `ipcMain.handle` admits one handler per
    // channel for the whole process life while `01-F26`'s unlock/auto-lock cycle moves the
    // signed-in identity 20–60× a shift. A reach computed once would be correct until the first
    // auto-lock and wrong for the rest of the day.
    const subject = subjectOf(deps);
    // A locked device is a subject with no authority (`01-F27`), so it gets no shift — not the
    // device's, not the last user's.
    if (subject === null) return { ...state, shifts: [] };

    const reach = reportScope(subject, {
      org_id: deps.store.identity.org_id,
      branch_id: deps.store.identity.branch_id,
    });

    switch (reach) {
      // "own branch" and "everything" are already resolved against THIS location by the matrix's
      // own per-assignment filter, so there is nothing left to narrow. `05-F20`: the console
      // ADDS the manager's cross-cashier view, it does not replace the cashier's own screen —
      // narrowing a manager here would delete the reconciliation doc 05 is built on.
      case "own_branch":
      case "org":
        return state;
      case "own_shift":
        return {
          ...state,
          // A new array; the fold's own projection is never mutated (`26 §8` owns it) and the
          // rows keep the order the fold gave them (`27-F4` — a row never moves under her).
          shifts: state.shifts.filter((shift) => isOwnShift(shift.cashier, subject.user_id)),
        };
      // `none` — Appendix A's storekeeper column reads "stock reports", i.e. no sales rows, and
      // a subject holding no assignment at this branch is a stranger here (`01-F26`). Written as
      // the default arm so a reach added to `ReportReach` later fails CLOSED rather than
      // inheriting the widest answer by silence.
      default:
        return { ...state, shifts: [] };
    }
  },
});

/**
 * `04-F23` — **THE TERMINAL'S GATE, AND IT IS TWO GATES RATHER THAN ONE.**
 *
 * A `04-F21` terminal is a browser on the shop Wi-Fi holding no store, no device identity and no
 * credential beyond a session handle. The till verifies its waiter, authorizes the act and
 * appends. This is the authorize step, and it lives in THIS file for the reason the file's own
 * header already gives for the escalation: *"A second copy of this reasoning for the approver is
 * how an escalation quietly widens a cell the guard narrows — so there is one."* A terminal guard
 * assembled anywhere else would be a second reading of `01-F26`'s assignments and of the matrix,
 * and two readings of one fact can disagree.
 *
 * ── Gate 1: the SURFACE (`TERMINAL_EVENT_TYPES`) ─────────────────────────────────────────────
 *
 * `04-F23` rules that the narrowing a `waiter` COLUMN was wanted for is delivered by the terminal
 * and not by the role: *"A role narrows a person across every surface; this narrows a surface
 * across every person."* Every role that holds `order.create` also holds the settle action, so
 * the matrix alone cannot express "may ring, may not settle" — and the pad's whole blast-radius
 * claim (`04-F22`: a stolen tablet can ring food and cannot settle, refund, open a drawer, pay
 * out, void after KOT or read cash) rests on this list being closed. **It refuses
 * `payment.recorded` for an OWNER**, which is the property no matrix cell can state.
 *
 * ── Gate 2: the PERSON (`verdictFor`, unchanged) ─────────────────────────────────────────────
 *
 * Commandment 8, asked exactly as the renderer's guard asks it, of a subject assembled by the
 * same `subjectOf` and narrowed by the same `roleOf`. A member `01-F42` revoked between sign-in
 * and this call has no assignments and is refused here, which is why the subject is rebuilt per
 * request rather than captured at sign-in.
 *
 * **Both must pass and neither substitutes for the other.** Dropping gate 1 leaves a pad that can
 * settle; dropping gate 2 leaves a pad that authorizes nothing at all.
 */
export const TERMINAL_EVENT_TYPES = [
  "order.created",
  "order.line_added",
  "order.line_removed",
  "order.confirmed",
] as const;

const TERMINAL_TYPES: ReadonlySet<string> = new Set(TERMINAL_EVENT_TYPES);

/**
 * `04-F23`'s verdict. A discriminated result rather than the `WriteRefusal` the renderer's guard
 * throws, because a terminal request crosses a wire: the caller has to turn this into a response
 * body, and an exception carrying a frozen sentinel compared by identity does not survive that.
 */
export type TerminalVerdict =
  | { readonly ok: true }
  /** `not_a_terminal_act` is gate 1; everything else is the matrix's own word (gate 2). */
  | { readonly ok: false; readonly refusal: WriteRefusal | "not_a_terminal_act" };

export type TerminalAuthorization = (user_id: string, event_type: string) => TerminalVerdict;

export type TerminalAuthorizationDeps = {
  /** `01-F26`/`01-F28` — the SYNCED registry, exactly as the renderer's guard reads it. */
  store: Pick<DeviceStore, "identity" | "staff">;
};

/**
 * `04-F22` (c) — the actor is an ARGUMENT this factory is handed, never a session it reads.
 *
 * There is no `session` dep and that absence is the safety property, on `createVerifiedAppend`'s
 * own reasoning one file over: a terminal guard that could reach the till's PIN session would
 * authorize a waiter's intent against whoever is standing at the counter. The caller has just
 * verified this `user_id` against `01-F28`'s hashes and `01-F61`'s durable counter; nothing here
 * may soften that into "somebody is signed in".
 *
 * **`user_id` never arrives from the tablet.** `04-F22` (c) forbids it — *"the tablet receives an
 * opaque handle and never a user id it could edit"* — and `terminal.ts` is where that is enforced,
 * because that is where the handle is resolved. This function cannot tell a resolved id from a
 * claimed one and must not be asked to.
 */
export const authorizeTerminal =
  (deps: TerminalAuthorizationDeps): TerminalAuthorization =>
  (user_id: string, event_type: string): TerminalVerdict => {
    // Gate 1 FIRST, and the order is deliberate: an act outside the terminal's surface is refused
    // without consulting the roster at all, so a request naming `payment.recorded` can never be
    // answered "allowed" by a matrix that would have allowed it at the counter.
    if (!TERMINAL_TYPES.has(event_type)) return { ok: false, refusal: "not_a_terminal_act" };
    const subject = subjectOf({
      store: deps.store,
      // `subjectOf` reads only `user_id` off a session; `display_name` is required by the type
      // and never consulted, which is the same construction `authorizeEscalation` uses for the
      // approver — one shape, one reading.
      session: () => ({ user_id, display_name: user_id }),
    });
    // A verified PIN for an id the registry does not carry cannot normally happen (`01-F28`
    // verifies against that registry), but `01-F42` can revoke a member between the two reads and
    // the answer that cannot be right is the permissive one (`01-F48`).
    if (subject === null) {
      return {
        ok: false,
        refusal: {
          event_type,
          outcome: "deny",
          action: WRITE_ACTIONS[event_type] ?? null,
          satisfied_by: [],
        },
      };
    }
    const verdict = verdictFor(
      subject,
      scopeOf(deps.store),
      // `04-F23`: the terminal's action set is `order.create` alone. None of `TERMINAL_EVENT_TYPES`
      // reaches `verdictFor`'s amount-dependent branches, so there is no threshold and no order
      // total to supply — and supplying a `paidOutApprovalThresholdPaisa` here would be a number
      // this surface can never spend, i.e. a value whose only effect is to look configured.
      //
      // ⚠ `campaignCitation` IS THE SAME ANSWER AND IT IS A DECISION RATHER THAN A DEFAULT — said
      // out loud because it arrived as a COMPILE ERROR when `17-F24`'s arm made the member
      // required, and the mechanical fix and the correct one look identical from the diff.
      // `verdictFor` reads it inside its `discount.recorded` branch and nowhere else, and gate 1
      // above refuses that type by name for **every** person including an owner — so no campaign
      // is ever resolved on this road, and `campaignCitationFor`'s five inputs (the artifact, the
      // open-order projection, `02-F64`'s link, branch time, the branch id) are none of them things
      // `TerminalAuthorizationDeps` is handed. Widening this gate's deps to carry a resolver it
      // cannot spend is the shape `paidOutApprovalThresholdPaisa` directly above already refuses.
      //
      // **Not a gap waiting to be filled in.** Doc 04 §1 puts *"void/comp/discount approval"* off
      // the handheld by design and `17-F27` (b) makes the CASHIER the one who cites, at `02-F61`'s
      // correction surface, which is a counter screen. **The neighbouring case, named rather than
      // left one keystroke away (`AGENTS.md` `L11`):** what is closed here is *the pad resolves no
      // campaign*; what is NOT closed is *the pad's road would not STAMP one either* — `17-F27`
      // (c)'s `campaign_version` writer lives in the renderer's `writes` chain, which
      // `createTerminal` is not built over. Both halves are held together by
      // `__acceptance__/terminal-write-path.test.ts` §F3, so the day `discount.recorded` joins
      // `TERMINAL_EVENT_TYPES` — a doc-04 spec act, not an implementer's — that test goes red and
      // the stamp has to be decided in the same change. `undefined` stays the safe direction
      // meanwhile: it falls through to the stricter discretionary predicate, whose `escalate` this
      // gate refuses outright (`04-F8` — the handheld initiates, never approves).
      {
        paidOutApprovalThresholdPaisa: 0,
        discountApprovalThresholdBps: undefined,
        orderTotalPaisa: undefined,
        campaignCitation: undefined,
      },
      event_type,
      {},
    );
    // `escalate` is a REFUSAL here, not an offer. `02-F20`'s local path needs a manager standing
    // at the pad, and there is no manager-approval surface on a terminal (`04-F8`: the handheld
    // initiates, never approves) — so an escalatable act reaching this gate is refused with the
    // matrix's own word, and the waiter walks to the till, which is `05-F27`'s budgeted walk.
    return allows(verdict) ? { ok: true } : { ok: false, refusal: verdict };
  };
