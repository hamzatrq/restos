// Acceptance tests — S-0a (the permission matrix as data + the `can(user, action, scope)`
// helper + report scoping). Authored from spec text ONLY, by a session that has read no
// implementation and no implementation plan (`24 §3` step 2; brief:
// `plans/wave-1/identity-test-brief.md`). Sources, and nothing else:
//   `restaurant-os.md` Appendix A   — the seed matrix, transcribed cell-for-cell below
//   `specs/01-kernel-sync.md`       — `01-F26` (User × Role × per-location assignment; the
//                                     Appendix A matrix is the seed; "roles are permission
//                                     sets, not apps"), `01-F27` (server-side authorization on
//                                     every operation; device tokens carry device identity
//                                     ONLY — user identity comes from the PIN session)
//   `specs/02-pos-app.md`           — `02-F20` (manager escalation; two equivalent paths),
//                                     `02-F22` (the day/float role guard), `02-F23`
//                                     (cashiers see only their own shifts), `02-F38` (a
//                                     requester is refused server-side for their own request)
//   `specs/18-engineering-handbook.md` — "Authorization is a single `can(user, action, scope)`
//                                     helper generated from the `domain` permission matrix —
//                                     inline role checks are banned."
//
// RED-AWAITING-IMPLEMENTATION. Nothing in `packages/domain` exports `can`, `ROLES` or
// `PERMISSION_ACTIONS` today, so every test below fails inside `requireCan()`/`requireExport()`
// with a named message. The namespace cast is deliberate (same idiom as
// `merge-schema.test.ts`): this file TYPECHECKS before the implementation exists, so a missing
// export is a loud runtime failure per test rather than a module-load crash that reds
// `pnpm typecheck` for every other package.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE CELL VALUE THIS FILE EXISTS FOR — **Appendix A's cells hold THREE outcomes, not two.**
// Read literally, *Void after KOT printed* under Cashier does not say `—`. It says
// **`needs Mgr PIN`**, and so do *Comp item* and *Discount > X%*. A helper that answers a
// BOOLEAN has to collapse that third value into one of the other two, and both collapses are
// product defects:
//   * collapse to allowed  → a cashier voids a printed KOT unsupervised. Appendix A's whole
//     stated purpose is theft detection; this is the leakage vector it was drawn to close.
//   * collapse to refused  → `02-F20`'s escalation ("local manager PIN on the POS; remote
//     approval via manager console; first response wins") has no reachable entry point, so the
//     feature cannot exist.
// §2 below is written so that a boolean implementation fails it *however it is written*: it
// takes ONE action and THREE roles whose Appendix A cells are `✔ (logged)`, `needs Mgr PIN`
// and `—`, and requires the three answers to be pairwise different. It never names an outcome
// string, so it survives any renaming of the vocabulary §3 pins.
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// PINNED INTERPRETATIONS — every place the FRs stop short. Recorded so the implementer can
// CONTEST the reading rather than discover it, and so each rename is one edit here.
//
//  P1. THE OUTCOME VOCABULARY is `"allow" | "deny" | "escalate"` (§3). Appendix A names the
//      three cell values but not their identifiers. `outcome` is a hard pin: every test reads
//      `decision.outcome`. §2 is the backstop that survives a rename.
//  P2. THE ACTION IDS are pins. Appendix A names ROWS in prose ("Void after KOT printed"), not
//      identifiers. Each id below is transcribed beside its verbatim row label so the mapping
//      is auditable. `order.price_override` comes from `02-F20` (which lists it among the four
//      escalating actions) and appears in no Appendix A row. `approval.grant` comes from
//      `02-F20`'s remote path + `02-F38` and likewise appears in no row.
//  P3. THE ROLE IDS are `cashier | branch_manager | storekeeper | owner` — the four Appendix A
//      COLUMNS. The appendix's prose lists eleven roles; only four have columns, so `ROLES` is
//      asserted as a superset, never as "exactly four".
//  P4. `✔ (logged)` IS `allow`. Appendix A distinguishes `✔` from `✔ (logged)`, but `02-F19`
//      already attributes *every* action in the envelope and `01-F5` owns the audit family —
//      so `(logged)` is emphasis on an existing law, not a fourth authorization outcome.
//      Likewise `✔ (or vendor onboarding team)` is `allow`: "vendor onboarding team" is not a
//      column in the matrix.
//  P5. `✖ never` IS `deny`, and it binds the OWNER too (§5). Appendix A's hard rule is
//      explicit — "no role, including owner".
//  P6. THE SUBJECT SHAPE is `{ user_id, org_id, assignments: [{ role, branch_id }] }`.
//      `01-F26` says "User × Role × per-location assignment", which is exactly a set of
//      (role, location) pairs. `branch_id: null` means org-wide (how an Owner holds
//      "everything"). `01-F26`'s per-user permission OVERRIDES are deliberately not modelled
//      here — no FR states their shape, and inventing one is how a test gets written to pass.
//  P7. THE SCOPE SHAPE is `{ org_id, branch_id, subject_user_id?, requested_by_user_id? }`.
//      `subject_user_id` is *whose* record is being read (`02-F23`: "cashiers see only their
//      own shifts"). `requested_by_user_id` is `02-F38`'s requester.
//  P8. A DECISION ECHOES ITS ACTION (`decision.action`) and an `escalate` decision NAMES WHO
//      CAN SATISFY IT (`decision.satisfied_by: Role[]`). Both are pins, and both are forced:
//      the brief's bar requires a refusal to name what it refused, and `18 §` bans inline role
//      checks — so if the escalate decision does not carry the satisfying role, the caller
//      that renders "enter manager PIN" has to hardcode `manager`, which is the banned check
//      relocated into the UI.
//  P9. TWO APPENDIX A CELLS ARE UNDECIDABLE FROM SPEC TEXT and are excluded from the flat
//      table, by name, in a test that fails if the exclusion set ever grows (§4b):
//        - *Edit menu & prices* / Branch Mgr reads **`optional`**, i.e. org-configurable
//          (`01-F26` permission overrides; `00 §7` layer 2). No FR states the DEFAULT, and
//          guessing it either direction is a coin flip. Reported as a finding.
//        - *View sales reports* — all four cells are SCOPES, not verdicts ("own shift only",
//          "own branch", "stock reports", "everything"). They are asserted in §8, where the
//          scope argument can actually carry them.
// P10. *Day open / close, cash count* / Cashier is asserted as **not `allow`**, not as `deny`
//      (§7). Appendix A's cell is `—`, but `02-F22` adds "where no manager device exists, the
//      local manager-PIN path satisfies the guard" — which is `02-F20`'s escalation path by
//      another name. The two readings (`deny` vs `escalate`) are both live in the corpus; the
//      leakage vector both readings forbid is "cashier opens the day unsupervised", and that
//      is what §7 asserts. Reported as a finding rather than resolved by preference.
// P11. `report.sales_view` covers Appendix A's *View sales reports* row. Storekeeper's cell
//      reads "stock reports", which is a DIFFERENT report; the only thing it decides about
//      this action is that a storekeeper does not get sales. A `report.stock_view` action is
//      NOT invented here — Appendix A gives it no row of its own.

