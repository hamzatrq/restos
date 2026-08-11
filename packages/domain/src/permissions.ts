// The permission matrix, and the one helper that reads it (01-F26, 01-F27, 18 §).
//
// `01-F26` names `restaurant-os.md` Appendix A as the SEED matrix and rules that "roles are
// permission sets, not apps"; `18 §` names the only consumer: "Authorization is a single
// `can(user, action, scope)` helper generated from the `domain` permission matrix — inline role
// checks are banned." So this file is the only place in the platform where a role decides
// anything, and everything below is transcription plus resolution — nothing is invented
// (Commandment 2).
//
// **Appendix A's cells hold THREE values, not two** — `✔`, `—`/`✖`, and `needs Mgr PIN`. A
// boolean answer has to collapse the third into one of the other two, and both collapses are
// product defects: collapse to allowed and a cashier voids a printed KOT unsupervised, which is
// the leakage vector the appendix was drawn to close; collapse to refused and `02-F20`'s
// escalation ("local manager PIN on the POS; remote approval via manager console; first response
// wins") has no reachable entry point, so the feature cannot exist. Hence `AuthOutcome` is
// three-valued, and `escalate` is what both of `02-F20`'s equivalent paths resolve.
//
// Report reach is a SEPARATE predicate (`reportScope`), not a fourth outcome: Appendix A's
// `View sales reports` row holds SCOPES ("own shift only" · "own branch" · "everything"), and
// folding them into the outcome would make every caller pattern-match a case one action uses.
//
// SCOPE (`24-F23` — the minimum that closes the FRs): the four Appendix A COLUMNS only. The
// appendix's prose names eleven roles, the seed matrix gives four columns, and encoding rows for
// roles no Wave-1 action is performed by is speculative generality. `01-F26`'s per-user
// permission OVERRIDES are named there and deliberately unbuilt — nothing in Wave 1 sets one,
// and both widenings are additive.

/** The four Appendix A columns (`01-F26`: the seed matrix). Widening is additive. */
// The seam-debt marker that stood here is DELETED, and its deletion is the news: this file had
// ZERO production callers from the day it was written, so Commandment 8 — "server-side
// authorization always via the `domain` permission matrix" — was enforced NOWHERE in the product.
// A written, 89-test, 28-mutant-killed authorization matrix that no request passed through.
//
// It gained TWO first callers on the same day, on the two planes, each built without knowledge of
// the other:
//   * `apps/pos-electron/src/main/authorize.ts` — the OPERATIONAL plane. `18 §9` gives the
//     renderer no Node access, so main IS the trusted side; it guards every write the renderer
//     asks for and deliberately does NOT guard `kot.*`, which are device facts nobody performs
//     (guarding them would silence `03-F5`'s failure band on a locked till).
//   * `services/api/src/trpc.ts` — the CLOUD plane. Every non-exempt tRPC procedure passes
//     through `can()`, and a boot assertion refuses to start a host carrying an ungated one.
//
// `reportScope` is still uncalled and carries its own marker; `02-F23`'s own-shifts scoping is
// what will reach it.
export const ROLES = ["cashier", "branch_manager", "storekeeper", "owner"] as const;

export type Role = (typeof ROLES)[number];

/**
 * `01-F26`'s "User × Role × per-location assignment" — one (role, location) pair.
 * `branch_id: null` is org-wide, which is how an owner holds Appendix A's "everything".
 */
export type RoleAssignment = {
  readonly role: Role;
  readonly branch_id: string | null;
};

/**
 * Who is asking. `01-F27`: user identity comes from the PIN session — a device token carries
 * device identity ONLY, so a device with nobody unlocked is a subject with no assignments and
 * therefore no authority.
 */
export type AuthSubject = {
  readonly user_id: string;
  readonly org_id: string;
  readonly assignments: readonly RoleAssignment[];
};

