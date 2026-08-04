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
  "stock.receive",
  "stock.count_entry",
  "stock.wastage_record",
  "catalog.edit_menu_prices",
  "catalog.edit_recipes",
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