import { describe, expect, it } from "vitest";
import * as domainNs from "../index.js";
import { newId } from "../index.js";

// ── The contract (P1, P6, P7, P8) ──────────────────────────────────────────────────────────

type Role = "cashier" | "branch_manager" | "storekeeper" | "owner";

type RoleAssignment = {
  readonly role: Role;
  /** `null` = org-wide. `01-F26`: "User × Role × per-location assignment". */
  readonly branch_id: string | null;
};

type AuthSubject = {
  readonly user_id: string;
  readonly org_id: string;
  readonly assignments: readonly RoleAssignment[];
  /**
   * `11-F22`, mirrored EXACTLY as production declares it (optional, closed at two). This local
   * type is this file's structural mirror of `packages/domain`'s — it exists so the suite compiles
   * against a `domain` that might not export `can` at all — and a mirror that omits a member the
   * real type carries is a mirror that lies. It is here only so the builder below can state the
   * member; nothing reads it, and no assertion in this file mentions a status.
   */
  readonly status?: "active" | "inactive";
};

type AuthScope = {
  readonly org_id: string;
  readonly branch_id: string | null;
  /** Whose record is being read/acted on — `02-F23`'s own-shifts-only axis. */
  readonly subject_user_id?: string | null;
  /** `02-F38`'s requester. */
  readonly requested_by_user_id?: string | null;
};