/**
 * Where, and about whom. `subject_user_id` is whose record is being read — `02-F23`'s
 * "cashiers see only their own shifts". `requested_by_user_id` is `02-F38`'s requester.
 */
export type AuthScope = {
  readonly org_id: string;
  readonly branch_id: string | null;
  readonly subject_user_id?: string | null;
  readonly requested_by_user_id?: string | null;
};

/** Appendix A's three cell kinds: `✔` · `—`/`✖` · `needs Mgr PIN`. */
export type AuthOutcome = "allow" | "deny" | "escalate";

/**
 * A decision always names the action it decided — a refusal a caller cannot attribute is
 * indistinguishable from a refusal of something else it also asked about.
 *
 * `satisfied_by` is present on `escalate` and ONLY on `escalate`: it names the roles whose
 * credential closes the gap (`02-F20`). Without it the screen that renders "enter manager PIN"
 * has to hardcode the role, which is `18 §`'s banned inline check relocated into the UI. It is
 * derived from the matrix, never listed by hand, so a named role is always a role that is itself
 * allowed the action.
 */
export type AuthDecision = {
  readonly outcome: AuthOutcome;
  readonly action: PermissionAction;
  readonly satisfied_by?: readonly Role[];
};

/**
 * Every Appendix A row, plus the two actions the FRs add to it:
 *
 * - `order.price_override` — `02-F20` lists it beside void-after-KOT, comp and above-threshold
 *   discount as needing manager escalation. Appendix A has no row for it, so `02-F20` alone
 *   decides its cells.
 * - `approval.grant` — `02-F20`'s remote path plus `02-F38`, which refuses a self-approval
 *   "server-side by the `domain` permission matrix". That requires the grant to BE an action in
 *   this matrix rather than a screen-level rule.
 */