type Outcome = "allow" | "deny" | "escalate";

type Decision = {
  readonly outcome: Outcome;
  readonly action?: string;
  readonly satisfied_by?: readonly Role[];
};

const maybeExports = domainNs as unknown as {
  can?: (subject: AuthSubject, action: string, scope: AuthScope) => Decision;
  ROLES?: readonly string[];
  PERMISSION_ACTIONS?: readonly string[];
};

const can = (subject: AuthSubject, action: string, scope: AuthScope): Decision => {
  const fn = maybeExports.can;
  if (typeof fn !== "function") {
    throw new Error(
      "@restos/domain exports no `can(user, action, scope)` — `18 §` names it as the single " +
        "authorization helper generated from the domain permission matrix (S-0a).",
    );
  }
  return fn(subject, action, scope);
};

const requireExport = <K extends "ROLES" | "PERMISSION_ACTIONS">(name: K): readonly string[] => {
  const value = maybeExports[name];
  if (!Array.isArray(value)) {
    throw new Error(
      `@restos/domain exports no \`${name}\` — the permission matrix is data in \`domain\`, ` +
        "declared once (`18 §2`, `packages/domain/CLAUDE.md`).",
    );
  }
  return value;
};

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────

const ORG = newId();
const BRANCH_A = newId();
const BRANCH_B = newId();

const subject = (assignments: readonly RoleAssignment[]): AuthSubject => ({
  user_id: newId(),
  org_id: ORG,
  assignments,
  // `11-F22` — the participation status the authorization subject now reads. Every fixture in
  // this file is a person who is CURRENTLY EMPLOYED, which is what every assertion below already
  // assumed and could not say; absent no longer means `active` (the FR forbids that default by
  // name, citing `01-F48`), so it is said. Nothing else here moves: no assertion, no cell, no
  // role, no assignment — this restates the same subject under a widened type.
  status: "active",
});

const CASHIER = subject([{ role: "cashier", branch_id: BRANCH_A }]);
const OTHER_CASHIER = subject([{ role: "cashier", branch_id: BRANCH_A }]);
const MANAGER = subject([{ role: "branch_manager", branch_id: BRANCH_A }]);
const OTHER_MANAGER = subject([{ role: "branch_manager", branch_id: BRANCH_A }]);
const STOREKEEPER = subject([{ role: "storekeeper", branch_id: BRANCH_A }]);
const OWNER = subject([{ role: "owner", branch_id: null }]);
/** `01-F27`: a device token carries device identity ONLY — it confers no role on anyone. */
const NO_ASSIGNMENT = subject([]);

const SUBJECT_BY_ROLE: Record<Role, AuthSubject> = {
  cashier: CASHIER,
  branch_manager: MANAGER,
  storekeeper: STOREKEEPER,
  owner: OWNER,
};

const at = (branch_id: string | null, extra: Partial<AuthScope> = {}): AuthScope => ({
  org_id: ORG,
  branch_id,
  ...extra,
});

// ── Appendix A, transcribed ────────────────────────────────────────────────────────────────
// `text` is the cell VERBATIM from `restaurant-os.md` Appendix A so the transcription can be
// diffed against the appendix by eye. `expect` is this file's reading of it (P4, P5, P9, P10).

type CellExpectation = Outcome | "not-allow" | "excluded";

type Cell = { readonly text: string; readonly expect: CellExpectation };

type MatrixRow = {
  /** The Appendix A row label, verbatim. */
  readonly row: string;
  readonly action: string;
  readonly cells: Record<Role, Cell>;
};

const ROLE_ORDER: readonly Role[] = ["cashier", "branch_manager", "storekeeper", "owner"];