export const PERMISSION_ACTIONS = [
  "order.create",
  "payment.settle",
  "order.discount_within_threshold",
  "order.discount_above_threshold",
  "order.void_after_kot",
  "order.comp_item",
  "order.price_override",
  "receipt.reprint",
  "day.open_close",
  // ── The service surface (`02-F21`..`F26`, `02-F36`, `02-F43`, `05-F19`). ────────────────
  // Appendix A has ONE cash row — "Day open / close, cash count" — and it is `day.open_close`
  // above. These five are the acts that row does not decide, each named by an FR that does.
  "shift.open_close",
  "cash.count",
  "cash.drawer_no_sale",
  "cash.paid_out",
  "refund.issue",
  "stock.receive",
  "stock.count_entry",
  "stock.wastage_record",
  "catalog.edit_menu_prices",
  "catalog.edit_recipes",
  // ── Device management (`14-F30`, which decides it alone). ───────────────────────────────
  // Appendix A has no device row, so before `14-F30` this matrix could not answer a device
  // request at all — and `14-F13` puts an immediate, irreversible kill switch on an
  // authenticated back-office screen. Commandment 8 has to have something to refuse against.
  "device.manage",
  // ── The counter's 86 (`02-F46`, which decides it alone). ───────────────────────────────
  // Appendix A has no availability row either, so before `02-F46` the matrix could not answer
  // a toggle request and `authorize.ts`'s fail-closed default denied every one of them —
  // `02-F7`'s control could not be built. Same shape as `device.manage` directly above.
  "availability.toggle",
  // ── The caller's file (`02-F47`, which decides it alone). ───────────────────────────────
  // Appendix A has no customer row either, so before `02-F47` the matrix could not answer a
  // `customer.created` / `customer.address_added` request and `authorize.ts`'s fail-closed
  // default denied both for every role INCLUDING owner — `02-F27`'s inline creation could not
  // be built. Third instance of `device.manage`'s and `availability.toggle`'s shape.
  "customer.record",
  "history.edit_delete",
  "approval.grant",
  "report.sales_view",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

const KNOWN_ACTIONS: ReadonlySet<string> = new Set(PERMISSION_ACTIONS);

/** The one row whose cells are scopes rather than verdicts — see `REPORT_REACH`. */
type ScopedAction = "report.sales_view";

type VerdictAction = Exclude<PermissionAction, ScopedAction>;

/**
 * Appendix A, transcribed row by row. `✔` and `✔ (logged)` are both `allow` — `02-F19` already
 * attributes every action in the envelope and `01-F5` owns the audit chain, so `(logged)` is
 * emphasis on an existing law, not a fourth authorization outcome. `—` and `✖` are `deny`;
 * `needs Mgr PIN` is `escalate`.
 *
 * `Record<Role, …>` is exhaustive on purpose: adding a fifth column to `ROLES` will not compile
 * until every row states its cell, so no role can be widened into a row by silence.
 */
const VERDICTS: Readonly<Record<VerdictAction, Readonly<Record<Role, AuthOutcome>>>> = {
  // `Create order / print KOT` — ✔ · ✔ · — · ✔
  "order.create": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  /**
   * `02-F46` — the 86 toggle. **No Appendix A row**; this cell is the FR's, and it copies
   * `order.create`'s row directly above rather than inventing a shape.
   *
   * **The `cashier: "allow"` cell is the one that matters and it is not a convenience.**
   * `02-F40` rules that in a printer-only kitchen 86-ing is a COUNTER action performed on the
   * chef's word, and `27-F11e` makes that most deployments — so `escalate` or `deny` here means
   * a T1 branch whose manager has gone home cannot stop the platform selling a dish the kitchen
   * ran out of, for the rest of the shift. `01-F61` refuses a lockout with no automatic end on
   * exactly this reasoning: a control whose only holder may not be in the building is a control
   * that does not exist.
   *
   * `storekeeper: "deny"` follows `order.create`: Appendix A's storekeeper column is stock-only
   * and `02-F40` calls this a counter act, not a stock one. Note it is NOT `stock.*` — auto-86
   * from stock levels is `restaurant-os.md`'s autonomy ladder and does not exist yet; this is a
   * human at a till saying the karahi is finished.
   */
  "availability.toggle": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  /**
   * `02-F47` — recording the caller (`customer.created` **and** `customer.address_added`, one
   * act). **No Appendix A row**; this cell is the FR's, and it copies `order.create`'s row
   * directly above rather than inventing a shape.
   *
   * **The `cashier: "allow"` cell is the one that matters**, on `availability.toggle`'s argument
   * with a stopwatch attached: `02-F27` puts the operator on the phone with the caller and
   * `02-F28` measures 30 seconds FROM NUMBER ENTRY, so `escalate` here would put writing down a
   * number behind a manager PIN inside a 30-second budget, in the `27-F11e` branch least likely
   * to have a manager on the floor.
   *
   * `storekeeper: "deny"` follows `order.create`: Appendix A's storekeeper column is stock-only
   * and this is a counter act. Note what a `deny` here does NOT do — `01-F17` and `08-F2` keep
   * the sale: a refused customer record costs a name and an address, never an order.
   */
  "customer.record": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Settle payment` — ✔ · ✔ · — · ✔
  "payment.settle": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Discount ≤ X% (configurable)` — ✔ · ✔ · — · ✔
  "order.discount_within_threshold": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Discount > X%` — needs Mgr PIN · ✔ · — · ✔ (`02-F20`: above the org threshold)
  "order.discount_above_threshold": {
    cashier: "escalate",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Void after KOT printed` — needs Mgr PIN · ✔ (logged) · — · ✔
  "order.void_after_kot": {
    cashier: "escalate",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Comp item` — needs Mgr PIN · ✔ (logged) · — · ✔
  "order.comp_item": {
    cashier: "escalate",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // No Appendix A row. `02-F20` names price override in the same breath as the three cells
  // above, so it carries the same column shape.
  "order.price_override": {
    cashier: "escalate",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Reprint receipt` — ✔ (logged) · ✔ · — · ✔
  "receipt.reprint": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Day open / close, cash count` — — · ✔ · — · ✔ (`02-F22`'s role guard).
  //
  // The cashier cell is `deny`, not `escalate`, though `02-F22` adds "where no manager device
  // exists, the local manager-PIN path satisfies the guard": that path is a manager PIN
  // *unlocking a session* on the counter device (`02-F18` — per-user PIN login on every device),
  // after which the subject IS a manager. It is not `02-F20`'s in-session escalation, whose
  // escalating actions are enumerated there and do not include day open.
  "day.open_close": {
    cashier: "deny",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // No Appendix A row. `02-F22` — "Shift open **per cashier** → `shift.opened`" — and `02-F23`
  // — "Shift close **per cashier**" — put both acts in the cashier's own hands, which is the
  // half of `02-F22` its role guard deliberately does NOT cover: that guard names "day open/close
  // and float entry", and folding the shift into it would leave a cashier unable to start her
  // own shift on the device she is standing at. The storekeeper is `—` on every till row in
  // Appendix A and gets the same cell here.
  "shift.open_close": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // No Appendix A row of its own — and the near-miss is the reason this one is stated
  // separately. Appendix A's `Day open / close, cash count` is the MANAGER'S day-close count
  // (`02-F24`, "manager cash count + deposit record"), and `05 §3` splits the two explicitly:
  // "Doc 02 owns: shift open/close per cashier, **cashier drawer counts** … Doc 05 owns: … **the
  // manager's day-close count entry**". So this row is the cashier counting HER OWN drawer at
  // shift close, which `02-F23` requires of her ("system-expected cash vs counted cash") and
  // which the whole "I'm clean" framing rests on her being able to do.
  "cash.count": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `02-F21` + `02-F43` + `01-F17`, and the all-allow row is the RULING, not a shrug.
  //
  // `02-F21`'s control on the classic theft vector is that the open is "logged and counted" —
  // logging, not refusal — and `02-F43` says in terms what a refusal produces: "an unbound
  // no-sale that is stored and uncounted … money vanishing from `02-F23`'s expected cash and
  // `02-F24`'s day close with nothing to point at". A denied role does not stop needing change
  // for a customer; it opens the drawer with a key and the ledger learns nothing, which is
  // strictly worse than the act this row permits. `05-F19`'s own worked scenario puts a
  // storekeeper at the POS taking cash out, so that cell is allow too.
  "cash.drawer_no_sale": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "allow",
    owner: "allow",
  },
  // `02-F26`/`05-F19`, and this row is only HALF the decision — see `canPayOut`, which is the
  // only route to it. The cells below are the BELOW-THRESHOLD verdict: who may take cash out of
  // the drawer at all. `05 §3` gives paid-out capture to doc 02 at the POS and `05-F19`'s
  // scenario has a storekeeper performing one, so every till-reachable role is allowed.
  "cash.paid_out": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "allow",
    owner: "allow",
  },
  // No Appendix A row. `02-F36` decides it alone and decides it flatly: a refund needs "manager
  // approval **always** (remote interrupt or local PIN)" — so the cashier cell is `escalate` on
  // exactly `02-F20`'s terms, and the storekeeper, who is `—` on settle, cannot reach it.
  "refund.issue": {
    cashier: "escalate",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Receive stock / transfers` — — · ✔ · ✔ · ✔
  "stock.receive": {
    cashier: "deny",
    branch_manager: "allow",
    storekeeper: "allow",
    owner: "allow",
  },
  // `Physical count entry` — — · ✔ · ✔ · ✔
  "stock.count_entry": {
    cashier: "deny",
    branch_manager: "allow",
    storekeeper: "allow",
    owner: "allow",
  },
  // `Record wastage` — ✔ (logged) · ✔ · ✔ · ✔
  "stock.wastage_record": {
    cashier: "allow",
    branch_manager: "allow",
    storekeeper: "allow",
    owner: "allow",
  },
  // `Edit menu & prices` — — · optional · — · ✔.
  //
  // `optional` is org-configurable (`01-F26`'s per-user overrides; `00 §7` layer 2) and no FR
  // states the default. The branch-manager cell therefore reads `deny`: the config plane that
  // would carry the option does not exist, the widening edit is additive, and the wrong guess in
  // the other direction is a price change nobody authorised sitting in an append-only ledger
  // (`01-F53` snapshots it at line-add). Recorded as a finding, not settled.
  "catalog.edit_menu_prices": {
    cashier: "deny",
    branch_manager: "deny",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Edit recipes` — — · — · — · ✔ (or vendor onboarding team). The parenthesis is not a
  // column in the matrix, so it decides nothing here.
  "catalog.edit_recipes": {
    cashier: "deny",
    branch_manager: "deny",
    storekeeper: "deny",
    owner: "allow",
  },
  // No Appendix A row — `14-F30` decides it, and records itself as a PINNED INTERPRETATION
  // rather than a transcription, because the appendix carries no device row to transcribe.
  //
  // The corpus names exactly ONE role for this act and names it twice: `14-N2` — "an owner can
  // change a price **or revoke a device** from their phone" — and doc 14 §4's *Device revocation*
  // flow, "**Owner** marks a tablet stolen". No FR puts a manager, a cashier or a storekeeper on
  // it, and doc 14 §9's first open question ("whether managers get a scoped back-office slice on
  // phones … or stay manager-console-only until pilots demand it") is the corpus saying a
  // manager's back-office reach is UNDECIDED — so a `branch_manager: allow` here would answer an
  // open question by accident. The row therefore reads like `catalog.edit_menu_prices` above,
  // which is the other half of `14-N2`'s own sentence and resolves the same way for the same
  // reason: no FR states the widening, and the widening edit is additive.
  //
  // **`deny`, not `escalate`.** `02-F20` enumerates the escalating actions and this is not among
  // them; there is no manager-PIN path to a back-office screen, and `services/api` refuses
  // `escalate` anyway because the cloud plane cannot collect a second credential.
  //
  // **ONE action covering `14-F12`'s list AND `14-F13`'s revocation** (`14-F30`). Splitting the
  // read from the destructive act is the tempting shape and it is speculative while every cell
  // is identical — two actions differing in no cell differ in nothing an implementation can
  // observe. It becomes a real question the day a role is widened into the list.
  "device.manage": {
    cashier: "deny",
    branch_manager: "deny",
    storekeeper: "deny",
    owner: "allow",
  },
  // `Edit/delete historical records` — ✖ never · ✖ never · ✖ never · ✖ never (append-only
  // corrections). Appendix A's hard rule is explicit that it binds the owner too, and
  // Commandment 1 / `01-F1` is the same law: history is corrected by new linked events, never
  // in place. The whole theft-detection value rests on this row.
  "history.edit_delete": {
    cashier: "deny",
    branch_manager: "deny",
    storekeeper: "deny",
    owner: "deny",
  },
  // No Appendix A row. `02-F20`'s remote path is a manager/owner act; a cashier escalates UP,
  // never sideways, so the cashier cell is `deny` rather than `escalate`. `02-F38`'s
  // self-approval refusal is applied on top, in `can` — it depends on the scope, not the role.
  "approval.grant": {
    cashier: "deny",
    branch_manager: "allow",
    storekeeper: "deny",
    owner: "allow",
  },
};

/**
 * Appendix A's `View sales reports` row, cell for cell: "own shift only" · "own branch" ·
 * "stock reports" · "everything". Every cell is a REACH, which is why the row is not in
 * `VERDICTS`.
 *
 * The storekeeper cell reads "stock reports" — a different report, which Appendix A gives no row
 * of its own. The only thing it decides about *sales* is that a storekeeper gets none, so no
 * `report.stock_view` action is invented here.
 */
export type ReportReach = "none" | "own_shift" | "own_branch" | "org";

const REPORT_REACH: Readonly<Record<Role, ReportReach>> = {
  cashier: "own_shift", // "own shift only" (`02-F23`: cross-cashier views belong to 05/12)
  branch_manager: "own_branch", // "own branch"
  storekeeper: "none", // "stock reports" — not sales
  owner: "org", // "everything"
};

/**
 * Appendix A's opening sentence — "in small restaurants one person wears several hats" — so a
 * subject holding two roles at one location gets the most permissive of them. Ranked, not
 * boolean, because `escalate` sits strictly between the other two.
 */
const OUTCOME_RANK: Readonly<Record<AuthOutcome, number>> = { deny: 0, escalate: 1, allow: 2 };

const REACH_RANK: Readonly<Record<ReportReach, number>> = {
  none: 0,
  own_shift: 1,
  own_branch: 2,
  org: 3,
};

/**
 * The roles a subject actually holds at this location (`01-F26`: the assignment is per-location).
 * An org-wide assignment (`branch_id: null`) carries into every branch; a branch assignment
 * carries into that branch only, so a cashier at branch A is a stranger at branch B.
 */
const rolesAt = (subject: AuthSubject, branch_id: string | null): readonly Role[] =>
  subject.assignments
    .filter((assignment) => assignment.branch_id === null || assignment.branch_id === branch_id)
    .map((assignment) => assignment.role);

/**
 * How far a subject's sales-report view reaches at this location (`02-F23` + Appendix A's
 * `View sales reports` row). Exported because the reach itself is the answer the cashier's own
 * reconciliation view needs — `can` decides one request, this decides what to fetch.
 */
export const reportScope = (subject: AuthSubject, scope: AuthScope): ReportReach => {
  if (subject.org_id !== scope.org_id) return "none";
  return rolesAt(subject, scope.branch_id).reduce<ReportReach>((widest, role) => {
    const reach = REPORT_REACH[role];
    return REACH_RANK[reach] > REACH_RANK[widest] ? reach : widest;
  }, "none");
};

/**
 * The single authorization helper (`18 §`). Server-side on every operation (`01-F27`), and the
 * only reader of the matrix — an inline role check anywhere else is a violation.
 *
 * Fails closed in every direction: an action the matrix does not carry, a subject from another
 * org, and a subject with no assignment at this location all refuse.
 */
export const can = (
  subject: AuthSubject,
  action: PermissionAction,
  scope: AuthScope,
): AuthDecision => {
  // An action absent from the matrix has not been authorized by it, and `01-F27` puts
  // authorization on EVERY operation — so the answer that cannot be right is `allow`. Typed
  // callers cannot reach this; the untyped edges (sync payloads, tRPC input) can.
  if (!KNOWN_ACTIONS.has(action)) return { outcome: "deny", action };

  // Assignments are held within one org (`01-F26`). Nothing carries across.
  if (subject.org_id !== scope.org_id) return { outcome: "deny", action };

  if (action === "report.sales_view") {
    const reach = reportScope(subject, scope);
    // `own_branch` and `org` are already resolved against this location by `rolesAt`; only
    // "own shift only" still has to check *whose* record was asked for.
    const permitted =
      reach === "own_shift" ? scope.subject_user_id === subject.user_id : reach !== "none";
    return { outcome: permitted ? "allow" : "deny", action };
  }

  // `02-F38`: a requester never approves their own request — "refused server-side by the
  // `domain` permission matrix (a client that renders it anyway must still fail)". It names no
  // role exception, so it binds the owner too, and it is checked before the row because the
  // owner's cell would otherwise allow it.
  if (action === "approval.grant" && scope.requested_by_user_id === subject.user_id) {
    return { outcome: "deny", action };
  }

  // `05-F19` — a paid-out's verdict depends on the AMOUNT against the org threshold, and
  // `AuthScope` carries neither. Answering here would be answering without the input that
  // decides the question, so this route refuses and `canPayOut` is the only one that resolves.
  //
  // It fails CLOSED rather than taking an optional pair of numbers, on `01-F60`'s precedent: an
  // optional completeness input means a forgetful caller silently skips the check, which is
  // exactly how a Rs 4,000 paid-out walks past the approval `05-F19` exists to require.
  if (action === "cash.paid_out") return { outcome: "deny", action };

  const verdicts = VERDICTS[action];
  const outcome = rolesAt(subject, scope.branch_id).reduce<AuthOutcome>((best, role) => {
    const verdict = verdicts[role];
    return OUTCOME_RANK[verdict] > OUTCOME_RANK[best] ? verdict : best;
  }, "deny");

  if (outcome !== "escalate") return { outcome, action };
  // Derived from the row, so `02-F20`'s path always resolves: every role named here is a role
  // this same matrix allows the action outright.
  return { outcome, action, satisfied_by: ROLES.filter((role) => verdicts[role] === "allow") };
};

/**
 * `05-F19` — "`cash.paid_out` above the org threshold requires approval".
 *
 * A SEPARATE predicate for the same reason `reportScope` is one: its cells are not plain
 * verdicts, and the input that decides them is not something `AuthScope` can carry. Both
 * figures are REQUIRED POSITIONAL parameters — `01-F60`'s enabled-set precedent, where the
 * completeness input was made required precisely because optional-means-skip is how a silent
 * omission gets in. `can(subject, "cash.paid_out", scope)` refuses on purpose, so there is no
 * second route that answers this question with the threshold missing.
 */
export type PaidOutRequest = {
  /** What is leaving the drawer, integer paisa (`02-F44` — a magnitude, never signed). */
  readonly amount_paisa: number;
  /** The org threshold (`05-F19`; `00 §7` layer 2), integer paisa. */
  readonly threshold_paisa: number;
};

// Reached by `apps/pos-electron/src/main/authorize.ts:232` — the counter's paid-out path. The
// threshold is passed EXPLICITLY as a required parameter rather than defaulted, on `01-F60`'s
// enabled-set precedent: an optional threshold defaulting to "never escalate" is how a silent
// omission becomes an unapproved withdrawal.
export const canPayOut = (
  subject: AuthSubject,
  scope: AuthScope,
  request: PaidOutRequest,
): AuthDecision => {
  const action = "cash.paid_out" as const;
  if (subject.org_id !== scope.org_id) return { outcome: "deny", action };

  const verdicts = VERDICTS[action];
  const base = rolesAt(subject, scope.branch_id).reduce<AuthOutcome>((best, role) => {
    const verdict = verdicts[role];
    return OUTCOME_RANK[verdict] > OUTCOME_RANK[best] ? verdict : best;
  }, "deny");
  // A role that may not take cash out of the drawer at all is refused before the amount is
  // looked at — the threshold widens no cell, it only narrows one.
  if (base !== "allow") return { outcome: base, action };

  // A comparison, not arithmetic: `DEC-MONEY-005` bans the operators, not the predicate.
  // At the threshold is still within it — `05-F19` says "above".
  if (request.amount_paisa <= request.threshold_paisa) return { outcome: base, action };

  return {
    outcome: "escalate",
    action,
    // Derived from the matrix like every other `satisfied_by`, but from `approval.grant`'s row
    // rather than this one: `05-F19` routes the excess to "approve/deny per `05-F6`/`F7`", so
    // the credential that closes the gap is one that may GRANT an approval, not one that may
    // record a paid-out. `02-F38`'s self-approval refusal is applied at the grant, where the
    // requester is known.
    satisfied_by: ROLES.filter((role) => VERDICTS["approval.grant"][role] === "allow"),
  };
};