const APPENDIX_A: readonly MatrixRow[] = [
  {
    row: "Create order / print KOT",
    action: "order.create",
    cells: {
      cashier: { text: "✔", expect: "allow" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Settle payment",
    action: "payment.settle",
    cells: {
      cashier: { text: "✔", expect: "allow" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Discount ≤ X% (configurable)",
    action: "order.discount_within_threshold",
    cells: {
      cashier: { text: "✔", expect: "allow" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Discount > X%",
    action: "order.discount_above_threshold",
    cells: {
      cashier: { text: "needs Mgr PIN", expect: "escalate" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Void after KOT printed",
    action: "order.void_after_kot",
    cells: {
      cashier: { text: "needs Mgr PIN", expect: "escalate" },
      branch_manager: { text: "✔ (logged)", expect: "allow" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Comp item",
    action: "order.comp_item",
    cells: {
      cashier: { text: "needs Mgr PIN", expect: "escalate" },
      branch_manager: { text: "✔ (logged)", expect: "allow" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Reprint receipt",
    action: "receipt.reprint",
    cells: {
      cashier: { text: "✔ (logged)", expect: "allow" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Day open / close, cash count",
    action: "day.open_close",
    cells: {
      // P10 — `—` in Appendix A, but `02-F22` admits the local manager-PIN path.
      cashier: { text: "—", expect: "not-allow" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Receive stock / transfers",
    action: "stock.receive",
    cells: {
      cashier: { text: "—", expect: "deny" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "✔", expect: "allow" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Physical count entry",
    action: "stock.count_entry",
    cells: {
      cashier: { text: "—", expect: "deny" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "✔", expect: "allow" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Record wastage",
    action: "stock.wastage_record",
    cells: {
      cashier: { text: "✔ (logged)", expect: "allow" },
      branch_manager: { text: "✔", expect: "allow" },
      storekeeper: { text: "✔", expect: "allow" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Edit menu & prices",
    action: "catalog.edit_menu_prices",
    cells: {
      cashier: { text: "—", expect: "deny" },
      // P9 — `optional` is org-configurable and no FR states the default.
      branch_manager: { text: "optional", expect: "excluded" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔", expect: "allow" },
    },
  },
  {
    row: "Edit recipes",
    action: "catalog.edit_recipes",
    cells: {
      cashier: { text: "—", expect: "deny" },
      branch_manager: { text: "—", expect: "deny" },
      storekeeper: { text: "—", expect: "deny" },
      owner: { text: "✔ (or vendor onboarding team)", expect: "allow" },
    },
  },
  {
    row: "View sales reports",
    action: "report.sales_view",
    cells: {
      // P9 — every cell in this row is a SCOPE, not a verdict. Asserted in §8.
      cashier: { text: "own shift only", expect: "excluded" },
      branch_manager: { text: "own branch", expect: "excluded" },
      storekeeper: { text: "stock reports", expect: "excluded" },
      owner: { text: "everything", expect: "excluded" },
    },
  },
  {
    row: "Edit/delete historical records",
    action: "history.edit_delete",
    cells: {
      cashier: { text: "✖ never", expect: "deny" },
      branch_manager: { text: "✖ never", expect: "deny" },
      storekeeper: { text: "✖ never", expect: "deny" },
      owner: { text: "✖ never (append-only corrections)", expect: "deny" },
    },
  },
];

// ── §1 — the helper and the matrix exist, and they are `domain`'s (`18 §`) ─────────────────

describe("S-0a §1 — a single `can(user, action, scope)` helper, in `domain` (18 §)", () => {
  it("`can` is exported from @restos/domain and answers a three-argument call", () => {
    expect(typeof maybeExports.can).toBe("function");
    const decision = can(CASHIER, "order.create", at(BRANCH_A));
    expect(decision).toBeDefined();
    expect(typeof decision.outcome).toBe("string");
  });

  it("the matrix is exported as data — `ROLES` carries all four Appendix A columns", () => {
    const roles = requireExport("ROLES");
    // Superset, not equality (P3): Appendix A's prose names eleven roles and gives four
    // columns, so a `ROLES` longer than four is correct and must not fail here.
    for (const role of ROLE_ORDER) {
      expect(roles).toContain(role);
    }
  });

  it("`PERMISSION_ACTIONS` carries every Appendix A row plus 02-F20's price override", () => {
    const actions = requireExport("PERMISSION_ACTIONS");
    for (const { action } of APPENDIX_A) {
      expect(actions).toContain(action);
    }
    // `02-F20` lists four escalating actions; three are Appendix A rows and this one is not.
    expect(actions).toContain("order.price_override");
    // `02-F38` refuses a self-approval "server-side by the `domain` permission matrix", which
    // requires the grant to BE an action in that matrix.
    expect(actions).toContain("approval.grant");
  });
});

// ── §2 — THE HEADLINE. Three distinct outcomes, named nowhere. ─────────────────────────────

describe("S-0a §2 — Appendix A's cells hold three outcomes, not two (01-F26, 02-F20)", () => {
  it("one action, three roles, three PAIRWISE DIFFERENT answers — no boolean can pass", () => {
    // `Void after KOT printed` is the only Appendix A row that carries all three cell kinds:
    //   Branch Mgr `✔ (logged)`   Cashier `needs Mgr PIN`   Storekeeper `—`
    const scope = at(BRANCH_A);
    const managerAnswer = can(MANAGER, "order.void_after_kot", scope).outcome;
    const cashierAnswer = can(CASHIER, "order.void_after_kot", scope).outcome;
    const storekeeperAnswer = can(STOREKEEPER, "order.void_after_kot", scope).outcome;

    // No outcome string appears in these three assertions on purpose: they hold under any
    // renaming of the vocabulary, and they are unsatisfiable by a two-valued answer.
    expect(cashierAnswer).not.toBe(managerAnswer);
    expect(cashierAnswer).not.toBe(storekeeperAnswer);
    expect(managerAnswer).not.toBe(storekeeperAnswer);
    expect(new Set([managerAnswer, cashierAnswer, storekeeperAnswer]).size).toBe(3);
  });

  it("all three `needs Mgr PIN` cells behave alike, and unlike the ✔ and — cells", () => {
    const scope = at(BRANCH_A);
    const pinCells = [
      can(CASHIER, "order.void_after_kot", scope).outcome,
      can(CASHIER, "order.comp_item", scope).outcome,
      can(CASHIER, "order.discount_above_threshold", scope).outcome,
    ];
    expect(new Set(pinCells).size).toBe(1);

    // The same cashier's ✔ cell and the same cashier's — cell, for contrast.
    const tickCell = can(CASHIER, "order.create", scope).outcome;
    const dashCell = can(CASHIER, "stock.receive", scope).outcome;
    for (const pinCell of pinCells) {
      expect(pinCell).not.toBe(tickCell);
      expect(pinCell).not.toBe(dashCell);
    }
    expect(tickCell).not.toBe(dashCell);
  });

  it("02-F20's fourth escalating action (price override) is the same third outcome", () => {
    const scope = at(BRANCH_A);
    // `02-F20` names void-after-KOT, comp, above-threshold discount AND price override
    // together. Appendix A has no row for price override, so only `02-F20` decides it.
    expect(can(CASHIER, "order.price_override", scope).outcome).toBe(
      can(CASHIER, "order.void_after_kot", scope).outcome,
    );
    expect(can(CASHIER, "order.price_override", scope).outcome).not.toBe(
      can(CASHIER, "order.create", scope).outcome,
    );
  });
});

// ── §3 — the pinned vocabulary (P1) ────────────────────────────────────────────────────────

describe("S-0a §3 — the outcome vocabulary (PINNED, contestable)", () => {
  it("a ✔ cell is `allow`, a — cell is `deny`, a `needs Mgr PIN` cell is `escalate`", () => {
    const scope = at(BRANCH_A);
    expect(can(CASHIER, "order.create", scope).outcome).toBe("allow");
    expect(can(STOREKEEPER, "order.create", scope).outcome).toBe("deny");
    expect(can(CASHIER, "order.void_after_kot", scope).outcome).toBe("escalate");
  });
});

// ── §4 — Appendix A, cell by cell, through `can()` ─────────────────────────────────────────

describe("S-0a §4 — every decidable Appendix A cell (restaurant-os.md Appendix A)", () => {
  for (const { row, action, cells } of APPENDIX_A) {
    for (const role of ROLE_ORDER) {
      const cell = cells[role];
      if (cell.expect === "excluded") continue;
      it(`${row} · ${role} · "${cell.text}"`, () => {
        const outcome = can(SUBJECT_BY_ROLE[role], action, at(BRANCH_A)).outcome;
        if (cell.expect === "not-allow") {
          expect(outcome).not.toBe("allow");
        } else {
          expect(outcome).toBe(cell.expect);
        }
      });
    }
  }
});

describe("S-0a §4b — the exclusion list is closed", () => {
  // GREEN TODAY, BY DESIGN — this is the only test in the file that never calls `can()`, so it
  // passes before the implementation exists. It is a pin on THIS FILE's transcription, not
  // coverage of the helper, and it is credited as neither.
  it("exactly five Appendix A cells are excluded, and each is named with its reason", () => {
    const excluded = APPENDIX_A.flatMap(({ row, cells }) =>
      ROLE_ORDER.filter((role) => cells[role].expect === "excluded").map(
        (role) => `${row} · ${role} · "${cells[role].text}"`,
      ),
    );
    // If a later edit quietly excludes a cell to make it pass, this list changes and this
    // test fails. That is the point of pinning it.
    expect(excluded).toEqual([
      'Edit menu & prices · branch_manager · "optional"',
      'View sales reports · cashier · "own shift only"',
      'View sales reports · branch_manager · "own branch"',
      'View sales reports · storekeeper · "stock reports"',
      'View sales reports · owner · "everything"',
    ]);
  });

  it("the four excluded report cells are covered by §8, not dropped", () => {
    // Non-vacuous restatement: the report action IS decided, it is just decided by scope.
    // If §8 were deleted this file would still refuse to call the row uncovered.
    const own = can(
      CASHIER,
      "report.sales_view",
      at(BRANCH_A, { subject_user_id: CASHIER.user_id }),
    );
    const other = can(
      CASHIER,
      "report.sales_view",
      at(BRANCH_A, { subject_user_id: OTHER_CASHIER.user_id }),
    );
    expect(own.outcome).not.toBe(other.outcome);
  });
});

// ── §5 — `✖ never` binds the owner (Appendix A hard rule, Commandment 1) ───────────────────

describe("S-0a §5 — `✖ never` is not a role permission (Appendix A hard rule)", () => {
  it("no role, INCLUDING owner, is allowed to edit or delete historical records", () => {
    for (const role of ROLE_ORDER) {
      const decision = can(SUBJECT_BY_ROLE[role], "history.edit_delete", at(BRANCH_A));
      expect(decision.outcome).toBe("deny");
      // A refusal must name what it refused (the brief's bar), or a caller cannot tell this
      // apart from a refusal of some other action it also asked about.
      expect(decision.action).toBe("history.edit_delete");
    }
  });

  it("the owner is not a wildcard — the same owner IS allowed the owner-✔ rows", () => {
    // Control for the test above: without this, "owner denied" would also pass against an
    // implementation that denies the owner everything.
    expect(can(OWNER, "catalog.edit_recipes", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(OWNER, "day.open_close", at(BRANCH_A)).outcome).toBe("allow");
  });
});

// ── §6 — the escalation is reachable and resolvable (02-F20) ───────────────────────────────

describe("S-0a §6 — `needs Mgr PIN` names who can satisfy it (02-F20, 18 §)", () => {
  it("an escalate decision carries at least one satisfying role", () => {
    const decision = can(CASHIER, "order.void_after_kot", at(BRANCH_A));
    expect(decision.satisfied_by).toBeDefined();
    expect(decision.satisfied_by?.length ?? 0).toBeGreaterThan(0);
  });

  it("every role it names is itself allowed the action — the path actually resolves", () => {
    const decision = can(CASHIER, "order.void_after_kot", at(BRANCH_A));
    const satisfiers = decision.satisfied_by ?? [];
    // Guarded so a zero-length list cannot leave this test running zero expectations
    // (oracle-round-2 §C pattern 2).
    expect(satisfiers.length).toBeGreaterThan(0);
    for (const role of satisfiers) {
      const approver = subject([{ role, branch_id: BRANCH_A }]);
      expect(can(approver, "order.void_after_kot", at(BRANCH_A)).outcome).toBe("allow");
    }
  });

  it("an `allow` and a `deny` decision do NOT carry satisfying roles", () => {
    // Otherwise `satisfied_by` is decoration and the caller learns nothing from reading it.
    expect(can(MANAGER, "order.void_after_kot", at(BRANCH_A)).satisfied_by).toBeUndefined();
    expect(can(STOREKEEPER, "order.void_after_kot", at(BRANCH_A)).satisfied_by).toBeUndefined();
  });
});

// ── §7 — the day/float role guard (02-F22) ────────────────────────────────────────────────

describe("S-0a §7 — day open/close and float entry are manager/owner (02-F22)", () => {
  it("a cashier session cannot simply execute a day open", () => {
    // P10: asserted as NOT-allow, because Appendix A's `—` and `02-F22`'s manager-PIN path
    // disagree on whether the cashier's answer is `deny` or `escalate`. Both readings forbid
    // the leakage this asserts.
    expect(can(CASHIER, "day.open_close", at(BRANCH_A)).outcome).not.toBe("allow");
  });

  it("manager and owner are allowed it outright", () => {
    expect(can(MANAGER, "day.open_close", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(OWNER, "day.open_close", at(BRANCH_A)).outcome).toBe("allow");
  });

  it("a storekeeper is refused it, and the refusal names the action", () => {
    const decision = can(STOREKEEPER, "day.open_close", at(BRANCH_A));
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe("day.open_close");
  });
});

// ── §8 — report scoping (02-F23 + Appendix A's "View sales reports" row) ──────────────────

describe("S-0a §8 — sales reports are scoped, not merely permitted (02-F23)", () => {
  it("a cashier may view their OWN shift's sales", () => {
    const decision = can(
      CASHIER,
      "report.sales_view",
      at(BRANCH_A, { subject_user_id: CASHIER.user_id }),
    );
    expect(decision.outcome).toBe("allow");
  });

  it("the SAME cashier is refused another cashier's shift — `own shift only`", () => {
    const decision = can(
      CASHIER,
      "report.sales_view",
      at(BRANCH_A, { subject_user_id: OTHER_CASHIER.user_id }),
    );
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe("report.sales_view");
  });

  it("a manager may view their own branch — `own branch`", () => {
    const decision = can(
      MANAGER,
      "report.sales_view",
      at(BRANCH_A, { subject_user_id: CASHIER.user_id }),
    );
    expect(decision.outcome).toBe("allow");
  });

  it("the SAME manager is refused another branch — the assignment is per-location (01-F26)", () => {
    const decision = can(
      MANAGER,
      "report.sales_view",
      at(BRANCH_B, { subject_user_id: CASHIER.user_id }),
    );
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe("report.sales_view");
  });

  it("an owner sees everything — every branch, every user", () => {
    expect(
      can(OWNER, "report.sales_view", at(BRANCH_A, { subject_user_id: CASHIER.user_id })).outcome,
    ).toBe("allow");
    expect(
      can(OWNER, "report.sales_view", at(BRANCH_B, { subject_user_id: MANAGER.user_id })).outcome,
    ).toBe("allow");
  });

  it("a storekeeper gets no sales report at all — their cell reads `stock reports`", () => {
    const decision = can(
      STOREKEEPER,
      "report.sales_view",
      at(BRANCH_A, { subject_user_id: STOREKEEPER.user_id }),
    );
    expect(decision.outcome).toBe("deny");
  });
});

// ── §9 — a requester never approves their own request (02-F38) ────────────────────────────

describe("S-0a §9 — self-approval is refused by the matrix, not merely hidden (02-F38)", () => {
  it("a manager may grant an approval another user requested", () => {
    // The control. Without it, every assertion below also passes against an implementation
    // that refuses `approval.grant` to everyone — which would delete `02-F20`'s remote path.
    const decision = can(
      MANAGER,
      "approval.grant",
      at(BRANCH_A, { requested_by_user_id: CASHIER.user_id }),
    );
    expect(decision.outcome).toBe("allow");
  });

  it("the SAME manager is refused their OWN request — server-side, by `can()` itself", () => {
    // `02-F38`: "absent from the requester's screen *and* refused server-side by the `domain`
    // permission matrix (Commandment 8 — a client that renders it anyway must still fail)".
    // A test that only asserted the button is missing would test the weaker half.
    const decision = can(
      MANAGER,
      "approval.grant",
      at(BRANCH_A, { requested_by_user_id: MANAGER.user_id }),
    );
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe("approval.grant");
  });

  it("a second manager may grant the first manager's request", () => {
    const decision = can(
      OTHER_MANAGER,
      "approval.grant",
      at(BRANCH_A, { requested_by_user_id: MANAGER.user_id }),
    );
    expect(decision.outcome).toBe("allow");
  });

  it("the owner is refused their own request too — `02-F38` names no role exception", () => {
    // CONTEST-RISK PIN. `02-F38` says "A requester never sees an approve control for their own
    // request" with no role qualifier, and the safe direction of an unqualified "never" is to
    // bind the owner. An implementation that special-cases the owner as allow-everything fails
    // exactly here, which is why the assertion is worth its risk.
    const decision = can(
      OWNER,
      "approval.grant",
      at(BRANCH_A, { requested_by_user_id: OWNER.user_id }),
    );
    expect(decision.outcome).toBe("deny");
  });

  it("a cashier cannot grant approvals at all — escalation goes UP (02-F20)", () => {
    const decision = can(
      CASHIER,
      "approval.grant",
      at(BRANCH_A, { requested_by_user_id: OTHER_CASHIER.user_id }),
    );
    expect(decision.outcome).toBe("deny");
  });
});

// ── §10 — identity axes: a role is held at a location, or not at all (01-F26, 01-F27) ─────

describe("S-0a §10 — a role is held per location, and no assignment is no authority", () => {
  it("a user with NO role assignment is authorised for nothing", () => {
    // `01-F27`: "device tokens carry device identity only — user identity comes from the PIN
    // session". A device on the counter with nobody unlocked is exactly this subject.
    for (const action of ["order.create", "payment.settle", "receipt.reprint"]) {
      const decision = can(NO_ASSIGNMENT, action, at(BRANCH_A));
      expect(decision.outcome).toBe("deny");
      expect(decision.action).toBe(action);
    }
  });

  it("a cashier assigned to branch A is refused the same action in branch B (01-F26)", () => {
    expect(can(CASHIER, "order.create", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(CASHIER, "order.create", at(BRANCH_B)).outcome).toBe("deny");
  });

  it("one person, two hats: cashier at A and manager at B, resolved per location", () => {
    // Appendix A's opening sentence: "Roles are permission sets, not separate apps — in small
    // restaurants one person wears several hats."
    const twoHats = subject([
      { role: "cashier", branch_id: BRANCH_A },
      { role: "branch_manager", branch_id: BRANCH_B },
    ]);
    expect(can(twoHats, "order.void_after_kot", at(BRANCH_A)).outcome).toBe("escalate");
    expect(can(twoHats, "order.void_after_kot", at(BRANCH_B)).outcome).toBe("allow");
  });

  it("an org-wide owner assignment carries into every branch", () => {
    expect(can(OWNER, "order.create", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(OWNER, "order.create", at(BRANCH_B)).outcome).toBe("allow");
  });
});

// ── §11 — fail closed (01-F27, Commandment 8) ─────────────────────────────────────────────

describe("S-0a §11 — an action the matrix does not carry is never allowed", () => {
  it("an unknown action is refused (or throws) — never allowed", () => {
    // `01-F27` puts authorization on EVERY operation. An action absent from the matrix has not
    // been authorized by it, so `allow` is the one answer that cannot be right. Either a
    // refusal or a throw is acceptable; silently allowing is not.
    //
    // The `catch` below would otherwise make this test GREEN before `can` exists at all — the
    // oracle-round-2 §C pattern of a tripwire that passes by not looking. This line is what
    // keeps it red until there is something to trip.
    expect(typeof maybeExports.can).toBe("function");
    let answer: string;
    try {
      answer = can(OWNER, "order.transmute_into_gold", at(BRANCH_A)).outcome;
    } catch {
      answer = "threw";
    }
    expect(answer).not.toBe("allow");
  });

  it("the same subject IS allowed a real action — the refusal above is about the action", () => {
    expect(can(OWNER, "order.create", at(BRANCH_A)).outcome).toBe("allow");
  });
});
